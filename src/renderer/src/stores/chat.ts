import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { translateError } from '@/utils/error-message'
import { useCloudAuthStore } from '@/stores/cloud-auth'

export interface Conversation {
  id: string
  bot_id: string
  title: string
  // 「智能体不再绑定模型」改造（v0.6.5+）：每个会话独立持久记忆当前模型
  // 新建时填入云控端默认（site-config.chat_default_model）；用户切换 → updateConversationModel
  active_model_provider_id: string
  active_model_id: string
  // v0.6.6+ 「对话内生图模型独立选择」：会话级记忆生图服务商/模型。
  // 输入框左下角「生图：」切换器写回；chat-engine 调 image_gen 时作为 LLM args 默认值。
  active_image_provider_id: string
  active_image_model_id: string
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  conversation_id: string
  role: string
  content: string
  attachments: any[]
  tool_calls: any[]
  created_at: string
  _toolLogs?: string[]
  _toolActive?: boolean
  _collapsed?: boolean
  // 推理模型思维链（仅本会话内存态，不入库；刷新后丢失属预期）
  _reasoning?: string
  _reasoningActive?: boolean
  _reasoningCollapsed?: boolean
}

/**
 * 对话输入草稿（per-conversation）。会话级维护，重启 app 后丢失，
 * 切换对话 不丢，切走页面 不丢。
 */
export interface ChatDraft {
  inputText: string
  attachments: any[]
  tempKbIds: string[]
  tempSkillIds: string[]
  tempMcpIds: string[]
  tempPromptSkillDirs: string[]
}

function emptyChatDraft(): ChatDraft {
  return {
    inputText: '',
    attachments: [],
    tempKbIds: [],
    tempSkillIds: [],
    tempMcpIds: [],
    tempPromptSkillDirs: [],
  }
}

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([])
  const messages = ref<Message[]>([])
  const currentConversationId = ref<string | null>(null)
  const currentBotId = ref<string | null>(null)
  const streamingConvIds = ref<Set<string>>(new Set())
  const activeRequestIds = ref<Record<string, string>>({})
  const canceledRequestIds = ref<Set<string>>(new Set())
  const streamContent = ref('')
  /** 会话级草稿 Map：切走页面 / 切换对话不丢。重启 app 后重置。 */
  const drafts = ref<Record<string, ChatDraft>>({})

  const streaming = computed(() =>
    currentConversationId.value ? streamingConvIds.value.has(currentConversationId.value) : false
  )

  const currentConversation = computed(() =>
    conversations.value.find((c) => c.id === currentConversationId.value) || null
  )

  function refreshCloudBalances() {
    useCloudAuthStore().refreshBalancesThrottled().catch(() => {})
  }

  function createRequestId(convId: string): string {
    return `chat-${convId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  async function fetchConversations(botId: string) {
    currentBotId.value = botId
    conversations.value = (await window.api.chat.invoke('listConversations', botId)) as Conversation[]
  }

  async function createConversation(
    botId: string,
    title?: string,
    initialModel?: { provider_id: string; model_id: string },
    initialImageModel?: { provider_id: string; model_id: string }
  ) {
    const result = (await window.api.chat.invoke(
      'createConversation',
      botId,
      title,
      initialModel,
      initialImageModel
    )) as Conversation
    conversations.value.unshift(result)
    return result
  }

  /**
   * 切换会话使用的模型（输入框左下角下拉触发）。
   * 写回主进程 + 同步更新本地 conversations 缓存中的对应会话字段，
   * 让 ChatModelSwitcher 显示立即跟随，无需重拉列表。
   */
  async function updateConversationModel(
    conversationId: string,
    provider_id: string,
    model_id: string
  ) {
    await window.api.chat.invoke('updateConversationModel', conversationId, provider_id, model_id)
    const conv = conversations.value.find((c) => c.id === conversationId)
    if (conv) {
      conv.active_model_provider_id = provider_id || ''
      conv.active_model_id = model_id || ''
    }
  }

  /**
   * 切换会话使用的生图模型（输入框左下角「生图：」切换器触发）。
   * 同 updateConversationModel：写回主进程 + 同步本地缓存，让切换器显示立即跟随。
   */
  async function updateConversationImageModel(
    conversationId: string,
    provider_id: string,
    model_id: string
  ) {
    await window.api.chat.invoke('updateConversationImageModel', conversationId, provider_id, model_id)
    const conv = conversations.value.find((c) => c.id === conversationId)
    if (conv) {
      conv.active_image_provider_id = provider_id || ''
      conv.active_image_model_id = model_id || ''
    }
  }

  async function selectConversation(id: string) {
    currentConversationId.value = id
    messages.value = (await window.api.chat.invoke('getMessages', id)) as Message[]
  }

  async function deleteConversation(id: string) {
    await window.api.chat.invoke('deleteConversation', id)
    conversations.value = conversations.value.filter((c) => c.id !== id)
    if (currentConversationId.value === id) {
      currentConversationId.value = null
      messages.value = []
    }
    // 同步清理该对话的草稿（避免微小的内存泄露）
    if (drafts.value[id]) {
      const next = { ...drafts.value }
      delete next[id]
      drafts.value = next
    }
  }

  /**
   * 读取某对话的草稿。不存在时实时创建空草稿并写回 map，调用方可直接 mutate 返回值。
   */
  function getDraft(convId: string): ChatDraft {
    if (!drafts.value[convId]) {
      drafts.value[convId] = emptyChatDraft()
    }
    return drafts.value[convId]
  }

  /** 批量设置草稿字段。适用于从 view 本地 ref 同步回 store 的场景。 */
  function setDraft(convId: string, patch: Partial<ChatDraft>): void {
    if (!drafts.value[convId]) drafts.value[convId] = emptyChatDraft()
    Object.assign(drafts.value[convId], patch)
  }

  /** 清除某对话的草稿。其他场景（如 send 后手动重置）可能需要。 */
  function clearDraft(convId: string): void {
    if (drafts.value[convId]) {
      const next = { ...drafts.value }
      delete next[convId]
      drafts.value = next
    }
  }

  async function updateTitle(id: string, title: string) {
    await window.api.chat.invoke('updateTitle', id, title)
    const conv = conversations.value.find((c) => c.id === id)
    if (conv) conv.title = title
  }

  function listenTitleUpdates() {
    window.api.chat.onTitleUpdated((data: any) => {
      const conv = conversations.value.find((c) => c.id === data.conversationId)
      if (conv) conv.title = data.title
    })
  }

  function stopListenTitleUpdates() {
    window.api.chat.offTitleUpdated()
  }

  /**
   * 监听 image_gen fire-and-forget 完成事件：主进程后台跑完 generateImages 后
   * 发出 chat:appendMessage，此处接收后把消息追加到 messages.value。
   *
   * 仅当 currentConversationId 匹配时追加；切走的会话不影响（消息已写入 DB，下次 selectConversation 会拉到）。
   * 同时也要清理 streaming 状态：图片到达意味着这一轮工具任务完成，
   * 清理 streamingConvIds 让对话气泡的"工具调用进行中"折叠面板复位。
   */
  function listenAppendMessage() {
    window.api.chat.onAppendMessage((data: any) => {
      if (!data?.conversationId || !data?.message) return
      if (data.requestId && canceledRequestIds.value.has(data.requestId)) return
      // 当前正在显示这个 conversation → 立刻追加；否则 DB 已写入，切回时 fetch 即可
      if (currentConversationId.value === data.conversationId) {
        const messageId = data.message.id
        if (!messageId || !messages.value.some((m) => m.id === messageId)) {
          messages.value.push(data.message)
        }
      }
      refreshCloudBalances()
    })
  }

  function stopListenAppendMessage() {
    window.api.chat.offAppendMessage()
  }

  async function sendMessage(content: string, attachments?: any[], overrides?: {
    kbCategoryIds?: string[]
    skillIds?: string[]
    mcpIds?: string[]
    promptSkillDirs?: string[]
  }) {
    if (!currentConversationId.value || !currentBotId.value) return

    const convId = currentConversationId.value!
    const botId = currentBotId.value!
    const requestId = createRequestId(convId)
    const previousRequestId = activeRequestIds.value[convId]
    if (previousRequestId && previousRequestId !== requestId) {
      canceledRequestIds.value.add(previousRequestId)
      canceledRequestIds.value = new Set(canceledRequestIds.value)
    }
    activeRequestIds.value = { ...activeRequestIds.value, [convId]: requestId }
    canceledRequestIds.value.delete(requestId)
    streamingConvIds.value.add(convId)
    streamingConvIds.value = new Set(streamingConvIds.value)
    streamContent.value = ''

    // Add user message locally
    messages.value.push({
      id: 'temp-user-' + Date.now(),
      conversation_id: currentConversationId.value,
      role: 'user',
      content,
      attachments: attachments || [],
      tool_calls: [],
      created_at: new Date().toISOString()
    })

    // Add placeholder assistant message
    const tempId = 'temp-assistant-' + Date.now()
    messages.value.push({
      id: tempId,
      conversation_id: currentConversationId.value,
      role: 'assistant',
      content: '',
      attachments: [],
      tool_calls: [],
      created_at: new Date().toISOString()
    })

    // Listen for stream events
    const toolLogs: string[] = []
    let localStreamContent = ''
    let localReasoning = ''
    let shouldRefreshMessages = false
    const unsubscribeStream = window.api.chat.onStream((data: any) => {
      if (data?.conversationId !== convId) return
      if (data?.requestId && data.requestId !== requestId) return
      if (canceledRequestIds.value.has(requestId) && data?.type !== 'aborted') return
      if (data.type === 'content') {
        localStreamContent += data.content
        if (currentConversationId.value === convId) streamContent.value = localStreamContent
        const msg = messages.value.find((m) => m.id === tempId)
        if (msg) {
          // 首个正文 token 到达 = 思考阶段结束，折叠思维链面板
          if (msg._reasoningActive) { msg._reasoningActive = false; msg._reasoningCollapsed = true }
          msg.content = localStreamContent
        }
      } else if (data.type === 'reasoning') {
        // 推理模型思维链：累积并实时展示「思考中」可折叠面板
        localReasoning += data.content || ''
        const msg = messages.value.find((m) => m.id === tempId)
        if (msg) {
          msg._reasoning = localReasoning
          msg._reasoningActive = true
          msg._reasoningCollapsed = false
        }
      } else if (data.type === 'tool_start') {
        localStreamContent = ''
        if (currentConversationId.value === convId) streamContent.value = ''
        const tools = (data.tools as string[]) || []
        if (tools.length) {
          // image_gen 是异步 fire-and-forget：tool_start 几乎立即被 tool_result 的 pending 摘要覆盖，
          // 真正的等待发生在后台。用户感知顺序：提交 → 立即解锁 → 后台生成 → 图片自动追加进对话。
          const others = tools.filter((t) => t !== 'image_gen')
          if (tools.includes('image_gen')) {
            toolLogs.push('> 提交生图任务…（约 30-90 秒后图片会自动出现在对话和右上角）')
          }
          if (others.length) toolLogs.push(`> calling: ${others.join(', ')}`)
        }
        const msg = messages.value.find((m) => m.id === tempId)
        if (msg) {
          if (msg._reasoningActive) { msg._reasoningActive = false; msg._reasoningCollapsed = true }
          msg.content = ''
          msg._toolLogs = [...toolLogs]
          msg._toolActive = true
          msg._collapsed = false
        }
      } else if (data.type === 'tool_result') {
        const line = `  ${data.tool}: ${data.summary || 'done'}`
        toolLogs.push(line)
        const msg = messages.value.find((m) => m.id === tempId)
        if (msg) msg._toolLogs = [...toolLogs]
      } else if (data.type === 'tool_done') {
        localStreamContent = ''
        if (currentConversationId.value === convId) streamContent.value = ''
        const msg = messages.value.find((m) => m.id === tempId)
        if (msg) msg.content = ''
      } else if (data.type === 'aborted') {
        // 保留已流式产出的半截内容，仅在尾部追加中断标记（主进程也会把 partial+标记落库）
        const msg = messages.value.find((m) => m.id === tempId)
        if (msg) {
          if (msg._reasoningActive) { msg._reasoningActive = false; msg._reasoningCollapsed = true }
          const marker = data.content || '[\u5df2\u4e2d\u65ad]'
          msg.content = msg.content ? `${msg.content}\n\n${marker}` : marker
        }
      } else if (data.type === 'error') {
        const msg = messages.value.find((m) => m.id === tempId)
        if (msg) {
          if (msg._reasoningActive) { msg._reasoningActive = false; msg._reasoningCollapsed = true }
          const errLine = `[Error] ${translateError(data.error)}`
          msg.content = msg.content ? `${msg.content}\n\n${errLine}` : errLine
        }
      }
      // Don't handle 'done' here - cleanup after IPC resolves
    })

    try {
      await window.api.chat.invoke('sendMessage', {
        conversationId: convId,
        requestId,
        botId,
        content,
        attachments,
        ...(overrides?.kbCategoryIds?.length ? { overrideKbCategoryIds: overrides.kbCategoryIds } : {}),
        ...(overrides?.skillIds?.length ? { overrideSkillIds: overrides.skillIds } : {}),
        ...(overrides?.mcpIds?.length ? { overrideMcpIds: overrides.mcpIds } : {}),
        ...(overrides?.promptSkillDirs?.length ? { overridePromptSkillDirs: overrides.promptSkillDirs } : {})
      })
    } catch (err: any) {
      const msg = messages.value.find((m) => m.id === tempId)
      if (msg && !msg.content) msg.content = `[Error] ${translateError(err.message || '')}`
    } finally {
      const isLatestRequest = activeRequestIds.value[convId] === requestId
      // Collapse tool logs after response completes
      const msg = messages.value.find((m) => m.id === tempId)
      if (msg) {
        msg._toolActive = false
        msg._collapsed = true
        msg._reasoningActive = false
        if (msg._reasoning) msg._reasoningCollapsed = true
      }
      if (isLatestRequest) {
        const next = { ...activeRequestIds.value }
        delete next[convId]
        activeRequestIds.value = next
        streamingConvIds.value.delete(convId)
        streamingConvIds.value = new Set(streamingConvIds.value)
        shouldRefreshMessages = true
      }
      const unsubscribe = unsubscribeStream as unknown as (() => void) | undefined
      if (typeof unsubscribe === 'function') unsubscribe()
      else window.api.chat.offStream()
      if (isLatestRequest) refreshCloudBalances()
    }

    // Refresh messages from DB - preserve streamed content to avoid flash
    if (shouldRefreshMessages && currentConversationId.value === convId) {
      const lastContent = localStreamContent
      const dbMessages = (await window.api.chat.invoke('getMessages', convId)) as Message[]
      // If the last DB assistant message matches streamed content, swap seamlessly
      if (dbMessages.length > 0) {
        const lastDb = dbMessages[dbMessages.length - 1]
        if (lastDb.role === 'assistant' && !lastDb.content && lastContent) {
          lastDb.content = lastContent
        }
        // Translate error messages from DB
        if (lastDb.role === 'assistant' && lastDb.content?.startsWith('[Error]')) {
          lastDb.content = `[Error] ${translateError(lastDb.content.slice(8))}`
        }
        // 思维链不入库：刷新后把本轮累积的 reasoning 贴回最后一条 assistant，
        // 让「已深度思考」折叠面板在本轮结束后仍可展开（切走会话再回来才会消失）
        if (lastDb.role === 'assistant' && localReasoning) {
          lastDb._reasoning = localReasoning
          lastDb._reasoningCollapsed = true
          lastDb._reasoningActive = false
        }
      }
      messages.value = dbMessages
    }
  }

  function reset() {
    conversations.value = []
    messages.value = []
    currentConversationId.value = null
    currentBotId.value = null
    streamingConvIds.value = new Set()
    activeRequestIds.value = {}
    canceledRequestIds.value = new Set()
    streamContent.value = ''
    drafts.value = {}
  }

  function isConversationStreaming(convId: string): boolean {
    return streamingConvIds.value.has(convId)
  }

  function isRequestCanceled(requestId?: string): boolean {
    return !!requestId && canceledRequestIds.value.has(requestId)
  }

  async function cancel(convId?: string) {
    const id = convId || currentConversationId.value
    if (!id) return false
    const requestId = activeRequestIds.value[id]
    if (requestId) {
      canceledRequestIds.value.add(requestId)
      canceledRequestIds.value = new Set(canceledRequestIds.value)
    }
    return (await window.api.chat.invoke('cancel', id, requestId)) as boolean
  }

  return {
    conversations,
    messages,
    currentConversationId,
    currentBotId,
    streaming,
    streamContent,
    isConversationStreaming,
    isRequestCanceled,
    currentConversation,
    drafts,
    fetchConversations,
    createConversation,
    updateConversationModel,
    updateConversationImageModel,
    selectConversation,
    deleteConversation,
    updateTitle,
    listenTitleUpdates,
    stopListenTitleUpdates,
    listenAppendMessage,
    stopListenAppendMessage,
    sendMessage,
    cancel,
    getDraft,
    setDraft,
    clearDraft,
    reset
  }
})
