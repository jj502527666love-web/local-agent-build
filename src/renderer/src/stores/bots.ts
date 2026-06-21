import { defineStore } from 'pinia'
import { ref } from 'vue'

function plain<T>(data: T): T {
  return JSON.parse(JSON.stringify(data))
}

export type ToolApproval = 'off' | 'destructive' | 'all'

export interface Bot {
  id: string
  name: string
  description: string
  model_provider_id: string | null
  model_id: string
  persona_id: string | null
  kb_only: number
  kb_category_ids: string[]
  /** 绑定的云端知识库 id 列表（云控端智能体预设下发；对话时在线检索） */
  cloud_kb_ids: number[]
  cloud_kb_only: number
  cloud_kb_top_k: number
  skill_ids: string[]
  mcp_ids: string[]
  prompt_skill_dirs: string[]
  tool_approval: ToolApproval
  /** 是否启用 AI 生图能力（image_gen tool）。0=关、1=开。默认关，避免对无图需求的智能体浪费 prompt 与 LLM 误调。 */
  enable_image_gen: number
  /** 是否启用 AI PPT 能力（deck_* 工具集）。0=关、1=开。默认关。 */
  enable_deck: number
  /** 单轮对话最大工具调用步数(0=用默认 40)。 */
  max_tool_rounds: number
  /** 2:3 形象图本地绝对路径（空=用首字母占位） */
  avatar: string
  /** 来源：'local' 本地创建 / 'market' 从市场保存 */
  source: string
  /** 市场来源云端 agent id（去重 / 评分用）。0=非市场来源 */
  cloud_agent_id: number
  /** 投稿到市场的审核态：'' 未投稿 / pending / approved / rejected / withdrawn */
  submission_status: string
  submission_reject_reason: string
  submission_reviewed_at: string
  submission_synced_at: string
  created_at: string
  updated_at: string
}

export interface MarketAgent {
  id: number
  name: string
  description: string
  avatar: string
  // 市场网格用的形象图缩略图（云端可能为空，回退 avatar）
  avatar_thumb?: string
  system_prompt: string
  tool_skill_ids: string[]
  tool_approval: ToolApproval
  enable_image_gen: number
  tags: string[]
  download_count: number
  rating_avg: number
  rating_count: number
  author_nickname: string
  // 定价：price=0 免费；>0 需购买。price_balance_type：token=金币 / credit=积分
  price: number
  price_balance_type: 'token' | 'credit'
  // 当前用户是否已拥有
  is_owned: boolean
  created_at?: string
}

export interface ImportFromMarketResult {
  ok: boolean
  alreadyExists?: boolean
  needLogin?: boolean
  needRecharge?: boolean
  forbidden?: boolean
  needed?: number
  current?: number
  balanceType?: 'token' | 'credit'
  error?: string
}

export const useBotStore = defineStore('bots', () => {
  const bots = ref<Bot[]>([])
  const loading = ref(false)

  async function fetchBots() {
    loading.value = true
    try {
      bots.value = (await window.api.bot.invoke('list')) as Bot[]
    } finally {
      loading.value = false
    }
  }

  async function createBot(data: Partial<Bot>) {
    const result = (await window.api.bot.invoke('create', plain(data))) as Bot
    bots.value.unshift(result)
    return result
  }

  async function updateBot(id: string, data: Partial<Bot>) {
    const result = (await window.api.bot.invoke('update', id, plain(data))) as Bot
    const idx = bots.value.findIndex((b) => b.id === id)
    if (idx !== -1) bots.value[idx] = result
    return result
  }

  async function deleteBot(id: string) {
    await window.api.bot.invoke('delete', id)
    bots.value = bots.value.filter((b) => b.id !== id)
  }

  // 渲染端选图（data:URL）落盘，返回本地绝对路径，写入 bot.avatar
  async function saveAvatar(dataUrl: string): Promise<string> {
    return (await window.api.bot.invoke('saveAvatar', dataUrl)) as string
  }

  // ===== 智能体市场 =====
  const marketAgents = ref<MarketAgent[]>([])
  const marketLoading = ref(false)
  const marketTotal = ref(0)

  async function fetchMarket(options?: { page?: number; pageSize?: number; search?: string }) {
    marketLoading.value = true
    try {
      const res = (await window.api.bot.invoke('listMarket', plain(options || {}))) as {
        items: MarketAgent[]
        total: number
      }
      marketAgents.value = res.items || []
      marketTotal.value = res.total || 0
    } finally {
      marketLoading.value = false
    }
  }

  async function importFromMarket(agent: MarketAgent): Promise<ImportFromMarketResult> {
    const res = (await window.api.bot.invoke('importFromMarket', plain(agent))) as {
      ok: boolean
      bot?: Bot
      alreadyExists?: boolean
      needLogin?: boolean
      needRecharge?: boolean
      forbidden?: boolean
      needed?: number
      current?: number
      balanceType?: 'token' | 'credit'
      error?: string
    }
    if (res.ok && res.bot && !res.alreadyExists) bots.value.unshift(res.bot)
    return {
      ok: res.ok,
      alreadyExists: res.alreadyExists,
      needLogin: res.needLogin,
      needRecharge: res.needRecharge,
      forbidden: res.forbidden,
      needed: res.needed,
      current: res.current,
      balanceType: res.balanceType,
      error: res.error,
    }
  }

  async function submitToMarket(localBotId: string) {
    return (await window.api.bot.invoke('submitToMarket', localBotId)) as { ok: boolean; error?: string; data?: any }
  }

  async function withdrawSubmission(localBotId: string) {
    return (await window.api.bot.invoke('withdrawSubmission', localBotId)) as { ok: boolean; error?: string }
  }

  async function syncSubmissionStatus(localBotIds: string[]) {
    return (await window.api.bot.invoke('syncSubmissionStatus', plain(localBotIds))) as { ok: boolean; items?: any[]; error?: string }
  }

  async function rateAgent(cloudAgentId: number, score: number, comment?: string) {
    return (await window.api.bot.invoke('rate', cloudAgentId, score, comment)) as { ok: boolean; error?: string; data?: any }
  }

  return {
    bots, loading, fetchBots, createBot, updateBot, deleteBot, saveAvatar,
    marketAgents, marketLoading, marketTotal,
    fetchMarket, importFromMarket, submitToMarket, withdrawSubmission, syncSubmissionStatus, rateAgent,
  }
})
