<template>
  <div class="canvas-node" :style="{ borderColor: '#8b5cf6' }" :data-status="data.status">
    <div class="node-header" style="background: #f5f3ff; color: #6d28d9;">
      <span class="node-type-dot" style="background: #8b5cf6;"></span>
      AI 文本
      <button @click="deleteNode" :disabled="data.locked" class="node-delete-btn">
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
    <div class="node-body">
      <div v-if="data.status === 'running'" class="flex items-center gap-1.5 text-[10px] text-amber-600 mb-2">
        <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
        AI 润色中...
      </div>
      <div v-if="data.status === 'error'" class="text-[10px] text-red-500 mb-2 break-words">{{ data.error }}</div>
      <div v-if="data.result" class="text-[10px] text-text-secondary mb-2 p-2 bg-surface-2 rounded-lg max-h-24 overflow-y-auto break-words">{{ data.result }}</div>
      <button
        @click="runAiText"
        :disabled="data.status === 'running' || data.locked"
        class="w-full py-1.5 text-[10px] font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-40 transition-colors"
      >
        AI 润色
      </button>
    </div>
    <Handle type="target" :position="Position.Left" id="input" class="handle-text" />
    <Handle type="source" :position="Position.Right" id="output" class="handle-text" />
  </div>
</template>

<script setup lang="ts">
import { Handle, Position } from '@vue-flow/core'
import { useCanvasStore } from '@/stores/canvas'
import { useWorkflowEngine } from '../composables/useWorkflowEngine'

const props = defineProps<{ data: Record<string, any> }>()
const canvasStore = useCanvasStore()
const { executeSingleNode } = useWorkflowEngine()

async function runAiText() {
  if (!props.data.nodeId || !props.data.projectId) return
  await executeSingleNode(props.data.nodeId, props.data.projectId)
}

function deleteNode() {
  if (!props.data.nodeId) return
  canvasStore.removeNode(props.data.nodeId)
}
</script>
