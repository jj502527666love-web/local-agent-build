import { getDatabase } from '../database'
import { v4 as uuid } from 'uuid'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'fs'
import { getDataDir } from './data-path'

export interface CanvasProject {
  id: string
  title: string
  text_provider_id: string
  text_model_id: string
  image_provider_id: string
  image_model_id: string
  concurrency: number
  system_prompt: string
  created_at: string
  updated_at: string
}

export interface CanvasNode {
  id: string
  project_id: string
  type: string
  position_x: number
  position_y: number
  width: number
  height: number
  data: Record<string, any>
  created_at: string
}

export interface CanvasEdge {
  id: string
  project_id: string
  source_node_id: string
  source_handle: string
  target_node_id: string
  target_handle: string
  created_at: string
}

function parseNode(row: any): CanvasNode {
  return { ...row, data: JSON.parse(row.data || '{}') }
}

// === Canvas image storage ===
// Ref images are stored on disk under dataDir/canvas/<projectId>/<nodeId>_<ts>.<ext>
// The node.data.image_path field holds the relative path (canvas/<projectId>/...).
// This avoids bloating SQLite with base64 dataURLs.

function getCanvasDir(): string {
  const dir = join(getDataDir(), 'canvas')
  mkdirSync(dir, { recursive: true })
  return dir
}

function getProjectImageDir(projectId: string): string {
  const dir = join(getCanvasDir(), projectId)
  mkdirSync(dir, { recursive: true })
  return dir
}

function toRelativePath(absPath: string): string {
  const dataDir = getDataDir()
  const prefix = dataDir.endsWith('\\') || dataDir.endsWith('/') ? dataDir : dataDir + (process.platform === 'win32' ? '\\' : '/')
  if (absPath.startsWith(prefix)) return absPath.slice(prefix.length).replace(/\\/g, '/')
  if (absPath.startsWith(dataDir)) return absPath.slice(dataDir.length + 1).replace(/\\/g, '/')
  return absPath.replace(/\\/g, '/')
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; ext: string } {
  const match = /^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/.exec(dataUrl)
  if (!match) throw new Error('Invalid data URL')
  const raw = match[2]
  let ext = match[1].toLowerCase()
  if (ext === 'jpeg') ext = 'jpg'
  // Only allow a small known-good set
  if (!['png', 'jpg', 'webp', 'gif'].includes(ext)) ext = 'png'
  return { buffer: Buffer.from(raw, 'base64'), ext }
}

function cleanupNodeFiles(dir: string, nodeId: string): void {
  if (!existsSync(dir)) return
  try {
    for (const name of readdirSync(dir)) {
      if (name.startsWith(`${nodeId}_`) || name.startsWith(`${nodeId}.`)) {
        try { rmSync(join(dir, name), { force: true }) } catch {}
      }
    }
  } catch {}
}

export function saveNodeImage(projectId: string, nodeId: string, dataUrl: string): { image_path: string } {
  const { buffer, ext } = parseDataUrl(dataUrl)
  const dir = getProjectImageDir(projectId)
  // Clean any previous image(s) for this node so old files don't accumulate
  cleanupNodeFiles(dir, nodeId)
  const filename = `${nodeId}_${Date.now()}.${ext}`
  const filePath = join(dir, filename)
  writeFileSync(filePath, buffer)
  return { image_path: toRelativePath(filePath) }
}

function deleteNodeImageFiles(projectId: string, nodeId: string): void {
  cleanupNodeFiles(join(getCanvasDir(), projectId), nodeId)
}

export function deleteNodeImage(projectId: string, nodeId: string): { ok: true } {
  deleteNodeImageFiles(projectId, nodeId)
  return { ok: true }
}

function deleteProjectImageDir(projectId: string): void {
  const dir = join(getCanvasDir(), projectId)
  if (existsSync(dir)) {
    try { rmSync(dir, { recursive: true, force: true }) } catch {}
  }
}

// === Projects ===

export function listProjects(): CanvasProject[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM canvas_projects ORDER BY updated_at DESC').all() as CanvasProject[]
}

export function getProject(id: string): CanvasProject | null {
  const db = getDatabase()
  return (db.prepare('SELECT * FROM canvas_projects WHERE id = ?').get(id) as CanvasProject) || null
}

export function createProject(data: {
  title: string
  text_provider_id?: string
  text_model_id?: string
  image_provider_id?: string
  image_model_id?: string
  concurrency?: number
  system_prompt?: string
}): CanvasProject {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO canvas_projects (id, title, text_provider_id, text_model_id, image_provider_id, image_model_id, concurrency, system_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    data.title || 'New Canvas',
    data.text_provider_id || '',
    data.text_model_id || '',
    data.image_provider_id || '',
    data.image_model_id || '',
    data.concurrency || 1,
    data.system_prompt || '',
    now,
    now
  )
  return getProject(id)!
}

export function updateProject(id: string, data: Partial<{
  title: string
  text_provider_id: string
  text_model_id: string
  image_provider_id: string
  image_model_id: string
  concurrency: number
  system_prompt: string
}>): CanvasProject | null {
  const db = getDatabase()
  const sets: string[] = ['updated_at = ?']
  const params: any[] = [new Date().toISOString()]
  if (data.title !== undefined) { sets.push('title = ?'); params.push(data.title) }
  if (data.text_provider_id !== undefined) { sets.push('text_provider_id = ?'); params.push(data.text_provider_id) }
  if (data.text_model_id !== undefined) { sets.push('text_model_id = ?'); params.push(data.text_model_id) }
  if (data.image_provider_id !== undefined) { sets.push('image_provider_id = ?'); params.push(data.image_provider_id) }
  if (data.image_model_id !== undefined) { sets.push('image_model_id = ?'); params.push(data.image_model_id) }
  if (data.concurrency !== undefined) { sets.push('concurrency = ?'); params.push(data.concurrency) }
  if (data.system_prompt !== undefined) { sets.push('system_prompt = ?'); params.push(data.system_prompt) }
  params.push(id)
  db.prepare(`UPDATE canvas_projects SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  return getProject(id)
}

export function deleteProject(id: string): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM canvas_projects WHERE id = ?').run(id)
  // Cascade: drop the entire canvas image directory for this project
  deleteProjectImageDir(id)
  return result.changes > 0
}

// === Nodes ===

export function listNodes(projectId: string): CanvasNode[] {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM canvas_nodes WHERE project_id = ? ORDER BY created_at ASC').all(projectId) as any[]
  return rows.map(parseNode)
}

export function getNode(id: string): CanvasNode | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM canvas_nodes WHERE id = ?').get(id) as any
  return row ? parseNode(row) : null
}

export function createNode(projectId: string, data: {
  type: string
  position_x: number
  position_y: number
  width?: number
  height?: number
  data?: Record<string, any>
}): CanvasNode {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO canvas_nodes (id, project_id, type, position_x, position_y, width, height, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, projectId, data.type, data.position_x, data.position_y, data.width || 240, data.height || 0, JSON.stringify(data.data || {}), now)
  touchProject(projectId)
  return getNode(id)!
}

export function updateNode(id: string, data: Partial<{
  position_x: number
  position_y: number
  width: number
  height: number
  data: Record<string, any>
}>): CanvasNode | null {
  const db = getDatabase()
  const sets: string[] = []
  const params: any[] = []
  if (data.position_x !== undefined) { sets.push('position_x = ?'); params.push(data.position_x) }
  if (data.position_y !== undefined) { sets.push('position_y = ?'); params.push(data.position_y) }
  if (data.width !== undefined) { sets.push('width = ?'); params.push(data.width) }
  if (data.height !== undefined) { sets.push('height = ?'); params.push(data.height) }
  if (data.data !== undefined) { sets.push('data = ?'); params.push(JSON.stringify(data.data)) }
  if (sets.length === 0) return getNode(id)
  params.push(id)
  db.prepare(`UPDATE canvas_nodes SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  const node = getNode(id)
  if (node) touchProject(node.project_id)
  return node
}

export function updateNodePositions(updates: { id: string; position_x: number; position_y: number }[]): void {
  const db = getDatabase()
  const stmt = db.prepare('UPDATE canvas_nodes SET position_x = ?, position_y = ? WHERE id = ?')
  const transaction = db.transaction(() => {
    for (const u of updates) {
      stmt.run(u.position_x, u.position_y, u.id)
    }
  })
  transaction()
}

export function deleteNode(id: string): boolean {
  const db = getDatabase()
  const node = getNode(id)
  const result = db.prepare('DELETE FROM canvas_nodes WHERE id = ?').run(id)
  if (node) {
    // Cascade: remove any disk-stored ref image files associated with this node
    if (node.type === 'refImage') {
      deleteNodeImageFiles(node.project_id, id)
    }
    touchProject(node.project_id)
  }
  return result.changes > 0
}

// === Edges ===

export function listEdges(projectId: string): CanvasEdge[] {
  const db = getDatabase()
  return db.prepare('SELECT * FROM canvas_edges WHERE project_id = ? ORDER BY created_at ASC').all(projectId) as CanvasEdge[]
}

export function createEdge(projectId: string, data: {
  source_node_id: string
  source_handle: string
  target_node_id: string
  target_handle: string
}): CanvasEdge {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO canvas_edges (id, project_id, source_node_id, source_handle, target_node_id, target_handle, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, projectId, data.source_node_id, data.source_handle, data.target_node_id, data.target_handle, now)
  touchProject(projectId)
  return db.prepare('SELECT * FROM canvas_edges WHERE id = ?').get(id) as CanvasEdge
}

export function deleteEdge(id: string): boolean {
  const db = getDatabase()
  const edge = db.prepare('SELECT project_id FROM canvas_edges WHERE id = ?').get(id) as any
  const result = db.prepare('DELETE FROM canvas_edges WHERE id = ?').run(id)
  if (edge) touchProject(edge.project_id)
  return result.changes > 0
}

export function deleteEdgesByNodeId(nodeId: string): number {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM canvas_edges WHERE source_node_id = ? OR target_node_id = ?').run(nodeId, nodeId)
  return result.changes
}

// === Bulk save (auto-save) ===

export function saveProjectState(projectId: string, nodes: { id: string; position_x: number; position_y: number; data: Record<string, any> }[]): void {
  const db = getDatabase()
  const nodeStmt = db.prepare('UPDATE canvas_nodes SET position_x = ?, position_y = ?, data = ? WHERE id = ? AND project_id = ?')
  const transaction = db.transaction(() => {
    for (const n of nodes) {
      nodeStmt.run(n.position_x, n.position_y, JSON.stringify(n.data), n.id, projectId)
    }
  })
  transaction()
  touchProject(projectId)
}

function touchProject(projectId: string): void {
  const db = getDatabase()
  db.prepare('UPDATE canvas_projects SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), projectId)
}
