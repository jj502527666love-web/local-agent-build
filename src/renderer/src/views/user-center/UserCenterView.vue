<template>
  <div class="h-full flex flex-col">
    <header class="page-header">
      <span class="text-xs text-text-tertiary">{{ store.user?.username }}</span>
    </header>
    <div class="page-body space-y-6 max-w-2xl">
      <!-- User Info -->
      <div class="card p-5">
        <h3 class="text-sm font-semibold text-text-primary mb-4">用户信息</h3>
        <div class="grid grid-cols-2 gap-4 text-xs">
          <div>
            <span class="text-text-tertiary block mb-1">ID</span>
            <span class="text-text-primary font-medium">{{ store.user?.id }}</span>
          </div>
          <div>
            <span class="text-text-tertiary block mb-1">用户名</span>
            <span class="text-text-primary font-medium">{{ store.user?.username }}</span>
          </div>
          <div>
            <span class="text-text-tertiary block mb-1">昵称</span>
            <span class="text-text-primary font-medium">{{ store.user?.nickname || '-' }}</span>
          </div>
          <div>
            <span class="text-text-tertiary block mb-1">邮箱</span>
            <span class="text-text-primary font-medium">{{ store.user?.email || '-' }}</span>
          </div>
        </div>
      </div>

      <!-- Plans store entry -->
      <div class="card p-5 flex items-center justify-between">
        <div class="min-w-0">
          <h3 class="text-sm font-semibold text-text-primary">套餐商城</h3>
          <p class="text-xs text-text-tertiary mt-1">浏览全部可购买套餐，扫码支付即时开通</p>
        </div>
        <button
          type="button"
          class="btn-primary text-xs whitespace-nowrap"
          @click="goPlansStore"
        >选购套餐</button>
      </div>

      <!-- My plans -->
      <div ref="myPlansRef">
        <MyPlansBox />
      </div>

      <!-- Redeem code -->
      <RedeemBox />

      <!-- Balance -->
      <div class="card p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-semibold text-text-primary">账户</h3>
          <button
            type="button"
            class="text-xs text-text-tertiary hover:text-text-primary"
            @click="balanceLogsOpen = true"
          >查看明细</button>
        </div>
        <div class="flex gap-4">
          <div v-for="b in store.balances" :key="b.type"
            class="flex-1 bg-surface-1 rounded-xl p-4 text-center">
            <div class="text-lg font-bold text-text-primary">{{ b.amount.toFixed(2) }}</div>
            <div class="text-[10px] text-text-tertiary mt-1">{{ balanceLabel(b.type) }}</div>
          </div>
          <div v-if="!store.balances.length" class="text-xs text-text-tertiary">-</div>
        </div>
        <!-- 最近到期预警：仅当最早到期的生效套餐 < 7 天时显示，避免年卡用户被频繁提醒。
             3-7 天琥珀，<3 天红色；点击滚动到「我的套餐」看详情。 -->
        <div
          v-if="nextExpiring"
          :class="['mt-3 flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors',
            nextExpiring.severity === 'danger'
              ? 'bg-red-50 hover:bg-red-100'
              : 'bg-amber-50 hover:bg-amber-100']"
          @click="scrollToPlans"
        >
          <span :class="['text-xs', nextExpiring.severity === 'danger' ? 'text-red-700' : 'text-amber-700']">
            最近到期
            <strong class="mx-1">{{ nextExpiring.plan_name }}</strong>
            <span class="font-mono">{{ nextExpiring.text }}</span>
          </span>
          <span :class="['text-xs', nextExpiring.severity === 'danger' ? 'text-red-600' : 'text-amber-600']">查看 →</span>
        </div>
        <!-- Billing Rules -->
        <div v-if="store.billingRules.length" class="mt-4 pt-4 border-t border-surface-3">
          <h4 class="text-xs font-medium text-text-secondary mb-2">计费标准</h4>
          <div class="space-y-1.5">
            <div v-for="r in store.billingRules" :key="r.cloud_model_id"
              class="flex items-center justify-between px-3 py-2 bg-surface-1 rounded-lg text-xs">
              <span class="text-text-primary font-medium">{{ r.model_name }}</span>
              <span v-if="r.billing_type === 'token'" class="text-text-secondary">
                {{ r.input_price }} / {{ r.output_price }} {{ siteConfig.labels.token }} / M tokens
              </span>
              <span v-else class="text-text-secondary">
                {{ r.credit_per_call }} {{ siteConfig.labels.credit }}/次
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Cloud Models -->
      <div class="card p-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-semibold text-text-primary">云端模型</h3>
          <span class="text-[10px] text-text-tertiary">{{ store.models.length }} 个模型</span>
        </div>
        <div v-if="store.models.length" class="space-y-1.5">
          <div v-for="m in store.models" :key="m.id"
            class="flex items-center justify-between px-3 py-2 bg-surface-1 rounded-lg">
            <div>
              <span class="text-xs font-medium text-text-primary">{{ m.name }}</span>
              <span class="text-[10px] text-text-tertiary ml-2">{{ m.model_id }}</span>
            </div>
            <span class="text-[10px] px-2 py-0.5 bg-surface-2 rounded text-text-secondary">{{ m.type }}</span>
          </div>
        </div>
        <div v-else class="text-xs text-text-tertiary">暂无分配模型</div>
      </div>

      <!-- Change Password -->
      <div class="card p-5">
        <h3 class="text-sm font-semibold text-text-primary mb-4">修改密码</h3>
        <form @submit.prevent="handleChangePassword" class="space-y-3 max-w-xs">
          <input v-model="pwdForm.oldPassword" type="password" placeholder="当前密码"
            class="w-full px-3 py-2 text-xs bg-surface-2 border border-surface-3 rounded-lg text-text-primary outline-none focus:border-primary-500" />
          <input v-model="pwdForm.newPassword" type="password" placeholder="新密码"
            class="w-full px-3 py-2 text-xs bg-surface-2 border border-surface-3 rounded-lg text-text-primary outline-none focus:border-primary-500" />
          <input v-model="pwdForm.confirmPassword" type="password" placeholder="确认新密码"
            class="w-full px-3 py-2 text-xs bg-surface-2 border border-surface-3 rounded-lg text-text-primary outline-none focus:border-primary-500" />
          <div v-if="pwdError" class="text-xs text-red-500">{{ pwdError }}</div>
          <div v-if="pwdSuccess" class="text-xs text-emerald-600">{{ pwdSuccess }}</div>
          <button type="submit" :disabled="pwdLoading"
            class="btn-primary text-xs">
            {{ pwdLoading ? '...' : '修改' }}
          </button>
        </form>
      </div>

      <!-- Logout -->
      <div class="pb-6">
        <button @click="handleLogout" class="btn-danger text-xs">退出登录</button>
      </div>
    </div>

    <!-- Balance logs dialog -->
    <BalanceLogsDialog v-model:visible="balanceLogsOpen" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCloudAuthStore } from '@/stores/cloud-auth'
import { useSiteConfigStore } from '@/stores/site-config'
import RedeemBox from '@/components/RedeemBox.vue'
import MyPlansBox from '@/components/MyPlansBox.vue'
import BalanceLogsDialog from '@/components/BalanceLogsDialog.vue'

const router = useRouter()
const store = useCloudAuthStore()
const siteConfig = useSiteConfigStore()

const pwdForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' })
const pwdError = ref('')
const pwdSuccess = ref('')
const pwdLoading = ref(false)
const balanceLogsOpen = ref(false)
const myPlansRef = ref<HTMLElement | null>(null)

/**
 * 计算「最近要过期」的生效套餐，仅当剩余 < 7 天时才返回预警信息：
 * - 过滤：status='active' 且 expires_at 非空（永久套餐不参与）
 * - 按 expires_at 升序取首个（最近过期的）
 * - 剩余 >= 7 天返回 null，避免年卡用户被不必要的提醒打扰
 * - 3-7 天：severity='warn'（3-7 天陈色 / 琥珀色）
 * - <3 天：severity='danger'（红色高优先）
 * 与 MyPlansBox 里 remainingClass 阈值保持一致。
 */
const nextExpiring = computed(() => {
  const candidates = (store.plans || [])
    .filter(p => p.status === 'active' && p.expires_at)
    .sort((a, b) => new Date(a.expires_at!).getTime() - new Date(b.expires_at!).getTime())
  if (!candidates.length) return null
  const p = candidates[0]
  const diff = new Date(p.expires_at!).getTime() - Date.now()
  if (diff <= 0) return null  // 已过期但后端还未跨上 status 为 expired，此处不预警避免误导
  const days = diff / 86400000
  if (days >= 7) return null

  let text: string
  const wholeDays = Math.floor(days)
  if (wholeDays >= 1) {
    text = `还剩 ${wholeDays} 天`
  } else {
    const hours = Math.floor(diff / 3600000)
    if (hours >= 1) text = `还剩 ${hours} 小时`
    else text = `还剩 ${Math.max(1, Math.floor(diff / 60000))} 分钟`
  }
  return {
    plan_name: p.plan_name,
    text,
    severity: days < 3 ? 'danger' as const : 'warn' as const,
  }
})

function scrollToPlans() {
  myPlansRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function handleChangePassword() {
  pwdError.value = ''
  pwdSuccess.value = ''
  if (pwdForm.value.newPassword !== pwdForm.value.confirmPassword) {
    pwdError.value = '两次密码不一致'
    return
  }
  if (pwdForm.value.newPassword.length < 6) {
    pwdError.value = '密码至少 6 位'
    return
  }
  pwdLoading.value = true
  try {
    await store.changePassword(pwdForm.value.oldPassword, pwdForm.value.newPassword)
    pwdSuccess.value = '密码修改成功'
    pwdForm.value = { oldPassword: '', newPassword: '', confirmPassword: '' }
  } catch (e: any) {
    pwdError.value = e.message || '操作失败'
  } finally {
    pwdLoading.value = false
  }
}

function handleLogout() {
  store.logout()
  router.replace('/login')
}

function goPlansStore() {
  router.push('/plans-store')
}

function balanceLabel(type: string): string {
  return siteConfig.labelOf(type?.toLowerCase())
}

onMounted(() => {
  store.fetchCloudData()
})
</script>
