<template>
  <template v-if="announcement">
    <!-- 公告入口：20 字标题预览，超过显示 …；整条可点击打开全文弹窗 -->
    <button
      type="button"
      class="flex items-center gap-1.5 px-2.5 h-6 rounded-full bg-primary-50 text-primary-700 border border-primary-100 hover:bg-primary-100 transition-colors max-w-[320px] focus:outline-none focus:ring-1 focus:ring-primary-400 dark:bg-primary-900/20 dark:text-primary-300 dark:border-primary-800"
      :title="announcement.title"
      @click="open = true"
    >
      <svg class="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 11l18-8v18L3 13v-2z" />
        <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
      </svg>
      <span class="text-[11px] font-medium truncate">{{ preview }}</span>
    </button>

    <!-- 全文弹窗：透明点击层用于「点外关闭」，项目规则「弹窗只加阴影不加背景遮罩」 -->
    <Teleport to="body">
      <div
        v-if="open"
        class="fixed inset-0 z-[9500] flex items-center justify-center pointer-events-none"
        @click.self="open = false"
      >
        <!-- 透明点击层：接收弹窗外点击事件。没有视觉背景（符合项目规则） -->
        <div class="absolute inset-0 pointer-events-auto" @click="open = false"></div>

        <div
          class="relative w-full max-w-lg mx-4 bg-surface-0 rounded-2xl shadow-2xl border border-surface-3 overflow-hidden pointer-events-auto"
          role="dialog"
          aria-modal="true"
        >
          <div class="px-5 py-3 border-b border-surface-2 flex items-center justify-between gap-3">
            <h3 class="text-sm font-semibold text-text-primary truncate" :title="announcement.title">{{ announcement.title }}</h3>
            <button
              type="button"
              class="text-text-tertiary hover:text-text-primary transition-colors flex-shrink-0"
              @click="open = false"
              aria-label="关闭"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div
            class="announcement-content px-5 py-4 max-h-[60vh] overflow-y-auto text-sm text-text-secondary leading-relaxed"
            v-html="announcement.content || '<p style=\'color:#bfbfbf\'>（无内容）</p>'"
          />
          <div class="px-5 py-3 border-t border-surface-2 flex justify-end">
            <button
              type="button"
              class="px-3 py-1.5 text-xs font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
              @click="open = false"
            >知道了</button>
          </div>
        </div>
      </div>
    </Teleport>
  </template>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useCloudAuthStore } from '@/stores/cloud-auth'

const cloudAuth = useCloudAuthStore()
const { announcement } = storeToRefs(cloudAuth)

const open = ref(false)

// 20 字预览：以 title 为主；超过 20 字截断 + …。
// 后端 title 上限 200，截断安全
const preview = computed(() => {
  const t = (announcement.value?.title || '').trim()
  if (!t) return '公告'
  return t.length <= 20 ? t : t.slice(0, 20) + '…'
})

// ESC 关闭弹窗：符合一般对话框交互习惯
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) {
    open.value = false
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<style scoped>
/* 富文本渲染样式：与 admin 预览保持一致 */
.announcement-content :deep(a) { color: var(--color-primary-600, #4f46e5); text-decoration: underline; }
.announcement-content :deep(ul),
.announcement-content :deep(ol) { padding-left: 24px; margin: 4px 0; }
.announcement-content :deep(p) { margin: 4px 0; }
.announcement-content :deep(b),
.announcement-content :deep(strong) { font-weight: 600; }
.announcement-content :deep(i),
.announcement-content :deep(em) { font-style: italic; }
.announcement-content :deep(u) { text-decoration: underline; }
</style>
