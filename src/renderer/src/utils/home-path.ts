// 首页路径判定：默认「智能体」列表页（/bots 同时是桌面端首页门面）。
// 云控端「桌面端菜单配置」可把智能体菜单隐藏——此时首页回退对话页，
// 避免用户每次启动落在侧栏无入口的页面。
//
// 菜单配置由 MainLayout 每次启动异步拉取；而「/」的重定向发生在布局挂载之前，
// 同步拿不到本次配置，因此拉取成功后写入 localStorage 缓存，重定向上读上次缓存。
// 无缓存（首次启动）时按默认可见处理 → /bots（菜单配置为站点级，不随用户变化）。

const MENU_OVERRIDES_CACHE_KEY = 'desktop_menu_overrides_cache'

export interface MenuOverrideEntry {
  visible: boolean
  title: string
}

/** 首页路径：智能体菜单可见（或未配置）→ /bots；被云控端隐藏 → /chat */
export function getHomePath(): string {
  try {
    const raw = localStorage.getItem(MENU_OVERRIDES_CACHE_KEY)
    if (raw) {
      const overrides = JSON.parse(raw) as Record<string, MenuOverrideEntry> | null
      if (overrides && overrides['/bots'] && overrides['/bots'].visible === false) return '/chat'
    }
  } catch {
    // 缓存损坏按默认处理
  }
  return '/bots'
}

/** 缓存云控端菜单配置（供下次启动时首页重定向判断） */
export function cacheMenuOverrides(overrides: Record<string, MenuOverrideEntry>): void {
  try {
    localStorage.setItem(MENU_OVERRIDES_CACHE_KEY, JSON.stringify(overrides ?? {}))
  } catch {
    // 写缓存失败不影响功能
  }
}
