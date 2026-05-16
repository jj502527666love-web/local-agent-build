<template>
  <div class="h-full flex flex-col">
    <!-- Tab 栏：仅当有 ≥ 2 个 tab 可见时显示；单 tab 时省略导航栏，直接铺满内容 -->
    <div
      v-if="visibleTabs.length > 1"
      class="px-6 pt-4 border-b border-surface-3 bg-surface-0 flex items-center gap-1"
    >
      <button
        v-for="t in visibleTabs"
        :key="t.key"
        class="px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px"
        :class="
          activeTab === t.key
            ? 'border-primary-500 text-primary-600 dark:text-primary-400'
            : 'border-transparent text-text-secondary hover:text-text-primary'
        "
        @click="onTabChange(t.key)"
      >
        {{ t.label }}
      </button>
    </div>

    <!-- 内容区：KeepAlive 让 tab 切换不丢失子组件状态（如 ModelView 的表单输入） -->
    <div class="flex-1 overflow-hidden">
      <KeepAlive>
        <component :is="currentComponent" />
      </KeepAlive>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * v0.6.9+ 模型服务 tab 容器。
 *
 * 三个 tab：
 *   - general：通用模型管理（chat / image / embedding 等本地自定义 model_providers）
 *               复用 v0.6.x 的 ModelView.vue 整页组件
 *   - video：  视频模型（暂未实现，DevelopingView 占位）。等到接入真实视频生成时替换为子组件
 *   - matting：抠图接口（阿里 viapi 自定义 AK/SK 本地管理）
 *
 * 可见性：每个 tab 受单独 permission 控制；用户只开通其中一项时不展示 tab 栏，直接铺满。
 *
 * URL：?tab=general|video|matting，便于「侧栏链接 / 老 /video-models 重定向」精确落点。
 */
import { computed, defineAsyncComponent, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCloudAuthStore } from '@/stores/cloud-auth'

const route = useRoute()
const router = useRouter()
const cloudAuth = useCloudAuthStore()

// 懒加载子组件：matting tab 的 store 在 onMounted 才用到，避免不开通的用户也加载
const GeneralTab = defineAsyncComponent(() => import('./ModelView.vue'))
const VideoTab   = defineAsyncComponent(() => import('@/views/common/DevelopingView.vue'))
const MattingTab = defineAsyncComponent(() => import('./MattingProvidersTab.vue'))

interface TabDef {
  key: 'general' | 'video' | 'matting'
  label: string
  visible: boolean
  component: any
}

const visibleTabs = computed<TabDef[]>(() => {
  const all: TabDef[] = [
    {
      key: 'general',
      label: '通用模型',
      visible: cloudAuth.permissions.allow_custom_provider,
      component: GeneralTab,
    },
    {
      key: 'video',
      label: '视频模型',
      visible: cloudAuth.permissions.allow_custom_video_provider,
      component: VideoTab,
    },
    {
      key: 'matting',
      label: '抠图接口',
      visible: cloudAuth.permissions.allow_custom_matting_provider,
      component: MattingTab,
    },
  ]
  return all.filter((t) => t.visible)
})

const activeTab = computed<'general' | 'video' | 'matting'>(() => {
  const q = String(route.query.tab || '')
  // 命中可见 tab 时用 URL；否则取第一个可见 tab；都没可见时默认 general（页面会显示空白，主层级 nav 也不会进来）
  if (q === 'general' || q === 'video' || q === 'matting') {
    if (visibleTabs.value.some((t) => t.key === q)) return q
  }
  return (visibleTabs.value[0]?.key as any) || 'general'
})

const currentComponent = computed(() => {
  const hit = visibleTabs.value.find((t) => t.key === activeTab.value)
  return hit?.component || GeneralTab
})

function onTabChange(key: string) {
  // 用 replace 避免推一堆 history 记录
  router.replace({ path: '/models', query: { ...route.query, tab: key } })
}

// 初次进入：URL 没带 tab 时主动补一个，便于刷新还原 + 浏览器返回栈语义清晰
onMounted(() => {
  if (!route.query.tab && visibleTabs.value.length) {
    router.replace({ path: '/models', query: { ...route.query, tab: activeTab.value } })
  }
})

// 当用户切换权限（极少见，但保留兜底）：当前 tab 失去可见性时滚到第一个可见 tab
// （仅响应权限刷新，不依赖路由钩子，避免与 onTabChange 互相触发）
import { watch } from 'vue'
watch(visibleTabs, (list) => {
  if (!list.length) return
  const cur = String(route.query.tab || '')
  if (!list.some((t) => t.key === cur)) {
    router.replace({ path: '/models', query: { ...route.query, tab: list[0].key } })
  }
})
</script>
