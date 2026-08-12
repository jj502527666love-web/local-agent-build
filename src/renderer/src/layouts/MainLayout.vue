<template>
  <div class="flex h-screen w-screen overflow-hidden bg-surface-1">
    <aside class="w-44 flex-shrink-0 bg-surface-0 border-r border-surface-3 flex flex-col">
      <div class="h-14 flex items-center px-5" :class="{ 'app-drag': isWin }">
        <div class="flex items-center gap-2.5">
          <img
            v-if="appIconUrl"
            :src="appIconUrl"
            class="w-8 h-8 rounded-lg object-cover flex-shrink-0"
            alt=""
            draggable="false"
          />
          <div
            v-else
            class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center"
          >
            <span class="text-white text-[11px] font-bold leading-none tracking-tight">{{ appAbbr }}</span>
          </div>
          <span class="text-sm font-bold text-text-primary tracking-tight">{{ appName }}</span>
        </div>
      </div>
      <nav class="flex-1 px-3 py-1 overflow-y-auto space-y-0.5">
        <template v-for="item in navItems" :key="item.key || item.path">
          <!-- 自定义外部链接菜单：无路由，点击按 open_mode 走系统浏览器 / 应用内窗口 -->
          <a
            v-if="!item.children && item.custom && item.custom.target_type === 'external'"
            class="nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:bg-surface-2 transition-all duration-150 cursor-pointer"
            :title="item.custom.target"
            @click="onCustomItemClick(item.custom)"
          >
            <component :is="item.icon" class="w-[18px] h-[18px] flex-shrink-0" />
            <span class="font-medium">{{ item.label }}</span>
          </a>
          <!-- 自定义内部页面菜单：router-link 但 active 手动判定（默认 active-class 不按 query 区分，
               /models?tab=video 这类目标会与内置同 path 菜单双高亮） -->
          <router-link
            v-else-if="!item.children && item.custom"
            :to="item.custom.target"
            :class="['nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:bg-surface-2 transition-all duration-150', isCustomInternalActive(item.custom) ? 'nav-active' : '']"
          >
            <component :is="item.icon" class="w-[18px] h-[18px] flex-shrink-0" />
            <span class="font-medium">{{ item.label }}</span>
          </router-link>
          <router-link
            v-else-if="!item.children"
            :to="item.path"
            class="nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:bg-surface-2 transition-all duration-150"
            active-class="nav-active"
          >
            <component :is="item.icon" class="w-[18px] h-[18px] flex-shrink-0" />
            <span class="font-medium">{{ item.label }}</span>
          </router-link>
          <div v-else>
            <button
              class="nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:bg-surface-2 transition-all duration-150 w-full text-left"
              :class="{ 'nav-active': isGroupActive(item) }"
              @click="toggleGroup(item.key)"
            >
              <component :is="item.icon" class="w-[18px] h-[18px] flex-shrink-0" />
              <span class="font-medium flex-1">{{ item.label }}</span>
              <IconChevron class="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200" :class="{ 'rotate-90': expandedGroups.has(item.key) }" />
            </button>
            <div v-show="expandedGroups.has(item.key)" class="mt-0.5 space-y-0.5">
              <template v-for="child in item.children" :key="child.key || child.path">
                <a
                  v-if="child.custom && child.custom.target_type === 'external'"
                  class="nav-item flex items-center gap-3 pl-9 pr-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-2 transition-all duration-150 cursor-pointer"
                  :title="child.custom.target"
                  @click="onCustomItemClick(child.custom)"
                >
                  <component :is="child.icon" class="w-[16px] h-[16px] flex-shrink-0" />
                  <span class="font-medium">{{ child.label }}</span>
                </a>
                <router-link
                  v-else-if="child.custom"
                  :to="child.custom.target"
                  :class="['nav-item flex items-center gap-3 pl-9 pr-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-2 transition-all duration-150', isCustomInternalActive(child.custom) ? 'nav-active' : '']"
                >
                  <component :is="child.icon" class="w-[16px] h-[16px] flex-shrink-0" />
                  <span class="font-medium">{{ child.label }}</span>
                </router-link>
                <router-link
                  v-else
                  :to="child.path"
                  class="nav-item flex items-center gap-3 pl-9 pr-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-2 transition-all duration-150"
                  active-class="nav-active"
                >
                  <component :is="child.icon" class="w-[16px] h-[16px] flex-shrink-0" />
                  <span class="font-medium">{{ child.label }}</span>
                </router-link>
              </template>
            </div>
          </div>
        </template>
      </nav>
      <div class="px-3 py-3 border-t border-surface-3 space-y-0.5">
        <router-link
          to="/user-center"
          class="nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:bg-surface-2 transition-all duration-150"
          active-class="nav-active"
        >
          <IconUser class="w-[18px] h-[18px] flex-shrink-0" />
          <span class="font-medium">{{ cloudAuth.user?.nickname || cloudAuth.user?.username || '\u7528\u6237' }}</span>
        </router-link>
        <router-link
          to="/settings"
          class="nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:bg-surface-2 transition-all duration-150"
          active-class="nav-active"
        >
          <IconSettings class="w-[18px] h-[18px] flex-shrink-0" />
          <span class="font-medium">设置</span>
        </router-link>
        <SidebarBalanceBadge v-if="cloudAuth.isLoggedIn" class="mt-2" />
      </div>
    </aside>
    <main class="flex-1 overflow-hidden flex flex-col relative">
      <header class="h-9 flex-shrink-0 flex items-center px-5 bg-surface-0 gap-3" :class="[isWin ? 'pr-40 app-drag' : '']">
        <h1 class="text-sm font-semibold text-text-primary flex-shrink-0">{{ pageTitle }}</h1>
        <!-- 全局公告条：登录后自动显示当前启用的最新一条；点击展开全文弹窗。
             放在 pageTitle 右侧 + 画布徽标左侧，画布运行时仍可点击（徽标 ml-auto 抢占右侧）。
             根元素是 button，main.css 的 `.app-drag button` 规则会自动 no-drag，无需额外 class -->
        <AnnouncementBar />
        <ExpiryGlobalBanner />
        <!-- 全局画布任务徽标：anyRunning 时显示，跨页面可见，让用户知道任务仍在后台执行 -->
        <div
          v-if="canvasAnyRunning && !isCanvasRoute"
          class="ml-auto flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-700/40 dark:text-amber-300"
        >
          <span class="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
          <button
            type="button"
            class="text-[11px] font-medium hover:underline"
            @click="goToRunningCanvas"
            :title="canvasRunningProjectIds.length ? '回到正在运行的画布' : '画布有节点在生成'"
          >画布生成中{{ canvasActiveCount > 0 ? ` (${canvasActiveCount})` : '' }}</button>
          <button
            v-if="canvasWorkflowRunning"
            type="button"
            class="text-[11px] px-1.5 py-0.5 rounded border border-amber-300 hover:bg-amber-100 dark:border-amber-700/60 dark:hover:bg-amber-900/30"
            @click="onCancelCanvas"
            title="停止画布工作流（已开始的节点会跑完）"
          >停止</button>
        </div>
      </header>
      <div class="absolute top-9 left-0 right-0 h-px bg-surface-3 z-10"></div>
      <div class="flex-1 overflow-hidden flex flex-col">
        <router-view />
      </div>
    </main>

    <!-- 全局余额不足弹窗：任意云端调用命中 402 时统一展示充值引导 -->
    <LowBalanceModal
      v-model:visible="lowBalance.visible"
      :balance-type="lowBalance.balanceType"
      :required="lowBalance.required"
      :available="lowBalance.available"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watchEffect } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useWorkflowEngine } from '@/views/canvas/composables/useWorkflowEngine'
import LowBalanceModal from '@/components/LowBalanceModal.vue'
import { useLowBalanceStore } from '@/stores/low-balance'
import IconChat from '@/components/icons/IconChat.vue'
// import IconDeck from '@/components/icons/IconDeck.vue' // AI PPT 暂时下线
import IconBot from '@/components/icons/IconBot.vue'
import IconKnowledge from '@/components/icons/IconKnowledge.vue'
import IconModel from '@/components/icons/IconModel.vue'
import IconPersona from '@/components/icons/IconPersona.vue'
import IconSkill from '@/components/icons/IconSkill.vue'
import IconTool from '@/components/icons/IconTool.vue'
import IconMcp from '@/components/icons/IconMcp.vue'
import IconSettings from '@/components/icons/IconSettings.vue'
import IconChevron from '@/components/icons/IconChevron.vue'
import IconExtension from '@/components/icons/IconExtension.vue'
import IconImageGen from '@/components/icons/IconImageGen.vue'
import IconInspiration from '@/components/icons/IconInspiration.vue'
import IconCreation from '@/components/icons/IconCreation.vue'
import IconBatchGen from '@/components/icons/IconBatchGen.vue'
import IconImage2Prompt from '@/components/icons/IconImage2Prompt.vue'
import IconImageMatting from '@/components/icons/IconImageMatting.vue'
import IconFineMatting from '@/components/icons/IconFineMatting.vue'
import IconPrompt from '@/components/icons/IconPrompt.vue'
import IconCanvas from '@/components/icons/IconCanvas.vue'
import IconGallery from '@/components/icons/IconGallery.vue'
import IconUser from '@/components/icons/IconUser.vue'
import IconAICreation from '@/components/icons/IconAICreation.vue'
import IconVideoGen from '@/components/icons/IconVideoGen.vue'
import IconVideoCreation from '@/components/icons/IconVideoCreation.vue'
import IconCanvasSquare from '@/components/icons/IconCanvasSquare.vue'
import IconImageToolkit from '@/components/icons/IconImageToolkit.vue'
import IconEweiShop from '@/components/icons/IconEweiShop.vue'
import IconClawbot from '@/components/icons/IconClawbot.vue'
import IconCustomLink from '@/components/icons/IconCustomLink.vue'
import IconCustomPage from '@/components/icons/IconCustomPage.vue'
import IconCustomApp from '@/components/icons/IconCustomApp.vue'
import IconCustomStar from '@/components/icons/IconCustomStar.vue'
import AnnouncementBar from '@/components/AnnouncementBar.vue'
import ExpiryGlobalBanner from '@/components/ExpiryGlobalBanner.vue'
import SidebarBalanceBadge from '@/components/SidebarBalanceBadge.vue'
import { useCloudAuthStore } from '@/stores/cloud-auth'
import { useSiteConfigStore } from '@/stores/site-config'
import { useClawbotStore } from '@/stores/clawbot'
import { cloudClient } from '@/utils/cloud-api'
import { appName, appAbbr, appIconUrl } from '@/utils/branding'
import { cacheMenuOverrides } from '@/utils/home-path'

const route = useRoute()
const router = useRouter()
const cloudAuth = useCloudAuthStore()
const siteConfig = useSiteConfigStore()
const lowBalance = useLowBalanceStore()
const pageTitle = computed(() => (route.meta?.title as string) || '')

// 画布任务全局徽标：useWorkflowEngine 是 module-level singleton，
// MainLayout 内 mount 时取到的就是任何位置（节点 / CanvasEditorView）共享的状态。
const {
  anyRunningGlobal: canvasAnyRunning,
  workflowRunningGlobal: canvasWorkflowRunning,
  activeSingleRunCount: canvasActiveSingleRunCount,
  runningProjectIds: canvasRunningProjectIds,
  cancelAllWorkflows: cancelCanvasWorkflow
} = useWorkflowEngine()

const canvasActiveCount = computed(() => {
  // workflow 模式下统计所有节点过于复杂，简化为：workflow 模式不显示数字、单节点模式显示数量
  if (canvasWorkflowRunning.value) return 0
  return canvasActiveSingleRunCount.value
})

const isCanvasRoute = computed(() => route.path.startsWith('/canvas'))

function goToRunningCanvas() {
  const pid = canvasRunningProjectIds.value[0]
  if (pid) {
    router.push(`/canvas/${pid}`)
  } else {
    router.push('/canvas')
  }
}

function onCancelCanvas() {
  cancelCanvasWorkflow()
}

// 平台判断：Win 用自定义无边框 + titleBarOverlay（需 app-drag + 右侧 padding 让位控件按钮），
// Mac/Linux 用原生标题栏（renderer 区域不被标题栏占据，无需 app-drag 与额外 padding）。
const isWin = ((window as any).electron?.process?.platform || (window as any).runtimeConfig?.platform || '') === 'win32'

const allNavItems = [
  // 智能体排第一：/bots 同时是启动首页（router 的 / 重定向到 getHomePath()）
  { path: '/bots', label: '智能体', icon: IconBot },
  { path: '/chat', label: '对话', icon: IconChat },
  { path: '/knowledge', label: '知识库', icon: IconKnowledge },
  // 微信 ClawBot：本地功能（扫码绑定微信，消息桥接进对话），不走云端权限门控
  { path: '/clawbot', label: '微信 ClawBot', icon: IconClawbot },
  // v0.6.9+「模型服务」并入了「视频模型」+「抠图接口」tab，因此可见性改成
  // OR 关系：自定义模型/视频模型/抠图接口任一权限开启即可见。
  // 视频模型独立顶级菜单已下线（重定向到 /models?tab=video）。
  { path: '/models', label: '模型服务', icon: IconModel, requireAnyPermission: ['allow_custom_provider', 'allow_custom_video_provider', 'allow_custom_matting_provider'] },
  { path: '/personas', label: '人格规则', icon: IconPersona },
  {
    key: 'group:ai-creation',
    label: 'AI 创作',
    icon: IconAICreation,
    children: [
      { path: '/image-gen', label: 'AI 生图', icon: IconImageGen },
      // { path: '/deck', label: 'AI PPT', icon: IconDeck }, // AI PPT 暂时下线
      { path: '/batch-gen', label: '批量生图', icon: IconBatchGen },
      { path: '/image-to-prompt', label: '图片反推', icon: IconImage2Prompt },
      { path: '/ai-matting', label: '快速抠图', icon: IconImageMatting, requireAnyPermission: ['allow_image_matting', 'allow_custom_matting_provider'] },
      { path: '/fine-matting', label: '精细抠图', icon: IconFineMatting, requireAnyPermission: ['allow_fine_matting'] },
      // 去AI标记：显示由系统设置的全局开关控制（下发 site-config.features.aiMarkRemoval）；能否使用另由权限判定
      { path: '/image-toolkit/remove-ai-mark', label: '去AI标记', icon: IconImageToolkit, requireSiteFeature: 'aiMarkRemoval' },
      { path: '/canvas', label: '流式画布', icon: IconCanvas },
      { path: '/ai-video', label: 'AI 视频', icon: IconVideoGen }
    ]
  },
  { path: '/image-toolkit', label: '图像处理', icon: IconImageToolkit },
  // 店铺商品图：填域名/账号/密码登录 ewei 商城，选门店后用本地图库/AI生图替换商品主图/详情图。
  // 入口权限门控：allow_ewei_shop 默认 false（默认拒绝）。两级门控——授权管理端开放本云控端该功能
  // 且用户被授权时，云控端才下发 true；老/未授权云控端不下发 → 隐藏入口。
  { path: '/ewei', label: '店铺商品图', icon: IconEweiShop, requireAnyPermission: ['allow_ewei_shop', 'allow_dianda_shop', 'allow_qdyun_shop'] },
  { path: '/inspiration', label: '灵感广场', icon: IconInspiration },
  { path: '/canvas-square', label: '创意模板', icon: IconCanvasSquare },
  {
    key: 'group:my-creations',
    label: '我的创作',
    icon: IconCreation,
    children: [
      { path: '/my-creations', label: '图片创作', icon: IconImageGen },
      { path: '/video-creations', label: '视频创作', icon: IconVideoCreation }
    ]
  },
  {
    key: 'group:extensions',
    label: '扩展能力',
    icon: IconExtension,
    children: [
      { path: '/gallery', label: '本地图库', icon: IconGallery },
      { path: '/prompts', label: '提示词', icon: IconPrompt },
      { path: '/tools', label: '小工具', icon: IconTool },
      { path: '/skills', label: 'Skills技能', icon: IconSkill },
      { path: '/mcps', label: 'MCP服务', icon: IconMcp }
    ]
  }
]

const expandedGroups = ref<Set<string>>(new Set())

// 云控端「桌面端菜单配置」：{ menu_key: { visible, title } }；登录后拉取，覆盖默认菜单的显隐与名称。
// menu_key：叶子菜单用 path，分组用 group:xxx。「模型服务 / AI 抠图」不下发（继续按功能权限）。
const menuOverrides = ref<Record<string, { visible: boolean; title: string }>>({})
// 云控端「自定义菜单」：后台维护的额外菜单项（内部路由 / 外部链接），随同一端点下发（仅可见项、已按 sort 排序）
interface CustomMenuItem {
  key: string
  title: string
  group_key: string
  target_type: 'internal' | 'external'
  target: string
  open_mode: 'browser' | 'window'
  icon: string
}
const customMenuItems = ref<CustomMenuItem[]>([])
onMounted(async () => {
  try {
    const res: any = await cloudClient.desktopMenu()
    menuOverrides.value = res?.overrides && typeof res.overrides === 'object' ? res.overrides : {}
    // 写入本地缓存：下次启动「/」重定向（发生在本组件挂载前）据此判断首页是 /bots 还是 /chat
    cacheMenuOverrides(menuOverrides.value)
    // 合并前过滤脏数据（字段缺失 / target_type 非法 / 目标为空或协议不符的项直接丢弃），
    // 防云端脏数据导致渲染出点击无反应的死菜单
    customMenuItems.value = Array.isArray(res?.custom_items)
      ? res.custom_items.filter((c: any) => {
          if (!c || typeof c.key !== 'string' || !c.key) return false
          if (typeof c.title !== 'string' || !c.title) return false
          if (typeof c.target !== 'string' || !c.target) return false
          if (c.target_type === 'internal') return c.target.startsWith('/')
          if (c.target_type === 'external') return /^https?:\/\//i.test(c.target)
          return false
        })
      : []
  } catch {
    menuOverrides.value = {}
    customMenuItems.value = []
  }
})

// 自定义菜单图标 key → 内置 SVG 组件（与云控端 CUSTOM_ICONS 枚举对齐；未知 key 回落链接图标）
const CUSTOM_ICON_MAP: Record<string, any> = {
  link: IconCustomLink,
  page: IconCustomPage,
  app: IconCustomApp,
  star: IconCustomStar
}

/** 自定义菜单点击：internal 走路由；external 按 open_mode 走系统浏览器 / 应用内独立窗口；失败给可见反馈 */
async function onCustomItemClick(item: CustomMenuItem) {
  if (item.target_type === 'internal') {
    router.push(item.target)
    return
  }
  const api = (window as any).api
  try {
    const res =
      item.open_mode === 'window'
        ? await api.shell.openExternalWindow(item.target, item.title)
        : await api.shell.openExternal(item.target)
    // openExternal 协议被主进程白名单拦截返回 false；openExternalWindow 校验失败返回 { success: false, error }
    if (res === false || (res && typeof res === 'object' && res.success === false)) {
      api.nativeDialog.alert(`无法打开链接：${item.target}${res?.error ? `\n${res.error}` : ''}`)
    }
  } catch (e: any) {
    api.nativeDialog.alert(`无法打开链接：${item.target}\n${e?.message || e}`)
  }
}

/** 自定义 internal 菜单的 active 判定：带 query/锚点的目标用 fullPath 精确匹配
 * （否则 /models?tab=video 与内置「模型服务」/models 会同时高亮——router-link 的 active 不按 query 区分），
 * 纯路径目标与内置一致按前缀匹配（子路由页面保持高亮） */
function isCustomInternalActive(c: CustomMenuItem): boolean {
  if (c.target.includes('?') || c.target.includes('#')) return route.fullPath === c.target
  return pathMatches(route.path, c.target)
}

// 微信 ClawBot：app 级常驻监听（幂等）装在主布局而非 ClawbotView——
// 否则用户未打开过 ClawBot 页时，微信轮次完成无法联动刷新对话页/会话列表
onMounted(() => {
  useClawbotStore().initClawbotListeners()
})

/**
 * 路径匹配：避免 `/canvas-square` 错命中 `/canvas` 这种「字符串前缀但语义不同」的情况。
 * 规则：完全相等 OR 完全相等 + 紧跟 `/`（用于带 :id 的子路径，比如 /canvas/abc）。
 * menuPath 先剥 query/锚点（自定义菜单 internal 目标可能带 ?tab=xxx），否则永不命中。
 */
function pathMatches(routePath: string, menuPath: string): boolean {
  const pure = (menuPath || '').split('?')[0].split('#')[0]
  if (!pure) return false
  return routePath === pure || routePath.startsWith(pure + '/')
}

watchEffect(() => {
  for (const item of allNavItems as any[]) {
    if (item.children?.some((child: any) => pathMatches(route.path, child.path))) {
      expandedGroups.value.add(item.key)
    }
  }
  // 自定义菜单 internal 子项命中当前路由时，所在组同样自动展开
  for (const c of customMenuItems.value) {
    if (!c.group_key || c.target_type !== 'internal') continue
    if (pathMatches(route.path, c.target)) expandedGroups.value.add(c.group_key)
  }
})

function toggleGroup(key: string) {
  if (expandedGroups.value.has(key)) {
    expandedGroups.value.delete(key)
  } else {
    expandedGroups.value.add(key)
  }
}

function isGroupActive(item: any) {
  return item.children?.some((child: any) => pathMatches(route.path, child.path))
}

function passesPermissionFilter(item: any): boolean {
  // 单个 key：requirePermission 必须为真
  if (item.requirePermission && !(cloudAuth.permissions as any)[item.requirePermission]) {
    return false
  }
  // 任一 key 命中即可：requireAnyPermission（数组），用于「模型服务」这种合并入口
  if (Array.isArray(item.requireAnyPermission)) {
    const anyTrue = item.requireAnyPermission.some(
      (k: string) => Boolean((cloudAuth.permissions as any)[k]),
    )
    if (!anyTrue) return false
  }
  // 站点级功能显示开关（如去AI标记，由系统设置全局控制、经 site-config 下发；与个人权限无关）
  if (item.requireSiteFeature && !(siteConfig.features as any)[item.requireSiteFeature]) {
    return false
  }
  return true
}

const navItems = computed(() => {
  const cfg = menuOverrides.value
  // 叶子项：先过功能权限；权限项（模型服务 / AI 抠图）不受菜单配置影响；其余按云端 override 隐藏/改名
  const applyLeaf = (item: any): any | null => {
    if (!passesPermissionFilter(item)) return null
    if (item.requireAnyPermission || item.requirePermission || item.requireSiteFeature) return item
    const o = cfg[item.path]
    if (o && o.visible === false) return null
    if (o && o.title) return { ...item, label: o.title }
    return item
  }
  const result: any[] = []
  for (const item of allNavItems as any[]) {
    if (item.children) {
      const go = cfg[item.key]
      if (go && go.visible === false) continue // 整组被隐藏
      const children = item.children.map(applyLeaf).filter(Boolean)
      if (children.length === 0) continue // 子项全部被隐藏 / 无权限则不显示分组
      result.push({ ...item, label: go && go.title ? go.title : item.label, children })
    } else {
      const applied = applyLeaf(item)
      if (applied) result.push(applied)
    }
  }
  // 合并云控端自定义菜单（已按 sort 排序）：挂到对应组末尾或顶级末尾；
  // 组被 overrides 隐藏 / 子项全空不存在时，该自定义项随之不显示（管理员隐藏组的语义覆盖）。
  // key 加 custom: 前缀——自定义 internal 项的 path 可能与内置菜单重复（如再挂一个 /chat），
  // 模板 :key 优先取 key，此前缀保证天然唯一
  for (const c of customMenuItems.value) {
    const leaf = {
      key: `custom:${c.key}`,
      // internal 复用 router-link（active 态由 isCustomInternalActive 手动判定）；external 无 path，模板走 <a> 分支
      path: c.target_type === 'internal' ? c.target : undefined,
      label: c.title,
      icon: CUSTOM_ICON_MAP[c.icon] || IconCustomLink,
      custom: c
    }
    if (!c.group_key) {
      result.push(leaf)
      continue
    }
    const group = result.find((it) => it.key === c.group_key && it.children)
    if (group) group.children.push(leaf)
  }
  return result
})
</script>

<style scoped>
.nav-active {
  background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%);
  color: #4338ca;
}
.nav-active svg {
  color: #4f46e5;
}

:global(.dark) .nav-active {
  background: linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(79,70,229,0.2) 100%);
  color: #a5b4fc;
}
:global(.dark) .nav-active svg {
  color: #818cf8;
}
</style>
