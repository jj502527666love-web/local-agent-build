<template>
  <!-- 自定义窗口控件（仅 Win）：收进主区卡片 header 右端，替代 titleBarOverlay 系统控件。
       四边统一边距后系统控件只能贴窗口物理右缘，故自绘；button 在 app-drag 区内自动 no-drag（main.css 规则）。 -->
  <div v-if="isWin" class="flex items-center gap-0.5 flex-shrink-0 no-drag">
    <button
      type="button"
      tabindex="-1"
      class="w-8 h-8 flex items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors outline-none focus:outline-none"
      title="最小化"
      @click="api.window.minimize()"
    >
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" d="M5 12h14" /></svg>
    </button>
    <button
      type="button"
      tabindex="-1"
      class="w-8 h-8 flex items-center justify-center rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors outline-none focus:outline-none"
      :title="isMaximized ? '还原' : '最大化'"
      @click="toggleMaximize"
    >
      <svg v-if="!isMaximized" class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
      <svg v-else class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linejoin="round" d="M8 8v10a1 1 0 0 0 1 1h10M5 15V6a1 1 0 0 1 1-1h9" /></svg>
    </button>
    <button
      type="button"
      tabindex="-1"
      class="w-8 h-8 flex items-center justify-center rounded-lg text-text-tertiary hover:text-red-600 hover:bg-red-50 transition-colors outline-none focus:outline-none"
      title="关闭"
      @click="api.window.close()"
    >
      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const api = (window as any).api
const platform = ((window as any).electron?.process?.platform || (window as any).runtimeConfig?.platform || '')
const isWin = platform === 'win32'

// 最大化状态跟踪（切换图标用）：窗口 resize 时按 outerBounds 与屏幕工作区比对近似判定，
// 避免为这一点状态新增 IPC 推送；判定偏差只影响图标，不影响 toggle 行为（主进程按真实状态切换）
const isMaximized = ref(false)
function guessMaximized() {
  try {
    isMaximized.value =
      window.screen.availWidth - window.outerWidth < 8 &&
      window.screen.availHeight - window.outerHeight < 8 &&
      window.screenX <= 0 &&
      window.screenY <= 0
  } catch {
    isMaximized.value = false
  }
}
function toggleMaximize() {
  api.window.maximize()
  // 主进程 toggle 后下一次 resize 事件会刷新图标
}
onMounted(() => {
  guessMaximized()
  window.addEventListener('resize', guessMaximized)
})
onUnmounted(() => window.removeEventListener('resize', guessMaximized))
</script>
