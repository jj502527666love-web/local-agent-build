<template>
  <div class="ask-user-card rounded-2xl rounded-bl-md border border-surface-3 bg-surface-0 shadow-card px-4 py-3">
    <div v-if="questions.length > 1" class="flex items-center gap-1 mb-2.5">
      <span
        v-for="(q, i) in questions"
        :key="q.id"
        :class="[
          'h-1 flex-1 rounded-full transition-colors',
          isAnswered || i < currentIndex
            ? 'bg-primary-500'
            : i === currentIndex
              ? 'bg-primary-400'
              : 'bg-surface-3'
        ]"
      ></span>
    </div>

    <template v-if="!isAnswered">
      <div v-if="questions.length > 1" class="text-[11px] text-text-tertiary mb-1">第 {{ currentIndex + 1 }} / {{ questions.length }} 题</div>
      <div class="text-sm text-text-primary font-medium mb-2.5 leading-relaxed">{{ current.question }}</div>

      <div class="flex flex-col gap-1.5">
        <button
          v-for="opt in current.options"
          :key="opt.id"
          type="button"
          @click="toggleOption(opt.id)"
          :class="[
            'w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors cursor-pointer hover:bg-surface-2',
            isSelectedCur(opt.id) ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-surface-3 text-text-secondary'
          ]"
        >
          <div class="flex items-start gap-2">
            <span
              :class="[
                'mt-0.5 flex-shrink-0 w-4 h-4 flex items-center justify-center border',
                current.allow_multiple ? 'rounded' : 'rounded-full',
                isSelectedCur(opt.id) ? 'border-primary-500 bg-primary-500' : 'border-surface-3'
              ]"
            >
              <svg v-if="isSelectedCur(opt.id)" class="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M4.5 12.75l6 6 9-13.5" /></svg>
            </span>
            <div class="min-w-0">
              <div class="font-medium leading-snug">{{ opt.label }}</div>
              <div v-if="opt.desc" class="text-[11px] text-text-tertiary leading-snug mt-0.5">{{ opt.desc }}</div>
            </div>
          </div>
        </button>
      </div>

      <textarea
        v-if="current.allow_free_input"
        v-model="curFreeText"
        rows="2"
        placeholder="可补充说明（可选）"
        class="mt-2 w-full px-3 py-2 text-sm rounded-lg border border-surface-3 bg-surface-0 text-text-primary resize-y focus:outline-none focus:ring-1 focus:ring-primary-400"
      ></textarea>

      <div class="mt-2.5 flex items-center justify-between gap-2">
        <button
          v-if="currentIndex > 0"
          type="button"
          @click="prev"
          class="px-3 py-1.5 text-xs rounded-lg border border-surface-3 text-text-secondary hover:bg-surface-2 transition-colors"
        >上一步</button>
        <span v-else></span>

        <div class="flex items-center gap-2">
          <span v-if="current.allow_multiple" class="text-[11px] text-text-tertiary">可多选</span>
          <button
            v-if="!isLast"
            type="button"
            :disabled="!curAnswered"
            @click="next"
            class="px-3.5 py-1.5 text-xs rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >下一步</button>
          <button
            v-else
            type="button"
            :disabled="!allAnswered"
            @click="finish"
            class="px-3.5 py-1.5 text-xs rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >完成</button>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="text-[11px] text-text-tertiary mb-2">
        <span v-if="card.status === 'canceled'">已取消</span>
        <span v-else-if="card.status === 'expired'">已超时</span>
        <span v-else>已完成</span>
      </div>
      <div class="flex flex-col gap-2.5">
        <div v-for="q in questions" :key="q.id">
          <div class="text-sm text-text-primary font-medium mb-1 leading-snug">{{ q.question }}</div>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="opt in selectedOptionsOf(q)"
              :key="opt.id"
              class="px-2 py-0.5 rounded-md bg-primary-50 text-primary-700 text-xs border border-primary-200"
            >{{ opt.label }}</span>
            <span v-if="!selectedOptionsOf(q).length && !freeTextOf(q)" class="text-xs text-text-tertiary">（未选）</span>
          </div>
          <div v-if="freeTextOf(q)" class="text-[11px] text-text-secondary mt-1">补充：{{ freeTextOf(q) }}</div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { MessageCard, MessageCardQuestion } from '@/stores/chat'

const props = defineProps<{ card: MessageCard }>()
const emit = defineEmits<{
  (e: 'submit', payload: { answers: Record<string, { selected: string[]; free_text?: string }> }): void
}>()

// 规范化 questions（兼容旧版单题 card：question + options）
const questions = computed<MessageCardQuestion[]>(() => {
  const c: any = props.card
  if (Array.isArray(c.questions) && c.questions.length) return c.questions
  if (c.question && Array.isArray(c.options)) {
    return [{ id: 'q0', question: c.question, options: c.options, allow_multiple: c.allow_multiple, allow_free_input: c.allow_free_input }]
  }
  return []
})

const submitted = ref(false)
const isAnswered = computed(() => props.card.status !== 'pending' || submitted.value)

// 本地答案累积（留痕态用 card.answers / 旧 card.selected 回填）
function initAnswers(): Record<string, { selected: string[]; free_text: string }> {
  const c: any = props.card
  const out: Record<string, { selected: string[]; free_text: string }> = {}
  for (const q of questions.value) {
    const a = c.answers?.[q.id]
    out[q.id] = { selected: a?.selected ? [...a.selected] : [], free_text: a?.free_text || '' }
  }
  // 兼容旧单题留痕
  if (!c.answers && Array.isArray(c.selected) && questions.value[0]) {
    out[questions.value[0].id] = { selected: [...c.selected], free_text: c.free_text || '' }
  }
  return out
}
const localAnswers = ref<Record<string, { selected: string[]; free_text: string }>>(initAnswers())
const currentIndex = ref(0)

const current = computed<MessageCardQuestion>(
  () => questions.value[currentIndex.value] || ({ id: '', question: '', options: [] } as MessageCardQuestion)
)
const isLast = computed(() => currentIndex.value >= questions.value.length - 1)

const curFreeText = computed<string>({
  get: () => localAnswers.value[current.value.id]?.free_text || '',
  set: (v: string) => { ensure(current.value.id).free_text = v }
})

function ensure(qid: string): { selected: string[]; free_text: string } {
  if (!localAnswers.value[qid]) localAnswers.value[qid] = { selected: [], free_text: '' }
  return localAnswers.value[qid]
}
function isSelectedCur(oid: string): boolean {
  return (localAnswers.value[current.value.id]?.selected || []).includes(oid)
}
function questionAnswered(q: MessageCardQuestion): boolean {
  const a = localAnswers.value[q.id]
  if (!a) return false
  return a.selected.length > 0 || (!!q.allow_free_input && !!a.free_text.trim())
}
const curAnswered = computed(() => questionAnswered(current.value))
const allAnswered = computed(() => questions.value.every(questionAnswered))

function toggleOption(oid: string): void {
  if (isAnswered.value) return
  const q = current.value
  const a = ensure(q.id)
  if (q.allow_multiple) {
    a.selected = a.selected.includes(oid) ? a.selected.filter((x) => x !== oid) : [...a.selected, oid]
  } else {
    a.selected = [oid]
    // 单选 + 无自由输入且非末题：自动进入下一题。
    // 末题始终保留「完成」按钮，由用户点击确认提交（符合"末尾有确定按钮"的预期，也避免自动提交带来的歧义）。
    if (!q.allow_free_input && !isLast.value) currentIndex.value++
  }
}

function prev(): void {
  if (currentIndex.value > 0) currentIndex.value--
}
function next(): void {
  if (!isAnswered.value && curAnswered.value && !isLast.value) currentIndex.value++
}
function finish(): void {
  if (isAnswered.value) return
  for (const q of questions.value) if (!questionAnswered(q)) return
  submitted.value = true
  const answers: Record<string, { selected: string[]; free_text?: string }> = {}
  for (const q of questions.value) {
    const a = localAnswers.value[q.id] || { selected: [], free_text: '' }
    answers[q.id] = { selected: [...a.selected], free_text: a.free_text.trim() || undefined }
  }
  emit('submit', { answers })
}

function selectedOptionsOf(q: MessageCardQuestion): MessageCardQuestion['options'] {
  const ids = localAnswers.value[q.id]?.selected || []
  return q.options.filter((o) => ids.includes(o.id))
}
function freeTextOf(q: MessageCardQuestion): string {
  return localAnswers.value[q.id]?.free_text || ''
}
</script>
