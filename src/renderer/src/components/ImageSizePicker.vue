<template>
  <div class="img-size-picker">
    <!-- Select layout：编排弹窗三处使用 -->
    <select
      v-if="layout === 'select'"
      :value="selectValue"
      :disabled="disabled"
      @change="onSelectChange"
      class="w-full text-[11px] bg-surface-0 rounded px-1.5 py-1 outline-none focus:border-primary-400 border"
      :class="[
        isCustom
          ? accentBorderClass
          : selectValue
            ? 'border-surface-3 text-text-primary'
            : 'border-surface-3 text-text-tertiary'
      ]"
      :title="selectTitle"
    >
      <option v-if="allowInherit" value="">{{ inheritLabel }}</option>
      <option
        v-for="p in presets"
        :key="p.value"
        :value="p.value"
      >{{ p.label }}</option>
      <option
        v-if="isCustom"
        :value="modelValue"
      >{{ displayValue }}</option>
      <option :value="CUSTOM_SENTINEL">自定义…</option>
    </select>

    <!-- Grid layout：生图页 + Canvas 节点使用 -->
    <div
      v-else
      class="grid gap-1.5"
      :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }"
    >
      <button
        v-for="p in presets"
        :key="p.value"
        type="button"
        :disabled="disabled"
        @click="onPick(p.value)"
        :class="buttonClass(modelValue === p.value)"
      >{{ p.label }}</button>
      <button
        type="button"
        ref="triggerRef"
        :disabled="disabled"
        :title="customButtonTitle"
        @click="openCustomEditor()"
        :class="buttonClass(isCustom)"
      >
        <svg
          class="block flex-shrink-0"
          :class="size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect width="12" height="20" x="6" y="2" rx="2" />
          <rect width="20" height="12" x="2" y="6" rx="2" />
        </svg>
      </button>
    </div>

    <!-- Hint：当前值对应像素 -->
    <div v-if="showHint && modelValue" class="mt-1 text-[10px] text-text-tertiary">
      输出 {{ pixelHint }}
    </div>

    <!-- Popover：Teleport 到 body，避免 Canvas 节点裁剪；仅阴影，无遮罩 -->
    <Teleport to="body">
      <div
        v-if="popoverOpen"
        ref="popoverRef"
        class="fixed z-[10050] w-[260px] bg-surface-0 rounded-xl border border-surface-3 shadow-[0_10px_30px_rgba(0,0,0,0.12)] p-3"
        :style="popoverStyle"
        @click.stop
      >
        <div class="flex items-center gap-1 mb-2">
          <button
            type="button"
            :class="tabClass(tab === 'ratio')"
            @click="tab = 'ratio'"
          >比例</button>
          <button
            type="button"
            :class="tabClass(tab === 'pixels')"
            @click="tab = 'pixels'"
          >像素</button>
          <div class="ml-auto text-[10px] text-text-tertiary">{{ tab === 'ratio' ? '长边 1792' : '自动 snap 到 8 倍数' }}</div>
        </div>

        <div v-if="tab === 'ratio'" class="space-y-2">
          <div class="flex items-center gap-1.5">
            <input
              v-model.number="ratioW"
              type="number"
              min="1"
              :max="RATIO_MAX"
              class="flex-1 min-w-0 px-2 py-1.5 text-sm bg-surface-1 border border-surface-3 rounded outline-none focus:border-primary-400"
            />
            <span class="text-text-tertiary">:</span>
            <input
              v-model.number="ratioH"
              type="number"
              min="1"
              :max="RATIO_MAX"
              class="flex-1 min-w-0 px-2 py-1.5 text-sm bg-surface-1 border border-surface-3 rounded outline-none focus:border-primary-400"
            />
          </div>
          <div class="flex items-center justify-between text-[11px]">
            <span class="text-text-tertiary">预计输出</span>
            <span :class="ratioPreview ? 'text-text-primary font-medium' : 'text-red-500'">
              {{ ratioPreview || '格式非法' }}
            </span>
          </div>
          <div v-if="ratioDetail?.clamped" class="text-[10px] text-amber-600">
            已按模型能力域自动调整
          </div>
        </div>

        <div v-else class="space-y-2">
          <div class="flex items-center gap-1.5">
            <input
              v-model.number="pxW"
              type="number"
              :min="PIXEL_MIN"
              :max="PIXEL_MAX"
              class="flex-1 min-w-0 px-2 py-1.5 text-sm bg-surface-1 border border-surface-3 rounded outline-none focus:border-primary-400"
            />
            <span class="text-text-tertiary">×</span>
            <input
              v-model.number="pxH"
              type="number"
              :min="PIXEL_MIN"
              :max="PIXEL_MAX"
              class="flex-1 min-w-0 px-2 py-1.5 text-sm bg-surface-1 border border-surface-3 rounded outline-none focus:border-primary-400"
            />
          </div>
          <div class="flex items-center justify-between text-[11px]">
            <span class="text-text-tertiary">snap 后</span>
            <span :class="pxPreview ? 'text-text-primary font-medium' : 'text-red-500'">
              {{ pxPreview || '格式非法' }}
            </span>
          </div>
          <div v-if="pxDetail?.clamped" class="text-[10px] text-amber-600">
            已按模型能力域自动调整
          </div>
          <div v-else-if="pxPreview && pxSnapChanged" class="text-[10px] text-amber-600">
            已自动调整为 8 的倍数
          </div>
        </div>

        <div class="flex items-center justify-end gap-1.5 mt-3">
          <button
            type="button"
            @click="closePopover"
            class="px-2.5 py-1 text-[11px] text-text-secondary border border-surface-3 rounded hover:bg-surface-2 transition-colors"
          >取消</button>
          <button
            type="button"
            @click="onConfirm"
            :disabled="!canConfirm"
            class="px-2.5 py-1 text-[11px] font-medium bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >确认</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onBeforeUnmount } from 'vue'
import {
  IMAGE_SIZE_PRESETS,
  isPresetValue,
  parsePixels,
  parseRatio,
  resolveSizeToPixels,
  resolveSizeToPixelsDetailed,
  formatSizeForDisplay,
  normalizeSizeInput,
  PIXEL_MIN,
  PIXEL_MAX,
  RATIO_MAX
} from '@shared/image-size'

interface Props {
  modelValue: string
  disabled?: boolean
  layout?: 'grid' | 'select'
  /** Grid 列数，默认 6（10 个预设 + 1 个自定义 = 11，11/6 向上取整 2 行） */
  columns?: number
  /** Select 模式下显示"继承"项（空字符串） */
  allowInherit?: boolean
  /** "继承"项展示文本 */
  inheritLabel?: string
  /** 底部显示当前 value 对应的像素 */
  showHint?: boolean
  /** 按钮选中态主题色 */
  accent?: 'primary' | 'amber' | 'red'
  /** 按钮尺寸：sm = 节点内紧凑，md = 生图页标准 */
  size?: 'sm' | 'md'
  /** 模型 id，决定 capability（长边上限/总像素上限） */
  modelId?: string
  /** 分辨率档位 id（1k/2k/4k），决定长边 longSide */
  tierId?: string
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  layout: 'grid',
  columns: 6,
  allowInherit: false,
  inheritLabel: '继承',
  showHint: false,
  accent: 'primary',
  size: 'md'
})

/** 统一构造解析选项：所有 resolve* 调用均借此走 capability */
const resolveOpts = computed(() => ({
  modelId: props.modelId,
  tierId: props.tierId
}))

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
}>()

const presets = IMAGE_SIZE_PRESETS
const CUSTOM_SENTINEL = '__custom__'

const isCustom = computed(
  () => !!props.modelValue && !isPresetValue(props.modelValue)
)
const displayValue = computed(() => formatSizeForDisplay(props.modelValue))

/** 按钮只显示图标，完整自定义值靠 tooltip + showHint 展示 */
const customButtonTitle = computed(() => {
  if (!isCustom.value) return '自定义比例或像素'
  const px = resolveSizeToPixels(props.modelValue, resolveOpts.value)
  return px ? `${displayValue.value} （${px}）` : displayValue.value
})

/** 绑定给 select 元素的 value：自定义时取 modelValue 本身（需要有对应 option），否则取 modelValue */
const selectValue = computed(() => props.modelValue)
const selectTitle = computed(() => {
  if (!props.modelValue) return props.inheritLabel
  const px = resolveSizeToPixels(props.modelValue, resolveOpts.value)
  return px ? `${displayValue.value} (${px})` : displayValue.value
})

const pixelHint = computed(() => resolveSizeToPixels(props.modelValue, resolveOpts.value) || '—')

// ============ 按钮样式 ============
const accentBorderClass = computed(() => {
  switch (props.accent) {
    case 'amber':
      return 'border-amber-500 text-amber-700'
    case 'red':
      return 'border-red-500 text-red-700'
    default:
      return 'border-primary-500 text-primary-700'
  }
})

function buttonClass(active: boolean): string[] {
  // flex + w-full: button must be a block-level flex container to fill its grid cell,
  // otherwise inline-flex collapses to fit-content and the icon drifts off-center.
  // min-w-0 + child <span class="truncate"> handle overflow without clipping the icon.
  const base = ['rounded-lg', 'border', 'transition-colors', 'flex', 'items-center', 'justify-center', 'gap-1', 'w-full', 'min-w-0', 'disabled:opacity-40', 'disabled:cursor-not-allowed']
  if (props.size === 'sm') {
    base.push('px-2', 'py-0.5', 'text-[10px]')
  } else {
    base.push('px-2', 'py-2', 'text-[10px]')
  }
  if (active) {
    switch (props.accent) {
      case 'amber':
        base.push('border-amber-500', 'bg-amber-50', 'text-amber-700', 'font-medium')
        break
      case 'red':
        base.push('border-red-500', 'bg-red-50', 'text-red-700', 'font-medium')
        break
      default:
        base.push('border-primary-500', 'bg-primary-50', 'text-primary-700', 'font-medium')
    }
  } else {
    base.push('border-surface-3', 'bg-surface-1', 'text-text-secondary', 'hover:bg-surface-2')
  }
  return base
}

function tabClass(active: boolean): string[] {
  const base = ['px-2.5', 'py-1', 'text-[11px]', 'rounded', 'transition-colors']
  if (active) {
    base.push('bg-primary-100', 'text-primary-700', 'font-medium')
  } else {
    base.push('text-text-tertiary', 'hover:bg-surface-2')
  }
  return base
}

// ============ 交互 ============
function onPick(value: string) {
  if (props.disabled) return
  emit('update:modelValue', value)
}

function onSelectChange(e: Event) {
  const target = e.target as HTMLSelectElement
  const v = target.value
  if (v === CUSTOM_SENTINEL) {
    // 还原 select 显示（不提交 sentinel），同时弹出编辑器
    target.value = props.modelValue
    openCustomEditor(target)
    return
  }
  emit('update:modelValue', v)
}

// ============ Popover ============
const popoverOpen = ref(false)
const popoverStyle = ref<Record<string, string>>({})
const popoverRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)
// Active anchor for positioning: grid mode uses the custom button, select mode
// passes its own <select> element. Cleared on close.
const activeAnchor = ref<HTMLElement | null>(null)

const tab = ref<'ratio' | 'pixels'>('ratio')
const ratioW = ref<number | null>(1)
const ratioH = ref<number | null>(1)
const pxW = ref<number | null>(1024)
const pxH = ref<number | null>(1024)

/** 比例预览的完整解析结果（包含 clamp 标志），走当前模型+档位 capability */
const ratioDetail = computed(() => {
  if (ratioW.value == null || ratioH.value == null) return null
  return resolveSizeToPixelsDetailed(`${ratioW.value}:${ratioH.value}`, resolveOpts.value)
})
const pxDetail = computed(() => {
  if (pxW.value == null || pxH.value == null) return null
  return resolveSizeToPixelsDetailed(`${pxW.value}x${pxH.value}`, resolveOpts.value)
})
const ratioPreview = computed(() => ratioDetail.value?.pixels || '')
const pxPreview = computed(() => pxDetail.value?.pixels || '')
const pxSnapChanged = computed(() => {
  if (!pxPreview.value || pxW.value == null || pxH.value == null) return false
  const [w, h] = pxPreview.value.split('x').map(Number)
  return w !== pxW.value || h !== pxH.value
})
const canConfirm = computed(() =>
  tab.value === 'ratio' ? !!ratioPreview.value : !!pxPreview.value
)

function openCustomEditor(anchor?: HTMLElement) {
  if (props.disabled) return
  activeAnchor.value = anchor ?? triggerRef.value
  // 依据当前值预填初始值
  const v = props.modelValue
  if (v) {
    const r = parseRatio(v)
    const p = parsePixels(normalizeSizeInput(v))
    if (p) {
      tab.value = 'pixels'
      pxW.value = p.w
      pxH.value = p.h
    } else if (r) {
      tab.value = 'ratio'
      ratioW.value = r.w
      ratioH.value = r.h
    } else if (isPresetValue(v)) {
      const preset = IMAGE_SIZE_PRESETS.find((pre) => pre.value === v)
      if (preset) {
        tab.value = 'ratio'
        ratioW.value = preset.ratio[0]
        ratioH.value = preset.ratio[1]
        const [pw, ph] = preset.pixels.split('x').map(Number)
        pxW.value = pw
        pxH.value = ph
      }
    }
  }
  positionPopover()
  popoverOpen.value = true
  nextTick(() => {
    positionPopover()
    window.addEventListener('mousedown', onOutsideClick, true)
    window.addEventListener('keydown', onKeydown, true)
    window.addEventListener('resize', positionPopover, true)
    window.addEventListener('scroll', positionPopover, true)
  })
}

function closePopover() {
  popoverOpen.value = false
  activeAnchor.value = null
  window.removeEventListener('mousedown', onOutsideClick, true)
  window.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('resize', positionPopover, true)
  window.removeEventListener('scroll', positionPopover, true)
}

function onOutsideClick(e: MouseEvent) {
  const pop = popoverRef.value
  const anchor = activeAnchor.value
  const t = e.target as Node | null
  if (!pop) return
  if (pop.contains(t)) return
  if (anchor && anchor.contains(t)) return
  closePopover()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    closePopover()
  } else if (e.key === 'Enter' && canConfirm.value) {
    e.preventDefault()
    onConfirm()
  }
}

function positionPopover() {
  // 以 activeAnchor 为准：grid 模式 = 自定义按钮；select 模式 = <select> 元素。
  const anchor = activeAnchor.value
  if (!anchor) {
    popoverStyle.value = {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)'
    }
    return
  }
  const rect = anchor.getBoundingClientRect()
  const popW = 260
  const popH = 180
  const margin = 8
  let left = rect.left
  let top = rect.bottom + margin
  if (left + popW > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - popW - margin)
  }
  if (top + popH > window.innerHeight - margin) {
    top = rect.top - popH - margin
  }
  popoverStyle.value = {
    top: `${Math.max(margin, top)}px`,
    left: `${Math.max(margin, left)}px`,
    transform: 'none'
  }
}

function onConfirm() {
  let val = ''
  if (tab.value === 'ratio' && ratioPreview.value) {
    val = `${ratioW.value}:${ratioH.value}`
  } else if (tab.value === 'pixels' && pxPreview.value) {
    // 采用 snap 后的值存储，避免用户看到的预览与实际不符
    val = pxPreview.value
  }
  if (!val) return
  emit('update:modelValue', val)
  closePopover()
}

onBeforeUnmount(() => {
  window.removeEventListener('mousedown', onOutsideClick, true)
  window.removeEventListener('keydown', onKeydown, true)
  window.removeEventListener('resize', positionPopover, true)
  window.removeEventListener('scroll', positionPopover, true)
})

</script>
