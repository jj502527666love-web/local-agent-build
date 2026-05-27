<template>
  <div :class="['space-y-1.5', containerClass]">
    <div
      :class="[
        'relative rounded-lg border bg-surface-1 transition-colors',
        disabled ? 'opacity-60 cursor-not-allowed' : (inlineEdit ? 'cursor-text hover:border-primary-300' : 'cursor-pointer hover:border-primary-300'),
        isOverLimit ? 'border-red-400' : 'border-surface-3 focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent'
      ]"
      @click="handleContainerClick"
    >
      <textarea
        ref="previewTextareaRef"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="!inlineEdit"
        :maxlength="hardLimit ? maxLength : undefined"
        :style="{ height: normalizedHeight }"
        :class="[
          'block w-full resize-none rounded-lg bg-transparent px-3 py-2 pr-16 text-xs text-text-primary outline-none placeholder:text-text-disabled',
          inlineEdit ? 'cursor-text' : 'cursor-pointer',
          inputClass
        ]"
        @input="handlePreviewInput"
        @keydown.enter.exact="handlePreviewEnter"
        @focus="handlePreviewFocus"
        @click.stop="handlePreviewClick"
        @blur="emitBlur"
        @paste="emitPaste"
      ></textarea>
      <button
        type="button"
        :disabled="disabled"
        class="absolute right-2 top-2 rounded-md border border-surface-3 bg-surface-0 px-2 py-1 text-[10px] font-medium text-text-tertiary shadow-sm transition-colors hover:border-primary-300 hover:text-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
        @click.stop="openDialog"
      >展开</button>
      <div v-if="showCount" class="pointer-events-none absolute bottom-1.5 right-2 text-[10px]" :class="isOverLimit ? 'text-red-500' : 'text-text-disabled'">
        {{ countText }}
      </div>
    </div>
    <p v-if="hint" class="text-[10px] text-text-tertiary leading-relaxed">{{ hint }}</p>
    <p v-if="isOverLimit" class="text-[10px] text-red-500 leading-relaxed">{{ limitMessage }}</p>
  </div>

  <Teleport to="body">
    <div v-if="dialogOpen" class="fixed inset-0 z-[9200] pointer-events-none">
      <div
        ref="dialogPanelRef"
        class="prompt-textarea-dialog pointer-events-auto fixed rounded-2xl border border-surface-3 bg-surface-0 shadow-2xl flex flex-col overflow-hidden"
        :style="dialogPanelStyle"
        @click.stop
        @pointerdown.stop
      >
        <div class="flex cursor-move select-none items-center justify-between gap-3 border-b border-surface-3 px-5 py-3" @pointerdown="startDialogDrag">
          <div class="min-w-0">
            <h3 class="text-sm font-semibold text-text-primary truncate">{{ dialogTitle }}</h3>
            <p class="mt-0.5 text-[11px] text-text-tertiary">大输入框编辑，{{ saveShortcutLabel }} 保存</p>
          </div>
          <button type="button" class="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary" @pointerdown.stop @click="cancelDialog">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div class="flex-1 min-h-0 p-5">
          <textarea
            ref="dialogTextareaRef"
            v-model="draft"
            :placeholder="placeholder"
            :maxlength="hardLimit ? maxLength : undefined"
            class="h-full min-h-0 w-full resize-none rounded-xl border border-surface-3 bg-surface-1 px-4 py-3 text-sm leading-relaxed text-text-primary outline-none transition-colors placeholder:text-text-disabled focus:border-primary-400 focus:ring-2 focus:ring-primary-500"
            @input="handleDialogInput"
            @blur="emitBlur"
            @keydown.ctrl.enter.prevent="confirmDialog"
            @keydown.meta.enter.prevent="confirmDialog"
            @keydown.enter.exact="handleEnter"
            @paste="emitPaste"
          ></textarea>
        </div>
        <div class="flex items-center justify-between gap-3 border-t border-surface-3 px-5 py-3">
          <div class="text-xs" :class="draftOverLimit ? 'text-red-500' : 'text-text-tertiary'">
            {{ draftCountText }}<span v-if="draftOverLimit">，请删减后保存</span>
          </div>
          <div class="flex items-center gap-2">
            <button type="button" class="rounded-lg border border-surface-3 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-2" @click="cancelDialog">{{ dialogLiveEdit ? '关闭' : '取消' }}</button>
            <button type="button" :disabled="draftOverLimit" class="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50" @click="confirmDialog">保存</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, type CSSProperties } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  title?: string
  height?: string | number
  maxLength?: number
  hardLimit?: boolean
  disabled?: boolean
  hint?: string
  inputClass?: string
  containerClass?: string
  submitOnEnter?: boolean
  inlineEdit?: boolean
  showCount?: boolean
  changeOnInput?: boolean
  dialogLiveEdit?: boolean
}>(), {
  modelValue: '',
  placeholder: '',
  title: '编辑提示词',
  height: 120,
  hardLimit: false,
  disabled: false,
  hint: '',
  inputClass: '',
  containerClass: '',
  submitOnEnter: false,
  inlineEdit: false,
  showCount: true,
  changeOnInput: false,
  dialogLiveEdit: false
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'change'): void
  (e: 'submit'): void
  (e: 'blur'): void
  (e: 'paste', event: ClipboardEvent): void
}>()

const previewTextareaRef = ref<HTMLTextAreaElement | null>(null)
const dialogTextareaRef = ref<HTMLTextAreaElement | null>(null)
const dialogPanelRef = ref<HTMLDivElement | null>(null)
const dialogOpen = ref(false)
const draft = ref('')
const dialogPosition = ref({ x: 0, y: 0 })
const dialogSize = ref({ width: 582, height: 540 })

const normalizedHeight = computed(() => typeof props.height === 'number' ? `${props.height}px` : props.height)
const length = computed(() => String(props.modelValue || '').length)
const isOverLimit = computed(() => Boolean(props.maxLength && length.value > props.maxLength))
const countText = computed(() => props.maxLength ? `${length.value}/${props.maxLength}` : `${length.value}`)
const draftLength = computed(() => String(draft.value || '').length)
const draftOverLimit = computed(() => Boolean(props.maxLength && draftLength.value > props.maxLength))
const draftCountText = computed(() => props.maxLength ? `${draftLength.value}/${props.maxLength}` : `${draftLength.value} 字`)
const limitMessage = computed(() => props.maxLength ? `最多 ${props.maxLength} 字，当前 ${length.value} 字` : '')
const dialogTitle = computed(() => props.title || '编辑提示词')
const saveShortcutLabel = computed(() => navigator.platform.toLowerCase().includes('mac') ? '⌘ + Enter' : 'Ctrl + Enter')
const dialogPanelStyle = computed<CSSProperties>(() => ({
  left: `${dialogPosition.value.x}px`,
  top: `${dialogPosition.value.y}px`,
  width: `${dialogSize.value.width}px`,
  height: `${dialogSize.value.height}px`,
  minWidth: '360px',
  minHeight: '320px',
  maxWidth: 'calc(100vw - 48px)',
  maxHeight: 'calc(100vh - 48px)',
  resize: 'both',
  overflow: 'hidden'
}))

let dragState: { startClientX: number; startClientY: number; startX: number; startY: number } | null = null

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function resetDialogLayout() {
  const baseWidth = Math.round(896 * 0.65)
  const width = clamp(baseWidth, 360, window.innerWidth - 48)
  const height = clamp(Math.round(window.innerHeight * 0.7), 420, window.innerHeight - 48)
  dialogSize.value = { width, height }
  dialogPosition.value = {
    x: Math.round((window.innerWidth - width) / 2),
    y: Math.round((window.innerHeight - height) / 2)
  }
}

function openDialog() {
  if (props.disabled) return
  draft.value = props.modelValue || ''
  resetDialogLayout()
  dialogOpen.value = true
  nextTick(() => dialogTextareaRef.value?.focus())
}

function startDialogDrag(event: PointerEvent) {
  if (event.button !== 0) return
  const target = event.target as HTMLElement
  if (target.closest('button, textarea, input, select')) return
  const rect = dialogPanelRef.value?.getBoundingClientRect()
  if (rect) {
    dialogSize.value = {
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    }
  }
  dragState = {
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: dialogPosition.value.x,
    startY: dialogPosition.value.y
  }
  document.addEventListener('pointermove', onDialogDragMove)
  document.addEventListener('pointerup', stopDialogDrag)
}

function onDialogDragMove(event: PointerEvent) {
  if (!dragState) return
  const rect = dialogPanelRef.value?.getBoundingClientRect()
  const width = rect?.width || dialogSize.value.width
  const height = rect?.height || dialogSize.value.height
  dialogPosition.value = {
    x: clamp(dragState.startX + event.clientX - dragState.startClientX, 8, window.innerWidth - Math.min(width, 80)),
    y: clamp(dragState.startY + event.clientY - dragState.startClientY, 8, window.innerHeight - Math.min(height, 48))
  }
}

function stopDialogDrag() {
  dragState = null
  document.removeEventListener('pointermove', onDialogDragMove)
  document.removeEventListener('pointerup', stopDialogDrag)
}

function handleContainerClick() {
  if (props.inlineEdit) {
    nextTick(() => previewTextareaRef.value?.focus())
    return
  }
  openDialog()
}

function handlePreviewClick() {
  if (!props.inlineEdit) openDialog()
}

function handlePreviewFocus() {
  if (!props.inlineEdit) openDialog()
}

function handlePreviewInput(event: Event) {
  if (!props.inlineEdit) return
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
  if (props.changeOnInput) emit('change')
}

function handleDialogInput() {
  if (!props.dialogLiveEdit) return
  emit('update:modelValue', draft.value)
  if (props.changeOnInput) emit('change')
}

function emitBlur() {
  emit('blur')
}

function handlePreviewEnter(event: KeyboardEvent) {
  if (!props.inlineEdit || !props.submitOnEnter || event.isComposing) return
  event.preventDefault()
  if (isOverLimit.value) return
  emit('submit')
}

function cancelDialog() {
  dialogOpen.value = false
}

function confirmDialog() {
  if (draftOverLimit.value) return
  emit('update:modelValue', draft.value)
  emit('change')
  dialogOpen.value = false
}

function handleEnter(event: KeyboardEvent) {
  if (!props.submitOnEnter || event.isComposing) return
  event.preventDefault()
  if (draftOverLimit.value) return
  emit('update:modelValue', draft.value)
  emit('change')
  dialogOpen.value = false
  emit('submit')
}

function emitPaste(event: ClipboardEvent) {
  emit('paste', event)
}

function focus() {
  if (props.disabled) return
  previewTextareaRef.value?.focus()
}

function containsDialogTarget(target: EventTarget | null): boolean {
  return Boolean(target instanceof Node && dialogPanelRef.value?.contains(target))
}

onBeforeUnmount(() => {
  stopDialogDrag()
})

defineExpose({ focus, openDialog, containsDialogTarget })
</script>
