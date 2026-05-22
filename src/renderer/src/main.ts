import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import { routes } from './router'
import { getCloudToken, setCloudToken } from './utils/cloud-api'
import { useThemeStore } from './stores/theme'
import { useCloudAuthStore } from './stores/cloud-auth'
import { useSiteConfigStore } from './stores/site-config'
import './assets/main.css'

// 启动时根据 runtimeConfig.appName 设置 document.title（覆盖 index.html 默认 'LocalAgent'）
const _cfg = (window as unknown as { runtimeConfig?: { appName?: string } }).runtimeConfig
if (_cfg?.appName) document.title = _cfg.appName

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
