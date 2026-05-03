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
  allow_image_gen: boolean
  allow_knowledge_base: boolean
  max_context_messages: number
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
  status: 'active' | 'expired' | 'revoked'
  token_granted: number
  credit_granted: number
  models: { id: number; model_id: string; name: string; type: string }[]
}

export const useCloudAuthStore = defineStore('cloudAuth', () => {
  const user = ref<CloudUser | null>(null)
  const models = ref<CloudModel[]>([])
  const permissions = ref<CloudPermissions>({
    allow_custom_provider: false,
    allow_image_gen: true,
    allow_knowledge_base: true,
    max_context_messages: 50,
  })
  const balances = ref<{ type: string; amount: number }[]>([])
  const billingRules = ref<any[]>([])
  const plans = ref<MyPlan[]>([])
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

  async function register(username: string, password: string, nickname?: string) {
    loading.value = true
    try {
      const data = await cloudAuth.register({ username, password, nickname })
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
    plans.value = []
    permissions.value = { allow_custom_provider: false, allow_image_gen: true, allow_knowledge_base: true, max_context_messages: 50 }
    window.api?.cloud?.setPermissions({ allow_custom_provider: false })
  }

  async function fetchMe() {
    try {
      const data = await cloudAuth.me()
      user.value = data
      localStorage.setItem('cloud_user', JSON.stringify(data))
    } catch (e: any) {
      if (e.message === 'AUTH_EXPIRED') logout()
      throw e
    }
  }

  async function fetchCloudData() {
    try {
      const [modelsRes, permRes, balRes] = await Promise.all([
        cloudClient.myModels(),
        cloudClient.myPermissions(),
        cloudClient.myBalance(),
      ])
      models.value = modelsRes.models || []
      permissions.value = { ...permissions.value, ...(permRes.permissions || {}) }
      balances.value = balRes.balances || []
      try {
        const billRes = await cloudClient.myBillingRules()
        billingRules.value = billRes.billing_rules || []
      } catch { billingRules.value = [] }
      try {
        const planRes = await cloudClient.myPlans()
        plans.value = (planRes.plans || []) as MyPlan[]
      } catch { plans.value = [] }
      // Sync permissions to main process for LLM routing guard
      window.api?.cloud?.setPermissions({ allow_custom_provider: permissions.value.allow_custom_provider })
    } catch (e: any) {
      console.error('[CloudAuth] fetchCloudData error:', e.message, e)
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
        // Token expired
      }
    }
  }

  return {
    user, models, permissions, balances, billingRules, plans,
    isLoggedIn, loading, pendingBonus,
    login, register, logout, fetchMe, fetchCloudData,
    changePassword, refreshToken, init, consumeBonus,
  }
})
