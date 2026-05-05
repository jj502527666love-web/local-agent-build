import { getDatabase } from '../database'
import { v4 as uuid } from 'uuid'
import { getModelProvider } from './model-provider'
import { createImageSession } from './image-session'
import { getDataDir } from './data-path'
import { getCloudToken, getCloudGatewayUrl } from './cloud-token'
import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { BrowserWindow } from 'electron'
import { recordUsage } from './usage-stats'
import { resolveSizeToPixels } from '@shared/image-size'
import { stripBase64 } from '@shared/strip-image-metadata'
import { normalizeApiBase } from './api-base-normalize'

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
  mask?: string
  modelProviderId: string
  modelId: string
  size: string
  /** 分辨率档位 id（1k/2k/4k），配合 modelId 决定发出前的最终像素 */
  tierId?: string
  quality?: string
  batchCount?: number
  /** Parallel workers within a single batch. 1 = serial (legacy), max 10. */
  concurrency?: number
}

/** 解析 UI 传入的 size（预设 / 比例 / 像素）为上游 API 接受的 "WxH" 像素串。
 * 传入 modelId+tierId 时按对应能力域 clamp；非法值直接抛错。 */
function resolvePixels(size: string, modelId?: string, tierId?: string): string {
  const px = resolveSizeToPixels(size, { modelId, tierId })
  if (!px) throw new Error(`尺寸格式非法：${size}`)
  return px
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

export function countFailedGenerations(): number {
  const db = getDatabase()
  const row = db.prepare('SELECT COUNT(*) as total FROM image_generations WHERE status = ?').get('error') as any
  return row?.total || 0
}

export function clearFailedGenerations(): { deleted: number } {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM image_generations WHERE status = ?').run('error')
  return { deleted: result.changes }
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
  refImages?: string[],
  mask?: string,
  tierId?: string
): Promise<{ b64_json?: string; url?: string; revised_prompt?: string }> {
  if (providerId.startsWith('cloud:')) {
    return callCloudImageAPI(modelId, prompt, size, quality, refImages, mask, tierId)
  }

  const provider = getModelProvider(providerId)
  if (!provider) throw new Error(`Model provider not found: ${providerId}`)
  const apiBase = normalizeApiBase(provider.api_base)
  const apiKey = provider.api_key

  const hasRefImages = refImages && refImages.length > 0
  const url = hasRefImages ? `${apiBase}/images/edits` : `${apiBase}/images/generations`

  const headers: Record<string, string> = {}
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  let fetchOptions: RequestInit

  let resolvedPx: string | null = null
  if (hasRefImages) {
    // Use multipart form for /images/edits
    resolvedPx = resolvePixels(size, modelId, tierId)
    const form = new FormData()
    form.append('model', modelId)
    form.append('prompt', prompt)
    form.append('n', '1')
    form.append('size', resolvedPx)
    form.append('quality', quality)
    form.append('response_format', 'b64_json')

    for (const img of refImages) {
      // Strip data URI prefix if present, and remove EXIF/ICC/XMP/COM segments
      // to avoid upstream rejecting non-standard ICC v4 profiles (e.g. WeChat images).
      const match = img.match(/^data:([^;]+);base64,/)
      const mimeType = match ? match[1] : 'image/png'
      const raw = match ? img.slice(match[0].length) : img
      const format: 'jpeg' | 'png' = mimeType.includes('png') ? 'png' : 'jpeg'
      const cleaned = stripBase64(raw, format)
      const buffer = Buffer.from(cleaned, 'base64')
      const blob = new Blob([buffer], { type: mimeType })
      const ext = format === 'png' ? 'png' : 'jpg'
      form.append('image', blob, `ref.${ext}`)
    }

    if (mask) {
      const maskMatch = mask.match(/^data:([^;]+);base64,/)
      const maskRaw = maskMatch ? mask.slice(maskMatch[0].length) : mask
      const cleanedMask = stripBase64(maskRaw, 'png')
      const maskBuffer = Buffer.from(cleanedMask, 'base64')
      const maskBlob = new Blob([maskBuffer], { type: 'image/png' })
      form.append('mask', maskBlob, 'mask.png')
    }

    fetchOptions = { method: 'POST', headers, body: form }
  } else {
    headers['Content-Type'] = 'application/json'
    resolvedPx = resolvePixels(size, modelId, tierId)
    const body: any = {
      model: modelId,
      prompt,
      n: 1,
      size: resolvedPx,
      quality,
      response_format: 'b64_json'
    }
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

async function callCloudImageAPI(
  modelId: string,
  prompt: string,
  size: string,
  quality: string,
  refImages?: string[],
  mask?: string,
  tierId?: string
): Promise<{ b64_json?: string; url?: string; revised_prompt?: string }> {
  const token = getCloudToken()
  if (!token) throw new Error('Cloud login required')
  const gatewayUrl = getCloudGatewayUrl()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  }

  const hasRefImages = refImages && refImages.length > 0
  const endpoint = hasRefImages ? '/images/edits' : '/images/generations'
  const body: any = {
    model: modelId,
    prompt,
    n: 1,
    size: resolvePixels(size, modelId, tierId),
    quality,
    response_format: 'b64_json'
  }

  if (hasRefImages) {
    body.images = refImages.map((img) => {
      const match = img.match(/^data:([^;]+);base64,/)
      const mimeType = match?.[1] || 'image/jpeg'
      const base64 = match ? img.slice(match[0].length) : img
      const format: 'jpeg' | 'png' = mimeType.includes('png') ? 'png' : 'jpeg'
      return stripBase64(base64, format)
    })
  }

  if (mask) {
    const maskMatch = mask.match(/^data:([^;]+);base64,/)
    const maskRaw = maskMatch ? mask.slice(maskMatch[0].length) : mask
    body.mask = stripBase64(maskRaw, 'png')
  }

  // Step 1: Submit task
  const submitRes = await fetch(`${gatewayUrl}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })

  if (!submitRes.ok) {
    const errorText = await submitRes.text()
    throw new Error(`Image API error ${submitRes.status}: ${errorText}`)
  }

  const submitData = await submitRes.json()
  const taskId = submitData.task_id
  if (!taskId) {
    // Direct response (no async)
    const result = submitData.data?.[0]
    if (!result) throw new Error('No image data in response')
    return { b64_json: result.b64_json, url: result.url, revised_prompt: result.revised_prompt }
  }

  // Step 2: Poll for result
  console.log('[ImageGen] Cloud task submitted:', taskId)
  const maxWait = 300000 // 5 minutes
  const pollInterval = 3000
  const start = Date.now()

  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval))

    const statusRes = await fetch(`${gatewayUrl}/images/status/${taskId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    })

    if (!statusRes.ok) {
      throw new Error(`Image API error ${statusRes.status}: ${await statusRes.text()}`)
    }

    const statusData = await statusRes.json()

    if (statusData.status === 'completed') {
      const result = statusData.result?.data?.[0]
      if (!result) throw new Error('No image data in response')
      return { b64_json: result.b64_json, url: result.url, revised_prompt: result.revised_prompt }
    }

    if (statusData.status === 'failed') {
      throw new Error(statusData.error || 'Image generation failed')
    }
  }

  throw new Error('Image generation timed out')
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
  const buffer = Buffer.from(rawBase64, 'base64')
  writeFileSync(filePath, buffer)
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

  const concurrency = Math.min(Math.max(options.concurrency || 1, 1), 10)
  const ordered: (ImageGeneration | null)[] = new Array(batchCount).fill(null)
  let cursor = 0
  let completedCount = 0

  async function runOne(i: number): Promise<void> {
    const genId = genIds[i]
    try {
      updateGenerationStatus(genId, 'generating', {})
      if (window) {
        window.webContents.send('imageGen:progress', {
          type: 'generating',
          index: i,
          total: batchCount,
          completed: completedCount,
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
        options.refImages,
        options.mask,
        options.tierId
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
      ordered[i] = gen
      completedCount++

      if (window) {
        window.webContents.send('imageGen:progress', {
          type: 'completed',
          index: i,
          total: batchCount,
          completed: completedCount,
          genId,
          generation: gen,
          sessionId
        })
      }
    } catch (e: any) {
      const errorMsg = e?.message || 'Unknown error'
      updateGenerationStatus(genId, 'error', { error: errorMsg })

      const gen = getGeneration(genId)!
      ordered[i] = gen
      completedCount++

      if (window) {
        window.webContents.send('imageGen:progress', {
          type: 'error',
          index: i,
          total: batchCount,
          completed: completedCount,
          genId,
          error: errorMsg,
          sessionId
        })
      }
    }
  }

  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++
      if (i >= batchCount) return
      await runOne(i)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, batchCount) }, () => worker())
  await Promise.all(workers)
  for (const g of ordered) if (g) results.push(g)

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

export function getAbsolutePath(relPath: string): string {
  const isAbsolute = /^[A-Za-z]:|^\//.test(relPath)
  if (isAbsolute) return relPath
  return join(getDataDir(), relPath)
}

export function saveEditedImage(id: string, base64Data: string): ImageGeneration | null {
  const gen = getGeneration(id)
  if (!gen) throw new Error('Generation not found: ' + id)

  const dir = getImageDir(gen.session_id)
  let ext = 'png'
  let rawBase64 = base64Data
  if (base64Data.startsWith('data:')) {
    const match = base64Data.match(/^data:image\/(\w+);base64,/)
    if (match) {
      ext = match[1] === 'jpeg' ? 'jpg' : match[1]
      rawBase64 = base64Data.slice(match[0].length)
    }
  }
  const filename = `${id}_edited.${ext}`
  const filePath = join(dir, filename)
  writeFileSync(filePath, Buffer.from(rawBase64, 'base64'))

  const relPath = toRelativePath(filePath)
  const db = getDatabase()
  db.prepare('UPDATE image_generations SET result_path = ? WHERE id = ?').run(relPath, id)

  return getGeneration(id)
}

