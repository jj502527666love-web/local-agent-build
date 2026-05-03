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
      <MyPlansBox />

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
        <!-- Billing Rules -->
        <div v-if="store.billingRules.length" class="mt-4 pt-4 border-t border-surface-3">
          <h4 class="text-xs font-medium text-text-secondary mb-2">计费标准</h4>
          <div class="space-y-1.5">
            <div v-for="r in store.billingRules" :key="r.cloud_model_id"
              class="flex items-center justify-between px-3 py-2 bg-surface-1 rounded-lg text-xs">
              <span class="text-text-primary font-medium">{{ r.model_name }}</span>
              <span v-if="r.billing_type === 'token'" class="text-text-secondary">
                {{ r.input_price }} / {{ r.output_price }} 余额/M
              </span>
              <span v-else class="text-text-secondary">
                {{ r.credit_per_call }} 积分/次
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
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useCloudAuthStore } from '@/stores/cloud-auth'
import RedeemBox from '@/components/RedeemBox.vue'
import MyPlansBox from '@/components/MyPlansBox.vue'
import BalanceLogsDialog from '@/components/BalanceLogsDialog.vue'

const router = useRouter()
const store = useCloudAuthStore()

const pwdForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' })
const pwdError = ref('')
const pwdSuccess = ref('')
const pwdLoading = ref(false)
const balanceLogsOpen = ref(false)

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
  const map: Record<string, string> = { token: '余额', credit: '积分' }
  return map[type?.toLowerCase()] || type
}

onMounted(() => {
  store.fetchCloudData()
})
</script>
