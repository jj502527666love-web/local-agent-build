<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div
        v-if="visible"
        class="fixed inset-0 z-[9600] flex items-center justify-center p-6"
        @click.self="close"
      >
        <div class="w-full max-w-xl bg-surface-0 rounded-2xl shadow-2xl flex flex-col max-h-[80vh]">
          <div class="flex items-center justify-between px-5 py-3 border-b border-surface-2">
            <h3 class="text-sm font-semibold text-text-primary">{{ siteConfig.labels.token }}明细</h3>
            <button @click="close" class="text-text-tertiary hover:text-text-primary">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="px-5 py-3 border-b border-surface-2 flex items-center gap-2">
            <select
              v-model="filterType"
              class="text-xs px-2 py-1.5 bg-surface-2 border border-surface-3 rounded-lg text-text-primary outline-none"
              @change="reload"
            >
              <option value="">全部类型</option>
              <option value="token">{{ siteConfig.labels.token }}</option>
              <option value="credit">{{ siteConfig.labels.credit }}</option>
            </select>
            <select
              v-model="filterChange"
              class="text-xs px-2 py-1.5 bg-surface-2 border border-surface-3 rounded-lg text-text-primary outline-none"
              @change="reload"
            >
              <option value="">全部变动</option>
              <option value="register_bonus">注册赠送</option>
              <option value="redeem">兑换码</option>
              <option value="plan_grant">套餐发放</option>
              <option value="usage">用量扣费</option>
              <option value="admin_adjust">管理员调整</option>
            </select>
            <button
              type="button"
              class="ml-auto text-xs text-text-tertiary hover:text-text-primary"
              :disabled="loading"
              @click="reload"
            >刷新</button>
          </div>

          <div class="flex-1 overflow-y-auto px-2 py-1">
            <div v-if="loading && !logs.length" class="text-xs text-text-tertiary py-8 text-center">加载中...</div>
            <div v-else-if="!logs.length" class="text-xs text-text-tertiary py-8 text-center">暂无明细</div>

            <ul v-else class="divide-y divide-surface-2">
              <li v-for="log in logs" :key="log.id" class="px-3 py-2.5 hover:bg-surface-1 rounded">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="text-[10px] px-1.5 py-0.5 rounded bg-surface-2 text-text-secondary">
                        {{ siteConfig.labelOf(log.balance_type) }}
                      </span>
                      <span class="text-[11px] text-text-secondary">{{ changeTypeLabel(log.change_type) }}</span>
                    </div>
                    <p v-if="log.remark" class="text-[10px] text-text-tertiary mt-1 truncate">{{ log.remark }}</p>
                    <p class="text-[10px] text-text-tertiary mt-0.5">{{ formatTime(log.created_at) }}</p>
                  </div>
                  <div class="text-right whitespace-nowrap">
                    <div :class="['text-sm font-semibold', Number(log.change_amount) >= 0 ? 'text-emerald-600' : 'text-red-500']">
                      {{ Number(log.change_amount) >= 0 ? '+' : '' }}{{ formatAmount(log.change_amount) }}
                    </div>
                    <div class="text-[10px] text-text-tertiary">余 {{ formatAmount(log.balance_after) }}</div>
                  </div>
                </div>
              </li>
            </ul>

            <div v-if="hasMore" class="px-3 py-3 text-center">
              <button
                type="button"
                class="text-xs text-primary-600 hover:text-primary-700"
                :disabled="loading"
                @click="loadMore"
              >{{ loading ? '加载中...' : '加载更多' }}</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { cloudClient } from '@/utils/cloud-api'
import { useSiteConfigStore } from '@/stores/site-config'

const siteConfig = useSiteConfigStore()

interface BalanceLog {
  id: number
  balance_type: string
  change_type: string
  change_amount: number | string
  balance_after: number | string
  remark: string
  created_at: string
}

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>()

const loading = ref(false)
const logs = ref<BalanceLog[]>([])
const filterType = ref('')
const filterChange = ref('')
const page = ref(1)
const lastPage = ref(1)

const hasMore = ref(false)

function close() {
  emit('update:visible', false)
}

async function fetch(reset: boolean) {
  loading.value = true
  try {
    const params: Record<string, string> = { page: String(reset ? 1 : page.value), per_page: '20' }
    if (filterType.value)   params.balance_type = filterType.value
    if (filterChange.value) params.change_type  = filterChange.value
    const res = await cloudClient.myBalanceLogs(params)
    const incoming = (res.data || []) as BalanceLog[]
    if (reset) {
      logs.value = incoming
      page.value = 1
    } else {
      logs.value = [...logs.value, ...incoming]
    }
    lastPage.value = res.last_page || 1
    hasMore.value = page.value < lastPage.value
  } catch {
    if (reset) logs.value = []
  } finally {
    loading.value = false
  }
}

function reload() {
  fetch(true)
}

function loadMore() {
  if (!hasMore.value || loading.value) return
  page.value++
  fetch(false)
}

function changeTypeLabel(t: string): string {
  switch (t) {
    case 'register_bonus': return '注册赠送'
    case 'redeem':         return '兑换码'
    case 'plan_grant':     return '套餐发放'
    case 'usage':          return '用量扣费'
    case 'admin_adjust':   return '管理员调整'
    default: return t
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    const y = d.getFullYear()
    const M = String(d.getMonth() + 1).padStart(2, '0')
    const D = String(d.getDate()).padStart(2, '0')
    const h = String(d.getHours()).padStart(2, '0')
    const m = String(d.getMinutes()).padStart(2, '0')
    return `${y}-${M}-${D} ${h}:${m}`
  } catch { return iso }
}

function formatAmount(value: number | string): string {
  const n = Number(value)
  if (Number.isNaN(n)) return '0'
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2)
}

watch(() => props.visible, (v) => {
  if (v) reload()
})
</script>

<style scoped>
.dialog-enter-active,
.dialog-leave-active { transition: opacity 0.2s ease; }
.dialog-enter-from,
.dialog-leave-to { opacity: 0; }
</style>
