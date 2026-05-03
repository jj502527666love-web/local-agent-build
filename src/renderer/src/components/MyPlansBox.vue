<template>
  <div class="card p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-sm font-semibold text-text-primary">我的套餐</h3>
      <span class="text-[10px] text-text-tertiary">{{ activePlans.length }} 个生效</span>
    </div>

    <div v-if="!plans.length" class="text-xs text-text-tertiary py-4 text-center">
      暂无套餐
    </div>

    <ul v-else class="space-y-3">
      <li
        v-for="p in plans"
        :key="p.id"
        class="bg-surface-1 rounded-xl p-4 border border-surface-3"
      >
        <div class="flex items-start justify-between gap-3 mb-2">
          <div class="min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-sm font-semibold text-text-primary truncate">{{ p.plan_name }}</span>
              <span class="text-[10px] text-text-tertiary font-mono">{{ p.plan_code }}</span>
            </div>
            <p v-if="p.description" class="text-xs text-text-secondary line-clamp-2">{{ p.description }}</p>
          </div>
          <span :class="['text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap', statusClass(p.status)]">
            {{ statusLabel(p.status) }}
          </span>
        </div>

        <div class="grid grid-cols-2 gap-2 mt-3 text-[11px]">
          <div>
            <span class="text-text-tertiary">来源</span>
            <span class="text-text-primary ml-1">{{ sourceLabel(p.source) }}</span>
          </div>
          <div>
            <span class="text-text-tertiary">{{ p.expires_at ? '到期' : '有效期' }}</span>
            <span class="text-text-primary ml-1">{{ p.expires_at ? formatDate(p.expires_at) : '永久' }}</span>
          </div>
          <div v-if="p.token_granted > 0">
            <span class="text-text-tertiary">余额额度</span>
            <span class="text-text-primary ml-1">{{ formatAmount(p.token_granted) }}</span>
          </div>
          <div v-if="p.credit_granted > 0">
            <span class="text-text-tertiary">积分额度</span>
            <span class="text-text-primary ml-1">{{ formatAmount(p.credit_granted) }}</span>
          </div>
        </div>

        <div v-if="p.models?.length" class="mt-3">
          <div class="text-[10px] text-text-tertiary mb-1">包含模型</div>
          <div class="flex flex-wrap gap-1">
            <span
              v-for="m in p.models"
              :key="m.id"
              class="text-[10px] bg-surface-2 text-text-secondary px-2 py-0.5 rounded"
            >
              {{ m.name || m.model_id }}
            </span>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useCloudAuthStore } from '@/stores/cloud-auth'
import type { MyPlan } from '@/stores/cloud-auth'

const store = useCloudAuthStore()

const plans = computed<MyPlan[]>(() => store.plans || [])
const activePlans = computed(() => plans.value.filter(p => p.status === 'active'))

function statusClass(status: string): string {
  switch (status) {
    case 'active':  return 'bg-emerald-50 text-emerald-700'
    case 'expired': return 'bg-surface-2 text-text-tertiary'
    case 'revoked': return 'bg-red-50 text-red-500'
    default:        return 'bg-surface-2 text-text-tertiary'
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'active':  return '生效中'
    case 'expired': return '已过期'
    case 'revoked': return '已撤销'
    default:        return status
  }
}

function sourceLabel(src: string): string {
  switch (src) {
    case 'purchase': return '购买'
    case 'redeem':   return '兑换码'
    case 'admin':    return '后台发放'
    case 'register': return '注册赠送'
    default:         return src
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  } catch { return iso }
}

function formatAmount(value: number | string): string {
  const n = Number(value)
  if (Number.isNaN(n)) return '0'
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2)
}
</script>
