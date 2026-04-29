<template>
  <div class="h-full flex overflow-hidden">
    <!-- Left: Global Config -->
    <div class="w-72 flex-shrink-0 border-r border-surface-3 bg-surface-0 flex flex-col overflow-y-auto">
      <div class="p-4 space-y-5">
        <h3 class="text-xs font-semibold text-text-primary tracking-wide uppercase">批量生图配置</h3>

        <!-- Default Prompt -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <div class="flex items-center gap-1.5">
              <label class="text-xs font-medium text-text-secondary">默认提示词</label>
              <button
                @click="showPresetPopup = !showPresetPopup"
                class="px-1.5 py-0.5 rounded text-[10px] text-text-tertiary hover:text-primary-600 hover:bg-surface-2 transition-colors"
              >预设</button>
            </div>
            <div class="flex items-center gap-1.5">
              <button
                v-if="defaultPrompt.trim() && optimizeProviderId && optimizeModelId"
                @click="optimizeDefaultPrompt('cn')"
                :disabled="optimizing"
                class="px-2 py-1 rounded-md text-xs font-medium text-text-tertiary hover:text-primary-600 hover:bg-surface-2 transition-colors"
                title="优化为中文提示词"
              >中</button>
              <button
                v-if="defaultPrompt.trim() && optimizeProviderId && optimizeModelId"
                @click="optimizeDefaultPrompt('en')"
                :disabled="optimizing"
                class="px-2 py-1 rounded-md text-xs font-medium text-text-tertiary hover:text-primary-600 hover:bg-surface-2 transition-colors"
                title="优化为英文提示词"
              >En</button>
            </div>
          </div>
          <textarea
            v-model="defaultPrompt"
            rows="4"
            class="w-full px-3 py-2 text-xs bg-surface-1 border border-surface-3 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-text-disabled"
            placeholder="所有参考图的默认提示词..."
          ></textarea>
          <div v-if="optimizing" class="flex items-center gap-1.5 mt-1 text-[10px] text-text-tertiary">
            <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
            正在优化提示词...
          </div>
        </div>

        <!-- Model Selection -->
        <div>
          <label class="text-xs font-medium text-text-secondary mb-1.5 block">模型</label>
          <select v-model="selectedProviderId" @change="selectedModelId = ''" class="w-full px-3 py-2 text-xs bg-surface-1 border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 mb-2">
            <option value="">-- 选择服务商 --</option>
            <option v-for="p in imageProviders" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <select v-model="selectedModelId" class="w-full px-3 py-2 text-xs bg-surface-1 border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" :disabled="!selectedProviderModels.length">
            <option value="">-- 选择模型 --</option>
            <option v-for="m in selectedProviderModels" :key="m" :value="m">{{ m }}</option>
          </select>
          <input v-if="selectedProviderId && !selectedProviderModels.length" v-model="selectedModelId" placeholder="输入模型名称" class="w-full mt-2 px-3 py-2 text-xs bg-surface-1 border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>

        <!-- Prompt Optimize Model -->
        <div>
          <label class="text-xs font-medium text-text-secondary mb-1.5 block">提示词优化模型</label>
          <select v-model="optimizeProviderId" @change="optimizeModelId = ''" class="w-full px-3 py-2 text-xs bg-surface-1 border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 mb-2">
            <option value="">-- 选择服务商 --</option>
            <option v-for="p in languageProviders" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <select v-model="optimizeModelId" class="w-full px-3 py-2 text-xs bg-surface-1 border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" :disabled="!optimizeProviderModels.length">
            <option value="">-- 选择模型 --</option>
            <option v-for="m in optimizeProviderModels" :key="m" :value="m">{{ m }}</option>
          </select>
          <input v-if="optimizeProviderId && !optimizeProviderModels.length" v-model="optimizeModelId" placeholder="输入模型名称" class="w-full mt-2 px-3 py-2 text-xs bg-surface-1 border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>

        <!-- Default Size -->
        <div>
          <label class="text-xs font-medium text-text-secondary mb-1.5 block">默认尺寸</label>
          <div class="grid grid-cols-5 gap-1.5">
            <button
              v-for="s in sizeOptions"
              :key="s.value"
              @click="defaultSize = s.value"
              :class="['px-2 py-2 text-[10px] rounded-lg border transition-colors text-center', defaultSize === s.value ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium' : 'border-surface-3 bg-surface-1 text-text-secondary hover:bg-surface-2']"
            >{{ s.label }}</button>
          </div>
        </div>

        <!-- Default Quality -->
        <div>
          <label class="text-xs font-medium text-text-secondary mb-1.5 block">默认画质</label>
          <div class="grid grid-cols-3 gap-1.5">
            <button
              v-for="q in qualityOptions"
              :key="q.value"
              @click="defaultQuality = q.value"
              :class="['px-2 py-2 text-[10px] rounded-lg border transition-colors text-center', defaultQuality === q.value ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium' : 'border-surface-3 bg-surface-1 text-text-secondary hover:bg-surface-2']"
            >{{ q.label }}</button>
          </div>
        </div>

        <!-- Add Reference Images -->
        <div>
          <button
            @click="pickRefImages"
            class="w-full px-3 py-2.5 text-xs font-medium border-2 border-dashed border-surface-4 rounded-lg text-text-tertiary hover:text-text-secondary hover:border-surface-5 transition-colors flex items-center justify-center gap-2"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" /></svg>
            添加参考图
          </button>
        </div>

        <!-- Start All -->
        <button
          @click="startAll"
          :disabled="!canStart || batchRunning"
          :class="['w-full py-3 rounded-xl text-xs font-semibold transition-all', canStart && !batchRunning ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm' : 'bg-surface-2 text-text-disabled cursor-not-allowed']"
        >
          {{ batchRunning ? `生成中 (${completedCount}/${tasks.length})` : `开始生成 (${tasks.length} 张)` }}
        </button>
      </div>
    </div>

    <!-- Right: Task List -->
    <div class="flex-1 flex flex-col bg-surface-1 overflow-hidden">
      <div class="flex items-center justify-between px-4 py-2.5 border-b border-surface-3 bg-surface-0">
        <div class="flex items-center gap-2">
          <h3 class="text-xs font-semibold text-text-primary">任务列表</h3>
          <span class="text-[10px] text-text-tertiary">{{ tasks.length }} 张参考图</span>
        </div>
        <div class="flex items-center gap-2">
          <button v-if="tasks.length && !batchRunning" @click="clearAll" class="text-[10px] text-text-tertiary hover:text-red-500 transition-colors">清空全部</button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-4">
        <!-- Empty state -->
        <div v-if="!tasks.length" class="flex-1 flex flex-col items-center justify-center py-20">
          <div class="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
            <svg class="w-8 h-8 text-text-disabled" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" /></svg>
          </div>
          <p class="text-sm font-medium text-text-secondary mb-1">添加参考图开始批量生图</p>
          <p class="text-xs text-text-tertiary">在左侧点击"添加参考图"上传多张图片</p>
        </div>

        <!-- Task cards -->
        <div v-else class="grid grid-cols-2 gap-3">
          <div
            v-for="(task, idx) in tasks"
            :key="task.id"
            :class="['rounded-xl border bg-surface-0 overflow-hidden transition-shadow', task.status === 'error' ? 'border-red-300' : task.status === 'done' ? 'border-green-300' : 'border-surface-3']"
          >
            <div class="flex gap-3 p-3">
              <!-- Reference image thumbnail -->
              <div class="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-surface-2">
                <img :src="task.refImage" class="w-full h-full object-cover" />
              </div>

              <!-- Task info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-[11px] font-medium text-text-primary">#{{ idx + 1 }}</span>
                  <div class="flex items-center gap-1.5">
                    <!-- Status badge -->
                    <span v-if="task.status === 'pending'" class="text-[10px] text-text-tertiary px-1.5 py-0.5 rounded bg-surface-2">待生成</span>
                    <span v-else-if="task.status === 'generating'" class="text-[10px] text-primary-600 px-1.5 py-0.5 rounded bg-primary-50 flex items-center gap-1">
                      <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                      生成中
                    </span>
                    <span v-else-if="task.status === 'done'" class="text-[10px] text-green-600 px-1.5 py-0.5 rounded bg-green-50">完成</span>
                    <span v-else-if="task.status === 'error'" class="text-[10px] text-red-500 px-1.5 py-0.5 rounded bg-red-50">失败</span>
                    <!-- Remove button -->
                    <button v-if="!batchRunning" @click="removeTask(idx)" class="p-0.5 text-text-tertiary hover:text-red-500 transition-colors">
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>

                <!-- Custom prompt (or show default) -->
                <p class="text-[11px] text-text-secondary line-clamp-2 mb-1.5">{{ task.customPrompt || defaultPrompt || '(未设置提示词)' }}</p>

                <!-- Custom size/quality display -->
                <div class="flex items-center gap-2 text-[10px] text-text-tertiary">
                  <span>{{ task.customSize || defaultSize }}</span>
                  <span>{{ getQualityLabel(task.customQuality || defaultQuality) }}</span>
                </div>
              </div>

              <!-- Result thumbnail -->
              <div v-if="task.status === 'done' && task.resultPath" class="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-surface-2 relative group/result">
                <img :src="localFileUrl(task.resultPath!)" class="w-full h-full object-cover cursor-pointer" @click="previewImage = localFileUrl(task.resultPath!)" />
                <div class="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover/result:opacity-100 transition-opacity bg-black/30">
                  <button @click.stop="copyImage(task.resultPath!)" class="w-7 h-7 rounded-lg bg-black/50 hover:bg-black/70 text-white flex items-center justify-center" title="复制图片">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" /></svg>
                  </button>
                  <button @click.stop="editImage" class="w-7 h-7 rounded-lg bg-black/50 hover:bg-black/70 text-white flex items-center justify-center" title="编辑">
                    <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" /></svg>
                  </button>
                </div>
              </div>
            </div>

            <!-- Expandable custom settings -->
            <div v-if="!batchRunning" class="border-t border-surface-2">
              <button @click="task.expanded = !task.expanded" class="w-full px-3 py-1.5 text-[10px] text-text-tertiary hover:text-text-secondary flex items-center justify-center gap-1 transition-colors">
                <svg :class="['w-3 h-3 transition-transform', task.expanded ? 'rotate-180' : '']" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
                {{ task.expanded ? '收起' : '自定义设置' }}
              </button>
              <div v-if="task.expanded" class="px-3 pb-3 space-y-3">
                <div>
                  <label class="text-[10px] font-medium text-text-tertiary mb-1 block">自定义提示词 (留空使用默认)</label>
                  <textarea v-model="task.customPrompt" rows="2" class="w-full px-2 py-1.5 text-[11px] bg-surface-1 border border-surface-3 rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-primary-500 placeholder:text-text-disabled" placeholder="留空使用默认提示词..."></textarea>
                </div>
                <div class="flex gap-3">
                  <div class="flex-1">
                    <label class="text-[10px] font-medium text-text-tertiary mb-1 block">尺寸</label>
                    <select v-model="task.customSize" class="w-full px-2 py-1.5 text-[11px] bg-surface-1 border border-surface-3 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500">
                      <option value="">默认 ({{ defaultSize }})</option>
                      <option v-for="s in sizeOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
                    </select>
                  </div>
                  <div class="flex-1">
                    <label class="text-[10px] font-medium text-text-tertiary mb-1 block">画质</label>
                    <select v-model="task.customQuality" class="w-full px-2 py-1.5 text-[11px] bg-surface-1 border border-surface-3 rounded-md focus:outline-none focus:ring-1 focus:ring-primary-500">
                      <option value="">默认 ({{ getQualityLabel(defaultQuality) }})</option>
                      <option v-for="q in qualityOptions" :key="q.value" :value="q.value">{{ q.label }}</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <!-- Error message -->
            <div v-if="task.status === 'error' && task.error" class="px-3 pb-2">
              <p class="text-[10px] text-red-500">{{ task.error }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Preset Prompt Modal -->
    <div v-if="showPresetPopup" class="fixed inset-0 z-50 flex items-center justify-center" @click.self="showPresetPopup = false">
      <div class="w-[480px] max-h-[70vh] bg-surface-0 border border-surface-3 rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.12)] flex flex-col">
        <div class="flex items-center justify-between px-5 py-3.5 border-b border-surface-3">
          <h3 class="text-sm font-semibold text-text-primary">预设提示词</h3>
          <button @click="showPresetPopup = false" class="p-1 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-surface-2 transition-colors">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <div v-for="cat in promptPresets" :key="cat.id">
            <div class="text-[10px] font-semibold text-text-tertiary uppercase tracking-wide mb-2">{{ cat.name }}</div>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="item in cat.items"
                :key="item.id"
                @click="defaultPrompt = item.content; showPresetPopup = false"
                class="text-left p-3 rounded-xl border border-surface-3 hover:border-primary-400 hover:bg-primary-50 transition-colors"
              >
                <div class="text-xs font-medium text-text-primary mb-1">{{ item.label }}</div>
                <div class="text-[10px] text-text-tertiary line-clamp-2">{{ item.content }}</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <div v-if="copyToast" class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-surface-0 shadow-lg border border-surface-3 text-xs text-text-primary">{{ copyToast }}</div>

    <!-- Image Preview Overlay -->
    <div v-if="previewImage" class="fixed inset-0 z-50 flex items-center justify-center" @click="previewImage = null">
      <div class="max-w-[90vw] max-h-[90vh] rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.15)]" @click.stop>
        <img :src="previewImage" class="max-w-full max-h-[90vh] object-contain" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, reactive } from 'vue'
import { useImageGenStore } from '@/stores/image-gen'
import { useModelStore } from '@/stores/models'
import { usePromptPresetStore } from '@/stores/prompt-presets'

interface BatchTask {
  id: string
  refImage: string
  customPrompt: string
  customSize: string
  customQuality: string
  status: 'pending' | 'generating' | 'done' | 'error'
  error: string
  resultPath: string | null
  expanded: boolean
}

const store = useImageGenStore()
const modelStore = useModelStore()
const presetStore = usePromptPresetStore()

const promptPresets = computed(() => presetStore.visibleGrouped('image_gen'))

const defaultPrompt = ref('')
const selectedProviderId = ref('')
const selectedModelId = ref('')
const optimizeProviderId = ref('')
const optimizeModelId = ref('')
const defaultSize = ref('1:1')
const defaultQuality = ref('auto')
const optimizing = ref(false)
const showPresetPopup = ref(false)
const batchRunning = ref(false)
const previewImage = ref<string | null>(null)
const tasks = ref<BatchTask[]>([])

function localFileUrl(path: string): string {
  const isAbsolute = /^[A-Za-z]:|^\//.test(path)
  const param = isAbsolute ? 'p' : 'rel'
  return 'local-file://img?' + param + '=' + encodeURIComponent(path)
}

const IMAGE_KEYWORDS = ['image', 'dall-e', 'flux', 'stable-diffusion', 'sdxl', 'cogview', 'wanx', 'kolors', 'gpt-image']
const LANGUAGE_KEYWORDS = ['gpt', 'claude', 'qwen', 'glm', 'kimi', 'deepseek', 'llama', 'mistral', 'gemma', 'yi-', 'baichuan', 'internlm', 'chat', 'turbo', 'lite', 'plus', 'pro', 'max', 'sonnet', 'opus', 'haiku']
const NON_LANGUAGE_KEYWORDS = ['image', 'dall-e', 'flux', 'stable-diffusion', 'sdxl', 'cogview', 'wanx', 'kolors', 'embedding', 'embed', 'bge', 'e5-', 'text-embedding', 'tts', 'whisper', 'audio', 'speech', 'asr', 'rerank', 'reranker']

function isImageModel(m: string) {
  const lower = m.toLowerCase()
  return IMAGE_KEYWORDS.some(k => lower.includes(k))
}
function isLanguageModel(m: string) {
  const lower = m.toLowerCase()
  if (NON_LANGUAGE_KEYWORDS.some(k => lower.includes(k))) return false
  return LANGUAGE_KEYWORDS.some(k => lower.includes(k))
}

const imageProviders = computed(() =>
  modelStore.providers.filter(p => p.models.some(isImageModel) || !p.models.length)
)
const languageProviders = computed(() =>
  modelStore.providers.filter(p => p.models.some(isLanguageModel) || !p.models.length)
)

const selectedProviderModels = computed(() => {
  if (!selectedProviderId.value) return []
  const p = modelStore.providers.find((p) => p.id === selectedProviderId.value)
  if (!p) return []
  const filtered = p.models.filter(isImageModel)
  return filtered.length ? filtered : p.models
})

const optimizeProviderModels = computed(() => {
  if (!optimizeProviderId.value) return []
  const p = modelStore.providers.find((p) => p.id === optimizeProviderId.value)
  if (!p) return []
  const filtered = p.models.filter(isLanguageModel)
  return filtered.length ? filtered : p.models
})

const sizeOptions = [
  { label: '1:1', value: '1:1' },
  { label: '3:2', value: '3:2' },
  { label: '2:3', value: '2:3' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' }
]

const qualityOptions = [
  { label: '自动', value: 'auto' },
  { label: '标准', value: 'standard' },
  { label: '高清', value: 'hd' }
]

function getQualityLabel(value: string): string {
  return qualityOptions.find(q => q.value === value)?.label || value
}

const canStart = computed(() =>
  tasks.value.length > 0 &&
  (defaultPrompt.value.trim() || tasks.value.every(t => t.customPrompt.trim())) &&
  selectedProviderId.value &&
  selectedModelId.value
)

const completedCount = computed(() =>
  tasks.value.filter(t => t.status === 'done' || t.status === 'error').length
)

function compressImage(dataUri: string, maxSize: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = reject
    img.src = dataUri
  })
}

let taskIdCounter = 0

async function pickRefImages() {
  try {
    const result = await (window as any).api.dialog.openFile({
      title: '选择参考图片',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled || !result.filePaths.length) return

    for (const filePath of result.filePaths) {
      const ext = filePath.split('.').pop()?.toLowerCase() || 'png'
      const raw = await (window as any).api.chat.invoke('readFileBase64', filePath)
      const dataUri = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${raw}`
      const compressed = await compressImage(dataUri, 1024, 0.8)
      tasks.value.push(reactive({
        id: `batch-${++taskIdCounter}`,
        refImage: compressed,
        customPrompt: '',
        customSize: '',
        customQuality: '',
        status: 'pending' as const,
        error: '',
        resultPath: null,
        expanded: false
      }))
    }
  } catch (e) {
    console.error('Failed to pick ref images:', e)
  }
}

function removeTask(idx: number) {
  tasks.value.splice(idx, 1)
}

function clearAll() {
  tasks.value = []
}

const OPTIMIZE_CN_PROMPT = `你是一个专业的 AI 图片生成提示词工程师。请将以下描述优化为高质量的中文生图提示词。

优化要求：
1. 保持原始创意意图不变
2. 补充画面构图、光影、色调、风格等专业描述
3. 增加细节描述（材质、纹理、氛围等）
4. 结构清晰，主体描述在前，风格修饰在后
5. 控制在 200 字以内

请直接输出优化后的提示词，不要包含任何解释。`

const OPTIMIZE_EN_PROMPT = `You are a professional AI image generation prompt engineer. Optimize the following description into a high-quality English image generation prompt.

Requirements:
1. Preserve the original creative intent
2. Add composition, lighting, color tone, and style descriptors
3. Include detail descriptions (materials, textures, atmosphere)
4. Structure: subject first, then style modifiers
5. Keep within 200 words

Output only the optimized prompt, no explanations.`

async function optimizeDefaultPrompt(lang: 'cn' | 'en') {
  if (!defaultPrompt.value.trim() || !optimizeProviderId.value || !optimizeModelId.value) return
  optimizing.value = true
  try {
    const systemPrompt = lang === 'cn' ? OPTIMIZE_CN_PROMPT : OPTIMIZE_EN_PROMPT
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: defaultPrompt.value }
    ]
    const result = await (window as any).api.llm.invoke('call', optimizeProviderId.value, optimizeModelId.value, messages)
    if (result) defaultPrompt.value = result
  } catch (e: any) {
    console.error('Optimize failed:', e)
  } finally {
    optimizing.value = false
  }
}

async function startAll() {
  if (!canStart.value || batchRunning.value) return
  batchRunning.value = true

  for (const task of tasks.value) {
    if (task.status === 'done') continue
    task.status = 'generating'
    task.error = ''
    try {
      const prompt = task.customPrompt.trim() || defaultPrompt.value.trim()
      const size = task.customSize || defaultSize.value
      const quality = task.customQuality || defaultQuality.value

      const countBefore = store.generations.length
      await store.generate({
        prompt,
        refImages: [task.refImage],
        modelProviderId: selectedProviderId.value,
        modelId: selectedModelId.value,
        size,
        quality,
        batchCount: 1
      })

      // Find newly added generation
      const newGen = store.generations.find((g, i) => i < store.generations.length - countBefore + 1 && g.status === 'done' && g.result_path)
        || store.generations[0]
      task.status = 'done'
      task.resultPath = newGen?.result_path || null
    } catch (e: any) {
      task.status = 'error'
      task.error = e?.message || '生成失败'
    }
  }

  batchRunning.value = false
}

const copyToast = ref('')

async function copyImage(path: string) {
  try {
    const res = await window.api.clipboard.writeImage(path)
    if (res.success) {
      copyToast.value = '已复制到剪贴板'
    } else {
      copyToast.value = '复制失败: ' + (res.error || '')
    }
  } catch (e: any) {
    copyToast.value = '复制失败'
  }
  setTimeout(() => { copyToast.value = '' }, 2000)
}

function editImage() {
  copyToast.value = '图片编辑功能开发中'
  setTimeout(() => { copyToast.value = '' }, 2000)
}

watch(selectedModelId, (v) => {
  if (v) {
    window.api.settings.invoke('set', 'imagegen_provider_id', selectedProviderId.value)
    window.api.settings.invoke('set', 'imagegen_model_id', v)
  }
})
watch(optimizeModelId, (v) => {
  if (v) {
    window.api.settings.invoke('set', 'imagegen_optimize_provider_id', optimizeProviderId.value)
    window.api.settings.invoke('set', 'imagegen_optimize_model_id', v)
  }
})

onMounted(async () => {
  store.listenProgress()
  await Promise.all([store.fetchGenerations(), modelStore.fetchProviders(), presetStore.fetchAll('image_gen')])

  const all = (await window.api.settings.invoke('getAll')) as Record<string, string>
  if (all['imagegen_provider_id']) selectedProviderId.value = all['imagegen_provider_id']
  if (all['imagegen_model_id']) selectedModelId.value = all['imagegen_model_id']
  if (all['imagegen_optimize_provider_id']) optimizeProviderId.value = all['imagegen_optimize_provider_id']
  if (all['imagegen_optimize_model_id']) optimizeModelId.value = all['imagegen_optimize_model_id']
})

onUnmounted(() => {
  store.stopListenProgress()
})
</script>
