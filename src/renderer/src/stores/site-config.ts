import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { cloudPublic } from '@/utils/cloud-api'

/**
 * 站点公开配置 store。无需登录，App 启动时拉取一次。
 *
 * 业务上：
 * - balance_type='token'  -> 现金钱包，默认显示"金币"
 * - balance_type='credit' -> 积分钱包，默认显示"积分"
 *
 * 管理员可在云控后台「设置 → 界面文案」自定义这两个标签。
 */
export interface CurrencyLabels {
  token: string
  credit: string
}

const DEFAULT_LABELS: CurrencyLabels = { token: '金币', credit: '积分' }

const STORAGE_KEY = 'site_config_currency'

function readCache(): CurrencyLabels {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_LABELS }
    const parsed = JSON.parse(raw)
    return {
      token: typeof parsed?.token === 'string' && parsed.token ? parsed.token : DEFAULT_LABELS.token,
      credit: typeof parsed?.credit === 'string' && parsed.credit ? parsed.credit : DEFAULT_LABELS.credit,
    }
  } catch {
    return { ...DEFAULT_LABELS }
  }
}

function writeCache(labels: CurrencyLabels) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(labels))
  } catch {
    // localStorage 不可用时静默失败
  }
}

export const useSiteConfigStore = defineStore('siteConfig', () => {
  // 启动时先用 localStorage 缓存，避免首屏闪烁默认文案
  const labels = ref<CurrencyLabels>(readCache())
  const loading = ref(false)
  const lastFetchedAt = ref<number | null>(null)

  /**
   * 根据 balance_type / billing_type 取对应文案。
   * 'credit' -> labels.credit，其他（含 'token'、空、未知值）-> labels.token
   */
  const labelOf = computed(() => (type: string | null | undefined): string => {
    return type === 'credit' ? labels.value.credit : labels.value.token
  })

  async function fetch(): Promise<void> {
    loading.value = true
    try {
      const data = await cloudPublic.siteConfig()
      const next: CurrencyLabels = {
        token: data?.currency?.token || DEFAULT_LABELS.token,
        credit: data?.currency?.credit || DEFAULT_LABELS.credit,
      }
      labels.value = next
      writeCache(next)
      lastFetchedAt.value = Date.now()
    } catch {
      // 拉取失败保持当前值（缓存或默认）
    } finally {
      loading.value = false
    }
  }

  /**
   * App 启动时调用。已有缓存就立即可用，同时后台异步刷新最新值。
   */
  function init(): void {
    fetch()
  }

  return { labels, loading, lastFetchedAt, labelOf, fetch, init }
})
