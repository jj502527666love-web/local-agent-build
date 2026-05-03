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
        <!-- Global prompt button -->
        <div class="relative" ref="globalPromptRef">
          <button @click="globalPromptExpanded = !globalPromptExpanded" :disabled="workflowRunning" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-surface-3 rounded-lg hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors" :class="canvasStore.currentProject?.system_prompt ? 'text-primary-600' : 'text-text-secondary'">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
            全局提示词
          </button>
          <div v-if="globalPromptExpanded" class="absolute right-0 top-full mt-1 w-[400px] bg-surface-0 border border-surface-3 rounded-xl shadow-lg z-50 p-3">
            <textarea
              v-model="globalPromptText"
              @input="debouncedSaveGlobalPrompt"
              placeholder="执行时会自动附加到所有生图节点的提示词前..."
              rows="4"
              class="w-full text-xs text-text-primary bg-surface-1 border border-surface-3 rounded-lg px-3 py-2 resize-none outline-none focus:border-primary-400 transition-colors"
              :disabled="workflowRunning"
            ></textarea>
            <p class="text-[10px] text-text-disabled mt-1.5">运行时自动拼接到生图提示词前</p>
          </div>
        </div>
        <!-- AI Orchestrate -->
        <button
          @click="showAiOrchestrate = true"
          :disabled="workflowRunning || !canvasStore.currentProject?.text_provider_id || !canvasStore.currentProject?.image_provider_id"
          class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-surface-3 text-text-secondary rounded-lg hover:bg-surface-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          :title="!canvasStore.currentProject?.text_provider_id || !canvasStore.currentProject?.image_provider_id ? '请先在画布设置中配置文本与生图模型' : '智能编排 · 生成画布骨架'"
        >
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
          </svg>
          智能编排
        </button>
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
          :disabled="anyRunning || canvasStore.nodes.length === 0"
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
        <button v-else @click="confirmClear = true" :disabled="canvasStore.nodes.length === 0 || anyRunning" class="p-1.5 rounded-lg text-text-tertiary hover:text-red-500 hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="清空画布">
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
        :key="vueFlowKey"
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
        :connect-on-click="false"
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
    <div v-if="showSettings" class="fixed inset-0 z-50 flex items-center justify-center">
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
              <option v-for="p in modelStore.providers" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <div v-if="settingsForm.text_provider_id">
            <label class="form-label">文本模型</label>
            <select v-model="settingsForm.text_model_id" class="select-field">
              <option value="">-- 请选择 --</option>
              <optgroup v-if="settingsTextGroups.recommended.length" label="推荐（对话）">
                <option v-for="m in settingsTextGroups.recommended" :key="m" :value="m">{{ m }}</option>
              </optgroup>
              <optgroup v-if="settingsTextGroups.others.length" label="其他可用">
                <option v-for="m in settingsTextGroups.others" :key="m" :value="m">{{ m }}</option>
              </optgroup>
            </select>
          </div>
          <div>
            <label class="form-label">生图服务商</label>
            <select v-model="settingsForm.image_provider_id" class="select-field" @change="settingsForm.image_model_id = ''">
              <option value="">-- 请选择 --</option>
              <option v-for="p in modelStore.providers" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <div v-if="settingsForm.image_provider_id">
            <label class="form-label">生图模型</label>
            <select v-model="settingsForm.image_model_id" class="select-field">
              <option value="">-- 请选择 --</option>
              <optgroup v-if="settingsImageGroups.recommended.length" label="推荐（生图）">
                <option v-for="m in settingsImageGroups.recommended" :key="m" :value="m">{{ m }}</option>
              </optgroup>
              <optgroup v-if="settingsImageGroups.others.length" label="其他可用">
                <option v-for="m in settingsImageGroups.others" :key="m" :value="m">{{ m }}</option>
              </optgroup>
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

    <!-- Handle click-to-create context menu -->
    <HandleCreateMenu
      :visible="handleMenu.visible"
      :position="{ x: handleMenu.x, y: handleMenu.y }"
      :source-data-type="handleMenu.sourceDataType"
      :candidates="handleMenuCandidates"
      :existing="handleMenuExisting"
      @create="onHandleMenuCreate"
      @connect="onHandleMenuConnect"
      @disconnect="onHandleMenuDisconnect"
      @hover="onHandleMenuHover"
      @close="closeHandleMenu"
    />

    <!-- AI Orchestrate dialog -->
    <AiOrchestrateDialog
      :visible="showAiOrchestrate"
      :project-id="projectId"
      :initial-description="pendingOrchestrateDescription"
      @close="onOrchestrateClose"
      @done="onOrchestrateDone"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, markRaw, provide, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { VueFlow, useVueFlow, ConnectionMode, type Node as FlowNode, type Edge, type Connection } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import { useCanvasStore } from '@/stores/canvas'
import { useModelStore } from '@/stores/models'
import { useHandoffStore } from '@/stores/handoff'
import { groupAndSort } from '@/utils/model-caps'
import { warmHintsCache, getHintsSync } from '@/utils/model-usage-hints'
import { NODE_TYPE_DEFS, getHandleType, getNodeTypeDef, type NodeTypeDef } from './composables/useNodeTypes'
import { useWorkflowEngine } from './composables/useWorkflowEngine'

import TextInputNode from './nodes/TextInputNode.vue'
import AiTextNode from './nodes/AiTextNode.vue'
import Text2ImgNode from './nodes/Text2ImgNode.vue'
import Img2ImgNode from './nodes/Img2ImgNode.vue'
import RefImageNode from './nodes/RefImageNode.vue'
import ImageResultNode from './nodes/ImageResultNode.vue'
import PromptSliceNode from './nodes/PromptSliceNode.vue'
import DeletableEdge from './edges/DeletableEdge.vue'
import HandleCreateMenu from './components/HandleCreateMenu.vue'
import AiOrchestrateDialog from './components/AiOrchestrateDialog.vue'

const route = useRoute()
const router = useRouter()
const canvasStore = useCanvasStore()
const modelStore = useModelStore()
const handoff = useHandoffStore()

const projectId = computed(() => route.params.id as string)

const editingTitle = ref(false)
const vueFlowKey = ref(0)
const titleDraft = ref('')
const titleInputRef = ref<HTMLInputElement | null>(null)
const showAddMenu = ref(false)
const showSettings = ref(false)
const showAiOrchestrate = ref(false)
const pendingOrchestrateDescription = ref('')
const confirmClear = ref(false)
const globalPromptExpanded = ref(false)
const globalPromptText = ref('')
let globalPromptTimer: ReturnType<typeof setTimeout> | null = null
function debouncedSaveGlobalPrompt() {
  if (globalPromptTimer) clearTimeout(globalPromptTimer)
  globalPromptTimer = setTimeout(async () => {
    if (!projectId.value) return
    await canvasStore.updateProject(projectId.value, { system_prompt: globalPromptText.value })
  }, 500)
}
const toast = ref<{ text: string; type: 'success' | 'error' } | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | null = null
function showToast(text: string, type: 'success' | 'error' = 'success', duration = 3000) {
  if (toastTimer) clearTimeout(toastTimer)
  toast.value = { text, type }
  toastTimer = setTimeout(() => { toast.value = null }, duration)
}
const globalPromptRef = ref<HTMLElement | null>(null)
const addMenuRef = ref<HTMLElement | null>(null)
const customNodeTypes: Record<string, any> = {
  textInput: markRaw(TextInputNode),
  aiText: markRaw(AiTextNode),
  text2img: markRaw(Text2ImgNode),
  img2img: markRaw(Img2ImgNode),
  refImage: markRaw(RefImageNode),
  imageResult: markRaw(ImageResultNode),
  promptSlice: markRaw(PromptSliceNode)
}
const customEdgeTypes: Record<string, any> = {
  deletable: markRaw(DeletableEdge)
}

const nodeTypes: NodeTypeDef[] = NODE_TYPE_DEFS

// Settings — unified model grouping via shared util
const hintsTick = ref(0)

const settingsForm = ref({
  title: '',
  text_provider_id: '',
  text_model_id: '',
  image_provider_id: '',
  image_model_id: '',
  concurrency: 1
})

const settingsTextProvider = computed(() =>
  modelStore.providers.find(p => p.id === settingsForm.value.text_provider_id) || null
)
const settingsImageProvider = computed(() =>
  modelStore.providers.find(p => p.id === settingsForm.value.image_provider_id) || null
)
const settingsTextGroups = computed(() => {
  hintsTick.value
  if (!settingsTextProvider.value) return { recommended: [], others: [] }
  return groupAndSort(settingsTextProvider.value.models, 'chat', {
    cloudTypeOf: (mid) => modelStore.cloudTypeOf(settingsTextProvider.value!.id, mid),
    usageHints: getHintsSync('chat', settingsTextProvider.value.id)
  })
})
const settingsImageGroups = computed(() => {
  hintsTick.value
  if (!settingsImageProvider.value) return { recommended: [], others: [] }
  return groupAndSort(settingsImageProvider.value.models, 'image', {
    cloudTypeOf: (mid) => modelStore.cloudTypeOf(settingsImageProvider.value!.id, mid),
    usageHints: getHintsSync('image', settingsImageProvider.value.id)
  })
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

// Toast the user after AI orchestration writes its nodes/edges to the canvas.
// We intentionally do NOT auto-execute the workflow — the user inspects the
// generated structure and decides when to run.
function onOrchestrateDone(result: { nodeIds: string[]; edgeIds: string[] }) {
  showToast(
    `编排完成：${result.nodeIds.length} 个节点 / ${result.edgeIds.length} 条连线`,
    'success'
  )
  // Nudge the user toward the freshly created nodes so they don't miss them.
  nextTick(() => fitView())
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

// Per-type sequence index, 1-based, ordered by created_at.
// Both the node header (#N badge) and the handle menu use this so the user
// always sees the same number for the same node, in either place.
// Recomputes when nodes are added/removed/reordered.
const nodeIndexMap = computed<Record<string, number>>(() => {
  const buckets: Record<string, typeof canvasStore.nodes> = {}
  for (const n of canvasStore.nodes) {
    if (!buckets[n.type]) buckets[n.type] = [] as any
    ;(buckets[n.type] as any).push(n)
  }
  const map: Record<string, number> = {}
  for (const t of Object.keys(buckets)) {
    const list = (buckets[t] as any[]).slice()
    list.sort((a, b) => {
      const at = a.created_at || ''
      const bt = b.created_at || ''
      if (at === bt) return a.id < b.id ? -1 : 1
      return at < bt ? -1 : 1
    })
    list.forEach((n, i) => {
      map[n.id] = i + 1
    })
  }
  return map
})

// Highlighted node id (set when the user hovers a "connect to existing" item
// in the handle menu) — vue-flow nodes pick up a `spotlight` class for it.
const hoveredNodeId = ref<string | null>(null)

// Convert store data to Vue Flow format
const flowNodes = computed<FlowNode[]>(() =>
  canvasStore.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: { x: n.position_x, y: n.position_y },
    class: hoveredNodeId.value === n.id ? 'spotlight' : '',
    data: {
      ...n.data,
      nodeId: n.id,
      projectId: n.project_id,
      locked: workflowRunning.value,
      nodeIndex: nodeIndexMap.value[n.id] || 1
    }
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

// Workflow engine — module-level singletons ensure the same state is shared
// across this view and every individual node component.
// - workflowRunning: only true while runWorkflow is executing the full canvas
// - anyRunning: true when workflowRunning OR any single node is running
// Declared here (before handle menu state) so the watch below can safely reference it.
const {
  workflowRunning,
  anyRunning,
  runWorkflow: executeWorkflow
} = useWorkflowEngine()

// === Handle click-to-create menu ===
// Clicking (not dragging) a source handle opens a context menu listing:
//   1) Compatible node types to create and auto-connect
//   2) Existing nodes in this project that can accept the data type
// Dragging still works as before for direct node-to-node wiring.
type HandleMenuState = {
  visible: boolean
  x: number
  y: number
  sourceNodeId: string
  sourceHandle: string
  sourceDataType: 'text' | 'image'
}
const handleMenu = ref<HandleMenuState>({
  visible: false,
  x: 0,
  y: 0,
  sourceNodeId: '',
  sourceHandle: '',
  sourceDataType: 'text'
})

function onHandleClick(
  event: MouseEvent,
  nodeId: string,
  handleId: string,
  dataType: 'text' | 'image'
) {
  // Structural edits are disabled while the whole-workflow run is active.
  // Single-node runs don't block this: independent nodes can still be wired up.
  if (workflowRunning.value) return
  event.stopPropagation()
  event.preventDefault()
  handleMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    sourceNodeId: nodeId,
    sourceHandle: handleId,
    sourceDataType: dataType
  }
}

provide('onHandleClick', onHandleClick)

// Domain rule mirror of isValidConnection() for the click-to-create path.
// Keeps both creation paths in sync — if we ever add more forbidden pairs,
// update both this helper and isValidConnection together.
function isForbiddenCombination(srcNodeType: string | undefined, targetNodeType: string): boolean {
  if (srcNodeType === 'refImage' && targetNodeType === 'imageResult') return true
  return false
}

// Compatible new-node candidates, with the resolved input handle we'll auto-connect to.
const handleMenuCandidates = computed(() => {
  if (!handleMenu.value.visible) return []
  const srcType = handleMenu.value.sourceDataType
  const srcNode = canvasStore.nodes.find((n) => n.id === handleMenu.value.sourceNodeId)
  const srcNodeType = srcNode?.type
  return NODE_TYPE_DEFS
    .filter((d) => d.inputs.some((i) => i.dataType === srcType))
    .filter((d) => !isForbiddenCombination(srcNodeType, d.type))
    .map((d) => {
      const input =
        d.inputs.find((i) => i.required && i.dataType === srcType) ||
        d.inputs.find((i) => i.dataType === srcType)!
      return {
        type: d.type,
        label: d.label,
        color: d.color,
        targetHandle: input.handle
      }
    })
})

// Existing-node candidates:
//   - in same project
//   - has at least one input handle matching sourceDataType
//   - not the source node itself
//   - not a forbidden combination
// Already-connected targets are NOT filtered out — they are surfaced with
// connected=true so the user can click them again to disconnect (toggle UX).
const handleMenuExisting = computed(() => {
  if (!handleMenu.value.visible || !projectId.value) return []
  const ctx = handleMenu.value
  const srcNode = canvasStore.nodes.find((n) => n.id === ctx.sourceNodeId)
  const srcNodeType = srcNode?.type
  const idx = nodeIndexMap.value
  // Map: targetNodeId -> edgeId for edges originating from this exact source/handle.
  // Used both to mark the menu item as connected and to know which edge to delete.
  const connectedEdge = new Map<string, string>()
  for (const e of canvasStore.edges) {
    if (
      e.project_id === projectId.value &&
      e.source_node_id === ctx.sourceNodeId &&
      e.source_handle === ctx.sourceHandle
    ) {
      connectedEdge.set(e.target_node_id, e.id)
    }
  }
  return canvasStore.nodes
    .filter((n) => n.project_id === projectId.value)
    .filter((n) => n.id !== ctx.sourceNodeId)
    .filter((n) => !isForbiddenCombination(srcNodeType, n.type))
    .map((n) => {
      const def = getNodeTypeDef(n.type)
      if (!def) return null
      const input =
        def.inputs.find((i) => i.required && i.dataType === ctx.sourceDataType) ||
        def.inputs.find((i) => i.dataType === ctx.sourceDataType)
      if (!input) return null
      let preview = ''
      if (n.type === 'textInput') preview = String(n.data.text || '').slice(0, 40)
      else if (n.type === 'aiText')
        preview = String(n.data.result || n.data.text || '').slice(0, 40)
      const edgeId = connectedEdge.get(n.id) || ''
      return {
        nodeId: n.id,
        label: def.label,
        index: idx[n.id] || 1,
        color: def.color,
        preview,
        connected: !!edgeId,
        edgeId
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
})

// Place the newly created node to the right of the source node, offsetting
// vertically if that slot is already occupied to avoid visual overlap.
function findFreeSlot(baseX: number, baseY: number): { x: number; y: number } {
  const projId = projectId.value
  const collision = (x: number, y: number) =>
    canvasStore.nodes.some(
      (n) =>
        n.project_id === projId &&
        Math.abs(n.position_x - x) < 50 &&
        Math.abs(n.position_y - y) < 50
    )
  let x = baseX
  let y = baseY
  let tries = 0
  while (collision(x, y) && tries < 20) {
    y += 120
    tries++
  }
  return { x, y }
}

async function onHandleMenuCreate(newType: string) {
  if (!projectId.value) return
  const src = canvasStore.nodes.find((n) => n.id === handleMenu.value.sourceNodeId)
  if (!src) {
    closeHandleMenu()
    return
  }
  // Defense in depth: even though candidates computed filters this out,
  // refuse again here in case the menu was opened with stale data.
  if (isForbiddenCombination(src.type, newType)) {
    closeHandleMenu()
    return
  }
  const def = getNodeTypeDef(newType)
  if (!def) {
    closeHandleMenu()
    return
  }
  const input =
    def.inputs.find((i) => i.required && i.dataType === handleMenu.value.sourceDataType) ||
    def.inputs.find((i) => i.dataType === handleMenu.value.sourceDataType)
  if (!input) {
    closeHandleMenu()
    return
  }

  const { x, y } = findFreeSlot(src.position_x + (src.width || 240) + 80, src.position_y)

  const newNode = await canvasStore.addNode(projectId.value, {
    type: newType,
    position_x: x,
    position_y: y,
    width: 240,
    height: 0,
    data: {}
  })

  await canvasStore.addEdge(projectId.value, {
    source_node_id: handleMenu.value.sourceNodeId,
    source_handle: handleMenu.value.sourceHandle,
    target_node_id: newNode.id,
    target_handle: input.handle
  })

  closeHandleMenu()
}

async function onHandleMenuConnect(targetNodeId: string) {
  if (!projectId.value || workflowRunning.value) return
  const target = canvasStore.nodes.find((n) => n.id === targetNodeId)
  if (!target) return
  const src = canvasStore.nodes.find((n) => n.id === handleMenu.value.sourceNodeId)
  // Defense in depth: mirror isValidConnection/candidates filter at the write site.
  if (src && isForbiddenCombination(src.type, target.type)) return
  const def = getNodeTypeDef(target.type)
  if (!def) return
  const input =
    def.inputs.find((i) => i.required && i.dataType === handleMenu.value.sourceDataType) ||
    def.inputs.find((i) => i.dataType === handleMenu.value.sourceDataType)
  if (!input) return

  const dup = canvasStore.edges.find(
    (e) =>
      e.project_id === projectId.value &&
      e.source_node_id === handleMenu.value.sourceNodeId &&
      e.source_handle === handleMenu.value.sourceHandle &&
      e.target_node_id === targetNodeId &&
      e.target_handle === input.handle
  )
  if (!dup) {
    await canvasStore.addEdge(projectId.value, {
      source_node_id: handleMenu.value.sourceNodeId,
      source_handle: handleMenu.value.sourceHandle,
      target_node_id: targetNodeId,
      target_handle: input.handle
    })
  }
  // Menu stays open by design — users often connect/disconnect several
  // targets in one go. Esc / outside-click / workflow-start still close it.
}

// Toggle counterpart of onHandleMenuConnect — the menu shows already-connected
// targets with a "已连接" badge; clicking removes that single edge.
async function onHandleMenuDisconnect(edgeId: string) {
  if (!projectId.value || workflowRunning.value || !edgeId) return
  await canvasStore.removeEdge(edgeId)
  // Same as above: keep the menu open for further edits.
}

// Hover-driven canvas spotlight: when the user hovers a "connect to existing"
// item, the corresponding node lights up so they can visually confirm the
// match without having to read or count node copies.
function onHandleMenuHover(nodeId: string | null) {
  hoveredNodeId.value = nodeId
}

function closeHandleMenu() {
  handleMenu.value.visible = false
  hoveredNodeId.value = null
}

// Auto-close the handle menu if the full workflow starts while it is open.
// Structural edits are disabled during whole-workflow runs, so the menu must
// not linger and suggest interactions that would silently no-op.
watch(
  () => workflowRunning.value,
  (running) => {
    if (running && handleMenu.value.visible) closeHandleMenu()
  }
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
    case 'text2img': return { model_provider_id: '', model_id: '', size: '1:1', tier_id: '2k', quality: 'auto', status: 'idle', generation_id: '', result_path: '' }
    case 'img2img': return { model_provider_id: '', model_id: '', size: '1:1', tier_id: '2k', quality: 'auto', status: 'idle', generation_id: '', result_path: '' }
    case 'refImage': return { image_data: '', image_path: '' }
    case 'imageResult': return { generation_id: '', result_path: '', result_url: '' }
    case 'promptSlice': return { rows: [] }
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
  if (globalPromptRef.value && !globalPromptRef.value.contains(e.target as globalThis.Node)) {
    globalPromptExpanded.value = false
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

function onOrchestrateClose() {
  showAiOrchestrate.value = false
  pendingOrchestrateDescription.value = ''
}

onMounted(async () => {
  document.addEventListener('click', onClickOutside)
  document.addEventListener('keydown', onKeyDown)
  await Promise.all([modelStore.fetchProviders(), warmHintsCache()])
  hintsTick.value++
  if (projectId.value) {
    await canvasStore.loadProject(projectId.value)
    globalPromptText.value = canvasStore.currentProject?.system_prompt || ''
    vueFlowKey.value++
  }

  const pending = handoff.consume<{ description?: string }>('canvasOrchestrate')
  if (pending?.description) {
    pendingOrchestrateDescription.value = pending.description
    await nextTick()
    showAiOrchestrate.value = true
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
/* Handle visual: slightly larger than before for easier targeting. */
.vue-flow__handle {
  width: 12px;
  height: 12px;
  border: 2px solid #94a3b8;
  background: white;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
/* Invisible hit area: extends the pointer target by 8px on every side
   without changing the visual size. Makes handles much easier to grab. */
.vue-flow__handle::before {
  content: '';
  position: absolute;
  inset: -8px;
  border-radius: 50%;
}
/* Hover lifts the handle and adds a soft halo so users know it is interactive. */
.vue-flow__handle:hover {
  transform: scale(1.6);
  border-color: #6366f1;
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.18);
}
/* Per-type tint so text/image handles are visually distinguishable. */
.vue-flow__handle.handle-text {
  border-color: #8b5cf6;
}
.vue-flow__handle.handle-text:hover {
  border-color: #7c3aed;
  box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.22);
}
.vue-flow__handle.handle-image {
  border-color: #f59e0b;
}
.vue-flow__handle.handle-image:hover {
  border-color: #d97706;
  box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.22);
}
/* Whole-row hover on promptSlice pre-highlights the row's handle,
   so users know exactly which row a handle belongs to even before touching it. */
.prompt-slice-row:hover .vue-flow__handle {
  transform: scale(1.55);
  border-color: #ec4899;
  box-shadow: 0 0 0 3px rgba(236, 72, 153, 0.22);
}
.prompt-slice-row:hover .vue-flow__handle:hover {
  transform: scale(1.8);
  box-shadow: 0 0 0 4px rgba(236, 72, 153, 0.3);
}
/* VueFlow state overrides stay on top of the color scheme. */
.vue-flow__handle-connecting {
  border-color: #6366f1 !important;
  background: #e0e7ff;
}
.vue-flow__handle-valid {
  border-color: #22c55e !important;
  background: #dcfce7;
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.25) !important;
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
/* Spotlight: applied while the user hovers a "connect to existing" item in
   the handle menu, so they can visually identify the matching node on the
   canvas without having to count. Pulses subtly to draw attention. */
.vue-flow__node.spotlight {
  z-index: 5;
  animation: spotlight-pulse 1.4s ease-in-out infinite;
}
.vue-flow__node.spotlight .canvas-node {
  outline: 2px solid #6366f1;
  outline-offset: 2px;
}
@keyframes spotlight-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.45),
                0 1px 4px rgba(0, 0, 0, 0.06);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(99, 102, 241, 0.18),
                0 4px 12px rgba(99, 102, 241, 0.25);
  }
}
</style>
