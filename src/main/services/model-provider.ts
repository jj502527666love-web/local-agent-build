import { getDatabase } from '../database'
import { v4 as uuid } from 'uuid'
import { normalizeApiBase } from './api-base-normalize'

/**
 * 自定义参数：在生图 body 顶层逐条 set 一对 kv。空字符串值视为占位，不下发。
 * 例：{name:"seed", value:"42"} → body.seed = "42"。
 * 数字/布尔会被尝试转换；解析失败保持字符串原样（上游通常能接受字符串）。
 */
export interface ProviderCustomParam {
  name: string
  value: string
}

export interface ModelProvider {
  id: string
  name: string
  type: string
  api_base: string
  api_key: string
  models: string[]
  /** 自定义参数（按顺序写入 body 顶层） */
  custom_params: ProviderCustomParam[]
  /** 最终 body 覆盖 patch（在 custom_params 之后 Object.assign） */
  request_override_patch: Record<string, any>
  created_at: string
  updated_at: string
}

/** 安全解析 JSON 字段；失败/空时回落安全默认值 */
function parseJsonField<T>(raw: unknown, fallback: T): T {
  if (raw == null || raw === '') return fallback
  try {
    const v = JSON.parse(String(raw))
    return v == null ? fallback : (v as T)
  } catch {
    return fallback
  }
}

function rowToProvider(row: any): ModelProvider {
  return {
    ...row,
    models: parseJsonField<string[]>(row.models, []),
    custom_params: parseJsonField<ProviderCustomParam[]>(row.custom_params, []),
    request_override_patch: parseJsonField<Record<string, any>>(row.request_override_patch, {})
  }
}

/** 清洗自定义参数：丢弃空 name、剔除非法条目。value 保留为字符串。 */
function normalizeCustomParams(input: unknown): ProviderCustomParam[] {
  if (!Array.isArray(input)) return []
  const out: ProviderCustomParam[] = []
  for (const item of input) {
    if (!item || typeof item !== 'object') continue
    const name = String((item as any).name ?? '').trim()
    if (!name) continue
    const value = String((item as any).value ?? '')
    out.push({ name, value })
  }
  return out
}

/** request_override_patch 必须是对象，数组/标量都拒绝 */
function normalizeOverridePatch(input: unknown): Record<string, any> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  return input as Record<string, any>
}

export function listModelProviders(): ModelProvider[] {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM model_providers ORDER BY created_at DESC').all() as any[]
  return rows.map(rowToProvider)
}

export function getModelProvider(id: string): ModelProvider | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM model_providers WHERE id = ?').get(id) as any
  if (!row) return null
  return rowToProvider(row)
}

export function createModelProvider(data: {
  name: string
  type: string
  api_base: string
  api_key: string
  models?: string[]
  custom_params?: ProviderCustomParam[]
  request_override_patch?: Record<string, any>
}): ModelProvider {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString()
  const models = JSON.stringify(data.models || [])
  const customParams = JSON.stringify(normalizeCustomParams(data.custom_params))
  const overridePatch = JSON.stringify(normalizeOverridePatch(data.request_override_patch))
  const apiBase = normalizeApiBase(data.api_base)
  db.prepare(
    'INSERT INTO model_providers (id, name, type, api_base, api_key, models, custom_params, request_override_patch, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, data.name, data.type, apiBase, data.api_key, models, customParams, overridePatch, now, now)
  return getModelProvider(id)!
}

export function updateModelProvider(
  id: string,
  data: Partial<{
    name: string
    type: string
    api_base: string
    api_key: string
    models: string[]
    custom_params: ProviderCustomParam[]
    request_override_patch: Record<string, any>
  }>
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
  const customParams = JSON.stringify(
    data.custom_params !== undefined ? normalizeCustomParams(data.custom_params) : existing.custom_params
  )
  const overridePatch = JSON.stringify(
    data.request_override_patch !== undefined
      ? normalizeOverridePatch(data.request_override_patch)
      : existing.request_override_patch
  )
  const now = new Date().toISOString()

  db.prepare(
    'UPDATE model_providers SET name=?, type=?, api_base=?, api_key=?, models=?, custom_params=?, request_override_patch=?, updated_at=? WHERE id=?'
  ).run(name, type, api_base, api_key, models, customParams, overridePatch, now, id)
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
