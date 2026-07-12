<template>
  <div class="canvas-node" :style="{ borderColor: '#0284c7' }" :data-status="data.status">
    <div class="node-header" style="background: #e0f2fe; color: #075985;">
      <span class="node-type-dot" style="background: #0284c7;"></span>
      智能体
      <span class="text-[10px] font-normal opacity-60 ml-1">#{{ data.nodeIndex }}</span>
      <button @click="deleteNode" :disabled="data.locked" class="node-delete-btn">
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
    <div class="node-body">
      <!-- 对话模型（折叠）：留空走画布默认文本模型 -->
      <div class="mb-2">
        <button
          @click.stop="showModel = !showModel"
          :disabled="data.locked"
          class="w-full flex items-center justify-between gap-1.5 px-1 py-0.5 text-[10px] text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-50"
        >
          <span class="flex items-center gap-1">
            <svg class="w-2.5 h-2.5 transition-transform" :class="{ 'rotate-90': showModel }" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
            对话模型
          </span>
          <span class="text-[9px] opacity-70">{{ modelStatusLabel }}</span>
        </button>
        <div v-if="showModel" class="mt-1.5 space-y-1.5">
          <select v-model="providerModel" @change="onProviderChange" :disabled="data.locked" class="node-textarea nodrag w-full text-[11px]">
            <option value="">使用画布默认</option>
            <option v-for="p in modelStore.providers" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <select v-if="providerModel" v-model="modelModel" @change="saveModel" :disabled="data.locked" class="node-textarea nodrag w-full text-[11px]">
            <option value="">-- 选择模型 --</option>
            <optgroup v-if="modelOptions.recommended.length" label="推荐（对话）">
              <option v-for="m in modelOptions.recommended" :key="m" :value="m">{{ modelStore.optionLabel(providerModel, m) }}</option>
            </optgroup>
            <optgroup v-if="modelOptions.others.length" label="其他可用">
              <option v-for="m in modelOptions.others" :key="m" :value="m">{{ modelStore.optionLabel(providerModel, m) }}</option>
            </optgroup>
          </select>
        </div>
      </div>

      <!-- 人设 / 系统提示词（折叠） -->
      <div class="mb-2">
        <button
          @click.stop="showSystemPrompt = !showSystemPrompt"
          :disabled="data.locked"
          class="w-full flex items-center justify-between gap-1.5 px-1 py-0.5 text-[10px] text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-50"
        >
          <span class="flex items-center gap-1">
            <svg class="w-2.5 h-2.5 transition-transform" :class="{ 'rotate-90': showSystemPrompt }" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
            人设
          </span>
          <span class="text-[9px] opacity-70">{{ systemPromptStatusLabel }}</span>
        </button>
        <div v-if="showSystemPrompt" class="mt-1.5">
          <PromptTextarea
            v-model="systemPromptModel"
            @change="saveSystemPrompt"
            title="编辑智能体人设 / 系统提示词"
            :height="88"
            placeholder="设定智能体的角色与行为。留空则按输入自由响应。"
            container-class="nodrag nopan"
            input-class="text-[11px]"
            :disabled="data.locked"
          />
        </div>
      </div>

      <!-- 本地知识库（折叠，多选） -->
      <div class="mb-2">
        <button
          @click.stop="showKb = !showKb"
          :disabled="data.locked"
          class="w-full flex items-center justify-between gap-1.5 px-1 py-0.5 text-[10px] text-text-tertiary hover:text-text-secondary transition-colors disabled:opacity-50"
        >
          <span class="flex items-center gap-1">
            <svg class="w-2.5 h-2.5 transition-transform" :class="{ 'rotate-90': showKb }" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
            知识库
          </span>
          <span class="text-[9px] opacity-70">{{ kbStatusLabel }}</span>
        </button>
        <div v-if="showKb" class="mt-1.5 space-y-1 max-h-28 overflow-y-auto nodrag">
          <p v-if="!categories.length" class="text-[9px] text-text-disabled px-1">暂无本地知识库分类，可在「知识库」页创建。</p>
          <label v-for="cat in categories" :key="cat.id" class="flex items-center gap-1.5 text-[10px] text-text-secondary px-1 cursor-pointer">
            <input type="checkbox" :checked="isKbChecked(cat.id)" @change="toggleKb(cat.id)" :disabled="data.locked" class="rounded" />
            <span class="truncate">{{ cat.name }}</span>
          </label>
        </div>
      </div>

      <div v-if="data.status === 'running'" class="flex items-center gap-1.5 text-[10px] text-amber-600 mb-2">
        <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
        智能体思考中...
      </div>
      <div v-if="data.status === 'error'" class="text-[10px] text-red-500 mb-2 break-words">{{ data.error }}</div>
      <div v-if="data.result" class="text-[10px] text-text-secondary mb-2 p-2 bg-surface-2 rounded-lg max-h-24 overflow-y-auto break-words">{{ data.result }}</div>
      <button
        @click="runAgent"
        :disabled="data.status === 'running' || data.locked"
        class="w-full py-1.5 text-[10px] font-medium bg-sky-600 text-white rounded-lg hover:bg-sky-700 disabled:opacity-40 transition-colors"
      >
        运行智能体
      </button>
    </div>
    <Handle type="target" :position="Position.Left" id="input" class="handle-text" />
    <Handle
      type="source"
      :position="Position.Right"
      id="output"
      class="handle-text"
      @click="(e: MouseEvent) => onHandleClick?.(e, data.nodeId, 'output', 'text')"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, watch, onMounted } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { useCanvasStore } from '@/stores/canvas'
import { useModelStore } from '@/stores/models'
import { useKnowledgeStore } from '@/stores/knowledge'
import { useWorkflowEngine } from '../composables/useWorkflowEngine'
import { groupAndSort } from '@/utils/model-caps'
import { getHintsSync } from '@/utils/model-usage-hints'
import PromptTextarea from '@/components/PromptTextarea.vue'

type HandleClickHandler = (e: MouseEvent, nodeId: string, handleId: string, dataType: 'text' | 'image') => void

const props = defineProps<{ data: Record<string, any> }>()
const canvasStore = useCanvasStore()
const modelStore = useModelStore()
const knowledgeStore = useKnowledgeStore()
const { executeSingleNode } = useWorkflowEngine()
const onHandleClick = inject<HandleClickHandler | null>('onHandleClick', null)

const showModel = ref(false)
const showSystemPrompt = ref(false)
const showKb = ref(false)

// 节点字段本地镜像（Vue Flow 节点 props 可能整体替换，用 ref + watch 同步更稳）
const providerModel = ref<string>(props.data.text_provider_id || '')
const modelModel = ref<string>(props.data.text_model_id || '')
const systemPromptModel = ref<string>(props.data.system_prompt ?? '')

watch(() => props.data.text_provider_id, (v) => { providerModel.value = v || '' })
watch(() => props.data.text_model_id, (v) => { modelModel.value = v || '' })
watch(() => props.data.system_prompt, (v) => { systemPromptModel.value = v ?? '' })

const categories = computed(() => knowledgeStore.categories)
onMounted(() => { if (!knowledgeStore.categories.length) knowledgeStore.fetchCategories() })

const currentProvider = computed(() => modelStore.providers.find((p) => p.id === providerModel.value) || null)
const modelOptions = computed(() => {
  if (!currentProvider.value) return { recommended: [] as string[], others: [] as string[] }
  return groupAndSort(currentProvider.value.models, 'chat', {
    cloudTypeOf: (mid: string) => modelStore.cloudTypeOf(currentProvider.value!.id, mid),
    usageHints: getHintsSync('chat', currentProvider.value.id)
  })
})

const modelStatusLabel = computed(() => {
  if (!providerModel.value) return '画布默认'
  if (!modelModel.value) return '未选模型'
  return '已自定义'
})
const systemPromptStatusLabel = computed(() => {
  const v = props.data.system_prompt
  return v === undefined || v === '' ? '未设置' : '已设置'
})
const kbStatusLabel = computed(() => {
  const n = Array.isArray(props.data.kb_category_ids) ? props.data.kb_category_ids.length : 0
  return n > 0 ? `${n} 个` : '未选'
})

function persist(patch: Record<string, any>): void {
  if (!props.data.nodeId) return
  canvasStore.updateNode(props.data.nodeId, { data: { ...props.data, ...patch } })
}
function onProviderChange(): void {
  modelModel.value = ''
  persist({ text_provider_id: providerModel.value, text_model_id: '' })
}
function saveModel(): void {
  persist({ text_model_id: modelModel.value })
}
function saveSystemPrompt(): void {
  persist({ system_prompt: systemPromptModel.value })
}
function isKbChecked(catId: string): boolean {
  return Array.isArray(props.data.kb_category_ids) && props.data.kb_category_ids.includes(catId)
}
function toggleKb(catId: string): void {
  const cur: string[] = Array.isArray(props.data.kb_category_ids) ? props.data.kb_category_ids : []
  const next = cur.includes(catId) ? cur.filter((id) => id !== catId) : [...cur, catId]
  persist({ kb_category_ids: next })
}
async function runAgent(): Promise<void> {
  if (!props.data.nodeId || !props.data.projectId) return
  await executeSingleNode(props.data.nodeId, props.data.projectId)
}
function deleteNode(): void {
  if (!props.data.nodeId) return
  canvasStore.removeNode(props.data.nodeId)
}
</script>
