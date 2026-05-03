// Unified model capability detection + grouping/sorting.
// Source of truth for all model selection dropdowns across the app.

export type ModelCap = 'chat' | 'vision' | 'image' | 'embedding' | 'tts' | 'asr' | 'rerank'

// Keyword dictionaries. Detection is a HINT only — models that don't match by name
// are NOT hidden; they fall into the "others" group and can still be selected.
const KEYWORDS: Record<ModelCap, string[]> = {
  chat: [
    'gpt', 'claude', 'qwen', 'glm', 'kimi', 'deepseek', 'llama', 'mistral',
    'gemma', 'yi-', 'baichuan', 'internlm', 'chat', 'turbo', 'lite', 'plus',
    'sonnet', 'opus', 'haiku', 'gemini', 'doubao', 'hunyuan', 'spark', 'ernie',
    'abab', 'moonshot', 'step-', 'command-r', 'phi-', 'wizardlm', 'vicuna',
    'openchat', 'solar', 'o1-', 'o3-', 'o4-', 'grok'
  ],
  vision: [
    'vision', '-vl', 'vl-', 'vl2', 'vl3', 'multimodal', '4o', 'omni',
    'claude-3', 'claude-4', 'sonnet', 'opus', 'haiku',
    'gemini', 'gpt-4', 'qwen-vl', 'qwen2-vl', 'qwen2.5-vl',
    'internvl', 'glm-4v', 'yi-vl', 'cogvlm', 'minicpm-v',
    'llava', 'pixtral', 'molmo', 'idefics', 'step-1v', 'doubao-vision'
  ],
  image: [
    'image', 'dall-e', 'flux', 'stable-diffusion', 'sdxl', 'cogview', 'wanx',
    'kolors', 'gpt-image', 'jimeng', 'seedream', 'kling', 'midjourney', 'mj-',
    'ideogram', 'recraft', 'playground', 'kandinsky', 'pixart'
  ],
  embedding: ['embedding', 'embed', 'bge', 'e5-', 'text-embedding', 'gte-'],
  tts: ['tts', 'audio-speech', 'speech-synthesis'],
  asr: ['whisper', 'asr', 'speech-recognition'],
  rerank: ['rerank', 'reranker']
}

// Keywords that exclude a model from being "chat" (e.g. pure generators / specialists)
const NON_CHAT: string[] = [
  'image', 'dall-e', 'flux', 'stable-diffusion', 'sdxl', 'cogview', 'wanx',
  'kolors', 'embedding', 'embed', 'bge', 'e5-', 'text-embedding',
  'tts', 'whisper', 'audio', 'speech', 'asr', 'rerank', 'reranker',
  'jimeng', 'seedream', 'kling', 'midjourney', 'mj-', 'ideogram', 'recraft',
  'playground', 'kandinsky', 'pixart', 'gpt-image'
]

function hasAny(lower: string, list: string[]): boolean {
  return list.some(k => lower.includes(k))
}

/**
 * Detect capabilities from model id by keyword matching.
 * Returns zero or more caps — order is not significant.
 */
export function detectCapsByName(modelId: string): ModelCap[] {
  const lower = (modelId || '').toLowerCase()
  const caps: ModelCap[] = []
  if (hasAny(lower, KEYWORDS.image)) caps.push('image')
  if (hasAny(lower, KEYWORDS.embedding)) caps.push('embedding')
  if (hasAny(lower, KEYWORDS.tts)) caps.push('tts')
  if (hasAny(lower, KEYWORDS.asr)) caps.push('asr')
  if (hasAny(lower, KEYWORDS.rerank)) caps.push('rerank')
  // Chat: match chat keywords AND not be a non-chat specialist
  if (hasAny(lower, KEYWORDS.chat) && !hasAny(lower, NON_CHAT)) caps.push('chat')
  // Vision: match vision keywords AND not be an image generator / embedding / tts
  if (hasAny(lower, KEYWORDS.vision) && !hasAny(lower, NON_CHAT)) caps.push('vision')
  return caps
}

/**
 * Backend-provided cloud type (from CloudModel.type enum 'chat'|'image'|'embedding').
 * This is the ground-truth signal from cloud admin, taking priority over name detection.
 */
export function capsFromCloudType(cloudType: string | undefined): ModelCap[] {
  if (!cloudType) return []
  const t = cloudType.toLowerCase()
  if (t === 'chat') return ['chat']
  if (t === 'image') return ['image']
  if (t === 'embedding') return ['embedding']
  if (t === 'tts') return ['tts']
  if (t === 'asr') return ['asr']
  return []
}

/**
 * Combined capability probe.
 * - If cloudType is known → base from capsFromCloudType, then merge in name-detected caps
 *   (so a cloud chat model named "qwen-vl-max" correctly picks up vision)
 * - Otherwise → pure name detection.
 */
export function getModelCaps(modelId: string, cloudType?: string): ModelCap[] {
  const base = capsFromCloudType(cloudType)
  const detected = detectCapsByName(modelId)
  const merged = new Set<ModelCap>([...base, ...detected])
  return Array.from(merged)
}

export function hasCap(modelId: string, cap: ModelCap, cloudType?: string): boolean {
  return getModelCaps(modelId, cloudType).includes(cap)
}

/**
 * Group models into "recommended" vs "others" for a given capability.
 * - recommended = usage-history + caps-detected, in that priority order
 * - others = the rest, alphabetical
 * Never hides anything — every model in the input appears in exactly one group.
 */
export function groupAndSort(
  models: string[],
  cap: ModelCap,
  opts: {
    cloudTypeOf?: (modelId: string) => string | undefined
    usageHints?: string[]
  } = {}
): { recommended: string[]; others: string[] } {
  const cloudTypeOf = opts.cloudTypeOf || (() => undefined)
  const hints = opts.usageHints || []
  const hintRank = new Map<string, number>()
  hints.forEach((id, i) => hintRank.set(id, i))

  const recommended: string[] = []
  const others: string[] = []

  for (const m of models) {
    const capable = hasCap(m, cap, cloudTypeOf(m))
    const inHints = hintRank.has(m)
    if (capable || inHints) recommended.push(m)
    else others.push(m)
  }

  // Sort recommended: hints first (by rank), then caps-only alphabetical
  recommended.sort((a, b) => {
    const ra = hintRank.has(a) ? hintRank.get(a)! : Infinity
    const rb = hintRank.has(b) ? hintRank.get(b)! : Infinity
    if (ra !== rb) return ra - rb
    return a.localeCompare(b)
  })
  others.sort((a, b) => a.localeCompare(b))

  return { recommended, others }
}
