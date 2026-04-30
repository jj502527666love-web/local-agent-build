<template>
  <div class="canvas-node" :style="{ borderColor: '#10b981' }">
    <div class="node-header" style="background: #ecfdf5; color: #047857;">
      <span class="node-type-dot" style="background: #10b981;"></span>
      参考图
      <button @click="deleteNode" :disabled="data.locked" class="node-delete-btn">
        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
    <div class="node-body">
      <div v-if="imagePreview" class="mb-2">
        <img :src="imagePreview" class="w-full rounded-lg border border-surface-3" />
      </div>
      <div v-else class="mb-2 p-4 border-2 border-dashed border-surface-3 rounded-lg text-center transition-colors" :class="data.locked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:border-emerald-400'" @click="!data.locked && pickImage()" @dragover.prevent @drop.prevent="!data.locked && onDrop($event)">
        <svg class="w-6 h-6 mx-auto mb-1.5 text-text-disabled" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
        <p class="text-[10px] text-text-tertiary">点击或拖入图片</p>
      </div>
      <button v-if="imagePreview" @click="clearImage" :disabled="data.locked" class="w-full py-1 text-[10px] text-text-tertiary hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">清除图片</button>
    </div>
    <Handle type="source" :position="Position.Right" id="output" class="handle-image" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { useCanvasStore } from '@/stores/canvas'

const props = defineProps<{ data: Record<string, any> }>()
const canvasStore = useCanvasStore()
const api = () => (window as any).api

const imagePreview = computed(() => {
  if (props.data.image_data) return props.data.image_data
  if (props.data.image_path) {
    const path = props.data.image_path
    const isAbsolute = /^[A-Za-z]:|^\//.test(path)
    const param = isAbsolute ? 'p' : 'rel'
    return 'local-file://img?' + param + '=' + encodeURIComponent(path)
  }
  return ''
})

async function pickImage() {
  const result = await api().dialog.openFile({
    title: '选择参考图片',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    properties: ['openFile']
  })
  if (result.canceled || !result.filePaths?.length) return
  const filePath = result.filePaths[0]
  const b64 = await api().chat.invoke('readFileBase64', filePath)
  const dataUri = `data:image/png;base64,${b64}`
  canvasStore.updateNode(props.data.nodeId, {
    data: { ...props.data, image_data: dataUri, image_path: '' }
  })
}

async function onDrop(e: DragEvent) {
  const file = e.dataTransfer?.files?.[0]
  if (!file || !file.type.startsWith('image/')) return
  const reader = new FileReader()
  reader.onload = () => {
    const dataUri = reader.result as string
    canvasStore.updateNode(props.data.nodeId, {
      data: { ...props.data, image_data: dataUri, image_path: '' }
    })
  }
  reader.readAsDataURL(file)
}

function clearImage() {
  canvasStore.updateNode(props.data.nodeId, {
    data: { ...props.data, image_data: '', image_path: '' }
  })
}

function deleteNode() {
  if (!props.data.nodeId) return
  canvasStore.removeNode(props.data.nodeId)
}
</script>
