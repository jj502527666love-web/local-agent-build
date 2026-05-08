<template>
  <div class="h-screen w-screen flex items-center justify-center bg-surface-1">
    <div class="w-full max-w-sm bg-surface-0 rounded-2xl shadow-lg p-8">
      <div class="flex items-center gap-3 mb-8">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
          <span class="text-white text-sm font-bold">{{ appAbbr }}</span>
        </div>
        <div>
          <h1 class="text-base font-bold text-text-primary">{{ appName }}</h1>
          <p class="text-xs text-text-tertiary">{{ isRegister ? '\u6ce8\u518c\u8d26\u53f7' : '\u767b\u5f55\u8d26\u53f7' }}</p>
        </div>
      </div>

      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div>
          <label class="block text-xs font-medium text-text-secondary mb-1.5">用户名</label>
          <input v-model="form.username" type="text" required autocomplete="username"
            class="w-full px-3 py-2.5 text-sm bg-surface-2 border border-surface-3 rounded-lg text-text-primary outline-none focus:border-primary-500 transition-colors"
            placeholder="请输入用户名" />
        </div>

        <div v-if="isRegister">
          <label class="block text-xs font-medium text-text-secondary mb-1.5">昵称</label>
          <input v-model="form.nickname" type="text"
            class="w-full px-3 py-2.5 text-sm bg-surface-2 border border-surface-3 rounded-lg text-text-primary outline-none focus:border-primary-500 transition-colors"
            placeholder="请输入昵称" />
        </div>

        <div>
          <label class="block text-xs font-medium text-text-secondary mb-1.5">密码</label>
          <input v-model="form.password" type="password" required autocomplete="current-password"
            class="w-full px-3 py-2.5 text-sm bg-surface-2 border border-surface-3 rounded-lg text-text-primary outline-none focus:border-primary-500 transition-colors"
            placeholder="请输入密码" />
        </div>

        <div v-if="isRegister">
          <label class="block text-xs font-medium text-text-secondary mb-1.5">确认密码</label>
          <input v-model="form.confirmPassword" type="password" required
            class="w-full px-3 py-2.5 text-sm bg-surface-2 border border-surface-3 rounded-lg text-text-primary outline-none focus:border-primary-500 transition-colors"
            placeholder="再次输入密码" />
        </div>

        <div v-if="!isRegister" class="flex items-center gap-4">
          <label class="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
            <input type="checkbox" v-model="rememberUsername" class="w-3.5 h-3.5 rounded border-surface-3 accent-primary-600" />
            记住账号
          </label>
          <label class="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
            <input type="checkbox" v-model="rememberPassword" class="w-3.5 h-3.5 rounded border-surface-3 accent-primary-600" />
            记住密码
          </label>
        </div>

        <div v-if="error" class="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{{ error }}</div>

        <button type="submit" :disabled="submitting"
          class="w-full py-3 text-sm font-semibold bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-xl transition-colors">
          {{ submitting ? '\u8bf7\u7a0d\u5019...' : (isRegister ? '\u6ce8\u518c' : '\u767b\u5f55') }}
        </button>
      </form>

      <div class="mt-5 text-center">
        <button @click="isRegister = !isRegister" class="text-xs text-primary-600 hover:text-primary-700 transition-colors">
          {{ isRegister ? '\u5df2\u6709\u8d26\u53f7\uff1f\u53bb\u767b\u5f55' : '\u6ca1\u6709\u8d26\u53f7\uff1f\u53bb\u6ce8\u518c' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useCloudAuthStore } from '@/stores/cloud-auth'
import { appName, appAbbr } from '@/utils/branding'

const router = useRouter()
const store = useCloudAuthStore()

const isRegister = ref(false)
const submitting = ref(false)
const error = ref('')
const form = ref({ username: '', password: '', confirmPassword: '', nickname: '' })
const rememberUsername = ref(false)
const rememberPassword = ref(false)

onMounted(() => {
  const ru = localStorage.getItem('login_remember_username')
  const rp = localStorage.getItem('login_remember_password')
  if (ru === '1') {
    rememberUsername.value = true
    form.value.username = localStorage.getItem('login_saved_username') || ''
  }
  if (rp === '1') {
    rememberPassword.value = true
    form.value.password = localStorage.getItem('login_saved_password') || ''
  }
})

watch(rememberUsername, (v) => {
  localStorage.setItem('login_remember_username', v ? '1' : '0')
  if (!v) localStorage.removeItem('login_saved_username')
})
watch(rememberPassword, (v) => {
  localStorage.setItem('login_remember_password', v ? '1' : '0')
  if (!v) localStorage.removeItem('login_saved_password')
})

const LOGIN_ERROR_MAP: Record<string, string> = {
  'Invalid credentials': '用户名或密码错误',
  'Account disabled': '账号已被禁用，请联系管理员',
  'Old password incorrect': '原密码不正确',
  'AUTH_EXPIRED': '登录已过期，请重新登录',
  'The username has already been taken': '该用户名已被注册',
  'Failed to fetch': '网络请求失败，请检查网络连接',
}

function translateLoginError(msg: string): string {
  if (!msg) return '操作失败'
  for (const [key, val] of Object.entries(LOGIN_ERROR_MAP)) {
    if (msg.includes(key)) return val
  }
  return msg
}

async function handleSubmit() {
  error.value = ''
  if (!form.value.username.trim() || !form.value.password.trim()) {
    error.value = '\u8bf7\u586b\u5199\u7528\u6237\u540d\u548c\u5bc6\u7801'
    return
  }
  if (isRegister.value && form.value.password !== form.value.confirmPassword) {
    error.value = '\u4e24\u6b21\u5bc6\u7801\u4e0d\u4e00\u81f4'
    return
  }

  submitting.value = true
  try {
    if (isRegister.value) {
      await store.register(form.value.username, form.value.password, form.value.nickname || undefined)
    } else {
      await store.login(form.value.username, form.value.password)
    }
    if (rememberUsername.value) localStorage.setItem('login_saved_username', form.value.username)
    else localStorage.removeItem('login_saved_username')
    if (rememberPassword.value) localStorage.setItem('login_saved_password', form.value.password)
    else localStorage.removeItem('login_saved_password')
    router.replace('/chat')
  } catch (e: any) {
    error.value = translateLoginError(e.message || '操作失败')
  } finally {
    submitting.value = false
  }
}
</script>
