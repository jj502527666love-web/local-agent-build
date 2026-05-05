<template>
  <div class="h-full flex flex-col">
    <header class="page-header">
      <button
        type="button"
        class="flex items-center gap-1 text-xs text-text-tertiary hover:text-text-primary"
        @click="goBack"
      >
        <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        返回用户中心
      </button>
    </header>

    <div class="page-body">
      <div class="max-w-5xl">
        <div class="mb-5">
          <h2 class="text-base font-semibold text-text-primary">套餐商城</h2>
          <p class="text-xs text-text-tertiary mt-1">选购合适的套餐解锁更多模型与额度</p>
        </div>

        <!-- Loading -->
        <div
          v-if="loading"
          class="flex items-center justify-center py-16 text-xs text-text-tertiary"
        >
          <svg class="w-5 h-5 animate-spin text-primary-600 mr-2" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
          </svg>
          正在加载套餐...
        </div>

        <!-- Error -->
        <div v-else-if="loadError" class="bg-red-50 text-red-600 rounded-lg px-4 py-3 text-xs">
          {{ loadError }}
          <button
            type="button"
            class="ml-2 underline"
            @click="loadPlans"
          >重试</button>
        </div>

        <!-- Empty -->
        <div
          v-else-if="!plans.length"
          class="text-center py-16 text-xs text-text-tertiary"
        >
          暂无可购买的套餐
        </div>

        <!-- Plans grid -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            v-for="p in plans"
            :key="p.id"
            class="card p-5 flex flex-col"
          >
            <div class="flex items-start justify-between gap-2 mb-2">
              <div class="min-w-0">
                <h3 class="text-sm font-semibold text-text-primary truncate">{{ p.name }}</h3>
                <p class="text-[10px] text-text-tertiary font-mono mt-0.5">{{ p.code }}</p>
              </div>
              <span
                v-if="p.duration_days === 0"
                class="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700"
              >永久</span>
              <span
                v-else
                class="text-[10px] px-2 py-0.5 rounded-full bg-primary-50 text-primary-700"
              >{{ p.duration_days }} 天</span>
            </div>

            <p
              v-if="p.description"
              class="text-xs text-text-secondary line-clamp-2 mb-3"
            >{{ p.description }}</p>

            <div class="flex items-baseline gap-1 mb-3">
              <span class="text-2xl font-bold text-primary-600">{{ formatPrice(p.price) }}</span>
              <span class="text-[10px] text-text-tertiary">{{ p.currency || 'CNY' }}</span>
            </div>

            <div class="grid grid-cols-2 gap-2 text-[11px] mb-3">
              <div v-if="p.token_quota > 0">
                <span class="text-text-tertiary">{{ siteConfig.labels.token }}额度</span>
                <span class="text-text-primary ml-1 font-medium">{{ formatNum(p.token_quota) }}</span>
              </div>
              <div v-if="p.credit_quota > 0">
                <span class="text-text-tertiary">{{ siteConfig.labels.credit }}额度</span>
                <span class="text-text-primary ml-1 font-medium">{{ formatNum(p.credit_quota) }}</span>
              </div>
              <div>
                <span class="text-text-tertiary">含模型</span>
                <span class="text-text-primary ml-1 font-medium">{{ p.models?.length || 0 }} 个</span>
              </div>
            </div>

            <div v-if="p.models?.length" class="mb-4">
              <div class="text-[10px] text-text-tertiary mb-1">包含模型</div>
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="m in p.models.slice(0, 6)"
                  :key="m.id"
                  class="text-[10px] bg-surface-2 text-text-secondary px-2 py-0.5 rounded"
                >{{ m.name || m.model_id }}</span>
                <span
                  v-if="p.models.length > 6"
                  class="text-[10px] text-text-tertiary"
                >+{{ p.models.length - 6 }}</span>
              </div>
            </div>

            <div class="flex-1"></div>

            <button
              type="button"
              class="btn-primary text-xs w-full"
              :disabled="!canPurchase(p)"
              @click="handleBuy(p)"
            >
              {{ purchaseLabel(p) }}
            </button>
          </div>
        </div>

        <p class="text-[11px] text-text-tertiary mt-6 text-center">
          支付完成后套餐将自动开通，可在用户中心「我的套餐」查看
        </p>
      </div>
    </div>

    <!-- Payment dialog -->
    <PaymentDialog
      v-model:visible="payOpen"
      :plan-id="selectedPlanId"
      @paid="onPaid"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { cloudClient } from '@/utils/cloud-api'
import { useSiteConfigStore } from '@/stores/site-config'
import PaymentDialog from '@/components/PaymentDialog.vue'

const siteConfig = useSiteConfigStore()

interface StoreModel {
  id: number
  model_id: string
  name: string
  type: string
}

interface StorePlan {
  id: number
  code: string
  name: string
  description: string
  price: string
  currency: string
  duration_days: number
  token_quota: number
  credit_quota: number
  sort: number
  models: StoreModel[]
}

const router = useRouter()

const plans = ref<StorePlan[]>([])
const loading = ref(false)
const loadError = ref('')

const payOpen = ref(false)
const selectedPlanId = ref<number | null>(null)

function goBack() {
  router.push('/user-center')
}

async function loadPlans() {
  loading.value = true
  loadError.value = ''
  try {
    const data = await cloudClient.listStorePlans()
    plans.value = (data.plans || []) as StorePlan[]
  } catch (e: any) {
    loadError.value = e?.message || '加载失败'
  }
  loading.value = false
}

function canPurchase(p: StorePlan): boolean {
  return Number(p.price) > 0
}

function purchaseLabel(p: StorePlan): string {
  if (Number(p.price) <= 0) return '不可在线购买'
  return '立即购买'
}

function handleBuy(p: StorePlan) {
  if (!canPurchase(p)) return
  selectedPlanId.value = p.id
  payOpen.value = true
}

function onPaid() {
  // PaymentDialog 内部已刷新 store；此处可补充提示或跳转
}

function formatPrice(v: string | number): string {
  const n = Number(v)
  if (Number.isNaN(n)) return '0.00'
  return n.toFixed(2)
}

function formatNum(v: number): string {
  if (!v) return '0'
  if (Number.isInteger(v)) return String(v)
  return Number(v).toFixed(2)
}

onMounted(() => {
  loadPlans()
})
</script>
