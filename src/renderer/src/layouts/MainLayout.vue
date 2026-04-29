<template>
  <div class="flex h-screen w-screen overflow-hidden bg-surface-1">
    <aside class="w-44 flex-shrink-0 bg-surface-0 border-r border-surface-3 flex flex-col">
      <div class="h-14 flex items-center px-5 app-drag">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center">
            <span class="text-white text-[11px] font-bold leading-none tracking-tight">LA</span>
          </div>
          <span class="text-sm font-bold text-text-primary tracking-tight">LocalAgent</span>
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
      <div class="px-3 py-3 border-t border-surface-3">
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
import IconPrompt from '@/components/icons/IconPrompt.vue'

const route = useRoute()
const pageTitle = computed(() => (route.meta?.title as string) || '')

const navItems = [
  { path: '/chat', label: '对话', icon: IconChat },
  { path: '/bots', label: '机器人', icon: IconBot },
  { path: '/knowledge', label: '知识库', icon: IconKnowledge },
  { path: '/models', label: '模型服务', icon: IconModel },
  { path: '/personas', label: '人格规则', icon: IconPersona },
  { path: '/tools', label: '小工具', icon: IconTool },
  { path: '/skills', label: 'Skills技能', icon: IconSkill },
  { path: '/mcps', label: 'MCP服务', icon: IconMcp },
  { path: '/image-gen', label: 'AI 生图', icon: IconImageGen },
  { path: '/batch-gen', label: '批量生图', icon: IconBatchGen },
  { path: '/inspiration', label: '灵感广场', icon: IconInspiration },
  { path: '/my-creations', label: '我的创作', icon: IconCreation },
  { path: '/prompts', label: '提示词', icon: IconPrompt }
]
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
