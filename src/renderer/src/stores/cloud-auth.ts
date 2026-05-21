import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { cloudAuth, cloudClient, setCloudToken, getCloudToken, clearCloudAuth } from '@/utils/cloud-api'

export interface CloudUser {
  id: number
  username: string
  email: string
  phone: string
  nickname: string
  role: string
  status: string
  groups: { id: number; name: string }[]
  balances: { type: string; amount: number }[]
}

export interface CloudModel {
  id: number
  model_id: string
  name: string
  type: string
  provider_name: string
  provider_type: string
}

export interface CloudPermissions {
  allow_custom_provider: boolean
  allow_custom_embedding: boolean
  /** 自定义视频模型：开启后桌面端侧栏「视频模型」入口可见。默认 false，独立于 allow_custom_provider */
  allow_custom_video_provider: boolean
  allow_image_gen: boolean
  allow_knowledge_base: boolean
  max_context_messages: number
  // 「灵感大王」：开启后桌面端创作详情可将作品上传到灵感广场
  inspiration_uploader: boolean
  // v0.6.9+ AI 抠图（阿里 viapi）相关 3 个权限：
  // - allow_image_matting：是否允许使用云接口抠图，关闭后桌面端「AI 抠图」入口隐藏
  // - allow_custom_matting_provider：是否允许桌面端配置自己的阿里 AK/SK 直连，关闭后「抠图接口」tab 隐藏
  // - image_matting_quota_per_month：每月配额（张），0=不限；超出后云接口会拒绝
  allow_image_matting: boolean
  allow_custom_matting_provider: boolean
  image_matting_quota_per_month: number
  [key: string]: any
}

export interface CloudBalanceBreakdown {
  wallet: number
  plan: number
  total: number
}

export interface CloudPlanQuota {
  id: number
  user_plan_id: number
  plan_id: number
  plan_code: string
  plan_name: string
  balance_type: string
  granted: number
  consumed: number
  remaining: number
  expires_at: string | null
  status: string
}

export interface CloudUsageCounter {
  counter_key: string
  limit: number
  used: number
  remaining: number | null
  period: string
  reset_at: string
  allowed: boolean
  unlimited: boolean
}

export interface CloudQuotas {
  balances: Record<string, CloudBalanceBreakdown>
  plan_quotas: CloudPlanQuota[]
  usage_counters: Record<string, CloudUsageCounter>
  rate_limits: Record<string, { rpm: number; tpm: number; concurrency: number }>
  policies: Record<string, any>
}

export interface RegisterBonus {
  granted: boolean
  reason?: string
  token?: number
  credit?: number
  plan_id?: number | null
  user_plan_id?: number | null
}

export interface MyPlan {
  id: number
  plan_id: number
  plan_code: string
  plan_name: string
  description: string
  source: string
  activated_at: string | null
  expires_at: string | null
  quota_refill_cycle?: 'none' | 'monthly' | string
  last_quota_refilled_at?: string | null
  next_quota_refill_at?: string | null
  upgraded_from_user_plan_id?: number | null
  status: 'active' | 'expired' | 'revoked'
  token_granted: number
  credit_granted: number
  policies?: Record<string, any>
  rate_limit?: Record<string, any>
  quota_buckets?: CloudPlanQuota[]
  quota_summary?: Record<string, { granted: number; consumed: number; remaining: number }>
  models: { id: number; model_id: string; name: string; type: string }[]
}

export interface Announcement {
  id: number
  title: string
  /** HTML 富文本，桌面端用 v-html 渲染。来源为 admin 后台可控，无需白名单过滤 */
  content: string
  updated_at: string
}

export const useCloudAuthStore = defineStore('cloudAuth', () => {
  const user = ref<CloudUser | null>(null)
  const models = ref<CloudModel[]>([])
  const permissions = ref<CloudPermissions>({
    allow_custom_provider: false,
    allow_custom_embedding: true,
    allow_custom_video_provider: false,
    allow_image_gen: true,
    allow_knowledge_base: true,
    max_context_messages: 50,
    inspiration_uploader: false,
    allow_image_matting: true,
    allow_custom_matting_provider: false,
    image_matting_quota_per_month: 100,
  })
  const balances = ref<{ type: string; amount: number }[]>([])
  const quotas = ref<CloudQuotas | null>(null)
  const billingRules = ref<any[]>([])
  const plans = ref<MyPlan[]>([])
  // 云端当前启用的最新一条公告，未登录 / 未拉取 / 无公告时为 null
  const announcement = ref<Announcement | null>(null)
  const isLoggedIn = computed(() => !!user.value && !!getCloudToken())
  const loading = ref(false)
  const pendingBonus = ref<RegisterBonus | null>(null)

  function loadCachedUser() {
    const raw = localStorage.getItem('cloud_user')
    if (raw) {
      try { user.value = JSON.parse(raw) } catch { user.value = null }
    }
  }

  async function login(username: string, password: string) {
    loading.value = true
    try {
      const data = await cloudAuth.login(username, password)
      setCloudToken(data.token)
      user.value = data.user
      localStorage.setItem('cloud_user', JSON.stringify(data.user))
      await fetchCloudData()
      return data.user
    } finally {
      loading.value = false
    }
  }

  async function register(username: string, password: string, nickname?: string, phone?: string) {
    loading.value = true
    try {
      const data = await cloudAuth.register({ username, password, nickname, phone })
      setCloudToken(data.token)
      user.value = data.user
      localStorage.setItem('cloud_user', JSON.stringify(data.user))
      // Capture register bonus for UI to display on next page
      if (data.bonus) {
        pendingBonus.value = data.bonus as RegisterBonus
      }
      await fetchCloudData()
      return data.user
    } finally {
      loading.value = false
    }
  }

  function consumeBonus(): RegisterBonus | null {
    const b = pendingBonus.value
    pendingBonus.value = null
    return b
  }

  function logout() {
    clearCloudAuth()
    user.value = null
    models.value = []
    balances.value = []
    quotas.value = null
    plans.value = []
    announcement.value = null
    permissions.value = {
      allow_custom_provider: false,
      allow_custom_embedding: true,
      allow_custom_video_provider: false,
      allow_image_gen: true,
      allow_knowledge_base: true,
      max_context_messages: 50,
      inspiration_uploader: false,
      allow_image_matting: true,
      allow_custom_matting_provider: false,
      image_matting_quota_per_month: 100,
    }
    window.api?.cloud?.setPermissions({
      allow_custom_provider: false,
      allow_custom_embedding: true,
    })
    // 清空主进程缓存的云端 embedding 模型与偏好，避免状态泄漏
    window.api?.cloud?.setEmbeddingModels([])
    window.api?.cloud?.setPreferredEmbeddingModel('')
    // 清空主进程缓存的全量云端模型，避免登出后旧账号的 cloud_model_id 被复用
    window.api?.cloud?.setModels([])
  }

  async function fetchMe() {
    try {
      const data = await cloudAuth.me()
      user.value = data
      localStorage.setItem('cloud_user', JSON.stringify(data))
    } catch (e: any) {
      // AUTH_EXPIRED 同步兜底：cloud-api.ts 内部 refresh 失败时已派发事件让 main.ts 调 logout()；
      // 这里再调一次保证调用方 await fetchMe() 后能立即拿到一致的 store 状态（logout 幂等）。
      if (e.message === 'AUTH_EXPIRED') logout()
      throw e
    }
  }

  async function fetchCloudData() {
    try {
      const [modelsRes, permRes, balRes, quotaRes] = await Promise.all([
        cloudClient.myModels(),
        cloudClient.myPermissions(),
        cloudClient.myBalance(),
        cloudClient.myQuotas().catch(() => null),
      ])
      models.value = modelsRes.models || []
      quotas.value = quotaRes as CloudQuotas | null
      permissions.value = { ...permissions.value, ...(quotaRes?.policies || {}), ...(permRes.permissions || {}) }
      balances.value = balRes.balances || []
      try {
        const billRes = await cloudClient.myBillingRules()
        billingRules.value = billRes.billing_rules || []
      } catch { billingRules.value = [] }
      try {
        const planRes = await cloudClient.myPlans()
        plans.value = (planRes.plans || []) as MyPlan[]
      } catch { plans.value = [] }
      // 拉取当前公告：接口失败 / 无公告 / 字段缺失统一按 null 处理，避免 UI 出现半残状态
      try {
        const annRes = await cloudClient.currentAnnouncement()
        const a = annRes?.announcement
        announcement.value = a && typeof a === 'object' && a.id
          ? { id: Number(a.id), title: String(a.title || ''), content: String(a.content || ''), updated_at: String(a.updated_at || '') }
          : null
      } catch { announcement.value = null }
      // Sync permissions to main process for LLM routing guard
      window.api?.cloud?.setPermissions({
        allow_custom_provider: permissions.value.allow_custom_provider,
        allow_custom_embedding: permissions.value.allow_custom_embedding,
      })
      // 同步云端 embedding 模型清单到主进程，用于 vectorize 路由 + Settings UI 渲染
      const embeddingModels = (modelsRes.models || [])
        .filter((m: any) => m.type === 'embedding')
        .map((m: any) => ({ id: m.id, model_id: m.model_id, name: m.name }))
      window.api?.cloud?.setEmbeddingModels(embeddingModels)
      // 同步全量云端模型到主进程；main 在 callLLM / 生图 / 向量请求体里附 cloud_model_id 主键，
      // 让云控端按主键精确路由，避免多家服务商同 model_id 时 first() 错位扣费。
      const allModels = (modelsRes.models || []).map((m: any) => ({
        id: m.id,
        model_id: m.model_id,
        name: m.name,
        type: m.type,
        provider_name: m.provider_name,
        provider_type: m.provider_type,
      }))
      window.api?.cloud?.setModels(allModels)
      // 用户偏好的云端 embedding 模型（从 settings 读取，由 SettingsView 写入）
      try {
        const preferred = (await window.api.settings.invoke('get', 'cloud_embedding_model')) as string | undefined
        window.api?.cloud?.setPreferredEmbeddingModel(preferred || '')
      } catch {
        window.api?.cloud?.setPreferredEmbeddingModel('')
      }
    } catch (e: any) {
      console.error('[CloudAuth] fetchCloudData error:', e.message, e)
      // AUTH_EXPIRED 同步兜底，参见 fetchMe 注释
      if (e.message === 'AUTH_EXPIRED') logout()
    }
  }

  async function changePassword(oldPwd: string, newPwd: string) {
    await cloudAuth.changePassword(oldPwd, newPwd)
  }

  async function refreshToken() {
    try {
      const data = await cloudAuth.refresh()
      setCloudToken(data.token)
    } catch {
      logout()
    }
  }

  async function init() {
    loadCachedUser()
    const token = getCloudToken()
    if (token) {
      // Sync token to main process for cloud LLM routing
      window.api?.cloud?.setToken(token)
      try {
        await fetchMe()
        await fetchCloudData()
      } catch {
        // Token 失效或网络异常：cloud-api.ts 已自动尝试 refresh，失败时已通过事件 + 同步兜底完成 logout，
        // 此处不需要做额外处理，吞错避免污染启动流程。
      }
    }
  }

  return {
    user, models, permissions, balances, quotas, billingRules, plans, announcement,
    isLoggedIn, loading, pendingBonus,
    login, register, logout, fetchMe, fetchCloudData,
    changePassword, refreshToken, init, consumeBonus,
  }
})
