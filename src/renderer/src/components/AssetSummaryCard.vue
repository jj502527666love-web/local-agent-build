<template>
  <div class="card p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-sm font-semibold text-text-primary">账户额度</h3>
      <button
        type="button"
        class="text-xs text-text-tertiary hover:text-text-primary"
        @click="$emit('openLogs')"
      >查看明细</button>
    </div>

    <div v-if="items.length" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div v-for="item in items" :key="item.type" class="rounded-xl bg-surface-1 border border-surface-3 p-4">
        <div class="flex items-center justify-between mb-3">
          <span class="text-xs font-medium text-text-primary">{{ item.label }}</span>
          <span class="text-[10px] text-text-tertiary">{{ item.type }}</span>
        </div>
        <div class="text-2xl font-bold text-text-primary font-mono">{{ formatAmount(item.total) }}</div>
        <div class="grid grid-cols-2 gap-2 mt-3 text-[11px]">
          <div class="rounded-lg bg-surface-0 px-2 py-1.5">
            <div class="text-text-tertiary">钱包</div>
            <div class="text-text-secondary font-mono">{{ formatAmount(item.wallet) }}</div>
          </div>
          <div class="rounded-lg bg-surface-0 px-2 py-1.5">
            <div class="text-text-tertiary">套餐</div>
            <div class="text-text-secondary font-mono">{{ formatAmount(item.plan) }}</div>
          </div>
        </div>
      </div>
    </div>
    <div v-else class="text-xs text-text-tertiary py-4 text-center">暂无额度数据</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useCloudAuthStore } from '@/stores/cloud-auth'
import { useSiteConfigStore } from '@/stores/site-config'

const emit = defineEmits<{
  (e: 'openLogs'): void
}>()
void emit

const store = useCloudAuthStore()
const siteConfig = useSiteConfigStore()

const items = computed(() => {
  const quotaBalances = store.quotas?.balances || {}
  if (Object.keys(quotaBalances).length) {
    return Object.entries(quotaBalances).map(([type, value]) => ({
      type,
      label: siteConfig.labelOf(type),
      wallet: Number(value.wallet || 0),
      plan: Number(value.plan || 0),
      total: Number(value.total || 0),
    }))
  }
  return (store.balances || []).map(b => ({
    type: b.type,
    label: siteConfig.labelOf(b.type),
    wallet: Number(b.amount || 0),
    plan: 0,
    total: Number(b.amount || 0),
  }))
})

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return '0'
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString()
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(2)
}
</script>
