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
        <template v-for="item in navItems" :key="item.path || item.key">
          <router-link
            v-if="!item.children"
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
              <router-link
                v-for="child in item.children"
                :key="child.path"
                :to="child.path"
                class="nav-item flex items-center gap-3 pl-9 pr-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-2 transition-all duration-150"
                active-class="nav-active"
              >
                <component :is="child.icon" class="w-[16px] h-[16px] flex-shrink-0" />
                <span class="font-medium">{{ child.label }}</span>
              </router-link>
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
            :title="canvasRunningProjectId ? '回到正在运行的画布' : '画布有节点在生成'"
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
import AnnouncementBar from '@/components/AnnouncementBar.vue'
import ExpiryGlobalBanner from '@/components/ExpiryGlobalBanner.vue'
import SidebarBalanceBadge from '@/components/SidebarBalanceBadge.vue'
import { useCloudAuthStore } from '@/stores/cloud-auth'
import { cloudClient } from '@/utils/cloud-api'
import { appName, appAbbr, appIconUrl } from '@/utils/branding'

const route = useRoute()
const router = useRouter()
const cloudAuth = useCloudAuthStore()
const lowBalance = useLowBalanceStore()
const pageTitle = computed(() => (route.meta?.title as string) || '')

// 画布任务全局徽标：useWorkflowEngine 是 module-level singleton，
// MainLayout 内 mount 时取到的就是任何位置（节点 / CanvasEditorView）共享的状态。
const {
  anyRunning: canvasAnyRunning,
  workflowRunning: canvasWorkflowRunning,
  activeSingleRuns: canvasActiveSingleRuns,
  runningProjectId: canvasRunningProjectId,
  cancelWorkflow: cancelCanvasWorkflow
} = useWorkflowEngine()

const canvasActiveCount = computed(() => {
  // workflow 模式下统计所有节点过于复杂，简化为：workflow 模式不显示数字、单节点模式显示数量
  if (canvasWorkflowRunning.value) return 0
  return canvasActiveSingleRuns.value.size
})

const isCanvasRoute = computed(() => route.path.startsWith('/canvas'))

function goToRunningCanvas() {
  if (canvasRunningProjectId.value) {
    router.push(`/canvas/${canvasRunningProjectId.value}`)
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
  { path: '/chat', label: '对话', icon: IconChat },
  { path: '/bots', label: '智能体', icon: IconBot },
  { path: '/knowledge', label: '知识库', icon: IconKnowledge },
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
      { path: '/canvas', label: '流式画布', icon: IconCanvas },
      { path: '/ai-video', label: 'AI 视频', icon: IconVideoGen }
    ]
  },
  { path: '/image-toolkit', label: '图像处理', icon: IconImageToolkit },
  // 店铺商品图：填域名/账号/密码登录 ewei 商城，选门店后用本地图库/AI生图替换商品主图/详情图。
  // 入口权限门控：allow_ewei_shop 默认 false（默认拒绝）。两级门控——授权管理端开放本云控端该功能
  // 且用户被授权时，云控端才下发 true；老/未授权云控端不下发 → 隐藏入口。
  { path: '/ewei', label: '店铺商品图', icon: IconEweiShop, requireAnyPermission: ['allow_ewei_shop'] },
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
onMounted(async () => {
  try {
    const res: any = await cloudClient.desktopMenu()
    menuOverrides.value = res?.overrides && typeof res.overrides === 'object' ? res.overrides : {}
  } catch {
    menuOverrides.value = {}
  }
})

/**
 * 路径匹配：避免 `/canvas-square` 错命中 `/canvas` 这种「字符串前缀但语义不同」的情况。
 * 规则：完全相等 OR 完全相等 + 紧跟 `/`（用于带 :id 的子路径，比如 /canvas/abc）。
 */
function pathMatches(routePath: string, menuPath: string): boolean {
  return routePath === menuPath || routePath.startsWith(menuPath + '/')
}

watchEffect(() => {
  for (const item of allNavItems as any[]) {
    if (item.children?.some((child: any) => pathMatches(route.path, child.path))) {
      expandedGroups.value.add(item.key)
    }
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
  return true
}

const navItems = computed(() => {
  const cfg = menuOverrides.value
  // 叶子项：先过功能权限；权限项（模型服务 / AI 抠图）不受菜单配置影响；其余按云端 override 隐藏/改名
  const applyLeaf = (item: any): any | null => {
    if (!passesPermissionFilter(item)) return null
    if (item.requireAnyPermission || item.requirePermission) return item
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
