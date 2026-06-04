import https from 'https'
import http from 'http'
import { getCloudApiBase } from './cloud-token'
import { createBot, getBot, getBotByCloudAgentId, updateBot, type Bot, type ToolApproval } from './bot'
import { createPersona } from './persona'
import { downloadAvatarFromUrl } from './bot-avatar'

class HttpError extends Error {
  status: number
  constructor(status: number, body: string) {
    super(`HTTP ${status}: ${body.slice(0, 200)}`)
    this.status = status
  }
}

// 桌面端预设的 6 个内置小工具（builtin_* 全平台固定 ID），市场只承载这一组
const BUILTIN_TOOL_IDS = new Set([
  'builtin_current_time',
  'builtin_calculator',
  'builtin_fetch_webpage',
  'builtin_json_tool',
  'builtin_text_tool',
  'builtin_random_generator',
])

export interface CloudAgent {
  id: number
  name: string
  description: string
  avatar: string
  system_prompt: string
  tool_skill_ids: string[]
  tool_approval: ToolApproval
  enable_image_gen: number
  tags: string[]
  download_count: number
  rating_avg: number
  rating_count: number
  author_nickname: string
  created_at?: string
}

function fetchJson(url: string, timeoutMs = 12000): Promise<any> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    const req = mod.get(url, (res) => {
      const status = res.statusCode || 0
      let data = ''
      res.on('data', (chunk: string) => (data += chunk))
      res.on('end', () => {
        if (status >= 400) {
          reject(new HttpError(status, data))
          return
        }
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(e)
        }
      })
    })
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Request timeout after ${timeoutMs}ms`)))
    req.on('error', reject)
  })
}

function isNotFound(e: unknown): boolean {
  return e instanceof HttpError && e.status === 404
}

function originOf(apiBase: string): string {
  const m = apiBase.match(/^(https?:\/\/[^/]+)/)
  return m ? m[1] : ''
}

function resolveUrl(value: string | undefined, origin: string): string {
  if (!value) return ''
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')) return value
  return value.startsWith('/') ? origin + value : value
}

function normalizeApproval(v: unknown): ToolApproval {
  return v === 'off' || v === 'destructive' || v === 'all' ? v : 'destructive'
}

function mapAgent(raw: any, origin: string): CloudAgent {
  const toolIds = Array.isArray(raw.tool_skill_ids)
    ? raw.tool_skill_ids.map((x: unknown) => String(x)).filter((x: string) => BUILTIN_TOOL_IDS.has(x))
    : []
  return {
    id: Number(raw.id),
    name: String(raw.name || ''),
    description: String(raw.description || ''),
    avatar: resolveUrl(raw.avatar, origin),
    system_prompt: String(raw.system_prompt || ''),
    tool_skill_ids: toolIds,
    tool_approval: normalizeApproval(raw.tool_approval),
    enable_image_gen: raw.enable_image_gen ? 1 : 0,
    tags: Array.isArray(raw.tags) ? raw.tags.map((t: unknown) => String(t)) : [],
    download_count: Number(raw.download_count || 0),
    rating_avg: Number(raw.rating_avg || 0),
    rating_count: Number(raw.rating_count || 0),
    author_nickname: String(raw.author_nickname || ''),
    created_at: raw.created_at || undefined,
  }
}

export async function fetchMarketAgents(options?: {
  page?: number
  pageSize?: number
  search?: string
}): Promise<{ items: CloudAgent[]; total: number; page: number; pageSize: number }> {
  const apiBase = getCloudApiBase()
  const page = options?.page || 1
  const pageSize = options?.pageSize || 24
  if (!apiBase) return { items: [], total: 0, page, pageSize }
  const origin = originOf(apiBase)
  const params = new URLSearchParams({ page: String(page), per_page: String(pageSize) })
  if (options?.search) params.set('search', options.search)
  const url = `${apiBase}/public/agents?${params.toString()}`
  let json: any
  try {
    json = await fetchJson(url)
  } catch (e) {
    // 远端可能尚未部署智能体市场接口：404 静默降级为空列表，其它错误抛给前端
    if (isNotFound(e)) return { items: [], total: 0, page, pageSize }
    throw e
  }
  const items: any[] = json.items || []
  return {
    items: items.map((it) => mapAgent(it, origin)),
    total: Number(json.total || items.length || 0),
    page,
    pageSize,
  }
}

export async function fetchMarketAgent(id: number): Promise<CloudAgent> {
  const apiBase = getCloudApiBase()
  if (!apiBase) throw new Error('云控端未配置')
  const origin = originOf(apiBase)
  const json = await fetchJson(`${apiBase}/public/agents/${id}`)
  return mapAgent(json, origin)
}

/** 保存到本地时回调下载量 +1（best-effort，失败不影响主流程） */
async function incrementDownload(id: number): Promise<void> {
  try {
    const apiBase = getCloudApiBase()
    if (!apiBase) return
    await fetch(`${apiBase}/public/agents/${id}/download`, { method: 'POST' })
  } catch {
    /* ignore */
  }
}

export interface ImportAgentResult {
  ok: boolean
  bot?: Bot
  alreadyExists?: boolean
  error?: string
}

/**
 * 从市场「保存到本地」：建人格（承载 system_prompt）→ 建本地 bot（绑 6 工具）→ 下载形象图落盘。
 * 已保存过（cloud_agent_id 命中）则直接返回现有 bot，不重复创建。
 */
export async function importAgentAsLocal(cloudAgentInput: CloudAgent): Promise<ImportAgentResult> {
  try {
    const cloud = cloudAgentInput
    if (!cloud || !cloud.id) return { ok: false, error: '市场智能体数据无效' }

    const existing = getBotByCloudAgentId(cloud.id)
    if (existing) return { ok: true, bot: existing, alreadyExists: true }

    // 系统提示词经「人格」承载（决定行为）
    let personaId: string | null = null
    const systemPrompt = (cloud.system_prompt || '').trim()
    if (systemPrompt) {
      const persona = createPersona({ name: cloud.name || '市场智能体', system_prompt: systemPrompt })
      personaId = persona.id
    }

    const toolIds = (cloud.tool_skill_ids || []).filter((x) => BUILTIN_TOOL_IDS.has(x))

    const bot = createBot({
      name: cloud.name || '未命名智能体',
      description: cloud.description || '',
      persona_id: personaId || undefined,
      skill_ids: toolIds,
      tool_approval: normalizeApproval(cloud.tool_approval),
      enable_image_gen: cloud.enable_image_gen ? 1 : 0,
      source: 'market',
      cloud_agent_id: cloud.id,
    })

    // 形象图下载落盘（失败降级：bot 仍可用，卡片回退首字母）
    if (cloud.avatar) {
      try {
        const localPath = await downloadAvatarFromUrl(cloud.avatar)
        if (localPath) updateBot(bot.id, { avatar: localPath })
      } catch {
        /* ignore download failure */
      }
    }

    void incrementDownload(cloud.id)

    return { ok: true, bot: getBot(bot.id) || bot, alreadyExists: false }
  } catch (e: any) {
    return { ok: false, error: e?.message || '保存到本地失败' }
  }
}
