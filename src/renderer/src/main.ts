import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import { routes } from './router'
import { getCloudToken } from './utils/cloud-api'
import { useThemeStore } from './stores/theme'
import { useCloudAuthStore } from './stores/cloud-auth'
import './assets/main.css'

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

// Initialize stores after mount (pinia must be installed first)
useThemeStore()
useCloudAuthStore().init()
