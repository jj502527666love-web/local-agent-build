import { getDatabase } from '../database'
import { v4 as uuid } from 'uuid'
import { join } from 'path'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { getDataDir } from './data-path'

export interface Conversation {
  id: string
  bot_id: string
  title: string
  // 「智能体不再绑定模型」改造：每个会话独立持久记忆当前模型
  // - 新建时填入云控端默认（site-config.chat_default_model）；缺省留空
  // - 用户在输入框左下角切换 → updateConversationModel 写回
  // - chat-engine sendMessage 时按 conv → cloud_default → 本地第一个 chat 模型 回退链解析
  active_model_provider_id: string
  active_model_id: string
  // v0.6.6+ 「对话内生图模型独立选择」：会话级记忆生图服务商/模型。
  // - 输入框左下角「生图：」切换器写回
  // - chat-engine 调 image_gen tool 时若 LLM args 未传 provider_id/model_id，回退到这两列
  // - 仍空时让 LLM 自行 list_providers（保持向后兼容）
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
  tool_call_id: string
  /** 推理模型思维链(仅 UI 展示，不回传模型)。 */
  reasoning: string
  created_at: string
}

export function listConversations(botId: string): Conversation[] {
  const db = getDatabase()
  return db
    .prepare('SELECT * FROM conversations WHERE bot_id = ? ORDER BY updated_at DESC')
    .all(botId) as Conversation[]
}

export function getConversation(id: string): Conversation | null {
  const db = getDatabase()
  return (
    (db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Conversation) || null
  )
}

export function createConversation(
  botId: string,
  title?: string,
  initialModel?: { provider_id: string; model_id: string },
  initialImageModel?: { provider_id: string; model_id: string }
): Conversation {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString()
  // 新建时把云控端默认模型（或显式传入的初始模型）写入 active_model_*；
  // 缺省时留空字符串，chat-engine 解析时再走回退链
  const pid = initialModel?.provider_id || ''
  const mid = initialModel?.model_id || ''
  // 生图模型同理：新建时可选预填（本地第一个 image 类型模型），缺省留空
  const ipid = initialImageModel?.provider_id || ''
  const imid = initialImageModel?.model_id || ''
  db.prepare(
    'INSERT INTO conversations (id, bot_id, title, active_model_provider_id, active_model_id, active_image_provider_id, active_image_model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, botId, title || 'New Chat', pid, mid, ipid, imid, now, now)
  // Eagerly create workspace directory so the "工作区" button works before any tool writes files.
  try {
    const wsDir = join(getDataDir(), 'workspaces', id)
    if (!existsSync(wsDir)) mkdirSync(wsDir, { recursive: true })
  } catch (e) {
    console.error('Failed to create workspace dir:', e)
  }
  return getConversation(id)!
}

export function updateConversationTitle(id: string, title: string): void {
  const db = getDatabase()
  const now = new Date().toISOString()
  db.prepare('UPDATE conversations SET title=?, updated_at=? WHERE id=?').run(title, now, id)
}

/**
 * 切换会话使用的模型（输入框左下角下拉触发）。
 * 仅写两个字段，不更新 updated_at（避免污染会话列表的排序，切模型不算"有新消息"）
 * provider_id / model_id 任一为空表示清空（恢复回退链）
 */
export function updateConversationModel(
  id: string,
  provider_id: string,
  model_id: string
): void {
  const db = getDatabase()
  db.prepare(
    'UPDATE conversations SET active_model_provider_id=?, active_model_id=? WHERE id=?'
  ).run(provider_id || '', model_id || '', id)
}

/**
 * 切换会话使用的生图模型（输入框左下角「生图：」切换器触发）。
 * 同 updateConversationModel：不更新 updated_at，不污染会话列表排序。
 * 任一为空 → 表示清空，chat-engine 调 image_gen 时让 LLM 自行 list_providers。
 */
export function updateConversationImageModel(
  id: string,
  provider_id: string,
  model_id: string
): void {
  const db = getDatabase()
  db.prepare(
    'UPDATE conversations SET active_image_provider_id=?, active_image_model_id=? WHERE id=?'
  ).run(provider_id || '', model_id || '', id)
}

export function deleteConversation(id: string): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
  // Cleanup workspace directory
  try {
    const wsDir = join(getDataDir(), 'workspaces', id)
    if (existsSync(wsDir)) rmSync(wsDir, { recursive: true, force: true })
  } catch (e) {
    console.error('Failed to cleanup workspace:', e)
  }
  return result.changes > 0
}

export function getMessages(conversationId: string): Message[] {
  const db = getDatabase()
  // 排序兜底 rowid：一轮 agent 调用里 assistant(tool_calls)→tool→tool 是同步连续插入，
  // created_at（ISO 毫秒）常完全相同。仅按 created_at 排序时 SQLite 不保证同值行的顺序，
  // 会导致重建历史时 tool_calls 配对错乱 / 显示乱序。rowid 是隐式自增插入序（等效 seq 列），
  // 作为第二排序键即可稳定复原真实写入顺序，且无需加列、无迁移与并发赋值风险。
  const rows = db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC')
    .all(conversationId) as any[]
  return rows.map((r) => ({
    ...r,
    attachments: JSON.parse(r.attachments || '[]'),
    tool_calls: JSON.parse(r.tool_calls || '[]'),
    tool_call_id: r.tool_call_id || '',
    reasoning: r.reasoning || ''
  }))
}

export function addMessage(data: {
  conversation_id: string
  role: string
  content: string
  attachments?: any[]
  tool_calls?: any[]
  tool_call_id?: string
  reasoning?: string
}): Message {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO messages (id, conversation_id, role, content, attachments, tool_calls, tool_call_id, reasoning, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    data.conversation_id,
    data.role,
    data.content,
    JSON.stringify(data.attachments || []),
    JSON.stringify(data.tool_calls || []),
    data.tool_call_id || '',
    data.reasoning || '',
    now
  )
  db.prepare('UPDATE conversations SET updated_at=? WHERE id=?').run(now, data.conversation_id)
  return {
    id,
    conversation_id: data.conversation_id,
    role: data.role,
    content: data.content,
    attachments: data.attachments || [],
    tool_calls: data.tool_calls || [],
    tool_call_id: data.tool_call_id || '',
    reasoning: data.reasoning || '',
    created_at: now
  }
}

export function deleteMessage(id: string): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM messages WHERE id = ?').run(id)
  return result.changes > 0
}

// 删除指定消息及其之后的所有消息(用于编辑/重新生成时截断历史)。返回删除数量。
export function deleteMessagesFrom(conversationId: string, fromMessageId: string): number {
  const db = getDatabase()
  const msgs = getMessages(conversationId)
  const idx = msgs.findIndex((m) => m.id === fromMessageId)
  if (idx === -1) return 0
  const idsToDelete = msgs.slice(idx).map((m) => m.id)
  const stmt = db.prepare('DELETE FROM messages WHERE id = ?')
  const tx = db.transaction(() => {
    for (const mid of idsToDelete) stmt.run(mid)
  })
  tx()
  return idsToDelete.length
}
