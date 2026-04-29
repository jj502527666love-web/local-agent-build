import { getDatabase } from '../database'
import { v4 as uuid } from 'uuid'
import { getModelProvider } from './model-provider'
import { createImageSession } from './image-session'
import { getDataDir } from './data-path'
import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { BrowserWindow } from 'electron'
import { recordUsage } from './usage-stats'

export interface ImageGeneration {
  id: string
  session_id: string
  prompt: string
  revised_prompt: string
  ref_images: string[]
  model_provider_id: string
  model_id: string
  size: string
  quality: string
  result_path: string
  result_url: string
  status: string
  error: string
  created_at: string
}

export interface GenerateImageOptions {
  sessionId?: string
  prompt: string
  refImages?: string[]
  modelProviderId: string
  modelId: string
  size: string
  quality?: string
  batchCount?: number
}

const SIZE_MAP: Record<string, string> = {
  '1:1': '1024x1024',
  '3:2': '1536x1024',
  '2:3': '1024x1536',
  '16:9': '1792x1024',
  '9:16': '1024x1792'
}

function parseRow(row: any): ImageGeneration {
  return {
    ...row,
    ref_images: JSON.parse(row.ref_images || '[]')
  }
}

export function listGenerations(sessionId: string): ImageGeneration[] {
  const db = getDatabase()
  const rows = db
    .prepare('SELECT * FROM image_generations WHERE session_id = ? ORDER BY created_at ASC')
    .all(sessionId) as any[]
  return rows.map(parseRow)
}

export function listRecentGenerations(limit: number = 100): ImageGeneration[] {
  const db = getDatabase()
  const rows = db
    .prepare('SELECT * FROM image_generations ORDER BY created_at DESC LIMIT ?')
    .all(limit) as any[]
  return rows.map(parseRow).reverse()
}

function getOrCreateDefaultSession(): string {
  const db = getDatabase()
  const row = db.prepare('SELECT id FROM image_sessions ORDER BY created_at ASC LIMIT 1').get() as any
  if (row) return row.id
  const session = createImageSession({ title: 'default' })
  return session.id
}

export function getGeneration(id: string): ImageGeneration | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM image_generations WHERE id = ?').get(id) as any
  if (!row) return null
  return parseRow(row)
}

export function listAllGenerations(page: number, pageSize: number, search?: string, startDate?: string, endDate?: string): { items: ImageGeneration[]; total: number } {
  const db = getDatabase()
  let countSql = 'SELECT COUNT(*) as total FROM image_generations WHERE status = ?'
  let querySql = 'SELECT * FROM image_generations WHERE status = ?'
  const params: any[] = ['done']

  if (search) {
    countSql += ' AND prompt LIKE ?'
    querySql += ' AND prompt LIKE ?'
    params.push(`%${search}%`)
  }

  if (startDate) {
    countSql += ' AND created_at >= ?'
    querySql += ' AND created_at >= ?'
    params.push(startDate)
  }

  if (endDate) {
    countSql += ' AND created_at <= ?'
    querySql += ' AND created_at <= ?'
    params.push(endDate)
  }

  querySql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?'

  const total = (db.prepare(countSql).get(...params) as any).total
  const offset = (page - 1) * pageSize
  const rows = db.prepare(querySql).all(...params, pageSize, offset) as any[]

  return { items: rows.map(parseRow), total }
}

export function deleteGeneration(id: string): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM image_generations WHERE id = ?').run(id)
  return result.changes > 0
}

export function deleteGenerations(ids: string[]): number {
  if (!ids.length) return 0
  const db = getDatabase()
  const placeholders = ids.map(() => '?').join(',')
  const result = db.prepare(`DELETE FROM image_generations WHERE id IN (${placeholders})`).run(...ids)
  return result.changes
}

function getImageDir(sessionId: string): string {
  const dir = join(getDataDir(), 'images', sessionId)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** 将绝对路径转为相对于数据目录的路径 */
function toRelativePath(absolutePath: string): string {
  const dataDir = getDataDir()
  return absolutePath.replace(/\\/g, '/').replace(dataDir.replace(/\\/g, '/'), '').replace(/^\//, '')
}

async function callImageAPI(
  providerId: string,
  modelId: string,
  prompt: string,
  size: string,
  quality: string,
  refImages?: string[]
): Promise<{ b64_json?: string; url?: string; revised_prompt?: string }> {
  const provider = getModelProvider(providerId)
  if (!provider) throw new Error(`Model provider not found: ${providerId}`)

  const apiBase = provider.api_base.replace(/\/$/, '')
  const hasRefImages = refImages && refImages.length > 0
  const url = hasRefImages ? `${apiBase}/images/edits` : `${apiBase}/images/generations`

  const headers: Record<string, string> = {}
  if (provider.api_key) {
    headers['Authorization'] = `Bearer ${provider.api_key}`
  }

  let fetchOptions: RequestInit

  if (hasRefImages) {
    // Use multipart form for /images/edits
    const form = new FormData()
    form.append('model', modelId)
    form.append('prompt', prompt)
    form.append('n', '1')
    form.append('size', SIZE_MAP[size] || size)
    form.append('quality', quality)
    form.append('response_format', 'b64_json')

    for (const img of refImages) {
      // Strip data URI prefix if present
      const match = img.match(/^data:([^;]+);base64,/)
      const mimeType = match ? match[1] : 'image/png'
      const raw = match ? img.slice(match[0].length) : img
      const buffer = Buffer.from(raw, 'base64')
      const blob = new Blob([buffer], { type: mimeType })
      const ext = mimeType.includes('png') ? 'png' : 'jpg'
      form.append('image', blob, `ref.${ext}`)
    }

    console.log('[ImageGen] Using /images/edits with', refImages.length, 'reference images')
    fetchOptions = { method: 'POST', headers, body: form }
  } else {
    headers['Content-Type'] = 'application/json'
    const body: any = {
      model: modelId,
      prompt,
      n: 1,
      size: SIZE_MAP[size] || size,
      quality,
      response_format: 'b64_json'
    }
    console.log('[ImageGen] Using /images/generations')
    fetchOptions = { method: 'POST', headers, body: JSON.stringify(body) }
  }

  const response = await fetch(url, fetchOptions)

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Image API error ${response.status}: ${errorText}`)
  }

  const data = await response.json()

  if (data.usage) {
    try {
      recordUsage(
        providerId,
        modelId,
        data.usage.prompt_tokens || 0,
        data.usage.completion_tokens || 0,
        data.usage.total_tokens || 0
      )
    } catch {}
  }

  const result = data.data?.[0]
  if (!result) throw new Error('No image data in response')

  return {
    b64_json: result.b64_json,
    url: result.url,
    revised_prompt: result.revised_prompt
  }
}

function saveImageToFile(sessionId: string, genId: string, b64Data: string): string {
  const dir = getImageDir(sessionId)
  // Detect format from base64 header or default to png
  let ext = 'png'
  let rawBase64 = b64Data
  if (b64Data.startsWith('data:')) {
    const match = b64Data.match(/^data:image\/(\w+);base64,/)
    if (match) {
      ext = match[1] === 'jpeg' ? 'jpg' : match[1]
      rawBase64 = b64Data.slice(match[0].length)
    }
  }
  const filename = `${genId}.${ext}`
  const filePath = join(dir, filename)
  writeFileSync(filePath, Buffer.from(rawBase64, 'base64'))
  return toRelativePath(filePath)   // 返回相对路径
}

async function downloadImageToFile(sessionId: string, genId: string, imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl)
  if (!response.ok) throw new Error(`Failed to download image: ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  const contentType = response.headers.get('content-type') || 'image/png'
  let ext = 'png'
  if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg'
  else if (contentType.includes('webp')) ext = 'webp'
  const dir = getImageDir(sessionId)
  const filename = `${genId}.${ext}`
  const filePath = join(dir, filename)
  writeFileSync(filePath, buffer)
  return toRelativePath(filePath)   // 返回相对路径
}

function insertGeneration(data: {
  id: string
  session_id: string
  prompt: string
  revised_prompt: string
  ref_images: string[]
  model_provider_id: string
  model_id: string
  size: string
  quality: string
  result_path: string
  result_url: string
  status: string
  error: string
}): ImageGeneration {
  const db = getDatabase()
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO image_generations (id, session_id, prompt, revised_prompt, ref_images, model_provider_id, model_id, size, quality, result_path, result_url, status, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    data.id,
    data.session_id,
    data.prompt,
    data.revised_prompt,
    JSON.stringify(data.ref_images),
    data.model_provider_id,
    data.model_id,
    data.size,
    data.quality,
    data.result_path,
    data.result_url,
    data.status,
    data.error,
    now
  )
  // Update session timestamp
  db.prepare('UPDATE image_sessions SET updated_at=? WHERE id=?').run(now, data.session_id)
  return getGeneration(data.id)!
}

function updateGenerationStatus(id: string, status: string, updates: Partial<{ result_path: string; result_url: string; revised_prompt: string; error: string }>): void {
  const db = getDatabase()
  const sets: string[] = ['status = ?']
  const params: any[] = [status]
  if (updates.result_path !== undefined) { sets.push('result_path = ?'); params.push(updates.result_path) }
  if (updates.result_url !== undefined) { sets.push('result_url = ?'); params.push(updates.result_url) }
  if (updates.revised_prompt !== undefined) { sets.push('revised_prompt = ?'); params.push(updates.revised_prompt) }
  if (updates.error !== undefined) { sets.push('error = ?'); params.push(updates.error) }
  params.push(id)
  db.prepare(`UPDATE image_generations SET ${sets.join(', ')} WHERE id = ?`).run(...params)
}

export async function generateImages(
  options: GenerateImageOptions,
  window?: BrowserWindow | null
): Promise<ImageGeneration[]> {
  const sessionId = options.sessionId || getOrCreateDefaultSession()
  const batchCount = Math.min(Math.max(options.batchCount || 1, 1), 10)
  const quality = options.quality || 'auto'
  const results: ImageGeneration[] = []

  // Pre-create all generation records as pending
  const genIds: string[] = []
  for (let i = 0; i < batchCount; i++) {
    const genId = uuid()
    genIds.push(genId)
    insertGeneration({
      id: genId,
      session_id: sessionId,
      prompt: options.prompt,
      revised_prompt: '',
      ref_images: options.refImages || [],
      model_provider_id: options.modelProviderId,
      model_id: options.modelId,
      size: options.size,
      quality,
      result_path: '',
      result_url: '',
      status: 'pending',
      error: ''
    })
  }

  // Send initial progress
  if (window) {
    window.webContents.send('imageGen:progress', {
      type: 'start',
      total: batchCount,
      completed: 0,
      sessionId
    })
  }

  // Generate each image
  for (let i = 0; i < batchCount; i++) {
    const genId = genIds[i]
    try {
      updateGenerationStatus(genId, 'generating', {})

      if (window) {
        window.webContents.send('imageGen:progress', {
          type: 'generating',
          index: i,
          total: batchCount,
          completed: i,
          genId,
          sessionId
        })
      }

      const apiResult = await callImageAPI(
        options.modelProviderId,
        options.modelId,
        options.prompt,
        options.size,
        quality,
        options.refImages
      )

      let resultPath = ''
      let resultUrl = ''

      if (apiResult.b64_json) {
        resultPath = saveImageToFile(sessionId, genId, apiResult.b64_json)
      } else if (apiResult.url) {
        resultUrl = apiResult.url
        try {
          resultPath = await downloadImageToFile(sessionId, genId, apiResult.url)
        } catch (e) {
          console.error('Failed to download image, keeping URL only:', e)
        }
      }

      updateGenerationStatus(genId, 'done', {
        result_path: resultPath,
        result_url: resultUrl,
        revised_prompt: apiResult.revised_prompt || ''
      })

      const gen = getGeneration(genId)!
      results.push(gen)

      if (window) {
        window.webContents.send('imageGen:progress', {
          type: 'completed',
          index: i,
          total: batchCount,
          completed: i + 1,
          genId,
          generation: gen,
          sessionId
        })
      }
    } catch (e: any) {
      const errorMsg = e?.message || 'Unknown error'
      updateGenerationStatus(genId, 'error', { error: errorMsg })

      const gen = getGeneration(genId)!
      results.push(gen)

      if (window) {
        window.webContents.send('imageGen:progress', {
          type: 'error',
          index: i,
          total: batchCount,
          completed: i + 1,
          genId,
          error: errorMsg,
          sessionId
        })
      }
    }
  }

  // Send done
  if (window) {
    window.webContents.send('imageGen:progress', {
      type: 'done',
      total: batchCount,
      completed: batchCount,
      sessionId
    })
  }

  return results
}
