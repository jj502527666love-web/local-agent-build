import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import { routes } from './router'
import { getCloudToken, setCloudToken } from './utils/cloud-api'
import { useThemeStore } from './stores/theme'
import { useCloudAuthStore } from './stores/cloud-auth'
import { useSiteConfigStore } from './stores/site-config'
import { useLowBalanceStore } from './stores/low-balance'
import { applyPrimaryColor, DEFAULT_PRIMARY } from './utils/theme-color'
import './assets/main.css'

// 用主进程原生对话框替换浏览器 alert/confirm：规避 Electron(Windows) 弹窗关闭后输入框
// 失焦无法输入的已知 bug；nativeDialog 走 sendSync 同步桥接，保留原生同步返回值，
// 因此所有现有 alert()/confirm() 调用点无需改动即可全局生效。
const nativeDialog = window.api?.nativeDialog
if (nativeDialog) {
  window.alert = (message?: any): void => {
    nativeDialog.alert(message)
  }
  window.confirm = (message?: string): boolean => nativeDialog.confirm(message)
}

// 启动时根据 runtimeConfig.appName 设置 document.title（覆盖 index.html 默认 'LocalAgent'）
const _cfg = (window as unknown as { runtimeConfig?: { appName?: string } }).runtimeConfig
if (_cfg?.appName) document.title = _cfg.appName

// 启动即注入缓存的主题主色，避免首屏用内置橙再跳变为云控端配置色；
// site-config 拉到最新主色后会再调一次 applyPrimaryColor 即时换肤。
try {
  const _theme = JSON.parse(localStorage.getItem('site_config_theme') || '{}')
  applyPrimaryColor(_theme?.primary_color || DEFAULT_PRIMARY)
} catch {
  applyPrimaryColor(DEFAULT_PRIMARY)
}

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

const pinia = createPinia()
const app = createApp(App)

app.use(router)
app.use(pinia)

// Auth guard: redirect to login if not authenticated
router.beforeEach((to, _from, next) => {
  const token = getCloudToken()
  if (to.matched.some(r => r.meta.requiresAuth) && !token) {
    next('/login')
  } else if (to.meta.guest && token) {
    next('/chat')
  } else {
    next()
  }
})

app.mount('#app')

// === 云端 auth 失效事件统一处理 ===
// 由 cloud-api.ts 在业务请求 401 且 refresh 失败时派发。
// 必须在 useCloudAuthStore().init() 之前注册：init 内会调 fetchMe / fetchCloudData，
// token 失效时它们会立即派发事件，监听器需提前就位才能捕获。
// 注意：cloud-api.ts 的 request() 内已经先 clearCloudAuth() 再 dispatchAuthExpired()，
// 这里 store.logout() 是在已清空 localStorage 的基础上同步 store 内存状态（user/models/permissions/...）。
window.addEventListener('cloud-auth-expired', (event) => {
  const reason = (event as CustomEvent<{ reason?: string }>)?.detail?.reason || ''
  console.warn('[CloudAuth] auth expired:', reason)
  useCloudAuthStore().logout()
  // 用户停留在需 auth 的页面时，beforeEach 不会触发；这里主动跳转登录页。
  const cur = router.currentRoute.value
  if (cur.matched.some((r) => r.meta?.requiresAuth)) {
    router.replace({ path: '/login', query: { reason: 'expired' } })
  }
})

// === 云端「余额不足」事件统一处理 ===
// 由 cloud-api.ts 在业务请求命中 402 时派发。打开全局 store，
// 由 MainLayout 常驻的 LowBalanceModal 统一展示充值引导。
window.addEventListener('cloud-low-balance', (event) => {
  const detail = (event as CustomEvent<{ balanceType?: string; required?: number; available?: number }>)?.detail
  useLowBalanceStore().open(detail)
})

window.api?.cloud?.onTokenUpdated?.(({ token }) => {
  if (token) {
    setCloudToken(token)
    useCloudAuthStore().syncTokenState()
  }
})

window.api?.cloud?.onAuthExpired?.(({ reason }) => {
  window.dispatchEvent(new CustomEvent('cloud-auth-expired', { detail: { reason: reason || 'main-process' } }))
})

// Initialize stores after mount (pinia must be installed first)
useThemeStore()
useCloudAuthStore().init()
// 拉取公开站点配置（货币文案等），无需登录，启动时调一次
useSiteConfigStore().init()
