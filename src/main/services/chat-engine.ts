import { BrowserWindow } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { getDataDir } from './data-path'
import { getBot } from './bot'
import { getPersona } from './persona'
import { getMessages, addMessage, getConversation, updateConversationTitle } from './conversation'
import { callLLM, ChatMessage } from './llm'
import { listSkills } from './skill'
import { getMcpServer } from './mcp-server'
import { getSummary, upsertSummary } from './conversation-summary'
import { embedText, embedBatch, cosineSimilarity } from './embedding'
import { searchHybrid } from './vector-store'
import { listKnowledgeBases } from './knowledge'
import { executeSkillSandbox } from './skill-sandbox'
import { callMcpTool } from './mcp-server'
import { listPromptSkills, getPromptSkillByName } from './prompt-skill'
import { coreToolDefs, executeCoreToolCall, CORE_TOOL_NAMES } from './core-tools'

const MAX_CONTEXT_TOKENS = 8000

function getWorkspaceDir(conversationId: string): string {
  const dir = join(getDataDir(), 'workspaces', conversationId)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
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
    score: cosineSimilarity(queryResult.embedding, chunkResults[i].embedding)
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
  if (!bot.model_provider_id) throw new Error('Bot has no model provider configured')

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

  // Base system prompt: tool usage guidance + bot identity
  const baseSystemParts: string[] = [
    '你是一个具备工具调用能力的AI助手。当任务需要读写文件、执行命令或调用其他工具时，直接调用对应工具完成操作，不要仅描述步骤或给出建议。'
  ]

  // Bot configuration summary
  const capSummary: string[] = []
  capSummary.push(`名称: ${bot.name}`)
  capSummary.push(`模型: ${bot.model_id}`)
  if (effectiveKbCategoryIds.length > 0) capSummary.push(`知识库: 已启用 (${effectiveKbCategoryIds.length} 个分类)`)
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
      // Collect all KB IDs for the bot's categories
      const kbIds: string[] = []
      for (const catId of effectiveKbCategoryIds) {
        const kbs = listKnowledgeBases(catId)
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
          const context = results.map((r, i) => `[${i + 1}] ${r.chunk.content}`).join('\n\n')
          messages.push({
            role: 'system',
            content: `以下是从知识库中检索到的相关内容，请参考这些内容回答用户问题：\n\n${context}`
          })
          console.log(`[chat] RAG: found ${results.length} relevant chunks from ${kbIds.length} KBs`)
        }
      }
    } catch (e: any) {
      console.log(`[chat] RAG retrieval failed: ${e.message}`)
    }

    // Knowledge-base-only constraint
    if (bot.kb_only && effectiveKbCategoryIds.length > 0) {
      messages.push({
        role: 'system',
        content:
          '重要约束：你只能根据提供的知识库内容来回答问题。如果知识库中没有相关信息，请明确告知用户“知识库中未找到相关信息”，不要编造或推测答案。'
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
        // Skip assistant messages with tool_calls from history
        // (tool_call_ids are not persisted, replaying them causes API errors)
        continue
      }
      historyMessages.push({ role: 'assistant', content: msg.content })
    } else if (msg.role === 'tool') {
      // Skip tool result messages from history (paired with skipped tool_calls above)
      continue
    }
  }

  // Sliding window: keep recent rounds, trim if exceeding token limit
  const systemTokens = estimateMessagesTokens(messages)
  const budget = MAX_CONTEXT_TOKENS - systemTokens
  let included = historyMessages.slice(-RECENT_ROUNDS * 2)
  while (included.length > 2 && estimateMessagesTokens(included) > budget) {
    included = included.slice(2)
  }
  messages.push(...included)

  // Build tools list from skills and MCP
  const tools = buildToolsList(effectiveSkillIds, effectiveMcpIds, effectivePromptSkillDirs)

  const systemCount = messages.length - included.length
  console.log(`[chat] context: ${systemCount} system + ${included.length} history msgs, ~${estimateMessagesTokens([...messages])} tokens, ${tools.length} tools`)

  // Call LLM with multi-round tool call loop (agent mode)
  const MAX_TOOL_ROUNDS = 10
  try {
    let currentMessages: ChatMessage[] = [...messages]
    let round = 0

    while (round <= MAX_TOOL_ROUNDS) {
      const t0 = Date.now()
      const response = await callLLM(
        bot.model_provider_id,
        {
          modelId: bot.model_id,
          messages: currentMessages,
          tools: tools.length > 0 ? tools : undefined,
          stream: true
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

      // Execute tool calls and collect results
      for (const toolCall of response.tool_calls) {
        const fnName = toolCall.function?.name || 'unknown'
        const result = await executeToolCall(toolCall, effectiveSkillIds, effectiveMcpIds, options.conversationId)
        const resultStr = JSON.stringify(result)
        // Send tool result summary to renderer
        if (window) {
          const summary = typeof result === 'string'
            ? (result.length > 100 ? result.slice(0, 100) + '...' : result)
            : (resultStr.length > 100 ? resultStr.slice(0, 100) + '...' : resultStr)
          window.webContents.send('chat:stream', { type: 'tool_result', tool: fnName, summary })
        }
        addMessage({
          conversation_id: options.conversationId,
          role: 'tool',
          content: resultStr
        })
        currentMessages.push({
          role: 'tool',
          content: resultStr,
          tool_call_id: toolCall.id || ''
        })
      }

      round++

      // Safety: if max rounds reached, do one final call without tools
      if (round >= MAX_TOOL_ROUNDS) {
        console.log(`[chat] max tool rounds (${MAX_TOOL_ROUNDS}) reached, final call without tools`)
        if (window) {
          window.webContents.send('chat:stream', { type: 'tool_done' })
        }
        const finalResponse = await callLLM(
          bot.model_provider_id,
          {
            modelId: bot.model_id,
            messages: currentMessages,
            stream: true
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
    maybeGenerateTitle(options.conversationId, bot.model_provider_id, bot.model_id, window)
    // Auto-summarize if history exceeds threshold
    maybeGenerateSummary(options.conversationId, bot.model_provider_id, bot.model_id)
  } catch (error: any) {
    // Send error to renderer
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

function buildToolsList(skillIds: string[], mcpIds: string[], promptSkillDirs: string[] = []): any[] {
  const tools: any[] = [...coreToolDefs]

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
  conversationId?: string
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
  const coreResult = await executeCoreToolCall(functionName, args, sandboxDir)
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
