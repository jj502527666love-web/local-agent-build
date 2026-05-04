<template>
  <div class="flex h-screen w-screen overflow-hidden bg-surface-1">
    <aside class="w-44 flex-shrink-0 bg-surface-0 border-r border-surface-3 flex flex-col">
      <div class="h-14 flex items-center px-5 app-drag">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
            <span class="text-white text-[11px] font-bold leading-none tracking-tight">{{ appAbbr }}</span>
          </div>
          <span class="text-sm font-bold text-text-primary tracking-tight">{{ appName }}</span>
        </div>
      </div>
      <nav class="flex-1 px-3 py-1 overflow-y-auto space-y-0.5">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-item flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:bg-surface-2 transition-all duration-150"
          active-class="nav-active"
        >
          <component :is="item.icon" class="w-[18px] h-[18px] flex-shrink-0" />
          <span class="font-medium">{{ item.label }}</span>
        </router-link>
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
      <header class="h-9 flex-shrink-0 flex items-center px-5 pr-40 bg-surface-0 app-drag">
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
import { computed } from 'vue'
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
import IconImageGen from '@/components/icons/IconImageGen.vue'
import IconInspiration from '@/components/icons/IconInspiration.vue'
import IconCreation from '@/components/icons/IconCreation.vue'
import IconBatchGen from '@/components/icons/IconBatchGen.vue'
import IconImage2Prompt from '@/components/icons/IconImage2Prompt.vue'
import IconPrompt from '@/components/icons/IconPrompt.vue'
import IconCanvas from '@/components/icons/IconCanvas.vue'
import IconUser from '@/components/icons/IconUser.vue'
import { useCloudAuthStore } from '@/stores/cloud-auth'

const route = useRoute()
const cloudAuth = useCloudAuthStore()
const pageTitle = computed(() => (route.meta?.title as string) || '')

// 品牌名：优先读 runtimeConfig.appName（由 inject 注入），dev fallback 'LocalAgent'
const _runtimeAppName = (window as unknown as { runtimeConfig?: { appName?: string } }).runtimeConfig?.appName
const appName = _runtimeAppName || 'LocalAgent'
function deriveAbbr(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return 'LA'
  // 中文取前 2 字
  if (/^[\u4e00-\u9fa5]/.test(trimmed)) return trimmed.slice(0, 2)
  // 英文/数字取前 2 字母大写
  const ascii = trimmed.replace(/[^a-zA-Z0-9]/g, '')
  return (ascii.slice(0, 2) || 'LA').toUpperCase()
}
const appAbbr = deriveAbbr(appName)

const allNavItems = [
  { path: '/chat', label: '\u5BF9\u8BDD', icon: IconChat },
  { path: '/bots', label: '\u673A\u5668\u4EBA', icon: IconBot },
  { path: '/knowledge', label: '\u77E5\u8BC6\u5E93', icon: IconKnowledge },
  { path: '/models', label: '\u6A21\u578B\u670D\u52A1', icon: IconModel, requirePermission: 'allow_custom_provider' },
  { path: '/personas', label: '\u4EBA\u683C\u89C4\u5219', icon: IconPersona },
  { path: '/tools', label: '\u5C0F\u5DE5\u5177', icon: IconTool },
  { path: '/skills', label: 'Skills\u6280\u80FD', icon: IconSkill },
  { path: '/mcps', label: 'MCP\u670D\u52A1', icon: IconMcp },
  { path: '/image-gen', label: 'AI \u751F\u56FE', icon: IconImageGen },
  { path: '/batch-gen', label: '\u6279\u91CF\u751F\u56FE', icon: IconBatchGen },
  { path: '/image-to-prompt', label: '\u56FE\u7247\u53CD\u63A8', icon: IconImage2Prompt },
  { path: '/canvas', label: '\u6D41\u5F0F\u753B\u5E03', icon: IconCanvas },
  { path: '/inspiration', label: '\u7075\u611F\u5E7F\u573A', icon: IconInspiration },
  { path: '/my-creations', label: '\u6211\u7684\u521B\u4F5C', icon: IconCreation },
  { path: '/prompts', label: '\u63D0\u793A\u8BCD', icon: IconPrompt }
]

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
