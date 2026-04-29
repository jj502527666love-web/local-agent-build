import { getDatabase } from '../database'
import { v4 as uuid } from 'uuid'

export interface ConversationSummary {
  id: string
  conversation_id: string
  summary: string
  token_count: number
  created_at: string
  updated_at: string
}

export function getSummary(conversationId: string): ConversationSummary | null {
  const db = getDatabase()
  const row = db
    .prepare('SELECT * FROM conversation_summaries WHERE conversation_id = ? ORDER BY updated_at DESC LIMIT 1')
    .get(conversationId) as any
  return row || null
}

export function upsertSummary(conversationId: string, summary: string, tokenCount: number): ConversationSummary {
  const db = getDatabase()
  const existing = getSummary(conversationId)
  const now = new Date().toISOString()

  if (existing) {
    db.prepare('UPDATE conversation_summaries SET summary=?, token_count=?, updated_at=? WHERE id=?').run(
      summary,
      tokenCount,
      now,
      existing.id
    )
    return { ...existing, summary, token_count: tokenCount, updated_at: now }
  }

  const id = uuid()
  db.prepare(
    'INSERT INTO conversation_summaries (id, conversation_id, summary, token_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, conversationId, summary, tokenCount, now, now)
  return { id, conversation_id: conversationId, summary, token_count: tokenCount, created_at: now, updated_at: now }
}

export function deleteSummary(conversationId: string): void {
  const db = getDatabase()
  db.prepare('DELETE FROM conversation_summaries WHERE conversation_id = ?').run(conversationId)
}
