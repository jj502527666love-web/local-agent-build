import { getDatabase } from '../database'
import { v4 as uuid } from 'uuid'

export interface Skill {
  id: string
  name: string
  description: string
  function_def: any
  implementation: string
  source: string
  version: string
  enabled: boolean
  created_at: string
}

function parseSkill(row: any): Skill {
  return {
    ...row,
    function_def: JSON.parse(row.function_def || '{}'),
    enabled: Boolean(row.enabled)
  }
}

export function listSkills(): Skill[] {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM skills ORDER BY created_at DESC').all() as any[]
  return rows.map(parseSkill)
}

export function getSkill(id: string): Skill | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as any
  if (!row) return null
  return parseSkill(row)
}

export function createSkill(data: {
  name: string
  description: string
  function_def: any
  implementation: string
  source?: string
  version?: string
}): Skill {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO skills (id, name, description, function_def, implementation, source, version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    data.name,
    data.description,
    JSON.stringify(data.function_def),
    data.implementation,
    data.source || 'local',
    data.version || '1.0.0',
    now
  )
  return getSkill(id)!
}

export function updateSkill(
  id: string,
  data: Partial<{
    name: string
    description: string
    function_def: any
    implementation: string
    enabled: boolean
  }>
): Skill | null {
  const db = getDatabase()
  const existing = getSkill(id)
  if (!existing) return null

  db.prepare(
    'UPDATE skills SET name=?, description=?, function_def=?, implementation=?, enabled=? WHERE id=?'
  ).run(
    data.name ?? existing.name,
    data.description ?? existing.description,
    JSON.stringify(data.function_def ?? existing.function_def),
    data.implementation ?? existing.implementation,
    data.enabled !== undefined ? (data.enabled ? 1 : 0) : existing.enabled ? 1 : 0,
    id
  )
  return getSkill(id)
}

export function deleteSkill(id: string): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM skills WHERE id = ?').run(id)
  if (result.changes > 0) {
    const bots = db.prepare("SELECT id, skill_ids FROM bots WHERE skill_ids LIKE '%' || ? || '%'").all(id) as any[]
    for (const bot of bots) {
      const ids: string[] = JSON.parse(bot.skill_ids || '[]')
      const filtered = ids.filter((sid: string) => sid !== id)
      if (filtered.length !== ids.length) {
        db.prepare('UPDATE bots SET skill_ids = ? WHERE id = ?').run(JSON.stringify(filtered), bot.id)
      }
    }
  }
  return result.changes > 0
}
