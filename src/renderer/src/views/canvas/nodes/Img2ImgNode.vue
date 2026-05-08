<template>
  <div class="canvas-node canvas-node-wide" :style="{ borderColor: '#ef4444' }" :data-status="data.status">
    <div class="node-header" style="background: #fef2f2; color: #b91c1c;">
      <span class="node-type-dot" style="background: #ef4444;"></span>
      图生图
      <span class="text-[10px] font-normal opacity-60 ml-1">#{{ data.nodeIndex }}</span>
      <button @click="deleteNode" :disabled="data.locked" class="node-delete-btn">
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
    <div class="node-body">
      <div class="mb-2">
        <label class="node-label">尺寸</label>
        <ImageSizePicker
          v-model="size"
          size="sm"
          accent="red"
          :columns="6"
          :disabled="data.locked"
          :model-id="projectImageModelId"
          :tier-id="tier"
        />
      </div>
      <div class="mb-2">
        <label class="node-label">分辨率</label>
        <ResolutionTierPicker
          v-model="tier"
          size="sm"
          :model-id="projectImageModelId"
          :disabled="data.locked"
        />
      </div>
      <!-- Optional prompt -->
      <div class="mb-2">
        <label class="node-label">提示词 (可选)</label>
        <textarea v-model="prompt" @change="savePrompt" placeholder="描述变化方向..." rows="2" class="node-textarea nodrag nopan" :disabled="data.locked"></textarea>
      </div>
      <!-- Status & Result -->
      <div v-if="data.status === 'running'" class="flex items-center gap-1.5 text-[10px] text-amber-600 mb-2">
        <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
        生成中...
      </div>
      <div v-if="data.status === 'error'" class="text-[10px] text-red-500 mb-2 break-words">{{ data.error }}</div>
      <div v-if="data.status === 'done' && data.ref_image_count" class="text-[10px] text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 mb-2 inline-flex items-center gap-1">
        <svg class="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>
        已使用 {{ data.ref_image_count }} 张参考图
      </div>
      <div v-if="data.result_path" class="mb-2">
        <img :src="getImageSrc(data.result_path)" class="w-full rounded-lg border border-surface-3" @click="previewImage" />
      </div>
      <button
        @click="runGenerate"
        :disabled="data.status === 'running' || data.locked"
        class="w-full py-1.5 text-[10px] font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-40 transition-colors"
      >
        生成
      </button>
    </div>
    <Handle type="target" :position="Position.Left" id="image-input" class="handle-image" style="top: 35%;" />
    <Handle type="target" :position="Position.Left" id="text-input" class="handle-text" style="top: 65%;" />
    <Handle
      type="source"
      :position="Position.Right"
      id="output"
      class="handle-image"
      @click="(e: MouseEvent) => onHandleClick?.(e, data.nodeId, 'output', 'image')"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, inject, watch, computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { useCanvasStore } from '@/stores/canvas'
import { useWorkflowEngine } from '../composables/useWorkflowEngine'
import ImageSizePicker from '@/components/ImageSizePicker.vue'
import ResolutionTierPicker from '@/components/ResolutionTierPicker.vue'
import { DEFAULT_TIER_ID } from '@shared/image-size'

type HandleClickHandler = (e: MouseEvent, nodeId: string, handleId: string, dataType: 'text' | 'image') => void

const props = defineProps<{ data: Record<string, any> }>()
const canvasStore = useCanvasStore()
const { executeSingleNode } = useWorkflowEngine()
const api = () => (window as any).api
const onHandleClick = inject<HandleClickHandler | null>('onHandleClick', null)

const size = ref(props.data.size || '1:1')
const tier = ref<string>(props.data.tier_id || DEFAULT_TIER_ID)
const prompt = ref(props.data.prompt || '')

// v-model driven: persist whenever the user picks a preset or confirms a custom value.
watch([size, tier], () => saveData())

function saveData() {
  if (!props.data.nodeId) return
  canvasStore.updateNode(props.data.nodeId, {
    data: { ...props.data, size: size.value, tier_id: tier.value, prompt: prompt.value }
  })
}

/** 节点展示用：从 canvas 当前项目拿生图模型 id，用于 ImageSizePicker/ResolutionTierPicker 能力域 */
const projectImageModelId = computed(() => canvasStore.currentProject?.image_model_id || '')

function savePrompt() {
  saveData()
}

function getImageSrc(path: string): string {
  if (!path) return ''
  if (path.startsWith('data:') || path.startsWith('http')) return path
  const isAbsolute = /^[A-Za-z]:|^\//.test(path)
  const param = isAbsolute ? 'p' : 'rel'
  return 'local-file://img?' + param + '=' + encodeURIComponent(path)
}

function previewImage() {
  if (props.data.result_path) {
    api().shell.showItemInFolder(props.data.result_path)
  }
}

async function runGenerate() {
  if (!props.data.nodeId || !props.data.projectId) return
  await executeSingleNode(props.data.nodeId, props.data.projectId)
}

function deleteNode() {
  if (!props.data.nodeId) return
  canvasStore.removeNode(props.data.nodeId)
}

</script>
