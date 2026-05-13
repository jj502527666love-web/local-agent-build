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
  skill_ids: string[]
  mcp_ids: string[]
  prompt_skill_dirs: string[]
  tool_approval: ToolApproval
  /** 是否启用 AI 生图能力（image_gen tool）。0=关、1=开。默认关，避免对无图需求的智能体浪费 prompt 与 LLM 误调。 */
  enable_image_gen: number
  created_at: string
  updated_at: string
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

  return { bots, loading, fetchBots, createBot, updateBot, deleteBot }
})
