import { getDatabase } from '../database'
import { v4 as uuid } from 'uuid'
import { normalizeApiBase } from './api-base-normalize'

export interface ModelProvider {
  id: string
  name: string
  type: string
  api_base: string
  api_key: string
  models: string[]
  created_at: string
  updated_at: string
}

export function listModelProviders(): ModelProvider[] {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM model_providers ORDER BY created_at DESC').all() as any[]
  return rows.map((r) => ({ ...r, models: JSON.parse(r.models) }))
}

export function getModelProvider(id: string): ModelProvider | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM model_providers WHERE id = ?').get(id) as any
  if (!row) return null
  return { ...row, models: JSON.parse(row.models) }
}

export function createModelProvider(data: {
  name: string
  type: string
  api_base: string
  api_key: string
  models?: string[]
}): ModelProvider {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString()
  const models = JSON.stringify(data.models || [])
  const apiBase = normalizeApiBase(data.api_base)
  db.prepare(
    'INSERT INTO model_providers (id, name, type, api_base, api_key, models, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, data.name, data.type, apiBase, data.api_key, models, now, now)
  return getModelProvider(id)!
}

export function updateModelProvider(
  id: string,
  data: Partial<{ name: string; type: string; api_base: string; api_key: string; models: string[] }>
): ModelProvider | null {
  const db = getDatabase()
  const existing = getModelProvider(id)
  if (!existing) return null

  const name = data.name ?? existing.name
  const type = data.type ?? existing.type
  // 仅在用户传入新值时 normalize，未传入则保持原值
  const api_base = data.api_base !== undefined ? normalizeApiBase(data.api_base) : existing.api_base
  const api_key = data.api_key ?? existing.api_key
  const models = JSON.stringify(data.models ?? existing.models)
  const now = new Date().toISOString()

  db.prepare(
    'UPDATE model_providers SET name=?, type=?, api_base=?, api_key=?, models=?, updated_at=? WHERE id=?'
  ).run(name, type, api_base, api_key, models, now, id)
  return getModelProvider(id)
}

export function deleteModelProvider(id: string): boolean {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM model_providers WHERE id = ?').run(id)
  return result.changes > 0
}

export async function fetchRemoteModels(apiBase: string, apiKey: string): Promise<string[]> {
  // 先 normalize：用户可能填不带 /v1 的地址，统一成 base/v1 形式
  const base = normalizeApiBase(apiBase)
  const headers: Record<string, string> = {}
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  // normalize 后大多数情况 base 已含 /v1；保留一份不带 /v1 的候选以兼容少数直接挂根的代理
  const stripped = base.replace(/\/v\d+[a-z]*$/i, '')
  const urls = [
    `${base}/models`,
    ...(stripped !== base ? [`${stripped}/models`] : [])
  ]

  let lastError = ''
  for (const url of urls) {
    try {
      const response = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(15000) })
      const contentType = response.headers.get('content-type') || ''
      if (!contentType.includes('json')) {
        lastError = `${url} 返回了非 JSON 响应，请检查 API 地址`
        continue
      }
      const data = await response.json()
      if (!response.ok) {
        const msg = data?.error?.message || data?.message || `HTTP ${response.status}`
        if (response.status === 401) {
          lastError = `认证失败: ${msg}，请检查 API 密钥`
        } else {
          lastError = `${response.status}: ${msg}`
        }
        continue
      }
      const models: string[] = (data.data || [])
        .map((m: any) => m.id as string)
        .filter(Boolean)
        .sort()
      return models
    } catch (e: any) {
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
        lastError = '请求超时，请检查网络连接和 API 地址'
      } else {
        lastError = e?.message || '未知错误'
      }
    }
  }
  throw new Error(lastError || '无法获取模型列表')
}
