// 通过 preload 暴露的 runtimeConfig 派生 API base（生产由 inject 注入，dev fallback 默认）
function getCloudApiBase(): string {
  const cfg = (window as unknown as { runtimeConfig?: { apiDomain?: string } }).runtimeConfig
  return cfg?.apiDomain ? `${cfg.apiDomain}/api` : 'https://agent-admin.o455.com/api'
}

let token: string | null = null
let deviceIdCache: string | null = null

export function setCloudToken(t: string | null) {
  token = t
  if (t) localStorage.setItem('cloud_token', t)
  else localStorage.removeItem('cloud_token')
  // Sync to main process for LLM cloud routing
  window.api?.cloud?.setToken(t)
}

export function getCloudToken(): string | null {
  if (!token) token = localStorage.getItem('cloud_token')
  return token
}

export function clearCloudAuth() {
  token = null
  localStorage.removeItem('cloud_token')
  localStorage.removeItem('cloud_user')
  window.api?.cloud?.setToken(null)
}

async function getDeviceId(): Promise<string> {
  if (deviceIdCache) return deviceIdCache
  try {
    const id = await window.api?.cloud?.getDeviceId?.()
    if (id) {
      deviceIdCache = id
      return id
    }
  } catch {}
  // Fallback: generate and persist to localStorage (rare case when preload unavailable)
  let fallback = localStorage.getItem('cloud_device_id')
  if (!fallback) {
    fallback = (crypto.randomUUID?.() || Math.random().toString(36).slice(2)).replace(/-/g, '')
    localStorage.setItem('cloud_device_id', fallback)
  }
  deviceIdCache = fallback
  return fallback
}

interface RequestOptions {
  withDeviceId?: boolean
}

async function request(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<any> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const t = getCloudToken()
  if (t) headers['Authorization'] = `Bearer ${t}`
  if (options.withDeviceId) {
    const deviceId = await getDeviceId()
    if (deviceId) headers['X-Device-Id'] = deviceId
  }

  let res: Response
  try {
    res = await fetch(`${getCloudApiBase()}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    })
  } catch (e: any) {
    throw new Error(e?.message?.includes('fetch') ? '网络请求失败，请检查网络连接' : (e?.message || '网络异常'))
  }

  let data: any
  try {
    data = await res.json()
  } catch {
    if (!res.ok) throw new Error(`服务器错误 (${res.status})`)
    throw new Error('服务器返回了无效的响应')
  }

  if (res.status === 401) {
    // Auth endpoints (login) return 401 with meaningful error; non-auth 401 means token expired
    if (data?.error) {
      throw new Error(data.error)
    }
    clearCloudAuth()
    throw new Error('登录已过期，请重新登录')
  }

  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export const cloudAuth = {
  login: (username: string, password: string) => request('POST', '/auth/login', { username, password }, { withDeviceId: true }),
  register: (data: { username: string; password: string; nickname?: string }) => request('POST', '/auth/register', data, { withDeviceId: true }),
  me: () => request('GET', '/auth/me'),
  changePassword: (old_password: string, new_password: string) => request('POST', '/auth/password', { old_password, new_password }),
  refresh: () => request('POST', '/auth/refresh'),
}

// 公开端点（无需登录）
export const cloudPublic = {
  siteConfig: () => request('GET', '/public/site-config'),
}

export const cloudClient = {
  myModels: () => request('GET', '/client/models'),
  myPermissions: () => request('GET', '/client/permissions'),
  myBalance: () => request('GET', '/client/balance'),
  myBalanceLogs: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return request('GET', `/client/balance-logs${qs}`)
  },
  myUsage: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return request('GET', `/client/usage${qs}`)
  },
  myBillingRules: () => request('GET', '/client/billing-rules'),
  myPlans: () => request('GET', '/client/my-plans'),
  redeem: (code: string) => request('POST', '/client/redeem', { code }),
  // 商城列表（所有 active 套餐）
  listStorePlans: () => request('GET', '/client/plans'),
  // 订单：创建 / 查询 / 取消（微信支付通道）
  createOrder: (planId: number) => request('POST', '/client/orders', { plan_id: planId }),
  getOrder: (orderNo: string) => request('GET', `/client/orders/${orderNo}`),
  cancelOrder: (orderNo: string) => request('POST', `/client/orders/${orderNo}/cancel`),
  // 订单：创建 / 同步（天阙聚合支付通道，无异步 notify 需主动轮询同步）
  createTianqueOrder: (planId: number) => request('POST', '/client/orders/tianque', { plan_id: planId }),
  syncTianqueOrder: (orderNo: string) => request('POST', `/client/orders/${orderNo}/tianque-sync`),
}
