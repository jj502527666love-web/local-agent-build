<template>
  <div class="h-full flex flex-col relative">
    <!-- Toolbar -->
    <div class="flex items-center justify-between px-4 py-2 bg-surface-0 border-b border-surface-3 z-10">
      <div class="flex items-center gap-3">
        <button @click="goBack" class="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors" title="返回列表">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
        </button>
        <div v-if="editingTitle" class="flex items-center gap-1">
          <input
            ref="titleInputRef"
            v-model="titleDraft"
            @keydown.enter="saveTitle"
            @keydown.escape="editingTitle = false"
            @blur="saveTitle"
            maxlength="30"
            class="text-sm font-medium text-text-primary bg-transparent border-b border-primary-400 outline-none py-0.5 w-48"
          />
        </div>
        <button v-else @click="startEditTitle" :disabled="workflowRunning" class="text-sm font-medium text-text-primary hover:text-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {{ canvasStore.currentProject?.title || 'Untitled' }}
        </button>
      </div>
      <div class="flex items-center gap-2">
        <!-- Add node menu -->
        <div class="relative" ref="addMenuRef">
          <button @click="showAddMenu = !showAddMenu" :disabled="workflowRunning" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            添加节点
          </button>
          <div v-if="showAddMenu" class="absolute right-0 top-full mt-1 w-44 bg-surface-0 border border-surface-3 rounded-xl shadow-lg z-50 py-1">
            <button v-for="nt in nodeTypes" :key="nt.type" @click="addNodeAtCenter(nt.type)" class="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:bg-surface-2 transition-colors">
              <span class="w-2 h-2 rounded-full flex-shrink-0" :style="{ background: nt.color }"></span>
              {{ nt.label }}
            </button>
          </div>
        </div>
        <!-- Run workflow -->
        <button
          @click="runWorkflow"
          :disabled="workflowRunning || canvasStore.nodes.length === 0"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-surface-3 rounded-lg hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          :class="workflowRunning ? 'text-amber-600' : 'text-text-secondary'"
        >
          <svg v-if="workflowRunning" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
          <svg v-else class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" /></svg>
          {{ workflowRunning ? '执行中...' : '执行工作流' }}
        </button>
        <!-- Settings -->
        <button @click="openSettings" :disabled="workflowRunning" class="p-1.5 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="画布设置">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" /></svg>
        </button>
        <!-- Clear canvas -->
        <template v-if="confirmClear">
          <button @click="doClearCanvas" class="px-2 py-1 text-[10px] font-medium text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors">确认清空</button>
          <button @click="confirmClear = false" class="px-2 py-1 text-[10px] text-text-tertiary border border-surface-3 rounded-lg hover:bg-surface-2 transition-colors">取消</button>
        </template>
        <button v-else @click="confirmClear = true" :disabled="canvasStore.nodes.length === 0 || workflowRunning" class="p-1.5 rounded-lg text-text-tertiary hover:text-red-500 hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="清空画布">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" /></svg>
        </button>
        <!-- Zoom controls -->
        <div class="flex items-center gap-1 text-[10px] text-text-tertiary">
          <button @click="zoomOut" class="p-1 rounded hover:bg-surface-2 transition-colors">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14" /></svg>
          </button>
          <span class="w-10 text-center">{{ zoomPercent }}%</span>
          <button @click="zoomIn" class="p-1 rounded hover:bg-surface-2 transition-colors">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" /></svg>
          </button>
          <button @click="fitView" class="p-1 rounded hover:bg-surface-2 transition-colors" title="适应视图">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Vue Flow Canvas -->
    <div class="flex-1 relative">
      <VueFlow
        :nodes="flowNodes"
        :edges="flowEdges"
        :node-types="customNodeTypes"
        :edge-types="customEdgeTypes"
        :default-viewport="{ x: 0, y: 0, zoom: 1 }"
        :default-edge-options="{ interactionWidth: 20, selectable: true }"
        :min-zoom="0.1"
        :max-zoom="3"
        :snap-to-grid="true"
        :snap-grid="[16, 16]"
        :connection-mode="ConnectionMode.Loose"
        :is-valid-connection="isValidConnection"
        :edges-updatable="!workflowRunning"
        :nodes-draggable="!workflowRunning"
        :nodes-connectable="!workflowRunning"
        fit-view-on-init
        @nodes-change="onNodesChange"
        @edges-change="onEdgesChange"
        @connect="onConnect"
        @viewport-change="onViewportChange"
        @node-drag-stop="onNodeDragStop"
      >
      </VueFlow>
    </div>

    <!-- Settings Dialog -->
    <div v-if="showSettings" class="fixed inset-0 z-50 flex items-center justify-center" @click.self="showSettings = false">
      <div class="w-[420px] bg-surface-0 rounded-2xl shadow-xl border border-surface-3 p-6" @click.stop>
        <h2 class="text-base font-semibold text-text-primary mb-4">画布设置</h2>
        <div class="space-y-4">
          <div>
            <label class="form-label">画布名称</label>
            <input v-model="settingsForm.title" maxlength="30" class="input-field" />
          </div>
          <div>
            <label class="form-label">文本处理服务商</label>
            <select v-model="settingsForm.text_provider_id" class="select-field" @change="settingsForm.text_model_id = ''">
              <option value="">-- 请选择 --</option>
              <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <div v-if="settingsForm.text_provider_id">
            <label class="form-label">文本模型</label>
            <select v-model="settingsForm.text_model_id" class="select-field">
              <option value="">-- 请选择 --</option>
              <option v-for="m in settingsTextModels" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>
          <div>
            <label class="form-label">生图服务商</label>
            <select v-model="settingsForm.image_provider_id" class="select-field" @change="settingsForm.image_model_id = ''">
              <option value="">-- 请选择 --</option>
              <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <div v-if="settingsForm.image_provider_id">
            <label class="form-label">生图模型</label>
            <select v-model="settingsForm.image_model_id" class="select-field">
              <option value="">-- 请选择 --</option>
              <option v-for="m in settingsImageModels" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>
          <div>
            <label class="form-label">并发数</label>
            <input v-model.number="settingsForm.concurrency" type="number" min="1" max="20" class="input-field" />
            <p class="text-[10px] text-text-disabled mt-1">请确认接口的实际并发限制，并确保设备性能满足并发要求</p>
          </div>
        </div>
        <div class="flex justify-end gap-2 mt-6">
          <button @click="showSettings = false" class="btn-secondary text-xs">取消</button>
          <button @click="saveSettings" class="btn-primary text-xs">保存</button>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <div v-if="toast" class="absolute bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg border text-xs font-medium transition-all"
      :class="toast.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'"
    >{{ toast.text }}</div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, markRaw } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { VueFlow, useVueFlow, ConnectionMode, type Node as FlowNode, type Edge, type Connection } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import { useCanvasStore } from '@/stores/canvas'
import { useModelStore } from '@/stores/models'
import { NODE_TYPE_DEFS, getHandleType, type NodeTypeDef } from './composables/useNodeTypes'
import { useWorkflowEngine } from './composables/useWorkflowEngine'

import TextInputNode from './nodes/TextInputNode.vue'
import AiTextNode from './nodes/AiTextNode.vue'
import Text2ImgNode from './nodes/Text2ImgNode.vue'
import Img2ImgNode from './nodes/Img2ImgNode.vue'
import RefImageNode from './nodes/RefImageNode.vue'
import ImageResultNode from './nodes/ImageResultNode.vue'
import DeletableEdge from './edges/DeletableEdge.vue'

const route = useRoute()
const router = useRouter()
const canvasStore = useCanvasStore()
const modelStore = useModelStore()

const projectId = computed(() => route.params.id as string)

const editingTitle = ref(false)
const titleDraft = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)
const showAddMenu = ref(false)
const showSettings = ref(false)
const confirmClear = ref(false)
const toast = ref<{ text: string; type: 'success' | 'error' } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(text: string, type: 'success' | 'error' = 'success', duration = 3000) {
  if (toastTimer) clearTimeout(toastTimer)
  toast.value = { text, type }
  toastTimer = setTimeout(() => { toast.value = null }, duration)
}
const addMenuRef = ref<HTMLElement | null>(null)
const customNodeTypes: Record<string, any> = {
  textInput: markRaw(TextInputNode),
  aiText: markRaw(AiTextNode),
  text2img: markRaw(Text2ImgNode),
  img2img: markRaw(Img2ImgNode),
  refImage: markRaw(RefImageNode),
  imageResult: markRaw(ImageResultNode)
}
const customEdgeTypes: Record<string, any> = {
  deletable: markRaw(DeletableEdge)
}

const nodeTypes: NodeTypeDef[] = NODE_TYPE_DEFS

// Settings
const providers = computed(() => modelStore.providers)
const settingsForm = ref({
  title: '',
  text_provider_id: '',
  text_model_id: '',
  image_provider_id: '',
  image_model_id: '',
  concurrency: 1
})

const settingsTextModels = computed(() => {
  const p = providers.value.find((p) => p.id === settingsForm.value.text_provider_id)
  return p ? (Array.isArray(p.models) ? p.models : []) : []
})

const settingsImageModels = computed(() => {
  const p = providers.value.find((p) => p.id === settingsForm.value.image_provider_id)
  return p ? (Array.isArray(p.models) ? p.models : []) : []
})

function openSettings() {
  const proj = canvasStore.currentProject
  if (!proj) return
  settingsForm.value = {
    title: proj.title,
    text_provider_id: proj.text_provider_id || '',
    text_model_id: proj.text_model_id || '',
    image_provider_id: proj.image_provider_id || '',
    image_model_id: proj.image_model_id || '',
    concurrency: proj.concurrency || 1
  }
  showSettings.value = true
}

async function saveSettings() {
  if (!projectId.value) return
  const concurrency = Math.max(1, Math.min(20, settingsForm.value.concurrency || 1))
  await canvasStore.updateProject(projectId.value, {
    title: settingsForm.value.title.trim() || canvasStore.currentProject?.title,
    text_provider_id: settingsForm.value.text_provider_id,
    text_model_id: settingsForm.value.text_model_id,
    image_provider_id: settingsForm.value.image_provider_id,
    image_model_id: settingsForm.value.image_model_id,
    concurrency
  })
  showSettings.value = false
}

const { zoomIn: vfZoomIn, zoomOut: vfZoomOut, fitView: vfFitView, getViewport } = useVueFlow()

const currentZoom = ref(1)
const zoomPercent = computed(() => Math.round(currentZoom.value * 100))

function zoomIn() { vfZoomIn(); updateZoom() }
function zoomOut() { vfZoomOut(); updateZoom() }
function fitView() { vfFitView({ padding: 0.2 }); updateZoom() }
function updateZoom() {
  nextTick(() => {
    const vp = getViewport()
    currentZoom.value = vp.zoom
  })
}
function onViewportChange(vp: any) {
  currentZoom.value = vp.zoom
}

// Convert store data to Vue Flow format
const flowNodes = computed<FlowNode[]>(() =>
  canvasStore.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: { x: n.position_x, y: n.position_y },
    data: { ...n.data, nodeId: n.id, projectId: n.project_id, locked: workflowRunning.value }
  }))
)

const flowEdges = computed<Edge[]>(() =>
  canvasStore.edges.map((e) => ({
    id: e.id,
    type: 'deletable',
    source: e.source_node_id,
    sourceHandle: e.source_handle,
    target: e.target_node_id,
    targetHandle: e.target_handle,
    animated: false,
    selectable: true
  }))
)

// Connection validation
function isValidConnection(connection: Connection): boolean {
  if (!connection.source || !connection.target) return false
  if (connection.source === connection.target) return false

  const sourceNode = canvasStore.nodes.find((n) => n.id === connection.source)
  const targetNode = canvasStore.nodes.find((n) => n.id === connection.target)
  if (!sourceNode || !targetNode) return false

  // Block refImage → imageResult direct connection (no meaningful purpose)
  if (sourceNode.type === 'refImage' && targetNode.type === 'imageResult') return false

  const sourceType = getHandleType(sourceNode.type, connection.sourceHandle || 'output', 'output')
  const targetType = getHandleType(targetNode.type, connection.targetHandle || 'input', 'input')

  return sourceType === targetType
}

// Event handlers
function onNodesChange(changes: any[]) {
  for (const change of changes) {
    if (change.type === 'position' && change.position && change.dragging === false) {
      const node = canvasStore.nodes.find((n) => n.id === change.id)
      if (node) {
        node.position_x = change.position.x
        node.position_y = change.position.y
      }
    }
  }
}

function onEdgesChange(changes: any[]) {
  if (workflowRunning.value) return
  for (const change of changes) {
    if (change.type === 'remove') {
      canvasStore.removeEdge(change.id)
    }
  }
}

async function onConnect(connection: Connection) {
  if (!projectId.value || workflowRunning.value) return
  await canvasStore.addEdge(projectId.value, {
    source_node_id: connection.source!,
    source_handle: connection.sourceHandle || 'output',
    target_node_id: connection.target!,
    target_handle: connection.targetHandle || 'input'
  })
}

function onNodeDragStop(event: any) {
  const draggedNodes = Array.isArray(event) ? event : [event]
  const updates: { id: string; position_x: number; position_y: number }[] = []
  for (const item of draggedNodes) {
    const node = item.node || item
    if (node?.id && node?.position) {
      updates.push({ id: node.id, position_x: node.position.x, position_y: node.position.y })
      const storeNode = canvasStore.nodes.find((n) => n.id === node.id)
      if (storeNode) {
        storeNode.position_x = node.position.x
        storeNode.position_y = node.position.y
      }
    }
  }
  if (updates.length > 0) {
    canvasStore.updateNodePositions(updates)
  }
}

// Add node
async function addNodeAtCenter(type: string) {
  showAddMenu.value = false
  if (!projectId.value) return
  const vp = getViewport()
  const x = (-vp.x + 400) / vp.zoom
  const y = (-vp.y + 200) / vp.zoom

  const defaultData = getDefaultNodeData(type)
  await canvasStore.addNode(projectId.value, {
    type,
    position_x: x,
    position_y: y,
    data: defaultData
  })
}

function getDefaultNodeData(type: string): Record<string, any> {
  switch (type) {
    case 'textInput': return { text: '' }
    case 'aiText': return { text: '', result: '', status: 'idle' }
    case 'text2img': return { model_provider_id: '', model_id: '', size: '1:1', quality: 'auto', status: 'idle', generation_id: '', result_path: '' }
    case 'img2img': return { model_provider_id: '', model_id: '', size: '1:1', quality: 'auto', status: 'idle', generation_id: '', result_path: '' }
    case 'refImage': return { image_data: '', image_path: '' }
    case 'imageResult': return { generation_id: '', result_path: '', result_url: '' }
    default: return {}
  }
}

// Title editing
function startEditTitle() {
  titleDraft.value = canvasStore.currentProject?.title || ''
  editingTitle.value = true
  nextTick(() => titleInputRef.value?.focus())
}

async function saveTitle() {
  const title = titleDraft.value.trim()
  if (title && projectId.value) {
    await canvasStore.updateProject(projectId.value, { title })
  }
  editingTitle.value = false
}

function goBack() {
  router.push('/canvas')
}

// Workflow engine
const { running: workflowRunning, runWorkflow: executeWorkflow } = useWorkflowEngine()

async function runWorkflow() {
  if (!projectId.value) return
  const result = await executeWorkflow(projectId.value)
  if (result) {
    showToast(result.message, result.ok ? 'success' : 'error', result.ok ? 3000 : 5000)
  }
}

// Clear all nodes and edges
async function doClearCanvas() {
  for (const edge of [...canvasStore.edges]) {
    await canvasStore.removeEdge(edge.id)
  }
  for (const node of [...canvasStore.nodes]) {
    await canvasStore.removeNode(node.id)
  }
  confirmClear.value = false
}

// Click outside to close menus
function onClickOutside(e: MouseEvent) {
  if (addMenuRef.value && !addMenuRef.value.contains(e.target as globalThis.Node)) {
    showAddMenu.value = false
  }
}

// Delete key support for selected edges
const { getSelectedEdges, removeEdges } = useVueFlow()
function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (workflowRunning.value) return
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
    const selected = getSelectedEdges.value
    if (selected.length > 0) {
      removeEdges(selected.map((ed) => ed.id))
    }
  }
}

onMounted(async () => {
  document.addEventListener('click', onClickOutside)
  document.addEventListener('keydown', onKeyDown)
  modelStore.fetchProviders()
  if (projectId.value) {
    await canvasStore.loadProject(projectId.value)
  }
})

onUnmounted(() => {
  document.removeEventListener('click', onClickOutside)
  document.removeEventListener('keydown', onKeyDown)
})
</script>

<style>
.vue-flow {
  background: #fafbfc;
}
.vue-flow__node {
  border-radius: 12px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04);
}
.vue-flow__handle {
  width: 10px;
  height: 10px;
  border: 2px solid #94a3b8;
  background: white;
}
.vue-flow__handle-connecting {
  border-color: #6366f1;
  background: #e0e7ff;
}
.vue-flow__handle-valid {
  border-color: #22c55e;
  background: #dcfce7;
}
.vue-flow__edge-path {
  stroke: #94a3b8;
  stroke-width: 2;
  transition: stroke 0.15s, stroke-width 0.15s;
}
.vue-flow__edge-interaction {
  stroke-width: 20;
}
.vue-flow__edge:hover .vue-flow__edge-path {
  stroke: #6366f1;
  stroke-width: 3;
}
.vue-flow__edge.selected .vue-flow__edge-path {
  stroke: #4f46e5;
  stroke-width: 3;
}
.vue-flow__connection-path {
  stroke: #6366f1;
  stroke-width: 2;
  stroke-dasharray: 5 5;
}
</style>
