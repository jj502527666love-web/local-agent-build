import { runSync, getSyncConfig } from './engine'
import { getCloudToken } from '../cloud-token'

// 自动同步调度：按频率定时跑；realtime 额外提供本地变更 debounce 触发。

let timer: NodeJS.Timeout | null = null
let debounceTimer: NodeJS.Timeout | null = null

const REALTIME_DEBOUNCE_MS = 30_000

function intervalMs(mode: string): number {
  switch (mode) {
    case 'realtime':
      return 120_000 // 兜底轮询（拉取他设备变更）；本地变更走 debounce 更快
    case 'hourly':
      return 60 * 60_000
    case 'daily':
      return 24 * 60 * 60_000
    default:
      return 0
  }
}

async function safeRun(): Promise<void> {
  if (!getCloudToken()) return
  try {
    await runSync()
  } catch {
    // runSync 内部已记录 last_error
  }
}

export function stopSyncScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

export function restartSyncScheduler(): void {
  stopSyncScheduler()
  const { mode } = getSyncConfig()
  const ms = intervalMs(mode)
  if (ms <= 0) return
  timer = setInterval(() => {
    void safeRun()
  }, ms)
}

/** 本地数据发生变更时调用：realtime 模式下做 30s 防抖后同步。 */
export function triggerDebounced(): void {
  const { mode } = getSyncConfig()
  if (mode !== 'realtime') return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    void safeRun()
  }, REALTIME_DEBOUNCE_MS)
}

/** 登录 / 账号就绪后跑一次（先 pull 后 push）。 */
export async function startupSync(): Promise<void> {
  const { mode } = getSyncConfig()
  if (mode === 'off') return
  await safeRun()
}
