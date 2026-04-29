import { getDatabase } from '../database'
import { v4 as uuid } from 'uuid'

export interface Persona {
  id: string
  name: string
  system_prompt: string
  created_at: string
  updated_at: string
}

export function listPersonas(): Persona[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM personas ORDER BY created_at DESC').all() as Persona[]
}

export function getPersona(id: string): Persona | null {
  const db = getDatabase()
  return (db.prepare('SELECT * FROM personas WHERE id = ?').get(id) as Persona) || null
}

export function createPersona(data: { name: string; system_prompt: string }): Persona {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO personas (id, name, system_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, data.name, data.system_prompt, now, now)
  return getPersona(id)!
}

export function updatePersona(
  id: string,
  data: Partial<{ name: string; system_prompt: string }>
): Persona | null {
  const db = getDatabase()
  const existing = getPersona(id)
  if (!existing) return null

  const name = data.name ?? existing.name
  const system_prompt = data.system_prompt ?? existing.system_prompt
  const now = new Date().toISOString()

  db.prepare('UPDATE personas SET name=?, system_prompt=?, updated_at=? WHERE id=?').run(
    name,
    system_prompt,
    now,
    id
  )
  return getPersona(id)
}

export function deletePersona(id: string): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM personas WHERE id = ?').run(id)
  return result.changes > 0
}

const PRESET_PERSONAS = [
  {
    name: 'PPT制作大师',
    system_prompt: '你是一名PPT全流程制作专家。你的目标不是给建议，而是实际动手完成PPT文件的制作。\n\n核心原则：\n1. 收到PPT制作需求后，必须先调用 use_skill 加载 ppt-master 技能\n2. 严格按照 ppt-master 技能返回的完整工作流程执行，不要跳过或简化任何步骤\n3. 每一步都要实际执行操作，产出真实文件\n4. 完成后告知用户最终文件路径\n\n设计规范：\n- 保持专业、简洁的商务风格\n- 禁止使用花哨的装饰元素\n- 配色统一，排版整齐\n- 文字精炼，图表清晰'
  }
]

export function seedPresetPersonas(): void {
  try {
    const db = getDatabase()
    for (const preset of PRESET_PERSONAS) {
      const existing = db.prepare('SELECT id FROM personas WHERE name = ?').get(preset.name)
      if (!existing) {
        const id = uuid()
        const now = new Date().toISOString()
        db.prepare(
          'INSERT INTO personas (id, name, system_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
        ).run(id, preset.name, preset.system_prompt, now, now)
      }
    }
  } catch (e) {
    console.error('Failed to seed preset personas:', e)
  }
}
