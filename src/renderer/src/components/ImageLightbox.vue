<template>
  <Teleport to="body">
    <Transition name="lb-fade">
      <div
        v-if="src"
        ref="rootEl"
        class="fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-md"
        @click.self="emitClose"
        @wheel.prevent="onWheel"
      >
        <!-- 图片 wrapper：用 inline-flex 让容器尺寸 = 图片 fit-to-screen 后的实际尺寸（max 92vw/92vh）。
             关闭按钮通过 absolute 定位在 wrapper 内部右上角，跟随图片视觉边沿。
             img 自身有 transform 用于缩放/平移，但 transform 不影响 wrapper 的布局尺寸，
             所以按钮位置在缩放 / 拖动后仍稳定，不会跟着图片缩放变形或飞出视窗。 -->
        <div class="relative inline-flex">
          <img
            :src="src"
            :alt="alt || ''"
            class="lb-img select-none shadow-[0_0_60px_rgba(0,0,0,0.35)] rounded-md"
            :style="imgStyle"
            @mousedown.prevent="onDragStart"
            @dblclick="onDoubleClick"
            @click.stop
            draggable="false"
          />
          <!-- 图片右上角关闭按钮：用户惯性的「找右上角 X 关闭」位置，避免误把 Electron 窗口
               标题栏的关闭按钮当作预览关闭。半透明白底 + 阴影，hover 不透明，不遮挡图片内容。 -->
          <button
            @click.stop="emitClose"
            @mousedown.stop
            class="absolute top-2 right-2 z-10 w-9 h-9 rounded-full bg-surface-0/85 backdrop-blur-sm shadow-[0_4px_24px_rgba(0,0,0,0.18)] flex items-center justify-center text-text-secondary hover:bg-surface-0 hover:text-text-primary transition-colors"
            title="关闭 (Esc)"
            aria-label="关闭预览"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <!-- 工具栏 -->
        <div
          class="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1.5 rounded-2xl bg-surface-0 shadow-[0_4px_24px_rgba(0,0,0,0.18)]"
          @click.stop
          @mousedown.stop
          @wheel.stop
        >
          <button @click="zoomByCenter(1 / 1.25)" class="lb-btn" title="缩小 (-)">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14" /></svg>
          </button>
          <span class="text-[11px] text-text-secondary tabular-nums w-12 text-center font-medium">{{ Math.round(scale * 100) }}%</span>
          <button @click="zoomByCenter(1.25)" class="lb-btn" title="放大 (+)">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 5v14M5 12h14" /></svg>
          </button>
          <button @click="reset" class="lb-btn" title="重置 (0 / 双击)">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M15 9V4.5M15 9h4.5M15 9l5.25-5.25M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 15v4.5M15 15h4.5m-4.5 0 5.25 5.25" /></svg>
          </button>

          <template v-if="onCopy || onLocate">
            <div class="w-px h-4 bg-surface-3 mx-0.5" />
            <button v-if="onCopy" @click="onCopy?.()" class="lb-btn" title="复制图片">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg>
            </button>
            <button v-if="onLocate" @click="onLocate?.()" class="lb-btn" title="打开所在文件夹">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" /></svg>
            </button>
          </template>

          <div class="w-px h-4 bg-surface-3 mx-0.5" />
          <button @click="emitClose" class="lb-btn" title="关闭 (Esc)">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'

const props = defineProps<{
  /** Image src; null/'' = hidden. */
  src: string | null | undefined
  alt?: string
  /** Optional toolbar action — shown only when provided. */
  onCopy?: () => void
  /** Optional toolbar action — shown only when provided. */
  onLocate?: () => void
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const MIN_SCALE = 0.1
const MAX_SCALE = 12

const rootEl = ref<HTMLElement | null>(null)

// Transform state — image is fit-to-screen at scale=1, centered (tx=ty=0).
const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
const dragging = ref(false)

const imgStyle = computed(() => ({
  transform: `translate(${tx.value}px, ${ty.value}px) scale(${scale.value})`,
  transformOrigin: 'center center',
  // Avoid CSS transition on transform while dragging/zooming via wheel — feels laggy.
  // Reset / dblclick zoom DO want a smooth tween; we toggle via a data-attr below.
  transition: dragging.value ? 'none' : 'transform 120ms ease-out'
}))

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function reset() {
  scale.value = 1
  tx.value = 0
  ty.value = 0
}

function emitClose() {
  emit('close')
}

/** Apply a multiplicative zoom centered on a screen point (mx, my) relative to container center. */
function zoomAt(factor: number, mx: number, my: number) {
  const newScale = clamp(scale.value * factor, MIN_SCALE, MAX_SCALE)
  if (newScale === scale.value) return
  const ratio = newScale / scale.value
  tx.value = mx - (mx - tx.value) * ratio
  ty.value = my - (my - ty.value) * ratio
  scale.value = newScale
}

function zoomByCenter(factor: number) {
  // Toolbar +/- buttons zoom around the visual center (mx=my=0 in our coord system).
  zoomAt(factor, 0, 0)
}

function onWheel(e: WheelEvent) {
  if (!props.src || !rootEl.value) return
  const rect = rootEl.value.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const mx = e.clientX - cx
  const my = e.clientY - cy
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
  zoomAt(factor, mx, my)
}

// ── Drag-to-pan ────────────────────────────────────────────────────────────
let dragStartX = 0
let dragStartY = 0
let dragStartTx = 0
let dragStartTy = 0
let dragMoved = false

function onDragStart(e: MouseEvent) {
  dragging.value = true
  dragMoved = false
  dragStartX = e.clientX
  dragStartY = e.clientY
  dragStartTx = tx.value
  dragStartTy = ty.value
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
}

function onDragMove(e: MouseEvent) {
  if (!dragging.value) return
  const dx = e.clientX - dragStartX
  const dy = e.clientY - dragStartY
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true
  tx.value = dragStartTx + dx
  ty.value = dragStartTy + dy
}

function onDragEnd() {
  dragging.value = false
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
}

function onDoubleClick(e: MouseEvent) {
  if (dragMoved) return
  // Reset if already zoomed, otherwise zoom to 2x at the cursor point.
  if (scale.value !== 1) {
    reset()
    return
  }
  if (!rootEl.value) return
  const rect = rootEl.value.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  zoomAt(2, e.clientX - cx, e.clientY - cy)
}

// ── Keyboard ───────────────────────────────────────────────────────────────
function onKeydown(e: KeyboardEvent) {
  if (!props.src) return
  if (e.key === 'Escape') {
    e.preventDefault()
    emitClose()
  } else if (e.key === '+' || e.key === '=') {
    e.preventDefault()
    zoomByCenter(1.25)
  } else if (e.key === '-' || e.key === '_') {
    e.preventDefault()
    zoomByCenter(1 / 1.25)
  } else if (e.key === '0') {
    e.preventDefault()
    reset()
  }
}

// Mount/unmount global key listener only when the lightbox is actually open,
// so we don't intercept Esc / +/- / 0 for the rest of the app.
watch(
  () => props.src,
  (val) => {
    if (val) {
      reset()
      window.addEventListener('keydown', onKeydown)
    } else {
      window.removeEventListener('keydown', onKeydown)
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
})
</script>

<style scoped>
.lb-img {
  /* Fit-to-screen at scale=1: at most 90vw / 90vh, preserving aspect ratio.
     Larger image will be downscaled to fit; smaller image displayed at native size.
     Zooming via wheel/buttons multiplies on top of this baseline. */
  max-width: 92vw;
  max-height: 92vh;
  width: auto;
  height: auto;
  -webkit-user-drag: none;
}

.lb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: var(--text-secondary, #6b7280);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 120ms ease-out, color 120ms ease-out;
}
.lb-btn:hover {
  background: var(--surface-2, #f3f4f6);
  color: var(--text-primary, #111827);
}

/* Fade in/out */
.lb-fade-enter-active,
.lb-fade-leave-active {
  transition: opacity 160ms ease-out;
}
.lb-fade-enter-from,
.lb-fade-leave-to {
  opacity: 0;
}
</style>
