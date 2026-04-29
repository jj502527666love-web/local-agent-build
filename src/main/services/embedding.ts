import { getSetting } from './settings'

export interface EmbeddingResult {
  embedding: number[]
  tokenCount: number
}

async function getEmbeddingConfig(): Promise<{
  type: string
  apiBase: string
  apiKey: string
  model: string
}> {
  const type = getSetting('vector_type') || 'openai'
  const apiBase = getSetting('vector_api_base') || ''
  const apiKey = getSetting('vector_api_key') || ''
  const model = getSetting('vector_model') || 'text-embedding-3-small'

  if (!apiBase) {
    throw new Error('向量服务未配置：请在设置中配置向量服务的 API 地址')
  }

  return { type, apiBase, apiKey, model }
}

export async function embedText(text: string): Promise<EmbeddingResult> {
  const config = await getEmbeddingConfig()
  const results = await embedBatch([text], config)
  return results[0]
}

export async function embedBatch(
  texts: string[],
  config?: { type: string; apiBase: string; apiKey: string; model: string }
): Promise<EmbeddingResult[]> {
  if (!config) {
    config = await getEmbeddingConfig()
  }

  const url = config.apiBase.replace(/\/+$/, '') + '/embeddings'

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }
  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`
  }

  const body = {
    model: config.model,
    input: texts
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
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

  // Sort by index to ensure correct order
  const sorted = data.data.sort((a, b) => a.index - b.index)

  return sorted.map((item) => ({
    embedding: item.embedding,
    tokenCount: data.usage?.prompt_tokens
      ? Math.ceil(data.usage.prompt_tokens / texts.length)
      : 0
  }))
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
