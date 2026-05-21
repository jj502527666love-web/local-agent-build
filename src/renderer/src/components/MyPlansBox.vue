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
            <span class="text-text-tertiary">{{ p.expires_at ? '剩余' : '有效期' }}</span>
            <span
              v-if="!p.expires_at"
              class="text-text-primary ml-1"
              :title="p.activated_at ? `开通于 ${formatDate(p.activated_at)}` : ''"
            >永久有效</span>
            <span
              v-else
              :class="['ml-1 font-medium', remainingClass(p.expires_at, p.status)]"
              :title="`到期：${formatDate(p.expires_at)}`"
            >{{ remainingText(p.expires_at, p.status) }}</span>
          </div>
          <div v-if="p.token_granted > 0">
            <span class="text-text-tertiary">{{ siteConfig.labels.token }}额度</span>
            <span class="text-text-primary ml-1">{{ formatAmount(p.token_granted) }}</span>
          </div>
          <div v-if="p.credit_granted > 0">
            <span class="text-text-tertiary">{{ siteConfig.labels.credit }}额度</span>
            <span class="text-text-primary ml-1">{{ formatAmount(p.credit_granted) }}</span>
          </div>
          <div>
            <span class="text-text-tertiary">续充</span>
            <span class="text-text-primary ml-1">{{ refillLabel(p.quota_refill_cycle) }}</span>
          </div>
          <div v-if="p.next_quota_refill_at">
            <span class="text-text-tertiary">下次续充</span>
            <span class="text-text-primary ml-1">{{ formatDate(p.next_quota_refill_at) }}</span>
          </div>
        </div>

        <div v-if="p.quota_summary" class="mt-3 space-y-2">
          <QuotaProgressBar
            v-for="item in quotaItems(p)"
            :key="item.type"
            :label="item.label"
            :used="item.consumed"
            :total="item.granted"
            :remaining="item.remaining"
          />
        </div>

        <div v-if="p.policies" class="mt-3">
          <PolicyBadgeList :policies="p.policies" :limit="6" />
        </div>

        <!-- 时长进度条：仅有限期 + 生效中套餐显示；已过期 / 已撤销 / 永久套餐隐藏 -->
        <div v-if="showProgress(p)" class="mt-3">
          <div class="h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div
              :class="['h-full transition-all duration-300', progressBarClass(p.expires_at!)]"
              :style="{ width: progressPercent(p.activated_at, p.expires_at!) + '%' }"
            ></div>
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
import { useSiteConfigStore } from '@/stores/site-config'
import QuotaProgressBar from '@/components/QuotaProgressBar.vue'
import PolicyBadgeList from '@/components/PolicyBadgeList.vue'
import type { MyPlan } from '@/stores/cloud-auth'

const store = useCloudAuthStore()
const siteConfig = useSiteConfigStore()

const plans = computed<MyPlan[]>(() => store.plans || [])
const activePlans = computed(() => plans.value.filter(p => p.status === 'active'))

function statusClass(status: string): string {
  switch (status) {
    case 'active':  return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
    case 'expired': return 'bg-surface-2 text-text-tertiary'
    case 'revoked': return 'bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-300'
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
    case 'upgrade':  return '升级'
    default:         return src
  }
}

function refillLabel(value?: string): string {
  return value === 'monthly' ? '月度续充' : '一次性'
}

function quotaItems(plan: MyPlan) {
  return Object.entries(plan.quota_summary || {})
    .filter(([, value]) => Number(value.granted || 0) > 0)
    .map(([type, value]) => ({
      type,
      label: `${siteConfig.labelOf(type)}使用`,
      granted: Number(value.granted || 0),
      consumed: Number(value.consumed || 0),
      remaining: Number(value.remaining || 0),
    }))
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

/**
 * 把到期 ISO 时间转成相对剩余时间（还剩 X 天 / 小时 / 分钟），过期返回"已过期"。
 * status 已是 expired/revoked 时直接返回对应文案，避免与时间计算错位。
 */
function remainingText(iso: string, status: string): string {
  if (status === 'expired') return '已过期'
  if (status === 'revoked') return '已撤销'
  const expires = new Date(iso).getTime()
  if (Number.isNaN(expires)) return '-'
  const diff = expires - Date.now()
  if (diff <= 0) return '已过期'
  const days = Math.floor(diff / 86400000)
  if (days >= 1) return `还剩 ${days} 天`
  const hours = Math.floor(diff / 3600000)
  if (hours >= 1) return `还剩 ${hours} 小时`
  const minutes = Math.max(1, Math.floor(diff / 60000))
  return `还剩 ${minutes} 分钟`
}

/**
 * 剩余时间文本配色：>7 天主色文，3-7 天琥珀，<3 天红色，已过期 / 已撤销 灰色。
 * 与「最近到期预警行」的阈值保持一致。
 */
function remainingClass(iso: string, status: string): string {
  if (status !== 'active') return 'text-text-tertiary'
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'text-text-tertiary'
  const days = diff / 86400000
  if (days >= 7) return 'text-text-primary'
  if (days >= 3) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-500 dark:text-red-400'
}

function showProgress(p: MyPlan): boolean {
  return p.status === 'active' && !!p.activated_at && !!p.expires_at
}

function progressPercent(activatedIso: string | null, expiresIso: string): number {
  if (!activatedIso) return 0
  const start = new Date(activatedIso).getTime()
  const end = new Date(expiresIso).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 100
  const now = Date.now()
  if (now <= start) return 0
  if (now >= end) return 100
  return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)))
}

function progressBarClass(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'bg-surface-3'
  const days = diff / 86400000
  if (days >= 7) return 'bg-emerald-500'
  if (days >= 3) return 'bg-amber-500'
  return 'bg-red-500'
}

function formatAmount(value: number | string): string {
  const n = Number(value)
  if (Number.isNaN(n)) return '0'
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(2)
}
</script>
