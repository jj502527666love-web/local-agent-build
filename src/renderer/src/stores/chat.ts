import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { translateError } from '@/utils/error-message'

export interface Conversation {
  id: string
  bot_id: string
  title: string
  // 「智能体不再绑定模型」改造（v0.6.5+）：每个会话独立持久记忆当前模型
  // 新建时填入云控端默认（site-config.chat_default_model）；用户切换 → updateConversationModel
  active_model_provider_id: string
  active_model_id: string
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
  const streamContent = ref('')
  /** 会话级草稿 Map：切走页面 / 切换对话不丢。重启 app 后重置。 */
  const drafts = ref<Record<string, ChatDraft>>({})

  const streaming = computed(() =>
    currentConversationId.value ? streamingConvIds.value.has(currentConversationId.value) : false
  )

  const currentConversation = computed(() =>
    conversations.value.find((c) => c.id === currentConversationId.value) || null
  )

  async function fetchConversations(botId: string) {
    currentBotId.value = botId
    conversations.value = (await window.api.chat.invoke('listConversations', botId)) as Conversation[]
  }

  async function createConversation(
    botId: string,
    title?: string,
    initialModel?: { provider_id: string; model_id: string }
  ) {
    const result = (await window.api.chat.invoke(
      'createConversation',
      botId,
      title,
      initialModel
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

  async function sendMessage(content: string, attachments?: any[], overrides?: {
    kbCategoryIds?: string[]
    skillIds?: string[]
    mcpIds?: string[]
    promptSkillDirs?: string[]
  }) {
    if (!currentConversationId.value || !currentBotId.value) return

    const convId = currentConversationId.value!
    const botId = currentBotId.value!
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
    window.api.chat.onStream((data: any) => {
      if (data.type === 'content') {
        streamContent.value += data.content
        const msg = messages.value.find((m) => m.id === tempId)
        if (msg) msg.content = streamContent.value
      } else if (data.type === 'tool_start') {
        streamContent.value = ''
        const names = (data.tools as string[])?.join(', ') || ''
        if (names) toolLogs.push(`> calling: ${names}`)
        const msg = messages.value.find((m) => m.id === tempId)
        if (msg) {
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
        streamContent.value = ''
        const msg = messages.value.find((m) => m.id === tempId)
        if (msg) msg.content = ''
      } else if (data.type === 'aborted') {
        const msg = messages.value.find((m) => m.id === tempId)
        if (msg && !msg.content) msg.content = '[\u5df2\u4e2d\u65ad]'
      } else if (data.type === 'error') {
        const msg = messages.value.find((m) => m.id === tempId)
        if (msg) msg.content = `[Error] ${translateError(data.error)}`
      }
      // Don't handle 'done' here - cleanup after IPC resolves
    })

    try {
      await window.api.chat.invoke('sendMessage', {
        conversationId: convId,
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
      // Collapse tool logs after response completes
      const msg = messages.value.find((m) => m.id === tempId)
      if (msg) {
        msg._toolActive = false
        msg._collapsed = true
      }
      streamingConvIds.value.delete(convId)
      streamingConvIds.value = new Set(streamingConvIds.value)
      window.api.chat.offStream()
    }

    // Refresh messages from DB - preserve streamed content to avoid flash
    if (currentConversationId.value === convId) {
      const lastContent = streamContent.value
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
    streamContent.value = ''
    drafts.value = {}
  }

  function isConversationStreaming(convId: string): boolean {
    return streamingConvIds.value.has(convId)
  }

  async function cancel(convId?: string) {
    const id = convId || currentConversationId.value
    if (!id) return false
    return (await window.api.chat.invoke('cancel', id)) as boolean
  }

  return {
    conversations,
    messages,
    currentConversationId,
    currentBotId,
    streaming,
    streamContent,
    isConversationStreaming,
    currentConversation,
    drafts,
    fetchConversations,
    createConversation,
    updateConversationModel,
    selectConversation,
    deleteConversation,
    updateTitle,
    listenTitleUpdates,
    stopListenTitleUpdates,
    sendMessage,
    cancel,
    getDraft,
    setDraft,
    clearDraft,
    reset
  }
})
