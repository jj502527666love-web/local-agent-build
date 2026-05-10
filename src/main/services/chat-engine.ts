import { BrowserWindow } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { v4 as uuid } from 'uuid'
import { getDataDir } from './data-path'
import { getBot, type ToolApproval } from './bot'
import { getPersona } from './persona'
import { getMessages, addMessage, getConversation, updateConversationTitle } from './conversation'
import { callLLM, ChatMessage, AbortedError, isAbortedError } from './llm'
import { listSkills } from './skill'
import { getMcpServer } from './mcp-server'
import { getSummary, upsertSummary } from './conversation-summary'
import { embedText, embedBatch, cosineSimilarity } from './embedding'
import { searchHybrid } from './vector-store'
import { listKnowledgeBases, listCategories, type KnowledgeBase } from './knowledge'
import { executeSkillSandbox } from './skill-sandbox'
import { callMcpTool } from './mcp-server'
import { listPromptSkills, getPromptSkillByName } from './prompt-skill'
import { coreToolDefs, executeCoreToolCall, CORE_TOOL_NAMES, KB_TOOL_NAMES, previewFileWrite, type FileWritePreview } from './core-tools'

// Per-model context-window table. Values are the *total* model context (prompt + completion).
// We reserve ~25% for the response and pass the rest as the prompt budget.
const MODEL_CONTEXT_LIMITS: { match: RegExp; total: number }[] = [
  // Claude
  { match: /claude-(?:opus|sonnet|haiku)-4|claude-3\.5|claude-3-5/i, total: 200_000 },
  { match: /claude-3/i, total: 200_000 },
  { match: /claude/i, total: 200_000 },
  // GPT-4 / GPT-5
  { match: /gpt-5/i, total: 256_000 },
  { match: /gpt-4\.1/i, total: 1_000_000 },
  { match: /gpt-4o|gpt-4-turbo|gpt-4-1106|gpt-4-0125/i, total: 128_000 },
  { match: /gpt-4-32k/i, total: 32_000 },
  { match: /gpt-4/i, total: 8_000 },
  { match: /o1|o3|o4/i, total: 200_000 },
  // GPT-3.5
  { match: /gpt-3\.5-turbo-16k/i, total: 16_000 },
  { match: /gpt-3\.5/i, total: 16_000 },
  // Gemini
  { match: /gemini-(?:1\.5|2\.0|2\.5)-pro/i, total: 1_000_000 },
  { match: /gemini-(?:1\.5|2\.0|2\.5)-flash/i, total: 1_000_000 },
  { match: /gemini/i, total: 32_000 },
  // DeepSeek
  { match: /deepseek-(?:r1|reasoner)/i, total: 64_000 },
  { match: /deepseek-chat|deepseek-coder|deepseek-v3/i, total: 64_000 },
  { match: /deepseek/i, total: 32_000 },
  // Qwen
  { match: /qwen.*-1m|qwen.*-long/i, total: 1_000_000 },
  { match: /qwen-?(?:plus|max|turbo)|qwen2\.5|qwen3/i, total: 128_000 },
  { match: /qwen/i, total: 32_000 },
  // GLM / ChatGLM
  { match: /glm-4-(?:plus|long|air|0520)/i, total: 128_000 },
  { match: /glm-4/i, total: 128_000 },
  { match: /glm/i, total: 32_000 },
  // Mistral
  { match: /mistral-large/i, total: 128_000 },
  { match: /mistral/i, total: 32_000 },
  // Llama
  { match: /llama-?3\.[12]/i, total: 128_000 },
  { match: /llama-?3/i, total: 8_000 },
  // Yi / Doubao / Baichuan / Moonshot
  { match: /moonshot|kimi/i, total: 128_000 },
  { match: /doubao/i, total: 128_000 },
  { match: /yi-/i, total: 32_000 }
]

const DEFAULT_TOTAL_CONTEXT = 32_000
const RESPONSE_RESERVE_RATIO = 0.25

function getModelPromptBudget(modelId: string): number {
  const id = String(modelId || '')
  const found = MODEL_CONTEXT_LIMITS.find((e) => e.match.test(id))
  const total = found?.total ?? DEFAULT_TOTAL_CONTEXT
  return Math.max(2000, Math.floor(total * (1 - RESPONSE_RESERVE_RATIO)))
}

// Per-conversation AbortController so the renderer can cancel a running send.
const activeControllers = new Map<string, AbortController>()

export function cancelChat(conversationId: string): boolean {
  const ctrl = activeControllers.get(conversationId)
  if (!ctrl) return false
  ctrl.abort()
  activeControllers.delete(conversationId)
  // Reject any pending approvals for this conversation
  for (const [reqId, ctx] of pendingApprovals) {
    if (ctx.conversationId === conversationId) {
      ctx.resolve(false)
      pendingApprovals.delete(reqId)
    }
  }
  return true
}

export function isChatActive(conversationId: string): boolean {
  return activeControllers.has(conversationId)
}

// === Tool approval ===
interface PendingApproval {
  conversationId: string
  resolve: (approved: boolean) => void
}
const pendingApprovals = new Map<string, PendingApproval>()

const DESTRUCTIVE_FILE_OPS = new Set(['write', 'append', 'mkdir', 'delete', 'copy', 'rename', 'write_json'])

function isDestructiveTool(name: string, args: any): boolean {
  if (name === 'run_command') return true
  if (name === 'file_ops') return DESTRUCTIVE_FILE_OPS.has(args?.action)
  // user skills run arbitrary JS - treat as destructive
  // MCP tools - treat as destructive (we cannot know their side effects)
  if (name && !['use_skill', 'image_gen'].includes(name)) {
    // Anything except prompt skill loading and image gen is potentially side-effectful;
    // image_gen only writes to workspace/images which is user-expected.
    return false // explicit list above; everything else is non-destructive by default
  }
  return false
}

function needsApproval(mode: ToolApproval, name: string, args: any): boolean {
  if (mode === 'off') return false
  if (mode === 'all') return true
  return isDestructiveTool(name, args)
}

function requestToolApproval(
  window: BrowserWindow | null,
  conversationId: string,
  toolCall: any,
  parsedArgs: any,
  preview: FileWritePreview | null,
  signal: AbortSignal
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const requestId = uuid()
    pendingApprovals.set(requestId, { conversationId, resolve })
    const onAbort = () => {
      const ctx = pendingApprovals.get(requestId)
      if (ctx) {
        pendingApprovals.delete(requestId)
        ctx.resolve(false)
      }
    }
    if (signal.aborted) {
      onAbort()
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    if (window) {
      window.webContents.send('chat:toolApproval', {
        request_id: requestId,
        conversation_id: conversationId,
        tool: toolCall.function?.name || 'unknown',
        args: parsedArgs,
        preview: preview || undefined
      })
    } else {
      // No window to ask: fail closed
      pendingApprovals.delete(requestId)
      resolve(false)
    }
  })
}

export function respondToolApproval(requestId: string, approved: boolean): boolean {
  const ctx = pendingApprovals.get(requestId)
  if (!ctx) return false
  pendingApprovals.delete(requestId)
  ctx.resolve(approved)
  return true
}

function getWorkspaceDir(conversationId: string): string {
  const dir = join(getDataDir(), 'workspaces', conversationId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * After slicing history for the sliding window, the first messages may be orphan
 * tool results (parent assistant.tool_calls got trimmed) or trailing assistant.tool_calls
 * without their matching tool responses. Both cases cause OpenAI to reject the replay, so
 * we repair by trimming those orphans.
 */
function repairHistoryHead(msgs: ChatMessage[]): ChatMessage[] {
  let start = 0
  // Drop leading orphan tool results.
  while (start < msgs.length && msgs[start].role === 'tool') start++
  // Drop a leading assistant whose declared tool_calls aren't all answered below it.
  if (start < msgs.length) {
    const head = msgs[start] as any
    if (head.role === 'assistant' && Array.isArray(head.tool_calls) && head.tool_calls.length > 0) {
      const ids: string[] = head.tool_calls.map((tc: any) => tc?.id).filter(Boolean)
      const tail = msgs.slice(start + 1)
      const answered = ids.every((id) =>
        tail.some((m: any) => m.role === 'tool' && m.tool_call_id === id)
      )
      if (!answered) start++
    }
  }
  let end = msgs.length
  // Drop a trailing assistant.tool_calls whose tool results were sliced off.
  while (end > 0) {
    const last = msgs[end - 1] as any
    if (last?.role === 'assistant' && Array.isArray(last.tool_calls) && last.tool_calls.length > 0) {
      const ids: string[] = last.tool_calls.map((tc: any) => tc?.id).filter(Boolean)
      const tail = msgs.slice(end)
      const answered = ids.every((id) =>
        tail.some((m: any) => m.role === 'tool' && m.tool_call_id === id)
      )
      if (!answered) { end--; continue }
    }
    break
  }
  return msgs.slice(start, end)
}

const RECENT_ROUNDS = 6
const DOC_CHUNK_SIZE = 500
const DOC_CHUNK_OVERLAP = 50
const DOC_TOP_K = 8
const DOC_MAX_RESULT_CHARS = 6000

function splitIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    chunks.push(text.slice(start, start + chunkSize))
    start += chunkSize - overlap
  }
  return chunks
}

async function retrieveRelevantChunks(docText: string, query: string, docName: string): Promise<string> {
  const chunks = splitIntoChunks(docText, DOC_CHUNK_SIZE, DOC_CHUNK_OVERLAP)
  if (chunks.length === 0) return docText

  const queryResult = await embedText(query)
  const chunkResults = await embedBatch(chunks)

  const scored = chunks.map((chunk, i) => ({
    chunk,
    score: cosineSimilarity(queryResult.embedding, chunkResults.embeddings[i].embedding)
  }))
  scored.sort((a, b) => b.score - a.score)

  let result = ''
  let count = 0
  for (const item of scored) {
    if (count >= DOC_TOP_K || result.length + item.chunk.length > DOC_MAX_RESULT_CHARS) break
    result += item.chunk + '\n---\n'
    count++
  }
  return `(${docName}: ${chunks.length} chunks, showing top ${count} relevant)\n\n${result}`
}

function estimateTokens(text: string): number {
  if (!text) return 0
  const cjk = text.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g)?.length || 0
  const rest = text.length - cjk
  return Math.ceil(cjk * 1.5 + rest / 4)
}

function estimateMessagesTokens(msgs: ChatMessage[]): number {
  return msgs.reduce((sum, m) => {
    if (typeof m.content === 'string') {
      return sum + estimateTokens(m.content) + 4
    }
    // Multimodal content array: estimate text parts normally, images as fixed cost
    let tokens = 4
    for (const part of m.content as any[]) {
      if (part.type === 'text') {
        tokens += estimateTokens(part.text || '')
      } else if (part.type === 'image_url') {
        tokens += 300 // fixed estimate per image
      }
    }
    return sum + tokens
  }, 0)
}

// 写入 system prompt 的 KB 清单上限：避免 prompt 过长撑爆上下文
const KB_SUMMARY_DOCS_PER_CATEGORY = 20

/**
 * 给 system prompt 用的知识库清单：分类名 + 每分类前 N 个文档名（截断时附"等 M 个"）。
 * 让模型直接知道库里大致有什么，能正确回答"知识库里有什么"这类元问题。
 * kbDataByCategory 由 sendMessage 预读传入，避免重复 IO。
 */
function buildKbInventorySummary(
  categoryIds: string[],
  kbDataByCategory: Map<string, KnowledgeBase[]>
): string {
  if (categoryIds.length === 0) return ''
  try {
    const allCats = listCategories()
    const cats = allCats.filter((c) => categoryIds.includes(c.id))
    if (cats.length === 0) return `知识库: 已启用 (${categoryIds.length} 个分类，但分类不可读)`
    const lines: string[] = [`知识库: 已启用 ${cats.length} 个分类`]
    for (const cat of cats) {
      const kbs = kbDataByCategory.get(cat.id) || []
      const ready = kbs.filter((kb) => kb.status === 'ready')
      const head = ready.slice(0, KB_SUMMARY_DOCS_PER_CATEGORY).map((kb) => kb.name).join(', ')
      const remaining = ready.length - Math.min(KB_SUMMARY_DOCS_PER_CATEGORY, ready.length)
      const headStr = head ? `: ${head}${remaining > 0 ? `, 等 ${remaining} 个` : ''}` : ''
      const pendingHint = kbs.length > ready.length ? `, 另 ${kbs.length - ready.length} 个待向量化` : ''
      lines.push(`- 分类「${cat.name}」(${ready.length} 个就绪文档${pendingHint})${headStr}`)
    }
    lines.push('当用户询问"知识库里有什么/有哪些文档"时调用 kb_list；当首次召回不够准确时调用 kb_search 用重写后的 query 重查。')
    return lines.join('\n')
  } catch {
    return `知识库: 已启用 (${categoryIds.length} 个分类)`
  }
}

export interface SendMessageOptions {
  conversationId: string
  botId: string
  content: string
  attachments?: any[]
  overrideKbCategoryIds?: string[]
  overrideSkillIds?: string[]
  overrideMcpIds?: string[]
  overridePromptSkillDirs?: string[]
}

export async function sendMessage(
  options: SendMessageOptions,
  window: BrowserWindow | null
): Promise<void> {
  const bot = getBot(options.botId)
  if (!bot) throw new Error('Bot not found')
  if (!bot.model_provider_id && !bot.model_id) throw new Error('Bot has no model provider configured')
  const effectiveProviderId = bot.model_provider_id || 'cloud:default'

  // Save user message
  addMessage({
    conversation_id: options.conversationId,
    role: 'user',
    content: options.content,
    attachments: options.attachments
  })

  // Build message history
  const history = getMessages(options.conversationId)
  const messages: ChatMessage[] = []

  // Resolve effective config (overrides take precedence)
  const effectiveKbCategoryIds = options.overrideKbCategoryIds ?? bot.kb_category_ids
  const effectiveSkillIds = options.overrideSkillIds ?? bot.skill_ids
  const effectiveMcpIds = options.overrideMcpIds ?? bot.mcp_ids
  const effectivePromptSkillDirs = options.overridePromptSkillDirs ?? (bot.prompt_skill_dirs || [])

  // 预读启用分类下的全部 KB 数据，供 system prompt 清单 + RAG 检索 + 召回片段来源标注三处复用，避免重复 IO
  const kbDataByCategory = new Map<string, KnowledgeBase[]>()
  if (effectiveKbCategoryIds.length > 0) {
    for (const catId of effectiveKbCategoryIds) {
      kbDataByCategory.set(catId, listKnowledgeBases(catId))
    }
  }

  // Base system prompt: tool usage guidance + bot identity
  const baseSystemParts: string[] = [
    '你是一个具备工具调用能力的AI助手。当任务需要读写文件、执行命令或调用其他工具时，直接调用对应工具完成操作，不要仅描述步骤或给出建议。'
  ]

  // Bot configuration summary
  const capSummary: string[] = []
  capSummary.push(`名称: ${bot.name}`)
  capSummary.push(`模型: ${bot.model_id}`)
  if (effectiveKbCategoryIds.length > 0) {
    capSummary.push(buildKbInventorySummary(effectiveKbCategoryIds, kbDataByCategory))
  }
  if (effectiveSkillIds.length > 0) {
    const allSkills = listSkills()
    const skillNames = allSkills.filter(s => effectiveSkillIds.includes(s.id) && s.enabled).map(s => s.function_def?.name || s.name)
    if (skillNames.length > 0) capSummary.push(`小工具: ${skillNames.join(', ')}`)
  }
  if (effectivePromptSkillDirs.length > 0) {
    const allPS = listPromptSkills().filter(s => s.enabled && effectivePromptSkillDirs.includes(s.dirName))
    if (allPS.length > 0) capSummary.push(`Skills技能: ${allPS.map(s => s.name).join(', ')} (通过 use_skill 工具调用)`)
  }
  if (effectiveMcpIds.length > 0) {
    const mcpNames: string[] = []
    for (const id of effectiveMcpIds) {
      const server = getMcpServer(id)
      if (server && server.enabled) mcpNames.push(server.name)
    }
    if (mcpNames.length > 0) capSummary.push(`MCP服务: ${mcpNames.join(', ')}`)
  }
  baseSystemParts.push(`当前配置:\n${capSummary.join('\n')}`)

  // Workspace path: tell the LLM where relative file paths resolve to
  const workspaceDir = getWorkspaceDir(options.conversationId)
  baseSystemParts.push(
    `[工作区目录]: ${workspaceDir}\n` +
    `- 当前对话专属目录,file_ops / run_command / image_gen 未指定绝对路径时默认在此目录操作\n` +
    `- 路径解析规则:\n` +
    `  · 绝对路径(如 C:\\foo\\bar.txt)按字面解析\n` +
    `  · 相对路径(如 out.md、data/x.json)解析到工作区内\n` +
    `  · '.' 或空字符串表示工作区根\n` +
    `- 查看工作区内容请调用 file_ops({action:'tree', path:'.'}) 或 ({action:'list', path:'.'})`
  )

  // System prompt from persona
  if (bot.persona_id) {
    const persona = getPersona(bot.persona_id)
    if (persona) {
      baseSystemParts.push(persona.system_prompt)
    }
  }

  messages.push({ role: 'system', content: baseSystemParts.join('\n\n') })

  // RAG: retrieve relevant knowledge base context
  if (effectiveKbCategoryIds.length > 0) {
    try {
      // Collect all KB IDs for the bot's categories（复用预读数据）
      const kbIds: string[] = []
      for (const catId of effectiveKbCategoryIds) {
        const kbs = kbDataByCategory.get(catId) || []
        for (const kb of kbs) {
          if (kb.status === 'ready') kbIds.push(kb.id)
        }
      }

      if (kbIds.length > 0) {
        // Build enhanced query: combine recent history for multi-turn context
        const recentHistory = getMessages(options.conversationId)
        const recentPairs = recentHistory
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .slice(-4) // last 2 rounds
        const historyContext = recentPairs
          .map((m) => (m.role === 'user' ? `Q: ${m.content}` : `A: ${m.content}`))
          .join('\n')
        const enhancedQuery = historyContext
          ? `${historyContext}\nQ: ${options.content}`
          : options.content
        const queryEmbed = await embedText(enhancedQuery)
        const results = searchHybrid(queryEmbed.embedding, options.content, kbIds, 5, 0.3)

        if (results.length > 0) {
          // 收集 KB id → name 映射，便于在召回片段里附上"来源文档名"（复用预读数据）
          const kbNameMap = new Map<string, string>()
          for (const catId of effectiveKbCategoryIds) {
            for (const kb of kbDataByCategory.get(catId) || []) {
              if (kb.status === 'ready') kbNameMap.set(kb.id, kb.name)
            }
          }
          const context = results
            .map((r, i) => {
              const score = Math.round(r.score * 1000) / 1000
              const source = kbNameMap.get(r.chunk.knowledge_base_id) || '未知文档'
              return `[${i + 1}] (相关度 ${score}, 来源: ${source})\n${r.chunk.content}`
            })
            .join('\n\n')
          messages.push({
            role: 'system',
            content:
              `以下是从知识库初次检索到的 ${results.length} 个片段（按相关性降序）：\n\n${context}\n\n` +
              '使用规则：\n' +
              '- 若上述片段已能回答用户问题，请基于片段直接回答，并在结尾用「来源：xxx」形式标注被引用的文档；\n' +
              '- 若上述片段相关度普遍偏低（score < 0.4）或与用户当前问题方向不符，请调用 kb_search 用重写过的 query 重新检索；\n' +
              '- 若用户问的是"知识库里有什么/有哪些文档"等元问题，请调用 kb_list 列出清单；不要凭这 5 个片段瞎猜全库内容。'
          })
          const topScore = Math.round(results[0].score * 1000) / 1000
          console.log(`[chat] RAG: found ${results.length} relevant chunks from ${kbIds.length} KBs (top score=${topScore})`)
        } else {
          // 0 命中也要告知模型，避免它误以为"没注入就是没启用"
          messages.push({
            role: 'system',
            content:
              '本次基于用户问题的初次检索未命中任何知识库片段（topK=5, threshold=0.3）。\n' +
              '如果用户问题确实与知识库主题相关，请调用 kb_search 用重写过的 query 重新检索；' +
              '如果是元问题（"库里有什么"），请调用 kb_list。'
          })
          console.log(`[chat] RAG: 0 chunks matched from ${kbIds.length} KBs`)
        }
      }
    } catch (e: any) {
      // 静默失败会让用户误以为"模型在用知识库实际没用"。把失败原因通过 system 告诉模型，让它能向用户澄清。
      console.log(`[chat] RAG retrieval failed: ${e.message}`)
      messages.push({
        role: 'system',
        content:
          `本次知识库初次检索失败（原因：${e.message || '未知错误'}）。\n` +
          '如果用户问题与知识库相关，请调用 kb_search 重试；如果重试仍失败，请明确告知用户"知识库检索暂时不可用"，不要假装查到了内容。'
      })
    }

    // Knowledge-base-only constraint
    if (bot.kb_only && effectiveKbCategoryIds.length > 0) {
      messages.push({
        role: 'system',
        content:
          '重要约束：你只能根据知识库内容回答问题。\n' +
          '- 如果初次召回的片段足够准确，直接基于片段回答并标注来源；\n' +
          '- 如果初次召回不足或不相关，必须先调用 kb_search 至少一次用重写过的 query 重新检索后再判断；\n' +
          '- 仅当多次检索仍无相关内容时，才回答"知识库中未找到相关信息"，不要凭常识或预训练知识编造或推测答案。'
      })
    }
  }

  // Inject prompt skill guidance
  const allPromptSkills = listPromptSkills().filter((s) => s.enabled)
  const botPromptSkills = effectivePromptSkillDirs.length > 0
    ? allPromptSkills.filter((s) => effectivePromptSkillDirs.includes(s.dirName))
    : allPromptSkills
  if (botPromptSkills.length > 0) {
    const names = botPromptSkills.map((s) => s.name).join(', ')
    messages.push({
      role: 'system',
      content: `你有以下 Skills 技能可用：${names}。当用户的请求与某个技能的能力匹配时，必须先调用 use_skill 工具加载该技能的完整指令，然后严格按照技能指令来完成任务。不要跳过技能直接回答。`
    })
  }

  // Inject existing summary as context
  const existingSummary = getSummary(options.conversationId)
  if (existingSummary && existingSummary.summary) {
    messages.push({
      role: 'system',
      content: `以下是之前对话的摘要，请在回答时参考：\n${existingSummary.summary}`
    })
  }

  // Convert history to ChatMessage array
  const historyMessages: ChatMessage[] = []
  for (const msg of history) {
    if (msg.role === 'user') {
      if (msg.attachments && msg.attachments.length > 0) {
        const contentParts: any[] = [{ type: 'text', text: msg.content }]
        for (const att of msg.attachments) {
          if (att.type === 'image') {
            contentParts.push({
              type: 'image_url',
              image_url: { url: att.data }
            })
          } else if (att.type === 'document' && att.data) {
            const MAX_DOC_CHARS = 8000
            if (att.data.length <= MAX_DOC_CHARS) {
              contentParts.push({ type: 'text', text: `[${att.name}]\n${att.data}` })
            } else {
              // Large doc: try RAG retrieval, fallback to truncation
              let docText: string
              try {
                docText = await retrieveRelevantChunks(att.data, msg.content, att.name)
              } catch {
                docText = att.data.slice(0, MAX_DOC_CHARS) + `\n...(truncated, ${att.data.length} chars total)`
              }
              contentParts.push({ type: 'text', text: `[${att.name}]\n${docText}` })
            }
          }
        }
        historyMessages.push({ role: 'user', content: contentParts })
      } else {
        historyMessages.push({ role: 'user', content: msg.content })
      }
    } else if (msg.role === 'assistant') {
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        // Replay full assistant.tool_calls block — but only if every tool_call has a paired tool result
        // later in history (otherwise the OpenAI API rejects it).
        const toolCallIds = msg.tool_calls.map((tc: any) => tc.id).filter(Boolean)
        const allPaired = toolCallIds.length > 0 && toolCallIds.every((id: string) =>
          history.some((m) => m.role === 'tool' && m.tool_call_id === id)
        )
        if (allPaired) {
          historyMessages.push({
            role: 'assistant',
            content: msg.content || '',
            tool_calls: msg.tool_calls
          } as any)
        }
        continue
      }
      historyMessages.push({ role: 'assistant', content: msg.content })
    } else if (msg.role === 'tool') {
      // Replay tool result paired to a previously-emitted assistant tool_call.
      if (!msg.tool_call_id) continue
      const lastAssistant = [...historyMessages].reverse().find((m) => m.role === 'assistant') as any
      const isPairedAbove = lastAssistant?.tool_calls?.some((tc: any) => tc.id === msg.tool_call_id)
      if (!isPairedAbove) continue
      historyMessages.push({
        role: 'tool',
        content: msg.content,
        tool_call_id: msg.tool_call_id
      } as any)
    }
  }

  // Sliding window: keep recent rounds, trim if exceeding the model's prompt budget.
  const systemTokens = estimateMessagesTokens(messages)
  const promptBudget = getModelPromptBudget(bot.model_id)
  const budget = promptBudget - systemTokens
  let included = historyMessages.slice(-RECENT_ROUNDS * 2)
  included = repairHistoryHead(included)
  while (included.length > 2 && estimateMessagesTokens(included) > budget) {
    included = included.slice(2)
    included = repairHistoryHead(included)
  }
  messages.push(...included)

  // Build tools list from skills and MCP (KB tools auto-included when KB enabled)
  const tools = buildToolsList(effectiveSkillIds, effectiveMcpIds, effectivePromptSkillDirs, effectiveKbCategoryIds)

  const systemCount = messages.length - included.length
  console.log(`[chat] context: ${systemCount} system + ${included.length} history msgs, ~${estimateMessagesTokens([...messages])} tokens, ${tools.length} tools`)

  // Call LLM with multi-round tool call loop (agent mode)
  const MAX_TOOL_ROUNDS = 10
  // Replace any leftover controller (e.g. previous failed cleanup) with a fresh one for this turn.
  const prevCtrl = activeControllers.get(options.conversationId)
  if (prevCtrl) prevCtrl.abort()
  const abortController = new AbortController()
  activeControllers.set(options.conversationId, abortController)
  const signal = abortController.signal
  try {
    let currentMessages: ChatMessage[] = [...messages]
    let round = 0

    while (round <= MAX_TOOL_ROUNDS) {
      if (signal.aborted) throw new AbortedError()
      const t0 = Date.now()
      const response = await callLLM(
        effectiveProviderId,
        {
          modelId: bot.model_id,
          messages: currentMessages,
          tools: tools.length > 0 ? tools : undefined,
          stream: true,
          signal
        },
        window
      )

      console.log(`[chat] round ${round}: LLM response in ${Date.now() - t0}ms, content: ${response.content.length} chars, tool_calls: ${response.tool_calls?.length || 0}`)

      // No tool calls → final response, save and break
      if (!response.tool_calls || response.tool_calls.length === 0) {
        addMessage({
          conversation_id: options.conversationId,
          role: 'assistant',
          content: response.content
        })
        break
      }

      // Save assistant message with tool calls
      addMessage({
        conversation_id: options.conversationId,
        role: 'assistant',
        content: response.content,
        tool_calls: response.tool_calls
      })

      // Append assistant message to context
      currentMessages.push({
        role: 'assistant',
        content: response.content,
        tool_calls: response.tool_calls
      })

      // Notify renderer which tools are being called
      const toolNames = response.tool_calls.map((tc: any) => tc.function?.name || 'unknown')
      if (window) {
        window.webContents.send('chat:stream', { type: 'tool_start', tools: toolNames })
      }

      // Pass 1 (serial): approval gate, collect rejections eagerly so the user sees them paired with the right call.
      type Plan = { toolCall: any; fnName: string; resultStr?: string }
      const plans: Plan[] = []
      const sandboxDir = getWorkspaceDir(options.conversationId)
      for (const toolCall of response.tool_calls) {
        if (signal.aborted) throw new AbortedError()
        const fnName = toolCall.function?.name || 'unknown'
        let parsedArgs: any = {}
        try { parsedArgs = JSON.parse(toolCall.function?.arguments || '{}') } catch {}

        if (needsApproval(bot.tool_approval, fnName, parsedArgs)) {
          const preview = fnName === 'file_ops' ? previewFileWrite(parsedArgs, sandboxDir) : null
          const approved = await requestToolApproval(window, options.conversationId, toolCall, parsedArgs, preview, signal)
          if (signal.aborted) throw new AbortedError()
          if (!approved) {
            plans.push({
              toolCall,
              fnName,
              resultStr: JSON.stringify({ error: '用户拒绝了该工具调用', tool: fnName })
            })
            if (window) {
              window.webContents.send('chat:stream', { type: 'tool_result', tool: fnName, summary: '[已拒绝]' })
            }
            continue
          }
        }
        plans.push({ toolCall, fnName })
      }

      // Pass 2 (parallel): execute all approved tools concurrently while preserving call order.
      const pendingExecs = plans.map(async (p) => {
        if (p.resultStr !== undefined) return p
        if (signal.aborted) throw new AbortedError()
        const result = await executeToolCall(p.toolCall, effectiveSkillIds, effectiveMcpIds, options.conversationId, effectiveKbCategoryIds)
        const resultStr = JSON.stringify(result)
        if (window) {
          const summary = typeof result === 'string'
            ? (result.length > 100 ? result.slice(0, 100) + '...' : result)
            : (resultStr.length > 100 ? resultStr.slice(0, 100) + '...' : resultStr)
          window.webContents.send('chat:stream', { type: 'tool_result', tool: p.fnName, summary })
        }
        return { ...p, resultStr }
      })
      const completed = await Promise.all(pendingExecs)
      if (signal.aborted) throw new AbortedError()

      // Pass 3 (serial): persist + append in original order so the LLM sees a deterministic transcript.
      for (const p of completed) {
        const resultStr = p.resultStr || ''
        addMessage({
          conversation_id: options.conversationId,
          role: 'tool',
          content: resultStr,
          tool_call_id: p.toolCall.id || ''
        })
        currentMessages.push({
          role: 'tool',
          content: resultStr,
          tool_call_id: p.toolCall.id || ''
        })
      }

      round++

      // Safety: if max rounds reached, do one final call without tools
      if (round >= MAX_TOOL_ROUNDS) {
        console.log(`[chat] max tool rounds (${MAX_TOOL_ROUNDS}) reached, final call without tools`)
        if (window) {
          window.webContents.send('chat:stream', { type: 'tool_done' })
        }
        if (signal.aborted) throw new AbortedError()
        const finalResponse = await callLLM(
          effectiveProviderId,
          {
            modelId: bot.model_id,
            messages: currentMessages,
            stream: true,
            signal
          },
          window
        )
        addMessage({
          conversation_id: options.conversationId,
          role: 'assistant',
          content: finalResponse.content
        })
        break
      }

      // Notify renderer that tool execution is done, next round streaming follows
      if (window) {
        window.webContents.send('chat:stream', { type: 'tool_done' })
      }
    }
    // Auto-generate title on 1st or 5th user message
    maybeGenerateTitle(options.conversationId, effectiveProviderId, bot.model_id, window)
    // Auto-summarize if history exceeds threshold
    maybeGenerateSummary(options.conversationId, effectiveProviderId, bot.model_id)
  } catch (error: any) {
    if (isAbortedError(error)) {
      // User-initiated cancel: surface as a friendly aborted marker, not an error.
      if (window) {
        window.webContents.send('chat:stream', { type: 'aborted' })
      }
      addMessage({
        conversation_id: options.conversationId,
        role: 'assistant',
        content: '[已中断]'
      })
    } else {
      if (window) {
        window.webContents.send('chat:stream', {
          type: 'error',
          error: error.message
        })
      }
      addMessage({
        conversation_id: options.conversationId,
        role: 'assistant',
        content: `[Error] ${error.message}`
      })
    }
  } finally {
    if (activeControllers.get(options.conversationId) === abortController) {
      activeControllers.delete(options.conversationId)
    }
  }
}

async function maybeGenerateTitle(
  conversationId: string,
  providerId: string,
  modelId: string,
  window: BrowserWindow | null
): Promise<void> {
  try {
    const allMessages = getMessages(conversationId)
    const userMsgCount = allMessages.filter((m) => m.role === 'user').length
    if (userMsgCount !== 1 && userMsgCount !== 5) return

    const conv = getConversation(conversationId)
    if (!conv) return
    // Skip if title was manually edited (not default) on 5th message
    if (userMsgCount === 5 && conv.title !== 'New Chat') {
      // Still regenerate on 5th to get a better title based on more context
    }

    const recentMsgs = allMessages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(0, userMsgCount === 1 ? 2 : 10)
      .map((m) => `${m.role === 'user' ? '用户' : 'AI'}: ${typeof m.content === 'string' ? m.content : '[附件]'}`)
      .join('\n')

    const result = await callLLM(providerId, {
      modelId,
      messages: [
        {
          role: 'system',
          content: '根据以下对话内容生成一个简短的中文标题，不超过10个字，只输出标题本身，不要引号或其他内容。'
        },
        { role: 'user', content: recentMsgs }
      ],
      stream: false,
      max_tokens: 30
    })

    if (result.content) {
      const title = result.content.trim().replace(/^["'「]|["'」]$/g, '').slice(0, 15)
      if (title) {
        updateConversationTitle(conversationId, title)
        if (window) {
          window.webContents.send('chat:titleUpdated', { conversationId, title })
        }
      }
    }
  } catch {
    // Title generation is non-critical
  }
}

const SUMMARY_THRESHOLD = 10

async function maybeGenerateSummary(
  conversationId: string,
  providerId: string,
  modelId: string
): Promise<void> {
  try {
    const allMessages = getMessages(conversationId)
    const userAssistantMsgs = allMessages.filter((m) => m.role === 'user' || m.role === 'assistant')
    if (userAssistantMsgs.length < SUMMARY_THRESHOLD) return

    const existing = getSummary(conversationId)
    const messagesToSummarize = userAssistantMsgs
      .slice(0, -RECENT_ROUNDS * 2)
      .map((m) => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`)
      .join('\n')

    if (!messagesToSummarize) return

    const previousSummary = existing?.summary ? `之前的摘要：${existing.summary}\n\n` : ''
    const summaryMessages: ChatMessage[] = [
      {
        role: 'system',
        content:
          '你是一个对话摘要助手。请将以下对话内容压缩为简洁的摘要，保留关键信息、用户偏好和重要决策。摘要控制在 200 字以内。'
      },
      {
        role: 'user',
        content: `${previousSummary}需要摘要的对话：\n${messagesToSummarize}`
      }
    ]

    const result = await callLLM(providerId, {
      modelId,
      messages: summaryMessages,
      stream: false
    })

    if (result.content) {
      upsertSummary(conversationId, result.content, estimateTokens(result.content))
    }
  } catch {
    // Summary generation is non-critical, silently ignore errors
  }
}

function buildToolsList(
  skillIds: string[],
  mcpIds: string[],
  promptSkillDirs: string[] = [],
  kbCategoryIds: string[] = []
): any[] {
  // Core tools 默认全量加入；当未启用知识库时剔除 kb_* 工具，避免给模型展示无意义入口
  const filteredCore = kbCategoryIds.length > 0
    ? coreToolDefs
    : coreToolDefs.filter((t: any) => !KB_TOOL_NAMES.includes(t?.function?.name))
  const tools: any[] = [...filteredCore]

  // Add user skills as tools (skip core tool names to avoid duplicates)
  const allSkills = listSkills()
  for (const skill of allSkills) {
    if (skillIds.includes(skill.id) && skill.enabled && !CORE_TOOL_NAMES.includes(skill.function_def?.name)) {
      tools.push({
        type: 'function',
        function: skill.function_def
      })
    }
  }

  // Add use_skill tool if there are enabled prompt skills (filtered by bot config)
  const allPromptSkills = listPromptSkills().filter((s) => s.enabled)
  const promptSkills = promptSkillDirs.length > 0
    ? allPromptSkills.filter((s) => promptSkillDirs.includes(s.dirName))
    : allPromptSkills
  if (promptSkills.length > 0) {
    const skillList = promptSkills.map((s) => `- ${s.name}: ${s.description}`).join('\n')
    tools.push({
      type: 'function',
      function: {
        name: 'use_skill',
        description: `IMPORTANT: When the user's request matches any available skill below, you MUST call this tool first to load the skill's full instructions before responding. Do NOT attempt to answer directly without loading the skill.\n\nAvailable skills:\n${skillList}`,
        parameters: {
          type: 'object',
          properties: {
            skill_name: {
              type: 'string',
              description: 'Name of the skill to load. Must match one of the available skills.',
              enum: promptSkills.map((s) => s.name)
            }
          },
          required: ['skill_name']
        }
      }
    })
  }

  // Add MCP server tools
  for (const mcpId of mcpIds) {
    const server = getMcpServer(mcpId)
    if (server && server.enabled) {
      for (const tool of server.tools) {
        tools.push({
          type: 'function',
          function: tool
        })
      }
    }
  }

  return tools
}

async function executeToolCall(
  toolCall: any,
  skillIds: string[],
  mcpIds: string[],
  conversationId?: string,
  kbCategoryIds: string[] = []
): Promise<any> {
  const functionName = toolCall.function?.name
  let args: any = {}
  try {
    args = JSON.parse(toolCall.function?.arguments || '{}')
  } catch {}

  // Handle use_skill (prompt skill)
  if (functionName === 'use_skill') {
    const skillName = args.skill_name
    const promptSkill = getPromptSkillByName(skillName)
    if (promptSkill) {
      const workspaceDir = conversationId ? getWorkspaceDir(conversationId) : ''
      const pathInfo = [
        `[Skill资源目录]: ${promptSkill.skillDir}`,
        workspaceDir ? `[工作区目录]: ${workspaceDir}` : ''
      ].filter(Boolean).join('\n')
      return `[Skill loaded: ${skillName}]\n${pathInfo}\n\nFollow the instructions below to complete the user's request:\n\n${promptSkill.content}`
    }
    return { error: `Skill "${skillName}" not found or disabled` }
  }

  // Try core tools first
  const sandboxDir = conversationId ? getWorkspaceDir(conversationId) : undefined
  const kbContext = { kbCategoryIds }
  const coreResult = await executeCoreToolCall(functionName, args, sandboxDir, kbContext)
  if (coreResult.handled) return coreResult.result

  // Try user skills
  const allSkills = listSkills()
  const skill = allSkills.find(
    (s) => skillIds.includes(s.id) && s.function_def?.name === functionName
  )

  if (skill) {
    const result = await executeSkillSandbox(skill.implementation, args, sandboxDir)
    return result.success ? result.result : { error: result.error }
  }

  // Try MCP tools
  for (const mcpId of mcpIds) {
    const server = getMcpServer(mcpId)
    if (server && server.enabled) {
      const mcpTool = server.tools.find((t: any) => t.name === functionName)
      if (mcpTool) {
        try {
          return await callMcpTool(mcpId, functionName, args)
        } catch (err: any) {
          return { error: `MCP tool ${functionName} failed: ${err.message}` }
        }
      }
    }
  }

  return { error: `Tool ${functionName} not found` }
}
