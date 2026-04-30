<template>
  <div class="canvas-node canvas-node-wide" :style="{ borderColor: '#f59e0b' }" :data-status="data.status">
    <div class="node-header" style="background: #fffbeb; color: #b45309;">
      <span class="node-type-dot" style="background: #f59e0b;"></span>
      文生图
      <button @click="deleteNode" :disabled="data.locked" class="node-delete-btn">
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
    <div class="node-body">
      <div class="mb-2">
        <label class="node-label">尺寸</label>
        <div class="flex gap-1 flex-wrap">
          <button
            v-for="s in sizes"
            :key="s"
            @click="size = s; saveData()"
            :disabled="data.locked"
            class="px-2 py-0.5 text-[10px] rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            :class="size === s ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-surface-3 text-text-tertiary hover:bg-surface-2'"
          >{{ s }}</button>
        </div>
      </div>
      <!-- Status & Result -->
      <div v-if="data.status === 'running'" class="flex items-center gap-1.5 text-[10px] text-amber-600 mb-2">
        <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
        生成中...
      </div>
      <div v-if="data.status === 'error'" class="text-[10px] text-red-500 mb-2 break-words">{{ data.error }}</div>
      <div v-if="data.result_path" class="mb-2">
        <img :src="getImageSrc(data.result_path)" class="w-full rounded-lg border border-surface-3" @click="previewImage" />
      </div>
      <button
        @click="runGenerate"
        :disabled="data.status === 'running' || data.locked"
        class="w-full py-1.5 text-[10px] font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-40 transition-colors"
      >
        生成
      </button>
    </div>
    <Handle type="target" :position="Position.Left" id="text-input" class="handle-text" style="top: 35%;" />
    <Handle type="target" :position="Position.Left" id="image-input" class="handle-image" style="top: 65%;" />
    <Handle type="source" :position="Position.Right" id="output" class="handle-image" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { useCanvasStore } from '@/stores/canvas'
import { useWorkflowEngine } from '../composables/useWorkflowEngine'

const props = defineProps<{ data: Record<string, any> }>()
const canvasStore = useCanvasStore()
const { executeSingleNode } = useWorkflowEngine()
const api = () => (window as any).api

const size = ref(props.data.size || '1:1')
const sizes = ['1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '16:9', '9:16', '21:9']

function saveData() {
  if (!props.data.nodeId) return
  canvasStore.updateNode(props.data.nodeId, {
    data: { ...props.data, size: size.value }
  })
}

function getImageSrc(path: string): string {
  if (!path) return ''
  if (path.startsWith('data:') || path.startsWith('http')) return path
  const isAbsolute = /^[A-Za-z]:|^\//.test(path)
  const param = isAbsolute ? 'p' : 'rel'
  return 'local-file://img?' + param + '=' + encodeURIComponent(path)
}

function previewImage() {
  // Could open in a modal, for now just open externally
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
