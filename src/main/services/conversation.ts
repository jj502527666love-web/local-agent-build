import { getDatabase } from '../database'
import { v4 as uuid } from 'uuid'
import { join } from 'path'
import { existsSync, rmSync } from 'fs'
import { getDataDir } from './data-path'

export interface Conversation {
  id: string
  bot_id: string
  title: string
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

export function createConversation(botId: string, title?: string): Conversation {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO conversations (id, bot_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, botId, title || 'New Chat', now, now)
  return getConversation(id)!
}

export function updateConversationTitle(id: string, title: string): void {
  const db = getDatabase()
  const now = new Date().toISOString()
  db.prepare('UPDATE conversations SET title=?, updated_at=? WHERE id=?').run(title, now, id)
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
  const rows = db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
    .all(conversationId) as any[]
  return rows.map((r) => ({
    ...r,
    attachments: JSON.parse(r.attachments || '[]'),
    tool_calls: JSON.parse(r.tool_calls || '[]')
  }))
}

export function addMessage(data: {
  conversation_id: string
  role: string
  content: string
  attachments?: any[]
  tool_calls?: any[]
}): Message {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO messages (id, conversation_id, role, content, attachments, tool_calls, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    data.conversation_id,
    data.role,
    data.content,
    JSON.stringify(data.attachments || []),
    JSON.stringify(data.tool_calls || []),
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
    created_at: now
  }
}

export function deleteMessage(id: string): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM messages WHERE id = ?').run(id)
  return result.changes > 0
}
