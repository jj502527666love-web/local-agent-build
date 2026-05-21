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
// Hard deadline as a safety net (30 min) — prevents a runaway agent / LLM loop
// from burning tokens forever, but is NOT a per-task duration limit. Agent can
// keep working until completion or user pressing Stop, as long as每一步都在前进。
// 长时间静默由 llm.ts 的 stream idle timeout 单独识别（见 STREAM_IDLE_TIMEOUT_MS）。
const AGENT_HARD_DEADLINE_MS = 30 * 60_000
// Tool approval popup独立超时（30 min）：用户离开喝水/开会不会被强制拒绝；
// 真正想取消的话用对话面板的「中止」按钮（走 cancelChat → abortController.abort()）。
const APPROVAL_TIMEOUT_MS = 30 * 60_000
const MAX_TOOL_RESULT_CHARS = 12_000

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
  for (const [, ctx] of pendingApprovals) {
    if (ctx.conversationId === conversationId) {
      ctx.cleanup()
      ctx.resolve(false)
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
  cleanup: () => void
}
const pendingApprovals = new Map<string, PendingApproval>()

const DESTRUCTIVE_FILE_OPS = new Set(['write', 'append', 'mkdir', 'delete', 'copy', 'rename', 'write_json'])

function isDestructiveTool(name: string, args: any): boolean {
  if (name === 'run_command') return true
  if (name === 'file_ops') return DESTRUCTIVE_FILE_OPS.has(args?.action)
  if (name === 'use_skill' || name === 'image_gen' || KB_TOOL_NAMES.includes(name)) return false
  if (name) return true
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
    const cleanup = () => {
      pendingApprovals.delete(requestId)
      signal.removeEventListener('abort', onAbort)
      clearTimeout(timer)
    }
    const onAbort = () => {
      const ctx = pendingApprovals.get(requestId)
      if (ctx) {
        cleanup()
        ctx.resolve(false)
      }
    }
    const timer = setTimeout(() => {
      const ctx = pendingApprovals.get(requestId)
      if (ctx) {
        cleanup()
        ctx.resolve(false)
      }
    }, APPROVAL_TIMEOUT_MS)
    pendingApprovals.set(requestId, { conversationId, resolve, cleanup })
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
      cleanup()
      resolve(false)
    }
  })
}

export function respondToolApproval(requestId: string, approved: boolean): boolean {
  const ctx = pendingApprovals.get(requestId)
  if (!ctx) return false
  ctx.cleanup()
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

async function retrieveRelevantChunks(docText: string, query: string, docName: string, signal?: AbortSignal): Promise<string> {
  const chunks = splitIntoChunks(docText, DOC_CHUNK_SIZE, DOC_CHUNK_OVERLAP)
  if (chunks.length === 0) return docText

  const queryResult = await embedText(query, { signal })
  const chunkResults = await embedBatch(chunks, undefined, { signal })

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

function limitToolResult(resultStr: string): string {
  if (resultStr.length <= MAX_TOOL_RESULT_CHARS) return resultStr
  return resultStr.slice(0, MAX_TOOL_RESULT_CHARS) + `\n...[tool result truncated, ${resultStr.length} chars total]`
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

function normalizeAttachments(attachments?: any[]): any[] | undefined {
  if (!attachments || attachments.length === 0) return attachments
  return attachments.map((att) => {
    if (!att || typeof att !== 'object') return att
    if (att.id) return att
    return { ...att, id: `att_${uuid()}` }
  })
}

function isImageAttachment(att: any): boolean {
  return !!att && att.type === 'image' && typeof att.data === 'string' && att.data.startsWith('data:image/')
}

function collectImageAttachmentRefs(history: any[], limit = 12): Array<{ id: string; name: string; data: string; messageId: string }> {
  const refs: Array<{ id: string; name: string; data: string; messageId: string }> = []
  const seen = new Set<string>()
  for (let i = history.length - 1; i >= 0 && refs.length < limit; i--) {
    const msg = history[i]
    if (msg?.role !== 'user' || !Array.isArray(msg.attachments)) continue
    for (let j = msg.attachments.length - 1; j >= 0 && refs.length < limit; j--) {
      const att = msg.attachments[j]
      if (!isImageAttachment(att)) continue
      const id = String(att.id || `${msg.id}:${j}`)
      if (seen.has(id)) continue
      seen.add(id)
      refs.push({
        id,
        name: String(att.name || `image-${j + 1}`),
        data: att.data,
        messageId: String(msg.id || '')
      })
    }
  }
  return refs
}

function normalizeStringList(value: any): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean)
  if (typeof value === 'string') return value.split(',').map((v) => v.trim()).filter(Boolean)
  return []
}

function shouldAutoInjectRecentImages(args: any, userContent: string): boolean {
  const text = `${userContent || ''}\n${args?.prompt || ''}`.toLowerCase()
  return /这张|这幅|这图|图片|照片|参考|基于|根据|保持|改成|修改|编辑|用.*图|image|photo|picture|reference|based on|edit|modify|this image/.test(text)
}

function resolveImageGenRefImages(args: any, refs: Array<{ id: string; name: string; data: string; messageId: string }>, currentTurnRefs: Array<{ id: string; name: string; data: string; messageId: string }>, userContent: string): string[] {
  const direct = Array.isArray(args.ref_images)
    ? args.ref_images.filter((v: any) => typeof v === 'string' && v.startsWith('data:image/'))
    : []
  const ids = normalizeStringList(args.ref_image_ids)
  const byId = new Map(refs.map((r) => [r.id, r]))
  const byName = new Map(refs.map((r) => [r.name, r]))
  const resolved = ids
    .map((id) => byId.get(id) || byName.get(id))
    .filter(Boolean)
    .map((r: any) => r.data)
  const autoRefs = direct.length || resolved.length
    ? []
    : (currentTurnRefs.length > 0 || shouldAutoInjectRecentImages(args, userContent) ? (currentTurnRefs.length ? currentTurnRefs : refs).slice(0, 4).map((r) => r.data) : [])
  return Array.from(new Set([...direct, ...resolved, ...autoRefs])).slice(0, 10)
}

export async function sendMessage(
  options: SendMessageOptions,
  window: BrowserWindow | null
): Promise<void> {
  const bot = getBot(options.botId)
  if (!bot) throw new Error('Bot not found')

  // 「智能体不再绑定模型」改造（v0.6.5+）：模型从 conversation.active_model_* 读取
  // - 优先用 conv.active_model_*（用户在输入框左下角切换过的在这里）
  // - 回退：bot.model_*（旧数据：之前绑在 bot 上的模型）
  // - 都为空时报错，提示用户从输入框左下角选模型
  const conv = getConversation(options.conversationId)
  if (!conv) throw new Error('Conversation not found')
  const effectiveProviderId =
    conv.active_model_provider_id || bot.model_provider_id || 'cloud:default'
  const effectiveModelId = conv.active_model_id || bot.model_id || ''
  if (!effectiveModelId) {
    throw new Error('未选择对话模型，请在输入框左下角选择模型')
  }

  // Save user message
  const normalizedAttachments = normalizeAttachments(options.attachments)
  const savedUserMessage = addMessage({
    conversation_id: options.conversationId,
    role: 'user',
    content: options.content,
    attachments: normalizedAttachments
  })

  const prevCtrl = activeControllers.get(options.conversationId)
  if (prevCtrl) prevCtrl.abort()
  const abortController = new AbortController()
  activeControllers.set(options.conversationId, abortController)
  const signal = abortController.signal
  // 不再做整轮 180s 硬超时。只保留 30 分钟 hard deadline 兜底防失控循环。
  // 实际「卡死检测」由 llm.ts 的 stream idle timeout 完成（60s 无 token 即视为静默）。
  let agentTurnTimedOut = false
  const agentTurnTimer = setTimeout(() => {
    agentTurnTimedOut = true
    abortController.abort()
  }, AGENT_HARD_DEADLINE_MS)
  const emitStream = (payload: Record<string, any>): void => {
    if (!window) return
    window.webContents.send('chat:stream', {
      ...payload,
      conversationId: options.conversationId
    })
  }

  try {
  // Build message history
  const history = getMessages(options.conversationId)
  const imageAttachmentRefs = collectImageAttachmentRefs(history)
  const currentTurnImageAttachmentRefs = collectImageAttachmentRefs([savedUserMessage])
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
  capSummary.push(`模型: ${effectiveModelId}`)
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

  // v0.6.6+ 智能体「调用生图能力」总开关：关时不给 LLM 注入任何生图相关信息（默认默认生图模型、工作流说明），
  // 避免某些小型模型看到 image_gen tool 定义后误调。同时 buildToolsList 也会过滤掉 image_gen tool，双重防护。
  if (bot.enable_image_gen) {
    // 会话默认生图模型：告知 LLM 调 image_gen 时可以跳过 list_providers，减少一轮 tool call。
    // 不告知（conv 未设）时走原本路径：LLM 先 list_providers 拿完整服务商列表再 generate。
    if (conv.active_image_provider_id && conv.active_image_model_id) {
      baseSystemParts.push(
        `[当前会话默认生图模型]:\n` +
        `- model_provider_id: ${conv.active_image_provider_id}\n` +
        `- model_id: ${conv.active_image_model_id}\n` +
        `- 调用 image_gen 工具且用户未明确指定服务商或模型时，直接用此默认值 generate，不必先调 list_providers\n` +
        `- 用户明确说"用某某服务商/某某模型"时应 list_providers 查找后再 generate`
      )
    }

    if (imageAttachmentRefs.length > 0) {
      const refList = imageAttachmentRefs
        .map((r, i) => `${i + 1}. id=${r.id}, name=${r.name}`)
        .join('\n')
      baseSystemParts.push(
        `[可用于生图参考的最近图片附件]:\n${refList}\n` +
        `- 若用户要求基于附件、参考图、修改图片或延续上一张图，调用 image_gen 时可传 ref_image_ids: ["附件id"]\n` +
        `- 若用户本轮刚上传了图片并要求生图/改图，即使不传 ref_image_ids，系统也会自动把本轮图片作为参考图注入\n` +
        `- 不要把图片 data URI/base64 原文写进 ref_images，优先使用 ref_image_ids`
      )
    }

    // 图片生成工作流约定：image_gen 是 fire-and-forget 异步工具，避免阻塞对话 30-90 秒。
    // 工具立即返回 status:'pending'，后台异步生成；完成后系统自动追加图片消息到对话流。
    baseSystemParts.push(
      `[图片生成工作流（异步、不等图）]:\n` +
      `- 用户请求绘图/生成图片时：把用户需求总结、补全为高质量提示词，调用 image_gen({action:'generate', prompt:<提示词>}) 一次\n` +
      `- 不要传 quality 参数；对话生图统一由系统使用 auto\n` +
      `- 工具会**立即返回 status:'pending'**，表示任务已提交。这是正常的——不要等图、不要重试、不要再次调用\n` +
      `- 收到 pending 后用一句话简短告诉用户："已为你提交生图任务，约 30-90 秒后图片会自动出现在对话和右上角"，然后立即结束本轮回复\n` +
      `- 不要在回复里嵌入 markdown 图片：图片还没生成完，url 此刻并不存在\n` +
      `- 生成完成后系统会自动追加一条 assistant 消息（含 markdown 图片）到对话，无需你做任何操作\n` +
      `- 用户在等待期间可以继续聊天，你正常回应即可。新一轮请求若再次需要画图，再次调用 image_gen\n` +
      `- 不要在调用前列出 providers，不要重复调用\n` +
      `- 失败时（tool 返回 error 字段）：简要说明原因并给出建议，不要重试`
    )
  }

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
        const queryEmbed = await embedText(enhancedQuery, { signal })
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
      if (signal.aborted) throw new AbortedError()
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
                docText = await retrieveRelevantChunks(att.data, msg.content, att.name, signal)
              } catch (e) {
                if (signal.aborted) throw e
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
  const promptBudget = getModelPromptBudget(effectiveModelId)
  const budget = promptBudget - systemTokens
  let included = historyMessages.slice(-RECENT_ROUNDS * 2)
  included = repairHistoryHead(included)
  while (included.length > 2 && estimateMessagesTokens(included) > budget) {
    included = included.slice(2)
    included = repairHistoryHead(included)
  }
  messages.push(...included)

  // Build tools list from skills and MCP (KB tools auto-included when KB enabled)
  const tools = buildToolsList(effectiveSkillIds, effectiveMcpIds, effectivePromptSkillDirs, effectiveKbCategoryIds, !!bot.enable_image_gen)

  const systemCount = messages.length - included.length
  console.log(`[chat] context: ${systemCount} system + ${included.length} history msgs, ~${estimateMessagesTokens([...messages])} tokens, ${tools.length} tools`)

  // Call LLM with multi-round tool call loop (agent mode)
  // 25 轮上限对齐主流 AI 编辑器（Cursor agent ~25）。整轮真正卡死由
  // stream idle timeout（llm.ts）+ 30 分钟 hard deadline 兜底检测。
  const MAX_TOOL_ROUNDS = 25
    let currentMessages: ChatMessage[] = [...messages]
    let round = 0

    while (round <= MAX_TOOL_ROUNDS) {
      if (signal.aborted) throw new AbortedError()
      const t0 = Date.now()
      const response = await callLLM(
        effectiveProviderId,
        {
          modelId: effectiveModelId,
          messages: currentMessages,
          tools: tools.length > 0 ? tools : undefined,
          stream: true,
          signal,
          streamContext: { conversationId: options.conversationId }
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
      emitStream({ type: 'tool_start', tools: toolNames })

      // Pass 1 (serial): approval gate, collect rejections eagerly so the user sees them paired with the right call.
      type Plan = { toolCall: any; fnName: string; result?: any; resultStr?: string }
      const plans: Plan[] = []
      const sandboxDir = getWorkspaceDir(options.conversationId)
      for (const toolCall of response.tool_calls) {
        if (signal.aborted) throw new AbortedError()
        const fnName = toolCall.function?.name || 'unknown'
        let parsedArgs: any = {}
        try { parsedArgs = JSON.parse(toolCall.function?.arguments || '{}') } catch {}

        if (fnName === 'image_gen' && parsedArgs?.action === 'generate') {
          let mutated = false
          if (!parsedArgs.model_provider_id && conv.active_image_provider_id) {
            parsedArgs.model_provider_id = conv.active_image_provider_id
            mutated = true
          }
          if (!parsedArgs.model_id && conv.active_image_model_id) {
            parsedArgs.model_id = conv.active_image_model_id
            mutated = true
          }
          if (parsedArgs.quality !== 'auto') {
            parsedArgs.quality = 'auto'
            mutated = true
          }
          const refImages = resolveImageGenRefImages(parsedArgs, imageAttachmentRefs, currentTurnImageAttachmentRefs, options.content)
          if (refImages.length > 0) {
            parsedArgs.ref_images = refImages
            mutated = true
          }
          if (mutated) {
            toolCall.function.arguments = JSON.stringify(parsedArgs)
            console.log(`[chat] image_gen args normalized: provider=${parsedArgs.model_provider_id || ''}, model=${parsedArgs.model_id || ''}, refs=${parsedArgs.ref_images?.length || 0}`)
          }
        }

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
            emitStream({ type: 'tool_result', tool: fnName, summary: '[已拒绝]' })
            continue
          }
        }
        plans.push({ toolCall, fnName })
      }

      // Pass 2 (parallel): execute all approved tools concurrently while preserving call order.
      const pendingExecs = plans.map(async (p) => {
        if (p.resultStr !== undefined) return p
        if (signal.aborted) throw new AbortedError()
        const result = await executeToolCall(
          p.toolCall,
          effectiveSkillIds,
          effectiveMcpIds,
          options.conversationId,
          effectiveKbCategoryIds,
          window,
          signal,
          undefined
        )
        // 工具已经返回字符串（如 use_skill 返回的 markdown skill 正文）就直接用；
        // 再 JSON.stringify 会在原文外面再裹一层引号 + 转义全部 \n 和 "，
        // 使 tool message content 变成 "\"# title\\n...\\n...\""，部分 OpenAI 兼容
        // 上游（deepseek/智谱/豆包/Moonshot 等）拿到这种「双重转义字符串」会触发
        // silent 200 + 空 SSE，表现为「调用工具后 AI 不再回复」。
        const rawResultStr = typeof result === 'string' ? result : JSON.stringify(result)
        const resultStr = limitToolResult(rawResultStr)
        const summary = buildToolSummary(p.fnName, result, resultStr)
        emitStream({ type: 'tool_result', tool: p.fnName, summary })
        return { ...p, result, resultStr }
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

      const hasPendingImageGen = completed.some((p) =>
        p.fnName === 'image_gen' &&
        p.result &&
        typeof p.result === 'object' &&
        p.result.status === 'pending'
      )
      if (hasPendingImageGen) {
        const content = '已为你提交生图任务，约 30-90 秒后图片会自动出现在对话和右上角。'
        emitStream({ type: 'tool_done' })
        emitStream({ type: 'content', content })
        addMessage({
          conversation_id: options.conversationId,
          role: 'assistant',
          content
        })
        break
      }

      round++

      // Safety: if max rounds reached, do one final call without tools
      if (round >= MAX_TOOL_ROUNDS) {
        console.log(`[chat] max tool rounds (${MAX_TOOL_ROUNDS}) reached, final call without tools`)
        emitStream({ type: 'tool_done' })
        if (signal.aborted) throw new AbortedError()
        const finalResponse = await callLLM(
          effectiveProviderId,
          {
            modelId: effectiveModelId,
            messages: currentMessages,
            stream: true,
            signal,
            streamContext: { conversationId: options.conversationId }
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
      emitStream({ type: 'tool_done' })
    }
    // Auto-generate title on 1st or 5th user message
    maybeGenerateTitle(options.conversationId, effectiveProviderId, effectiveModelId, window)
    // Auto-summarize if history exceeds threshold
    maybeGenerateSummary(options.conversationId, effectiveProviderId, effectiveModelId)
  } catch (error: any) {
    if (agentTurnTimedOut) {
      const message = '本轮 Agent 执行已超过 30 分钟硬上限，已自动中断'
      emitStream({ type: 'error', error: message })
      addMessage({
        conversation_id: options.conversationId,
        role: 'assistant',
        content: `[Error] ${message}`
      })
    } else if (isAbortedError(error)) {
      // User-initiated cancel: surface as a friendly aborted marker, not an error.
      emitStream({ type: 'aborted' })
      addMessage({
        conversation_id: options.conversationId,
        role: 'assistant',
        content: '[已中断]'
      })
    } else {
      emitStream({ type: 'error', error: error.message })
      addMessage({
        conversation_id: options.conversationId,
        role: 'assistant',
        content: `[Error] ${error.message}`
      })
    }
  } finally {
    clearTimeout(agentTurnTimer)
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

/**
 * 把 OpenAI function schema 兜底成上游能稳定解析的形态。修两类常见缺陷：
 * - parameters 缺失 / 不是对象（例如 MCP tool 用 inputSchema 字段被裸塞过来；用户表单填错）
 *   → 兜成最小合法 { type: 'object', properties: {...} }
 * - properties 缺失 / 为空对象 {} / 不是对象
 *   部分 OpenAI 兼容上游（DeepSeek/智谱/豆包/Moonshot 等）遇到空 properties 会触发 silent 200 + 空 SSE，
 *   塞一个永远不会被模型用到的占位字段就能绕过该 bug，对正常调用无副作用。
 * 不修改输入对象，返回新对象，避免污染 DB / 内存里的原始 function_def。
 */
function normalizeFunctionSchema(fn: any): any {
  if (!fn || typeof fn !== 'object') return fn
  const rawParams = fn.parameters
  const baseParams =
    rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams) ? rawParams : {}
  const normalizedParams: any = {
    ...baseParams,
    type: typeof baseParams.type === 'string' ? baseParams.type : 'object'
  }
  const props = normalizedParams.properties
  const isEmptyProps =
    !props ||
    typeof props !== 'object' ||
    Array.isArray(props) ||
    Object.keys(props).length === 0
  if (isEmptyProps) {
    normalizedParams.properties = {
      _placeholder: {
        type: 'string',
        description: '保留字段，模型无需填充'
      }
    }
  }
  return { ...fn, parameters: normalizedParams }
}

/**
 * MCP 协议 tools/list 返回的工具用 inputSchema 字段，OpenAI function 协议用 parameters。
 * 直接把 MCP tool 当作 OpenAI function 转发会让上游收到没有 parameters 的 function，
 * 部分上游会触发 silent 200。这里做字段映射，name/description 原样保留。
 * 已经是 OpenAI 形态（含 parameters）的不动。
 */
function mcpToolToOpenAIFunction(tool: any): any {
  if (!tool || typeof tool !== 'object') return tool
  if (tool.parameters) return tool
  if (tool.inputSchema) {
    const { inputSchema, ...rest } = tool
    return { ...rest, parameters: inputSchema }
  }
  return tool
}

function buildToolsList(
  skillIds: string[],
  mcpIds: string[],
  promptSkillDirs: string[] = [],
  kbCategoryIds: string[] = [],
  enableImageGen: boolean = false
): any[] {
  // Core tools 默认全量加入；但会进一步过滤:
  // - 未启用知识库时剔除 kb_* 工具，避免给模型展示无意义入口
  // - 智能体未开启「调用生图能力」时剔除 image_gen，避免 LLM 误调、节省 prompt
  const filteredCore = coreToolDefs.filter((t: any) => {
    const name = t?.function?.name
    if (!enableImageGen && name === 'image_gen') return false
    if (kbCategoryIds.length === 0 && KB_TOOL_NAMES.includes(name)) return false
    return true
  })
  const tools: any[] = filteredCore.map((t: any) => ({
    type: 'function',
    function: normalizeFunctionSchema(t.function)
  }))

  // Add user skills as tools (skip core tool names to avoid duplicates)
  // 走 normalize 兜底：用户自建小工具的 function_def 可能 properties 为空 {} 或缺失 parameters，
  // 直接转发会让部分上游 silent 200。
  const allSkills = listSkills()
  for (const skill of allSkills) {
    if (skillIds.includes(skill.id) && skill.enabled && !CORE_TOOL_NAMES.includes(skill.function_def?.name)) {
      tools.push({
        type: 'function',
        function: normalizeFunctionSchema(skill.function_def)
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
  // 双层兜底：先把 MCP 的 inputSchema 字段映射成 OpenAI 的 parameters，再走 normalize
  // 处理空 properties 等剩余 schema 缺陷。
  for (const mcpId of mcpIds) {
    const server = getMcpServer(mcpId)
    if (server && server.enabled) {
      for (const tool of server.tools) {
        tools.push({
          type: 'function',
          function: normalizeFunctionSchema(mcpToolToOpenAIFunction(tool))
        })
      }
    }
  }

  return tools
}

/**
 * 把 tool result 压成对用户友好的简短文案，用于对话气泡里的工具调用折叠面板。
 * 默认行为：JSON.stringify 后截断 100 字（兼容旧逻辑）；
 * 对 image_gen 工具走专用文案：成功显示"图片已生成 ${basename}"，失败显示"生成失败: ${error}"。
 * 这样用户在折叠面板里看到的不是裸 JSON，体验更好。
 */
function buildToolSummary(toolName: string, result: any, resultStr: string): string {
  if (toolName === 'image_gen' && result && typeof result === 'object') {
    // chat 路径下 image_gen 是异步 fire-and-forget：立即返回 status:'pending'，
    // 实际图片在后台生成，完成后会以独立 assistant 消息追加到对话流。
    if (result.status === 'pending') return '已提交生图任务，正在后台生成…'
    if (result.error) return `生成失败：${String(result.error).slice(0, 80)}`
    if (result.success) {
      const path = String(result.path || '')
      const fileName = path ? path.split(/[\\/]/).pop() : ''
      return fileName ? `图片已生成 ${fileName}` : '图片已生成'
    }
  }
  if (typeof result === 'string') {
    return result.length > 100 ? result.slice(0, 100) + '...' : result
  }
  return resultStr.length > 100 ? resultStr.slice(0, 100) + '...' : resultStr
}

async function executeToolCall(
  toolCall: any,
  skillIds: string[],
  mcpIds: string[],
  conversationId?: string,
  kbCategoryIds: string[] = [],
  window?: BrowserWindow | null,
  signal?: AbortSignal,
  timeoutMs?: number
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
  const execContext = { conversationId, window: window || null, signal, timeoutMs }
  const coreResult = await executeCoreToolCall(functionName, args, sandboxDir, kbContext, execContext)
  if (coreResult.handled) return coreResult.result

  // Try user skills
  const allSkills = listSkills()
  const skill = allSkills.find(
    (s) => skillIds.includes(s.id) && s.function_def?.name === functionName
  )

  if (skill) {
    const result = await executeSkillSandbox(skill.implementation, args, sandboxDir, timeoutMs)
    return result.success ? result.result : { error: result.error }
  }

  // Try MCP tools
  for (const mcpId of mcpIds) {
    const server = getMcpServer(mcpId)
    if (server && server.enabled) {
      const mcpTool = server.tools.find((t: any) => t.name === functionName)
      if (mcpTool) {
        try {
          return await callMcpTool(mcpId, functionName, args, timeoutMs)
        } catch (err: any) {
          return { error: `MCP tool ${functionName} failed: ${err.message}` }
        }
      }
    }
  }

  return { error: `Tool ${functionName} not found` }
}
