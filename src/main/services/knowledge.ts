import { getDatabase } from '../database'
import { v4 as uuid } from 'uuid'
import { statSync, readdirSync, existsSync } from 'fs'
import { join, extname, basename } from 'path'

export interface KBCategory {
  id: string
  name: string
  description: string
  watch_paths: string[]
  created_at: string
}

export interface KnowledgeBase {
  id: string
  category_id: string
  name: string
  file_path: string
  file_type: string
  chunk_count: number
  status: string
  created_at: string
}

function parseCategory(row: any): KBCategory {
  return { ...row, watch_paths: JSON.parse(row.watch_paths || '[]') }
}

export function listCategories(): KBCategory[] {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM kb_categories ORDER BY created_at DESC').all() as any[]
  return rows.map(parseCategory)
}

export function getCategory(id: string): KBCategory | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM kb_categories WHERE id = ?').get(id) as any
  return row ? parseCategory(row) : null
}

export function createCategory(data: { name: string; description?: string }): KBCategory {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString()
  db.prepare('INSERT INTO kb_categories (id, name, description, created_at) VALUES (?, ?, ?, ?)').run(
    id,
    data.name,
    data.description || '',
    now
  )
  return getCategory(id)!
}

export function updateCategory(
  id: string,
  data: Partial<{ name: string; description: string }>
): KBCategory | null {
  const db = getDatabase()
  const existing = getCategory(id)
  if (!existing) return null
  const name = data.name ?? existing.name
  const description = data.description ?? existing.description
  db.prepare('UPDATE kb_categories SET name=?, description=? WHERE id=?').run(name, description, id)
  return getCategory(id)
}

export function deleteCategory(id: string): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM kb_categories WHERE id = ?').run(id)
  if (result.changes > 0) {
    const bots = db.prepare("SELECT id, kb_category_ids FROM bots WHERE kb_category_ids LIKE '%' || ? || '%'").all(id) as any[]
    for (const bot of bots) {
      const ids: string[] = JSON.parse(bot.kb_category_ids || '[]')
      const filtered = ids.filter((cid: string) => cid !== id)
      if (filtered.length !== ids.length) {
        db.prepare('UPDATE bots SET kb_category_ids = ? WHERE id = ?').run(JSON.stringify(filtered), bot.id)
      }
    }
  }
  return result.changes > 0
}

export function listKnowledgeBases(categoryId?: string): KnowledgeBase[] {
  const db = getDatabase()
  if (categoryId) {
    return db
      .prepare('SELECT * FROM knowledge_bases WHERE category_id = ? ORDER BY created_at DESC')
      .all(categoryId) as KnowledgeBase[]
  }
  return db.prepare('SELECT * FROM knowledge_bases ORDER BY created_at DESC').all() as KnowledgeBase[]
}

export function listKnowledgeBasesPaged(
  categoryId: string,
  page: number,
  pageSize: number
): { items: KnowledgeBase[]; total: number } {
  const db = getDatabase()
  const total = (db.prepare('SELECT COUNT(*) as cnt FROM knowledge_bases WHERE category_id = ?').get(categoryId) as any).cnt
  const items = db
    .prepare('SELECT * FROM knowledge_bases WHERE category_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(categoryId, pageSize, (page - 1) * pageSize) as KnowledgeBase[]
  return { items, total }
}

export function getKnowledgeBase(id: string): KnowledgeBase | null {
  const db = getDatabase()
  return (db.prepare('SELECT * FROM knowledge_bases WHERE id = ?').get(id) as KnowledgeBase) || null
}

export function createKnowledgeBase(data: {
  category_id: string
  name: string
  file_path: string
  file_type: string
}): KnowledgeBase {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO knowledge_bases (id, category_id, name, file_path, file_type, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, data.category_id, data.name, data.file_path, data.file_type, now)
  return getKnowledgeBase(id)!
}

export function updateKnowledgeBaseStatus(id: string, status: string, chunkCount?: number): void {
  const db = getDatabase()
  if (chunkCount !== undefined) {
    db.prepare('UPDATE knowledge_bases SET status=?, chunk_count=? WHERE id=?').run(
      status,
      chunkCount,
      id
    )
  } else {
    db.prepare('UPDATE knowledge_bases SET status=? WHERE id=?').run(status, id)
  }
}

export function deleteKnowledgeBase(id: string): boolean {
  const db = getDatabase()
  db.prepare('DELETE FROM vector_chunks WHERE knowledge_base_id = ?').run(id)
  const result = db.prepare('DELETE FROM knowledge_bases WHERE id = ?').run(id)
  return result.changes > 0
}

const SUPPORTED_EXTENSIONS = new Set(['txt', 'md', 'pdf', 'doc', 'docx', 'json', 'csv'])

export function bindFolder(categoryId: string, folderPath: string): KBCategory | null {
  const cat = getCategory(categoryId)
  if (!cat) return null
  const paths = cat.watch_paths
  if (!paths.includes(folderPath)) {
    paths.push(folderPath)
    const db = getDatabase()
    db.prepare('UPDATE kb_categories SET watch_paths=? WHERE id=?').run(JSON.stringify(paths), categoryId)
  }
  return getCategory(categoryId)
}

export function unbindFolder(categoryId: string, folderPath: string): KBCategory | null {
  const cat = getCategory(categoryId)
  if (!cat) return null
  const paths = cat.watch_paths.filter((p) => p !== folderPath)
  const db = getDatabase()
  db.prepare('UPDATE kb_categories SET watch_paths=? WHERE id=?').run(JSON.stringify(paths), categoryId)

  // Remove docs from this folder (and their vectors)
  const normalizedFolder = folderPath.replace(/[\\/]+$/, '')
  const docs = listKnowledgeBases(categoryId)
  for (const doc of docs) {
    if (doc.file_path && (doc.file_path.startsWith(normalizedFolder + '\\') || doc.file_path.startsWith(normalizedFolder + '/'))) {
      deleteKnowledgeBase(doc.id)
    }
  }

  return getCategory(categoryId)
}

export function syncCategory(categoryId: string): { added: number; removed: number; modified: number } {
  const db = getDatabase()
  const cat = getCategory(categoryId)
  if (!cat) return { added: 0, removed: 0, modified: 0 }

  const existingDocs = listKnowledgeBases(categoryId)
  const existingByPath = new Map<string, KnowledgeBase>()
  for (const doc of existingDocs) {
    if (doc.file_path) existingByPath.set(doc.file_path, doc)
  }

  let added = 0
  let removed = 0
  let modified = 0

  // Collect all files from watch_paths (recursive)
  const watchedFiles = new Set<string>()
  function scanDir(dir: string): void {
    if (!existsSync(dir)) return
    try {
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          scanDir(join(dir, entry.name))
        } else if (entry.isFile()) {
          const ext = extname(entry.name).slice(1).toLowerCase()
          if (SUPPORTED_EXTENSIONS.has(ext)) {
            watchedFiles.add(join(dir, entry.name))
          }
        }
      }
    } catch { /* skip inaccessible folders */ }
  }
  for (const folderPath of cat.watch_paths) {
    scanDir(folderPath)
  }

  // Add new files from watched folders
  for (const filePath of Array.from(watchedFiles)) {
    if (!existingByPath.has(filePath)) {
      const fileName = basename(filePath)
      const ext = extname(fileName).slice(1).toLowerCase()
      createKnowledgeBase({ category_id: categoryId, name: fileName, file_path: filePath, file_type: ext })
      added++
    }
  }

  // Build set of normalized watch folder prefixes for orphan detection
  const watchPrefixes = cat.watch_paths.map((p) => p.replace(/[\\/]+$/, ''))

  // Check all existing docs (including manually added ones)
  for (const doc of existingDocs) {
    if (!doc.file_path) continue

    // Check if doc belongs to a current watch folder
    const belongsToWatchFolder = watchPrefixes.some(
      (prefix) => doc.file_path.startsWith(prefix + '\\') || doc.file_path.startsWith(prefix + '/')
    )

    if (!existsSync(doc.file_path)) {
      // File deleted from disk
      deleteKnowledgeBase(doc.id)
      removed++
    } else if (belongsToWatchFolder && !watchedFiles.has(doc.file_path)) {
      // File exists but no longer matched by watch (e.g. unsupported ext after rename)
      deleteKnowledgeBase(doc.id)
      removed++
    } else if (doc.status === 'ready') {
      // Check if file was modified (mtime newer than doc created_at)
      try {
        const stat = statSync(doc.file_path)
        const docTime = new Date(doc.created_at).getTime()
        if (stat.mtimeMs > docTime) {
          // File modified — reset to pending, delete chunks
          db.prepare('UPDATE knowledge_bases SET status=?, chunk_count=0 WHERE id=?').run('pending', doc.id)
          db.prepare('DELETE FROM vector_chunks WHERE knowledge_base_id = ?').run(doc.id)
          modified++
        }
      } catch { /* stat failed, skip */ }
    }
  }

  return { added, removed, modified }
}
