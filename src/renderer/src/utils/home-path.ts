// 首页路径判定：默认「对话」空态工作台（/chat）。
// 云控端「桌面端菜单配置」可隐藏对话菜单——此时首页回退智能体列表 /bots；
// 若对话、智能体都被隐藏，仍落 /chat（对话页本身功能完整，仅侧栏无入口，
// 保证用户始终有一个可用的落地页）。
//
// 菜单配置由 MainLayout 每次启动异步拉取；而「/」的重定向发生在布局挂载之前，
// 同步拿不到本次配置，因此拉取成功后写入 localStorage 缓存，重定向上读上次缓存。
// 无缓存（首次启动）时按默认可见处理 → /chat（菜单配置为站点级，不随用户变化）。

const MENU_OVERRIDES_CACHE_KEY = 'desktop_menu_overrides_cache'

export interface MenuOverrideEntry {
  visible: boolean
  title: string
}

/** 首页路径：对话空态工作台（/chat）；云控端隐藏对话菜单且智能体可见时回退 /bots */
export function getHomePath(): string {
  try {
    const raw = localStorage.getItem(MENU_OVERRIDES_CACHE_KEY)
    if (raw) {
      const overrides = JSON.parse(raw) as Record<string, MenuOverrideEntry> | null
      if (overrides && overrides['/chat'] && overrides['/chat'].visible === false) {
        if (overrides['/bots'] && overrides['/bots'].visible === false) return '/chat'
        return '/bots'
      }
    }
  } catch {
    // 缓存损坏按默认处理
  }
  return '/chat'
}

/** 缓存云控端菜单配置（供下次启动时首页重定向判断） */
export function cacheMenuOverrides(overrides: Record<string, MenuOverrideEntry>): void {
  try {
    localStorage.setItem(MENU_OVERRIDES_CACHE_KEY, JSON.stringify(overrides ?? {}))
  } catch {
    // 写缓存失败不影响功能
  }
}
