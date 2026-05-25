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
    <div v-if="dialogOpen" class="fixed inset-0 z-[9200] flex items-center justify-center p-6 pointer-events-none">
      <div class="pointer-events-auto w-full max-w-4xl max-h-[88vh] rounded-2xl border border-surface-3 bg-surface-0 shadow-2xl flex flex-col overflow-hidden">
        <div class="flex items-center justify-between gap-3 border-b border-surface-3 px-5 py-3">
          <div class="min-w-0">
            <h3 class="text-sm font-semibold text-text-primary truncate">{{ dialogTitle }}</h3>
            <p class="mt-0.5 text-[11px] text-text-tertiary">大输入框编辑，{{ saveShortcutLabel }} 保存</p>
          </div>
          <button type="button" class="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary" @click="cancelDialog">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div class="flex-1 min-h-0 p-5">
          <textarea
            ref="dialogTextareaRef"
            v-model="draft"
            :placeholder="placeholder"
            :maxlength="hardLimit ? maxLength : undefined"
            class="h-[56vh] min-h-[320px] w-full resize-none rounded-xl border border-surface-3 bg-surface-1 px-4 py-3 text-sm leading-relaxed text-text-primary outline-none transition-colors placeholder:text-text-disabled focus:border-primary-400 focus:ring-2 focus:ring-primary-500"
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
            <button type="button" class="rounded-lg border border-surface-3 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-2" @click="cancelDialog">取消</button>
            <button type="button" :disabled="draftOverLimit" class="rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50" @click="confirmDialog">保存</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'

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
  showCount: true
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'change'): void
  (e: 'submit'): void
  (e: 'paste', event: ClipboardEvent): void
}>()

const previewTextareaRef = ref<HTMLTextAreaElement | null>(null)
const dialogTextareaRef = ref<HTMLTextAreaElement | null>(null)
const dialogOpen = ref(false)
const draft = ref('')

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

function openDialog() {
  if (props.disabled) return
  draft.value = props.modelValue || ''
  dialogOpen.value = true
  nextTick(() => dialogTextareaRef.value?.focus())
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

defineExpose({ focus, openDialog })
</script>
