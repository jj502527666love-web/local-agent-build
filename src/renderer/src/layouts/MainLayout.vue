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
        <template v-for="item in navItems" :key="item.path || item.label">
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
              @click="toggleGroup(item.label)"
            >
              <component :is="item.icon" class="w-[18px] h-[18px] flex-shrink-0" />
              <span class="font-medium flex-1">{{ item.label }}</span>
              <IconChevron class="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200" :class="{ 'rotate-90': expandedGroups.has(item.label) }" />
            </button>
            <div v-show="expandedGroups.has(item.label)" class="mt-0.5 space-y-0.5">
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
      </div>
    </aside>
    <main class="flex-1 overflow-hidden flex flex-col relative">
      <header class="h-9 flex-shrink-0 flex items-center px-5 bg-surface-0" :class="[isWin ? 'pr-40 app-drag' : '']">
        <h1 class="text-sm font-semibold text-text-primary">{{ pageTitle }}</h1>
      </header>
      <div class="absolute top-9 left-0 right-0 h-px bg-surface-3 z-10"></div>
      <div class="flex-1 overflow-hidden flex flex-col">
        <router-view />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import IconChat from '@/components/icons/IconChat.vue'
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
import IconPrompt from '@/components/icons/IconPrompt.vue'
import IconCanvas from '@/components/icons/IconCanvas.vue'
import IconGallery from '@/components/icons/IconGallery.vue'
import IconUser from '@/components/icons/IconUser.vue'
import { useCloudAuthStore } from '@/stores/cloud-auth'
import { appName, appAbbr, appIconUrl } from '@/utils/branding'

const route = useRoute()
const cloudAuth = useCloudAuthStore()
const pageTitle = computed(() => (route.meta?.title as string) || '')

// 平台判断：Win 用自定义无边框 + titleBarOverlay（需 app-drag + 右侧 padding 让位控件按钮），
// Mac/Linux 用原生标题栏（renderer 区域不被标题栏占据，无需 app-drag 与额外 padding）。
const isWin = ((window as any).electron?.process?.platform || (window as any).runtimeConfig?.platform || '') === 'win32'

const allNavItems = [
  { path: '/chat', label: '\u5BF9\u8BDD', icon: IconChat },
  { path: '/bots', label: '\u667A\u80FD\u4F53', icon: IconBot },
  { path: '/knowledge', label: '\u77E5\u8BC6\u5E93', icon: IconKnowledge },
  { path: '/models', label: '\u6A21\u578B\u670D\u52A1', icon: IconModel, requirePermission: 'allow_custom_provider' },
  { path: '/personas', label: '\u4EBA\u683C\u89C4\u5219', icon: IconPersona },
  { path: '/tools', label: '\u5C0F\u5DE5\u5177', icon: IconTool },
  { path: '/image-gen', label: 'AI \u751F\u56FE', icon: IconImageGen },
  { path: '/batch-gen', label: '\u6279\u91CF\u751F\u56FE', icon: IconBatchGen },
  { path: '/image-to-prompt', label: '\u56FE\u7247\u53CD\u63A8', icon: IconImage2Prompt },
  { path: '/canvas', label: '\u6D41\u5F0F\u753B\u5E03', icon: IconCanvas },
  { path: '/inspiration', label: '\u7075\u611F\u5E7F\u573A', icon: IconInspiration },
  { path: '/my-creations', label: '\u6211\u7684\u521B\u4F5C', icon: IconCreation },
  {
    label: '\u6269\u5C55\u80FD\u529B',
    icon: IconExtension,
    children: [
      { path: '/gallery', label: '\u672C\u5730\u56FE\u5E93', icon: IconGallery },
      { path: '/prompts', label: '\u63D0\u793A\u8BCD', icon: IconPrompt },
      { path: '/skills', label: 'Skills\u6280\u80FD', icon: IconSkill },
      { path: '/mcps', label: 'MCP\u670D\u52A1', icon: IconMcp }
    ]
  }
]

const expandedGroups = ref<Set<string>>(new Set())

watchEffect(() => {
  for (const item of allNavItems) {
    if (item.children?.some(child => route.path.startsWith(child.path))) {
      expandedGroups.value.add(item.label)
    }
  }
})

function toggleGroup(label: string) {
  if (expandedGroups.value.has(label)) {
    expandedGroups.value.delete(label)
  } else {
    expandedGroups.value.add(label)
  }
}

function isGroupActive(item: any) {
  return item.children?.some((child: any) => route.path.startsWith(child.path))
}

const navItems = computed(() => {
  return allNavItems.filter(item => {
    if (item.requirePermission === 'allow_custom_provider') {
      return cloudAuth.permissions.allow_custom_provider
    }
    return true
  })
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
