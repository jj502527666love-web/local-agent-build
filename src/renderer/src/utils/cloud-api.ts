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

// === 单飞 token 自动刷新 ===
//
// 后端 (config/jwt.php)：JWT_TTL=24h、JWT_REFRESH_TTL=14d。
// 即 token 过期后 14 天内仍可凭旧 token 调 /auth/refresh 换发新 token，
// 所以业务请求遇到 401 'Token expired' 时应先尝试 refresh + 重试，对用户无感。
//
// 多个并发业务请求可能同时撞 401，必须单飞：只发一次 refresh，其余请求等结果。
// JWTAuth::refresh() 会把旧 token 加入 blacklist，旧 token 重复 refresh 会失败。
let refreshing: Promise<string | null> | null = null

async function refreshToken(): Promise<string | null> {
  if (refreshing) return refreshing

  refreshing = (async () => {
    const startToken = getCloudToken()
    if (!startToken) return null

    try {
      const res = await fetch(`${getCloudApiBase()}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${startToken}`,
        },
      })
      if (!res.ok) return null
      const data = await res.json().catch(() => null)
      if (!data?.token) return null
      // race guard：refresh 期间用户可能主动 logout（getCloudToken 变 null），
      // 不要把已清掉的 token 复活，否则 UI 显示已登出但其实又活了。
      if (getCloudToken() !== startToken) return null
      setCloudToken(data.token)
      return data.token
    } catch {
      return null
    }
  })()

  try {
    return await refreshing
  } finally {
    refreshing = null
  }
}

// 后端 JwtAuthMiddleware 的 401 错误标签（必须与 backend/app/Http/Middleware/JwtAuthMiddleware.php 同步）：
//   'Token expired'      ← JWT 已过期，仍在 refresh 窗口（可 refresh）
//   'Token not provided' ← 客户端没带 Authorization 头（也尝试 refresh：本地状态错乱时兜底）
//   'Token invalid'      ← 签名无效 / 已 blacklist（不可 refresh，直接登出）
//   'User not found'     ← 用户被删（不可 refresh，直接登出）
function isRefreshableErrorMessage(msg: string): boolean {
  return msg === 'Token expired' || msg === 'Token not provided'
}

// 不允许触发自动 refresh 的端点：
// 1. /auth/login、/auth/register 的 401 是业务错误（"用户名或密码错误"），不该触发登出
// 2. /auth/refresh 自身 401 不能再 refresh，否则无限循环
const NO_AUTO_REFRESH_PATHS = new Set(['/auth/login', '/auth/register', '/auth/refresh'])

// 派发全局 auth 失效事件，由 main.ts 统一监听 → store.logout() + router.replace('/login')
function dispatchAuthExpired(reason: string): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cloud-auth-expired', { detail: { reason } }))
  }
}

async function request(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
  attempt = 0,
): Promise<any> {
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

  // === 401 处理 ===
  if (res.status === 401) {
    let errMsg = ''
    try {
      const cloned = await res.clone().json()
      errMsg = cloned?.error || ''
    } catch {}

    const isAuthEndpoint = NO_AUTO_REFRESH_PATHS.has(path)

    // 业务端点 + 可 refresh 的标签 + 第一次尝试 → 走 refresh + retry
    if (!isAuthEndpoint && attempt === 0 && isRefreshableErrorMessage(errMsg)) {
      const newToken = await refreshToken()
      if (newToken) {
        // 重试一次（attempt=1 防止再次进入此分支造成循环）
        return request(method, path, body, options, 1)
      }
      // refresh 失败 fall through 到下面的"全局登出"分支
    }

    if (isAuthEndpoint) {
      // 登录/注册/refresh 的 401 是调用方该处理的业务错误，不触发全局事件
      throw new Error(errMsg || '认证失败')
    }

    // 业务端点 401：refresh 失败 / 不可 refresh / retry 仍失败
    // → 清状态 + 派发事件让 store + router 同步登出 + 跳转登录页
    clearCloudAuth()
    dispatchAuthExpired(errMsg || 'unknown')
    throw new Error('AUTH_EXPIRED')
  }

  let data: any
  try {
    data = await res.json()
  } catch {
    if (!res.ok) throw new Error(`服务器错误 (${res.status})`)
    throw new Error('服务器返回了无效的响应')
  }

  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export const cloudAuth = {
  login: (username: string, password: string) => request('POST', '/auth/login', { username, password }, { withDeviceId: true }),
  register: (data: { username: string; password: string; nickname?: string; phone?: string }) => request('POST', '/auth/register', data, { withDeviceId: true }),
  me: () => request('GET', '/auth/me'),
  changePassword: (old_password: string, new_password: string) => request('POST', '/auth/password', { old_password, new_password }),
  refresh: () => request('POST', '/auth/refresh'),
}

// 公开端点（无需登录）
export const cloudPublic = {
  siteConfig: () => request('GET', '/public/site-config'),
  // 灵感广场分类（桌面端上传时拉取，作为分类下拉数据源）
  listInspirationCategories: () => request('GET', '/public/inspiration/categories'),
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
