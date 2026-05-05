import { getSetting } from './settings'
import {
  getCloudToken,
  getAllowCustomEmbedding,
  getCloudGatewayUrl,
  getActiveCloudEmbeddingModelId,
} from './cloud-token'
import { normalizeApiBase } from './api-base-normalize'

export interface EmbeddingResult {
  embedding: number[]
  tokenCount: number
}

export interface EmbeddingMeta {
  model: string
  source: 'cloud' | 'local'
  dim: number
}

export interface ResolvedEmbeddingConfig {
  source: 'cloud' | 'local'
  model: string
  /** local 才有 */
  apiBase?: string
  /** local 才有 */
  apiKey?: string
}

/** 自定义错误：当套餐未包含 embedding 模型 / 余额不足 / 未配置时抛出 */
export class EmbeddingUnavailableError extends Error {
  code: 'NO_CLOUD_MODEL' | 'INSUFFICIENT_BALANCE' | 'NOT_CONFIGURED' | 'UNAUTHORIZED'
  constructor(code: EmbeddingUnavailableError['code'], message: string) {
    super(message)
    this.code = code
    this.name = 'EmbeddingUnavailableError'
  }
}

/**
 * 解析当前应使用的 embedding 配置。
 * 优先级（与「模型服务」allow_custom_provider 双层校验保持一致）：
 *   1. 已登录 且 allow_custom_embedding === false → 强制走云端 gateway
 *   2. 已登录 且 用户在 Settings 主动选了「云端模型」(setting=cloud) → 走云端
 *   3. 否则 → 走本地配置（vector_api_base 等）
 *
 * 任何分支配置缺失都抛 EmbeddingUnavailableError，UI 层据 code 引导用户。
 */
export async function getEmbeddingConfig(): Promise<ResolvedEmbeddingConfig> {
  const loggedIn = !!getCloudToken()
  const allowLocal = getAllowCustomEmbedding()
  // 用户在 SettingsView 主动选择的来源：'cloud' | 'local' | ''（默认按权限决定）
  const userSource = (getSetting('vector_source') || '').trim() as 'cloud' | 'local' | ''

  // 「强制云端」条件：登录 + 权限关闭。或登录 + 用户主动选 cloud
  const forceCloud = loggedIn && (!allowLocal || userSource === 'cloud')

  if (forceCloud) {
    const model = getActiveCloudEmbeddingModelId()
    if (!model) {
      throw new EmbeddingUnavailableError(
        'NO_CLOUD_MODEL',
        '您的套餐未包含向量模型，请前往套餐商城购买',
      )
    }
    return { source: 'cloud', model }
  }

  // 本地分支
  const apiBase = (getSetting('vector_api_base') || '').trim()
  const apiKey = (getSetting('vector_api_key') || '').trim()
  const model = (getSetting('vector_model') || 'text-embedding-3-small').trim()
  if (!apiBase) {
    throw new EmbeddingUnavailableError(
      'NOT_CONFIGURED',
      '向量服务未配置：请在设置中配置向量服务的 API 地址',
    )
  }
  return { source: 'local', model, apiBase, apiKey }
}

export async function embedText(text: string): Promise<EmbeddingResult & EmbeddingMeta> {
  const config = await getEmbeddingConfig()
  const results = await embedBatch([text], config)
  return {
    embedding: results.embeddings[0].embedding,
    tokenCount: results.embeddings[0].tokenCount,
    model: results.meta.model,
    source: results.meta.source,
    dim: results.meta.dim,
  }
}

export interface EmbedBatchResponse {
  embeddings: EmbeddingResult[]
  meta: EmbeddingMeta
}

export async function embedBatch(
  texts: string[],
  config?: ResolvedEmbeddingConfig,
): Promise<EmbedBatchResponse> {
  if (!config) config = await getEmbeddingConfig()

  if (config.source === 'cloud') {
    return cloudEmbedBatch(texts, config.model)
  }
  return localEmbedBatch(texts, config)
}

async function localEmbedBatch(
  texts: string[],
  config: ResolvedEmbeddingConfig,
): Promise<EmbedBatchResponse> {
  if (!config.apiBase) {
    throw new EmbeddingUnavailableError('NOT_CONFIGURED', '本地向量服务未配置 API 地址')
  }
  const url = normalizeApiBase(config.apiBase) + '/embeddings'
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: config.model, input: texts }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Embedding API 请求失败 (${response.status}): ${errorText}`)
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[]; index: number }>
    usage?: { prompt_tokens?: number; total_tokens?: number }
  }
  if (!data.data || !Array.isArray(data.data)) {
    throw new Error('Embedding API 返回格式异常')
  }

  const sorted = data.data.sort((a, b) => a.index - b.index)
  const embeddings: EmbeddingResult[] = sorted.map((item) => ({
    embedding: item.embedding,
    tokenCount: data.usage?.prompt_tokens
      ? Math.ceil(data.usage.prompt_tokens / texts.length)
      : 0,
  }))
  const dim = embeddings[0]?.embedding.length || 0
  return {
    embeddings,
    meta: { model: config.model, source: 'local', dim },
  }
}

async function cloudEmbedBatch(texts: string[], model: string): Promise<EmbedBatchResponse> {
  const token = getCloudToken()
  if (!token) {
    throw new EmbeddingUnavailableError('UNAUTHORIZED', '需要登录云端账号才能使用云端向量服务')
  }
  if (!model) {
    throw new EmbeddingUnavailableError(
      'NO_CLOUD_MODEL',
      '您的套餐未包含向量模型，请前往套餐商城购买',
    )
  }

  const url = `${getCloudGatewayUrl()}/embeddings`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ model, input: texts }),
  })

  // 余额不足专属：402
  if (response.status === 402) {
    throw new EmbeddingUnavailableError('INSUFFICIENT_BALANCE', '云端余额不足，请充值或购买套餐')
  }
  if (response.status === 401) {
    throw new EmbeddingUnavailableError('UNAUTHORIZED', '云端账号登录已过期，请重新登录')
  }
  if (response.status === 403) {
    // 套餐不含该模型 / 模型被关停
    throw new EmbeddingUnavailableError(
      'NO_CLOUD_MODEL',
      '当前账号无权使用该向量模型，请购买套餐',
    )
  }
  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`云端向量请求失败 (${response.status}): ${errorText}`)
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[]; index: number }>
    usage?: { prompt_tokens?: number; total_tokens?: number }
  }
  if (!data.data || !Array.isArray(data.data)) {
    throw new Error('云端向量返回格式异常')
  }

  const sorted = data.data.sort((a, b) => a.index - b.index)
  const embeddings: EmbeddingResult[] = sorted.map((item) => ({
    embedding: item.embedding,
    tokenCount: data.usage?.prompt_tokens
      ? Math.ceil(data.usage.prompt_tokens / texts.length)
      : 0,
  }))
  const dim = embeddings[0]?.embedding.length || 0
  return {
    embeddings,
    meta: { model, source: 'cloud', dim },
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dotProduct / denom
}
