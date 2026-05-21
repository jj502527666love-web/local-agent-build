<template>
  <div class="h-screen w-screen flex items-center justify-center bg-surface-1">
    <div class="w-full max-w-sm bg-surface-0 rounded-2xl shadow-lg p-8">
      <div class="flex items-center gap-3 mb-8">
        <img
          v-if="appIconUrl"
          :src="appIconUrl"
          class="w-10 h-10 rounded-xl object-cover flex-shrink-0"
          alt=""
          draggable="false"
        />
        <div
          v-else
          class="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center flex-shrink-0"
        >
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
            :placeholder="isRegister ? '中文 / 英文 / 数字 / 下划线，6-16 位' : '请输入用户名'" />
        </div>

        <div v-if="isRegister">
          <label class="block text-xs font-medium text-text-secondary mb-1.5">昵称</label>
          <input v-model="form.nickname" type="text"
            class="w-full px-3 py-2.5 text-sm bg-surface-2 border border-surface-3 rounded-lg text-text-primary outline-none focus:border-primary-500 transition-colors"
            placeholder="中文 / 英文 / 数字 / 下划线，2-30 位（选填，不填默认用用户名）" />
        </div>

        <div v-if="isRegister">
          <label class="block text-xs font-medium text-text-secondary mb-1.5">手机号 <span class="text-text-tertiary">(选填)</span></label>
          <input v-model="form.phone" type="tel" autocomplete="tel"
            class="w-full px-3 py-2.5 text-sm bg-surface-2 border border-surface-3 rounded-lg text-text-primary outline-none focus:border-primary-500 transition-colors"
            placeholder="请输入手机号" />
        </div>

        <div>
          <label class="block text-xs font-medium text-text-secondary mb-1.5">密码</label>
          <input v-model="form.password" type="password" required autocomplete="current-password"
            class="w-full px-3 py-2.5 text-sm bg-surface-2 border border-surface-3 rounded-lg text-text-primary outline-none focus:border-primary-500 transition-colors"
            :placeholder="isRegister ? '至少 6 位' : '请输入密码'" />
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

        <div v-if="isRegister" class="flex items-start gap-1.5">
          <input
            id="agree-checkbox"
            type="checkbox"
            v-model="agreed"
            class="mt-0.5 w-3.5 h-3.5 rounded border-surface-3 accent-primary-600 cursor-pointer flex-shrink-0"
          />
          <label for="agree-checkbox" class="text-xs text-text-secondary leading-relaxed cursor-pointer">
            我已阅读并同意
            <button type="button" @click="openAgreement('register')" class="text-primary-600 hover:text-primary-700 transition-colors">《{{ siteConfig.agreements.register.title || '注册协议' }}》</button>
            和
            <button type="button" @click="openAgreement('privacy')" class="text-primary-600 hover:text-primary-700 transition-colors">《{{ siteConfig.agreements.privacy.title || '隐私协议' }}》</button>
          </label>
        </div>

        <div v-if="error" class="text-xs text-red-500 bg-red-50 dark:text-red-300 dark:bg-red-900/20 rounded-lg px-3 py-2">{{ error }}</div>

        <button type="submit" :disabled="submitting || (isRegister && !siteConfig.register.enabled)"
          class="w-full py-3 text-sm font-semibold bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-xl transition-colors">
          {{ submitting ? '\u8bf7\u7a0d\u5019...' : (isRegister ? '\u6ce8\u518c' : '\u767b\u5f55') }}
        </button>
      </form>

      <div class="mt-5 text-center">
        <button v-if="isRegister || siteConfig.register.enabled" @click="toggleMode" class="text-xs text-primary-600 hover:text-primary-700 transition-colors">
          {{ isRegister ? '已有账号？去登录' : '没有账号？去注册' }}
        </button>
        <p v-else class="text-xs text-text-tertiary">当前暂未开放注册，请联系管理员</p>
      </div>
    </div>

    <AgreementDialog
      :open="agreementDialog.open"
      :title="agreementDialog.title"
      :content-html="agreementDialog.content"
      @close="agreementDialog.open = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useCloudAuthStore } from '@/stores/cloud-auth'
import { useSiteConfigStore } from '@/stores/site-config'
import AgreementDialog from '@/components/AgreementDialog.vue'
import { appName, appAbbr, appIconUrl } from '@/utils/branding'

const router = useRouter()
const store = useCloudAuthStore()
const siteConfig = useSiteConfigStore()

const isRegister = ref(false)
const submitting = ref(false)
const error = ref('')
const form = ref({ username: '', password: '', confirmPassword: '', nickname: '', phone: '' })
const rememberUsername = ref(false)
const rememberPassword = ref(false)
// 注册页协议勾选：默认不勾选，提交前必须勾选。切换登录/注册时重置
const agreed = ref(false)
const agreementDialog = ref<{ open: boolean; title: string; content: string }>({
  open: false,
  title: '',
  content: '',
})

function openAgreement(type: 'register' | 'privacy') {
  const a = type === 'register' ? siteConfig.agreements.register : siteConfig.agreements.privacy
  agreementDialog.value = {
    open: true,
    title: a.title || (type === 'register' ? '注册协议' : '隐私协议'),
    content: a.content || '',
  }
}

function toggleMode() {
  if (!isRegister.value && !siteConfig.register.enabled) {
    error.value = '当前暂未开放注册，请联系管理员'
    return
  }
  isRegister.value = !isRegister.value
  // 切换时清理错误提示与协议勾选，避免状态残留
  error.value = ''
  agreed.value = false
}

// 与云控端 UserController/AuthController 保持一致：中/英/数/下划线
const NAME_REGEX = /^[a-zA-Z0-9_\u4e00-\u9fa5]+$/

onMounted(() => {
  void siteConfig.fetch()
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
  'The nickname has already been taken': '该昵称已被使用',
  'The email has already been taken': '该邮箱已被使用',
  'Failed to fetch': '网络请求失败，请检查网络连接',
}

function translateLoginError(msg: string): string {
  if (!msg) return '操作失败'
  for (const [key, val] of Object.entries(LOGIN_ERROR_MAP)) {
    if (msg.includes(key)) return val
  }
  return msg
}

function validateRegisterForm(): string | null {
  const username = form.value.username.trim()
  const nickname = form.value.nickname.trim()
  const phone = form.value.phone.trim()

  if (username.length < 6 || username.length > 16) return '用户名长度需 6-16 个字符'
  if (!NAME_REGEX.test(username)) return '用户名只能包含中文 / 英文 / 数字 / 下划线'

  if (nickname) {
    if (nickname.length < 2 || nickname.length > 30) return '昵称长度需 2-30 个字符'
    if (!NAME_REGEX.test(nickname)) return '昵称只能包含中文 / 英文 / 数字 / 下划线'
  }

  if (phone && phone.length > 20) return '手机号最多 20 位'

  if (form.value.password.length < 6) return '密码至少 6 位'
  if (form.value.password !== form.value.confirmPassword) return '两次密码不一致'
  if (!agreed.value) return '请勾选并阅读《' + (siteConfig.agreements.register.title || '注册协议') + '》和《' + (siteConfig.agreements.privacy.title || '隐私协议') + '》'
  return null
}

async function handleSubmit() {
  error.value = ''
  if (!form.value.username.trim() || !form.value.password.trim()) {
    error.value = '\u8bf7\u586b\u5199\u7528\u6237\u540d\u548c\u5bc6\u7801'
    return
  }
  if (isRegister.value) {
    if (!siteConfig.register.enabled) {
      error.value = '当前暂未开放注册，请联系管理员'
      return
    }
    const msg = validateRegisterForm()
    if (msg) {
      error.value = msg
      return
    }
  }

  submitting.value = true
  try {
    if (isRegister.value) {
      await store.register(
        form.value.username.trim(),
        form.value.password,
        form.value.nickname.trim() || undefined,
        form.value.phone.trim() || undefined,
      )
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
