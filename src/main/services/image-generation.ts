import { getDatabase } from '../database'
import { v4 as uuid } from 'uuid'
import { getModelProvider } from './model-provider'
import { createImageSession } from './image-session'
import { getDataDir } from './data-path'
import { getCloudToken, getCloudGatewayUrl } from './cloud-token'
import { join } from 'path'
import { mkdirSync, writeFileSync, unlinkSync, existsSync } from 'fs'
import { BrowserWindow } from 'electron'
import { recordUsage } from './usage-stats'
import { resolveSizeToPixels, getMaxConsistencyN } from '@shared/image-size'
import { stripBase64 } from '@shared/strip-image-metadata'
import { normalizeApiBase } from './api-base-normalize'
import { addToCreation, removeByRelativePath } from './gallery'

// ---- Global concurrency limit (Bug #3) ----
// 所有入口（ImageGenView / BatchGenView / ImageEditView / Canvas / Chat 工具）共享此上限，
// 防止多入口同时打到上游服务商触发 429 / 账号风控。
// 6 是经验值：常见服务商单账号 RPM 限制 30~60，单请求 5~30s，6 并发约 1~3 RPS。
const MAX_CONCURRENT_API_CALLS = 6
let _activeApiCalls = 0
const _apiWaitQueue: Array<() => void> = []

async function acquireApiSlot(): Promise<void> {
  if (_activeApiCalls < MAX_CONCURRENT_API_CALLS) {
    _activeApiCalls++
    return
  }
  return new Promise<void>((resolve) => {
    _apiWaitQueue.push(() => {
      _activeApiCalls++
      resolve()
    })
  })
}

function releaseApiSlot(): void {
  _activeApiCalls--
  const next = _apiWaitQueue.shift()
  if (next) next()
}

// ---- fetch with timeout (Bug #4) ----
/**
 * 带超时的 fetch。AbortController 触发后 fetch 抛 AbortError，
 * 上层用 wrapFetchError 转成更可读的"请求超时"。
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error(`请求超时 (${timeoutMs}ms): ${url}`)
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/** 错误信息截断（Bug #9）：上游可能返回几 MB HTML，避免污染 DB / IPC / UI */
function truncateError(text: string, max = 500): string {
  if (!text) return ''
  return text.length <= max ? text : text.slice(0, max) + `... (truncated, total ${text.length} chars)`
}

// ---- Disk file cleanup (Bug #5) ----
/** 安全删除一个绝对路径下的文件；不存在或失败都吞掉，仅日志 */
function safeDeleteFile(absPath: string): void {
  try {
    if (existsSync(absPath)) unlinkSync(absPath)
  } catch (e) {
    console.error('[ImageGen] Failed to delete file:', absPath, e)
  }
}

/** 按数据库存的相对路径删除磁盘文件；兼容旧数据中残留的绝对路径 */
function deleteImageByRelPath(relPath: string | null | undefined): void {
  if (!relPath) return
  const isAbs = /^[A-Za-z]:|^\//.test(relPath)
  const absPath = isAbs ? relPath : join(getDataDir(), relPath)
  safeDeleteFile(absPath)
}

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
  /** 多图一致性：单次 API 请求生成 n 张风格/角色一致的图片 */
  consistency?: boolean
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
  // Bug #5: 清理磁盘上残留的失败图片（罕见但保险）
  try {
    const rows = db.prepare("SELECT result_path FROM image_generations WHERE status = 'error'").all() as { result_path?: string }[]
    for (const row of rows) {
      if (row.result_path) {
        try { removeByRelativePath(row.result_path) } catch {}
        deleteImageByRelPath(row.result_path)
      }
    }
  } catch {}
  const result = db.prepare('DELETE FROM image_generations WHERE status = ?').run('error')
  return { deleted: result.changes }
}

export function deleteGeneration(id: string): boolean {
  const db = getDatabase()
  // 联动删除：清理图库引用 + 磁盘文件（Bug #5）+ 数据库行
  try {
    const row = db.prepare('SELECT result_path FROM image_generations WHERE id = ?').get(id) as { result_path?: string } | undefined
    if (row?.result_path) {
      try { removeByRelativePath(row.result_path) } catch (e) { console.error('Failed to remove from gallery on delete:', e) }
      deleteImageByRelPath(row.result_path)
    }
  } catch {}
  const result = db.prepare('DELETE FROM image_generations WHERE id = ?').run(id)
  return result.changes > 0
}

export function deleteGenerations(ids: string[]): number {
  if (!ids.length) return 0
  const db = getDatabase()
  // 联动删除：图库引用 + 磁盘文件（Bug #5）+ 数据库行
  try {
    const placeholders = ids.map(() => '?').join(',')
    const rows = db.prepare(`SELECT result_path FROM image_generations WHERE id IN (${placeholders})`).all(...ids) as { result_path?: string }[]
    for (const row of rows) {
      if (row.result_path) {
        try { removeByRelativePath(row.result_path) } catch (e) { console.error('Failed to remove from gallery on batch delete:', e) }
        deleteImageByRelPath(row.result_path)
      }
    }
  } catch {}
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

type ImageAPIResult = { b64_json?: string; url?: string; revised_prompt?: string }

/** 单次生图 API 调用的超时上限（毫秒）：覆盖最慢的 4K + 高质量场景 */
const IMAGE_API_TIMEOUT_MS = 180_000

async function callImageAPI(
  providerId: string,
  modelId: string,
  prompt: string,
  size: string,
  quality: string,
  refImages?: string[],
  mask?: string,
  tierId?: string,
  n: number = 1
): Promise<ImageAPIResult[]> {
  // Bug #3: 全局 semaphore — 所有入口共享上限
  await acquireApiSlot()
  try {
    if (providerId.startsWith('cloud:')) {
      return await callCloudImageAPI(modelId, prompt, size, quality, refImages, mask, tierId, n)
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
      form.append('n', String(n))
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
        n,
        size: resolvedPx,
        quality,
        response_format: 'b64_json'
      }
      fetchOptions = { method: 'POST', headers, body: JSON.stringify(body) }
    }

    // Bug #4: 加超时
    const response = await fetchWithTimeout(url, fetchOptions, IMAGE_API_TIMEOUT_MS)

    if (!response.ok) {
      const errorText = await response.text()
      // Bug #9: 截断超长错误响应
      throw new Error(`Image API error ${response.status}: ${truncateError(errorText)}`)
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

    const items = data.data as any[]
    if (!items || items.length === 0) throw new Error('No image data in response')

    return items.map((item: any) => ({
      b64_json: item.b64_json,
      url: item.url,
      revised_prompt: item.revised_prompt
    }))
  } finally {
    releaseApiSlot()
  }
}

async function callCloudImageAPI(
  modelId: string,
  prompt: string,
  size: string,
  quality: string,
  refImages?: string[],
  mask?: string,
  tierId?: string,
  n: number = 1
): Promise<ImageAPIResult[]> {
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
    n,
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

  // Step 1: Submit task (Bug #4: 60s 提交超时)
  const submitRes = await fetchWithTimeout(`${gatewayUrl}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  }, 60_000)

  if (!submitRes.ok) {
    const errorText = await submitRes.text()
    throw new Error(`Image API error ${submitRes.status}: ${truncateError(errorText)}`)
  }

  const submitData = await submitRes.json()
  const taskId = submitData.task_id
  if (!taskId) {
    // Direct response (no async)
    const items = submitData.data as any[]
    if (!items || items.length === 0) throw new Error('No image data in response')
    return items.map((item: any) => ({ b64_json: item.b64_json, url: item.url, revised_prompt: item.revised_prompt }))
  }

  // Step 2: Poll for result
  console.log('[ImageGen] Cloud task submitted:', taskId)
  const maxWait = 300_000 // 5 minutes 总等待
  const pollInterval = 3_000
  const pollTimeout = 30_000 // Bug #4: 单次 status 请求 30s 超时
  const start = Date.now()

  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval))

    const statusRes = await fetchWithTimeout(`${gatewayUrl}/images/status/${taskId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    }, pollTimeout)

    if (!statusRes.ok) {
      throw new Error(`Image API error ${statusRes.status}: ${truncateError(await statusRes.text())}`)
    }

    const statusData = await statusRes.json()

    if (statusData.status === 'completed') {
      const items = (statusData.result?.data || statusData.data) as any[]
      if (!items || items.length === 0) throw new Error('No image data in response')
      return items.map((item: any) => ({ b64_json: item.b64_json, url: item.url, revised_prompt: item.revised_prompt }))
    }

    if (statusData.status === 'failed') {
      throw new Error(truncateError(statusData.error || 'Image generation failed'))
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
  // Bug #4: 下载也加超时（120s 覆盖大文件）
  const response = await fetchWithTimeout(imageUrl, { method: 'GET' }, 120_000)
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
  const rawBatchCount = Math.min(Math.max(options.batchCount || 1, 1), 10)
  const quality = options.quality || 'auto'
  const results: ImageGeneration[] = []
  const maxN = getMaxConsistencyN(options.modelId)
  const useConsistency = !!(options.consistency && rawBatchCount > 1 && maxN > 1)
  // In consistency mode, clamp to model's maxN (single API call)
  const batchCount = useConsistency ? Math.min(rawBatchCount, maxN) : rawBatchCount

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

  if (useConsistency) {
    // -- Consistency mode: single API call with n = batchCount --
    // Mark all as generating
    for (let i = 0; i < batchCount; i++) {
      updateGenerationStatus(genIds[i], 'generating', {})
      if (window) {
        window.webContents.send('imageGen:progress', {
          type: 'generating',
          index: i,
          total: batchCount,
          completed: 0,
          genId: genIds[i],
          sessionId
        })
      }
    }

    try {
      const apiResults = await callImageAPI(
        options.modelProviderId,
        options.modelId,
        options.prompt,
        options.size,
        quality,
        options.refImages,
        options.mask,
        options.tierId,
        batchCount
      )

      // Save each result to its corresponding genId
      for (let i = 0; i < batchCount; i++) {
        const genId = genIds[i]
        const apiResult = apiResults[i]
        if (!apiResult) {
          updateGenerationStatus(genId, 'error', { error: 'No image data for index ' + i })
          if (window) {
            window.webContents.send('imageGen:progress', {
              type: 'error', index: i, total: batchCount, completed: i + 1,
              genId, error: 'No image data for index ' + i, sessionId
            })
          }
          continue
        }

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

        if (resultPath) {
          try { addToCreation(resultPath) } catch (e) { console.error('Failed to add to gallery creation:', e) }
        }

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
      }
    } catch (e: any) {
      // Consistency mode: if the single API call fails, mark all as error
      const errorMsg = e?.message || 'Unknown error'
      for (let i = 0; i < batchCount; i++) {
        updateGenerationStatus(genIds[i], 'error', { error: errorMsg })
        if (window) {
          window.webContents.send('imageGen:progress', {
            type: 'error',
            index: i,
            total: batchCount,
            completed: i + 1,
            genId: genIds[i],
            error: errorMsg,
            sessionId
          })
        }
      }
    }
  } else {
    // -- Normal mode: independent API calls (n=1 each) --
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

        const apiResults = await callImageAPI(
          options.modelProviderId,
          options.modelId,
          options.prompt,
          options.size,
          quality,
          options.refImages,
          options.mask,
          options.tierId,
          1
        )
        const apiResult = apiResults[0]
        if (!apiResult) throw new Error('No image data in response')

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

        if (resultPath) {
          try { addToCreation(resultPath) } catch (e) { console.error('Failed to add to gallery creation:', e) }
        }

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

  // Bug #5: 如旧 result_path 是不同扩展名的 _edited 衍生品，删除孤儿文件。
  // 不删原始 ${id}.${ext}（保留作为重置基准）。
  const oldPath = gen.result_path
  if (oldPath && oldPath !== relPath && oldPath.includes('_edited.')) {
    deleteImageByRelPath(oldPath)
  }

  const db = getDatabase()
  db.prepare('UPDATE image_generations SET result_path = ? WHERE id = ?').run(relPath, id)

  return getGeneration(id)
}

