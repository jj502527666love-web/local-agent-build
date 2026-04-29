import { getDatabase } from '../database'
import { v4 as uuid } from 'uuid'

export interface Bot {
  id: string
  name: string
  description: string
  model_provider_id: string | null
  model_id: string
  persona_id: string | null
  kb_only: number
  kb_category_ids: string[]
  skill_ids: string[]
  mcp_ids: string[]
  prompt_skill_dirs: string[]
  created_at: string
  updated_at: string
}

function parseBot(row: any): Bot {
  return {
    ...row,
    kb_category_ids: JSON.parse(row.kb_category_ids || '[]'),
    skill_ids: JSON.parse(row.skill_ids || '[]'),
    mcp_ids: JSON.parse(row.mcp_ids || '[]'),
    prompt_skill_dirs: JSON.parse(row.prompt_skill_dirs || '[]')
  }
}

export function listBots(): Bot[] {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM bots ORDER BY created_at DESC').all() as any[]
  return rows.map(parseBot)
}

export function getBot(id: string): Bot | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM bots WHERE id = ?').get(id) as any
  if (!row) return null
  return parseBot(row)
}

export function createBot(data: {
  name: string
  description?: string
  model_provider_id?: string
  model_id?: string
  persona_id?: string
  kb_only?: number
  kb_category_ids?: string[]
  skill_ids?: string[]
  mcp_ids?: string[]
  prompt_skill_dirs?: string[]
}): Bot {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO bots (id, name, description, model_provider_id, model_id, persona_id, kb_only, kb_category_ids, skill_ids, mcp_ids, prompt_skill_dirs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    data.name,
    data.description || '',
    data.model_provider_id || null,
    data.model_id || '',
    data.persona_id || null,
    data.kb_only || 0,
    JSON.stringify(data.kb_category_ids || []),
    JSON.stringify(data.skill_ids || []),
    JSON.stringify(data.mcp_ids || []),
    JSON.stringify(data.prompt_skill_dirs || []),
    now,
    now
  )
  return getBot(id)!
}

export function updateBot(
  id: string,
  data: Partial<{
    name: string
    description: string
    model_provider_id: string | null
    model_id: string
    persona_id: string | null
    kb_only: number
    kb_category_ids: string[]
    skill_ids: string[]
    mcp_ids: string[]
    prompt_skill_dirs: string[]
  }>
): Bot | null {
  const db = getDatabase()
  const existing = getBot(id)
  if (!existing) return null

  const now = new Date().toISOString()
  db.prepare(
    'UPDATE bots SET name=?, description=?, model_provider_id=?, model_id=?, persona_id=?, kb_only=?, kb_category_ids=?, skill_ids=?, mcp_ids=?, prompt_skill_dirs=?, updated_at=? WHERE id=?'
  ).run(
    data.name ?? existing.name,
    data.description ?? existing.description,
    data.model_provider_id !== undefined ? data.model_provider_id : existing.model_provider_id,
    data.model_id ?? existing.model_id,
    data.persona_id !== undefined ? data.persona_id : existing.persona_id,
    data.kb_only !== undefined ? data.kb_only : existing.kb_only,
    JSON.stringify(data.kb_category_ids ?? existing.kb_category_ids),
    JSON.stringify(data.skill_ids ?? existing.skill_ids),
    JSON.stringify(data.mcp_ids ?? existing.mcp_ids),
    JSON.stringify(data.prompt_skill_dirs ?? existing.prompt_skill_dirs),
    now,
    id
  )
  return getBot(id)
}

export function deleteBot(id: string): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM bots WHERE id = ?').run(id)
  return result.changes > 0
}
