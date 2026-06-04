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

/**
 * 进行中的流式回复状态（per-conversation）。
 * 提升为 store 级持久态：切走会话 / 切走页面再回来仍可继续逐字渲染。
 * 由 app 级常驻 onStream 监听更新，sendMessage 在 IPC resolve（本轮落库）后删除。
 */
export interface StreamingState {
  requestId: string
  content: string
  reasoning: string
  reasoningActive: boolean
  toolLogs: string[]
  toolActive: boolean
  collapsed: boolean
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
  /** 进行中的流式回复（per-conversation）。切走会话/页面再回来不丢，本轮完成后删除。 */
  const streamingStates = ref<Record<string, StreamingState>>({})
  /** app 级常驻流式监听只装一次的幂等标志（store 单例，setup 仅执行一次）。 */
  let streamListenerReady = false

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
    // 同步清理进行中的流式态
    if (streamingStates.value[id]) {
      const next = { ...streamingStates.value }
      delete next[id]
      streamingStates.value = next
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

  /** image_gen 等工具 tool_start 的日志行（与旧逻辑保持一致）。 */
  function buildToolStartLogs(tools: unknown): string[] {
    const list = (tools as string[]) || []
    if (!list.length) return []
    const logs: string[] = []
    const others = list.filter((t) => t !== 'image_gen')
    if (list.includes('image_gen')) {
      logs.push('> 提交生图任务…（约 30-90 秒后图片会自动出现在对话和右上角）')
    }
    if (others.length) logs.push(`> calling: ${others.join(', ')}`)
    return logs
  }

  function getStreamingState(convId: string): StreamingState | undefined {
    return streamingStates.value[convId]
  }

  /**
   * App 级常驻流式监听：只装一次，永不随组件卸载退订。
   * 按 conversationId 路由到 streamingStates，使「切走会话/页面再回来」仍能继续逐字渲染。
   * - requestId 不匹配的旧流自动忽略（同会话连发时旧轮被覆盖）。
   * - 取消后仅放行 aborted（与旧逻辑一致）。
   * - 'done' 不在此处理：清理统一在 sendMessage 的 IPC resolve 之后做。
   */
  function initStreamListener() {
    if (streamListenerReady) return
    streamListenerReady = true
    window.api.chat.onStream((data: any) => {
      const convId = data?.conversationId
      if (!convId) return
      const st = streamingStates.value[convId]
      if (!st) return
      if (data.requestId && st.requestId !== data.requestId) return
      if (canceledRequestIds.value.has(st.requestId) && data.type !== 'aborted') return

      switch (data.type) {
        case 'content':
          // 首个正文 token 到达 = 思考阶段结束，折叠思维链面板
          if (st.reasoningActive) st.reasoningActive = false
          st.content += data.content || ''
          break
        case 'reasoning':
          st.reasoning += data.content || ''
          st.reasoningActive = true
          break
        case 'tool_start':
          st.content = ''
          if (st.reasoningActive) st.reasoningActive = false
          st.toolActive = true
          st.collapsed = false
          st.toolLogs.push(...buildToolStartLogs(data.tools))
          break
        case 'tool_result':
          st.toolLogs.push(`  ${data.tool}: ${data.summary || 'done'}`)
          break
        case 'tool_done':
          st.content = ''
          break
        case 'aborted': {
          if (st.reasoningActive) st.reasoningActive = false
          const marker = data.content || '[\u5df2\u4e2d\u65ad]'
          st.content = st.content ? `${st.content}\n\n${marker}` : marker
          break
        }
        case 'error': {
          if (st.reasoningActive) st.reasoningActive = false
          const errLine = `[Error] ${translateError(data.error)}`
          st.content = st.content ? `${st.content}\n\n${errLine}` : errLine
          break
        }
      }
      // 当前停在该会话时镜像给 streamContent，沿用现有 scrollToBottom 的 watch
      if (currentConversationId.value === convId) streamContent.value = st.content
    })
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

    // 乐观插入用户消息（主进程也会立即落库；切走切回靠 getMessages 拿回）
    messages.value.push({
      id: 'temp-user-' + Date.now(),
      conversation_id: convId,
      role: 'user',
      content,
      attachments: attachments || [],
      tool_calls: [],
      created_at: new Date().toISOString()
    })

    // 进行中的流式态提升为 store 级（per-conversation），由 app 级常驻 onStream 监听更新。
    // 不再 push 临时 assistant 占位、不再注册闭包监听：切走会话/页面再回来仍能继续逐字渲染。
    streamingStates.value[convId] = {
      requestId,
      content: '',
      reasoning: '',
      reasoningActive: false,
      toolLogs: [],
      toolActive: true,
      collapsed: false,
    }

    let invokeErrorMsg = ''
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
      // 主进程通常已 catch 并把 error/aborted 落库；此处仅兜底 IPC 通道级失败。
      invokeErrorMsg = translateError(err?.message || '')
      const st = streamingStates.value[convId]
      if (st) st.content = st.content ? `${st.content}\n\n[Error] ${invokeErrorMsg}` : `[Error] ${invokeErrorMsg}`
    } finally {
      const isLatestRequest = activeRequestIds.value[convId] === requestId
      if (isLatestRequest) {
        const st = streamingStates.value[convId]
        const localContent = st?.content || ''
        const localReasoning = st?.reasoning || ''

        // 仅当仍停留在该会话时，从 DB 拉真实消息并与 live 气泡做 seamless swap。
        // 用 try/catch 包住：即便 getMessages 失败也要继续往下清理，避免会话卡在 streaming 状态。
        if (currentConversationId.value === convId) {
          try {
            const dbMessages = (await window.api.chat.invoke('getMessages', convId)) as Message[]
            if (dbMessages.length > 0) {
              const lastDb = dbMessages[dbMessages.length - 1]
              if (lastDb.role === 'assistant' && !lastDb.content && localContent) {
                lastDb.content = localContent
              }
              if (lastDb.role === 'assistant' && lastDb.content?.startsWith('[Error]')) {
                lastDb.content = `[Error] ${translateError(lastDb.content.slice(8))}`
              }
              // 思维链不入库：把本轮累积 reasoning 贴回最后一条 assistant（切走再回来才会消失）
              if (lastDb.role === 'assistant' && localReasoning) {
                lastDb._reasoning = localReasoning
                lastDb._reasoningCollapsed = true
                lastDb._reasoningActive = false
              }
            }
            // 兜底：IPC 级失败导致主进程未落库本轮 assistant 时补一条本地错误消息，避免错误丢失
            const lastDb = dbMessages[dbMessages.length - 1]
            if (invokeErrorMsg && (!lastDb || lastDb.role !== 'assistant' || !lastDb.content)) {
              dbMessages.push({
                id: 'temp-error-' + Date.now(),
                conversation_id: convId,
                role: 'assistant',
                content: `[Error] ${invokeErrorMsg}`,
                attachments: [],
                tool_calls: [],
                created_at: new Date().toISOString()
              })
            }
            // await 期间用户可能已切走：二次确认仍在该会话才覆盖 messages，避免覆盖别的会话
            if (currentConversationId.value === convId) {
              messages.value = dbMessages
            }
          } catch {
            // 拉取失败不致命：下次 selectConversation 会重新从 DB 拉
          }
        }

        // 清理流式态（始终执行，避免卡在 streaming 状态；live 气泡随之消失，已被真实消息替换）
        delete streamingStates.value[convId]
        const next = { ...activeRequestIds.value }
        delete next[convId]
        activeRequestIds.value = next
        streamingConvIds.value.delete(convId)
        streamingConvIds.value = new Set(streamingConvIds.value)
        refreshCloudBalances()
      }
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
    streamingStates.value = {}
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
    streamingStates,
    getStreamingState,
    initStreamListener,
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
