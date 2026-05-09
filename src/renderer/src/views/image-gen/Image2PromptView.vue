<template>
  <div class="h-full flex overflow-hidden">
    <!-- Left: Config -->
    <div class="w-72 flex-shrink-0 border-r border-surface-3 bg-surface-0 flex flex-col overflow-y-auto">
      <div class="p-4 space-y-5">
        <h3 class="text-xs font-semibold text-text-primary tracking-wide uppercase">反推配置</h3>

        <!-- Vision Model -->
        <div>
          <label class="text-xs font-medium text-text-secondary mb-1.5 block">视觉模型</label>
          <select
            v-model="visionProviderId"
            @change="visionModelId = ''"
            class="w-full px-3 py-2 text-xs bg-surface-1 border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 mb-2"
          >
            <option value="">-- 选择服务商 --</option>
            <option v-for="p in modelStore.providers" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <select
            v-model="visionModelId"
            class="w-full px-3 py-2 text-xs bg-surface-1 border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            :disabled="!currentProviderModels.length"
          >
            <option value="">-- 选择模型 --</option>
            <optgroup v-if="modelGroups.recommended.length" label="推荐">
              <option v-for="m in modelGroups.recommended" :key="m" :value="m">{{ m }}</option>
            </optgroup>
          </select>
          <input
            v-if="visionProviderId && !currentProviderModels.length"
            v-model="visionModelId"
            placeholder="输入模型名称"
            class="w-full mt-2 px-3 py-2 text-xs bg-surface-1 border border-surface-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <p class="text-[10px] text-text-tertiary mt-1.5">需支持图像输入的多模态模型（如 GPT-4o、Claude 3、Gemini、Qwen-VL 等）</p>
        </div>

        <!-- Output Language -->
        <div>
          <label class="text-xs font-medium text-text-secondary mb-1.5 block">输出语言</label>
          <div class="grid grid-cols-2 gap-1.5">
            <button
              v-for="l in langOptions"
              :key="l.value"
              @click="l.value === 'cn' && forceEnglish ? null : (outputLang = l.value)"
              :disabled="l.value === 'cn' && forceEnglish"
              :class="['px-2 py-2 text-[11px] rounded-lg border transition-colors text-center', outputLang === l.value ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium' : 'border-surface-3 bg-surface-1 text-text-secondary hover:bg-surface-2', l.value === 'cn' && forceEnglish ? 'opacity-40 cursor-not-allowed hover:bg-surface-1' : '']"
              :title="l.value === 'cn' && forceEnglish ? '该风格仅支持英文' : ''"
            >{{ l.label }}</button>
          </div>
          <p v-if="forceEnglish" class="text-[10px] text-text-tertiary mt-1">当前风格仅支持英文输出</p>
        </div>

        <!-- Style Preset -->
        <div>
          <label class="text-xs font-medium text-text-secondary mb-1.5 block">风格模板</label>
          <div class="grid grid-cols-2 gap-1.5">
            <button
              v-for="s in styleOptions"
              :key="s.value"
              @click="stylePreset = s.value"
              :class="['px-2 py-2 text-[11px] rounded-lg border transition-colors text-center', stylePreset === s.value ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium' : 'border-surface-3 bg-surface-1 text-text-secondary hover:bg-surface-2']"
            >{{ s.label }}</button>
          </div>
        </div>

        <!-- System Prompt (editable) -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="text-xs font-medium text-text-secondary">系统提示词</label>
            <button
              @click="resetSystemPrompt"
              class="text-[10px] text-text-tertiary hover:text-primary-600 transition-colors"
            >重置</button>
          </div>
          <textarea
            v-model="systemPrompt"
            rows="5"
            class="w-full px-3 py-2 text-xs bg-surface-1 border border-surface-3 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder:text-text-disabled"
          ></textarea>
        </div>

        <!-- Concurrency -->
        <div>
          <label class="text-xs font-medium text-text-secondary mb-1.5 block">并发数</label>
          <div class="grid grid-cols-4 gap-1.5">
            <button
              v-for="n in [1, 2, 3, 5]"
              :key="n"
              @click="concurrency = n"
              :class="['px-2 py-2 text-[11px] rounded-lg border transition-colors text-center', concurrency === n ? 'border-primary-500 bg-primary-50 text-primary-700 font-medium' : 'border-surface-3 bg-surface-1 text-text-secondary hover:bg-surface-2']"
            >{{ n }}</button>
          </div>
          <p class="text-[10px] text-text-tertiary mt-1">同时处理任务数，过高可能触发限流</p>
        </div>

        <!-- Upload -->
        <div>
          <div class="flex gap-2">
            <button
              @click="pickImages"
              :disabled="tasks.length >= MAX_TASKS"
              class="flex-1 px-3 py-2.5 text-xs font-medium border-2 border-dashed border-surface-4 rounded-lg text-text-tertiary hover:text-text-secondary hover:border-surface-5 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              添加图片
            </button>
            <button
              @click="showGalleryPicker = true"
              :disabled="tasks.length >= MAX_TASKS"
              class="flex-1 px-3 py-2.5 text-xs font-medium border-2 border-dashed border-surface-4 rounded-lg text-text-tertiary hover:text-text-secondary hover:border-surface-5 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke-width="2"/><circle cx="8.5" cy="8.5" r="1.5" stroke-width="2"/><polyline points="21 15 16 10 5 21" stroke-width="2"/></svg>
              图库选图
            </button>
          </div>
          <p class="text-[10px] text-text-tertiary mt-1 text-center">{{ tasks.length }} / {{ MAX_TASKS }}</p>
        </div>

        <!-- Batch Action -->
        <button
          @click="runAll"
          :disabled="!canRunAll || running"
          :class="['w-full py-3 rounded-xl text-xs font-semibold transition-all', canRunAll && !running ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm' : 'bg-surface-2 text-text-disabled cursor-not-allowed']"
        >
          {{ running ? `反推中 (${completedCount}/${tasks.length})` : `批量反推 (${pendingCount} 张)` }}
        </button>
      </div>
    </div>

    <!-- Right: Task List -->
    <div class="flex-1 flex flex-col bg-surface-1 overflow-hidden">
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-2.5 border-b border-surface-3 bg-surface-0">
        <div class="flex items-center gap-2">
          <h3 class="text-xs font-semibold text-text-primary">图片任务</h3>
          <span class="text-[10px] text-text-tertiary">{{ tasks.length }} 张 · 已完成 {{ completedCount }}</span>
        </div>
        <div class="flex items-center gap-2">
          <button
            v-if="tasks.length && !running"
            @click="copyAll"
            class="text-[10px] text-text-tertiary hover:text-primary-600 transition-colors"
          >复制全部</button>
          <button
            v-if="tasks.length && !running"
            @click="clearAll"
            class="text-[10px] text-text-tertiary hover:text-red-500 transition-colors"
          >清空全部</button>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-4">
        <!-- Empty state -->
        <div v-if="!tasks.length" class="flex-1 flex flex-col items-center justify-center py-20">
          <div class="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
            <svg class="w-8 h-8 text-text-disabled" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z" /></svg>
          </div>
          <p class="text-sm font-medium text-text-secondary mb-1">添加图片开始反推提示词</p>
          <p class="text-xs text-text-tertiary">最多支持 {{ MAX_TASKS }} 张图片，点击左侧"添加图片"上传</p>
        </div>

        <!-- Task cards -->
        <div v-else class="grid grid-cols-1 gap-3">
          <div
            v-for="(task, idx) in tasks"
            :key="task.id"
            :class="['rounded-xl border bg-surface-0 overflow-hidden', task.status === 'error' ? 'border-red-300' : task.status === 'done' ? 'border-green-300' : 'border-surface-3']"
          >
            <div class="flex gap-3 p-3">
              <!-- Thumbnail -->
              <div class="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 bg-surface-2 cursor-pointer" @click="previewImage = task.image">
                <img :src="task.image" class="w-full h-full object-cover" />
              </div>

              <!-- Content -->
              <div class="flex-1 min-w-0">
                <!-- Header -->
                <div class="flex items-center justify-between mb-1.5">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="text-[11px] font-medium text-text-primary flex-shrink-0">#{{ idx + 1 }}</span>
                    <span class="text-[10px] text-text-tertiary truncate">{{ task.name }}</span>
                  </div>
                  <div class="flex items-center gap-1.5 flex-shrink-0">
                    <span v-if="task.status === 'pending'" class="text-[10px] text-text-tertiary px-1.5 py-0.5 rounded bg-surface-2">待反推</span>
                    <span v-else-if="task.status === 'running'" class="text-[10px] text-primary-600 px-1.5 py-0.5 rounded bg-primary-50 flex items-center gap-1">
                      <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                      反推中
                    </span>
                    <span v-else-if="task.status === 'done'" class="text-[10px] text-green-600 px-1.5 py-0.5 rounded bg-green-50">完成</span>
                    <span v-else-if="task.status === 'error'" class="text-[10px] text-red-500 px-1.5 py-0.5 rounded bg-red-50" :title="task.error">失败</span>
                    <button
                      v-if="!running"
                      @click="removeTask(idx)"
                      class="p-0.5 text-text-tertiary hover:text-red-500 transition-colors"
                      title="删除"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>

                <!-- Result -->
                <textarea
                  v-model="task.result"
                  :placeholder="task.status === 'error' ? task.error : '反推结果将显示在此处…'"
                  rows="3"
                  class="w-full px-2.5 py-1.5 text-xs bg-surface-1 border border-surface-3 rounded-lg resize-y focus:outline-none focus:ring-1 focus:ring-primary-500 placeholder:text-text-disabled"
                ></textarea>

                <!-- Actions -->
                <div class="flex items-center justify-end gap-1.5 mt-1.5">
                  <button
                    v-if="!running && task.status !== 'running'"
                    @click="runOne(task)"
                    :disabled="!canRunOne"
                    class="px-2.5 py-1 text-[11px] font-medium text-primary-600 hover:bg-primary-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >{{ task.status === 'done' ? '重新反推' : '反推' }}</button>
                  <button
                    v-if="task.result.trim()"
                    @click="copyText(task.result)"
                    class="px-2.5 py-1 text-[11px] font-medium text-text-secondary hover:bg-surface-2 rounded-md transition-colors"
                  >复制</button>
                  <button
                    v-if="task.result.trim()"
                    @click="sendToImageGen(task.result)"
                    class="px-2.5 py-1 text-[11px] font-medium text-text-secondary hover:bg-surface-2 rounded-md transition-colors"
                    title="用此提示词跳转到 AI 生图"
                  >生图</button>
                  <button
                    v-if="task.result.trim()"
                    @click="sendToPresets(task.result)"
                    class="px-2.5 py-1 text-[11px] font-medium text-text-secondary hover:bg-surface-2 rounded-md transition-colors"
                    title="存为生图预设提示词"
                  >存入预设</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <div v-if="toast" class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-surface-0 shadow-lg border border-surface-3 text-xs text-text-primary">{{ toast }}</div>

    <!-- Image Preview -->
    <div v-if="previewImage" class="fixed inset-0 z-50 flex items-center justify-center p-8" @click="previewImage = null">
      <div class="max-w-[90vw] max-h-[90vh] rounded-2xl overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.15)]" @click.stop>
        <img :src="previewImage" class="max-w-full max-h-[90vh] object-contain" />
      </div>
    </div>
    <GalleryPicker v-model:visible="showGalleryPicker" :multiple="true" @select="onGalleryPickImages" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, reactive } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useModelStore } from '@/stores/models'
import { useImage2PromptStore } from '@/stores/image2prompt'
import type { Task as Image2PromptTask } from '@/stores/image2prompt'
import { groupAndSort } from '@/utils/model-caps'
import { recordUsage, warmHintsCache, getHintsSync } from '@/utils/model-usage-hints'
import { stripImageMetadata } from '@shared/strip-image-metadata'
import GalleryPicker from '@/components/GalleryPicker.vue'

// Task 类型已提到 stores/image2prompt.ts，下面作为本地别名使用
type Task = Image2PromptTask

const router = useRouter()
const modelStore = useModelStore()

const MAX_TASKS = 20

// 会话级表单+任务草稿：路由切换不丢，重启 app 后重置
const formStore = useImage2PromptStore()
const {
  visionProviderId,
  visionModelId,
  outputLang,
  stylePreset,
  systemPrompt,
  concurrency,
  tasks,
  idCounter,
} = storeToRefs(formStore)

const running = ref(false)
const previewImage = ref<string | null>(null)
const toast = ref('')

// ---- Vision model grouping (via shared util) ----
// We show ALL providers and ALL their models, grouping recommended vision models
// to the top. Usage history is persisted and reused to rank more accurately.
const hintsTick = ref(0)

const currentProvider = computed(() =>
  modelStore.providers.find(p => p.id === visionProviderId.value) || null
)

const currentProviderModels = computed(() => currentProvider.value?.models ?? [])

const modelGroups = computed(() => {
  // Touch tick so that the groups update right after we record usage
  hintsTick.value
  if (!currentProvider.value) return { recommended: [], others: [] }
  return groupAndSort(currentProvider.value.models, 'vision', {
    cloudTypeOf: (mid) => modelStore.cloudTypeOf(currentProvider.value!.id, mid),
    usageHints: getHintsSync('vision', currentProvider.value.id)
  })
})

// ---- Output language / style ----
const langOptions = [
  { label: '中文', value: 'cn' as const },
  { label: '英文', value: 'en' as const }
]

const styleOptions = [
  { label: '通用描述', value: 'general' as const },
  { label: 'SD 短语', value: 'sd_phrase' as const },
  { label: 'SD 标签', value: 'sd_tag' as const },
  { label: 'Midjourney', value: 'mj' as const },
  { label: 'Danbooru', value: 'danbooru' as const }
]

// Styles that only support English output
const EN_ONLY_STYLES = new Set(['sd_tag', 'danbooru'])
const forceEnglish = computed(() => EN_ONLY_STYLES.has(stylePreset.value))

const SYSTEM_PROMPTS: Record<string, string> = {
  'general_cn': `你是一位 AI 生图提示词反推专家。你的任务是观察图片，反推出一段可直接用于 AI 文生图模型的中文提示词。根据图片实际内容，描述关键要素（如主体、场景、风格、材质、视角、光线等），简单图片简短描述，复杂图片详细描述，无需固定字数。只输出提示词本身。`,
  'general_en': `You are an AI image prompt reverse-engineering expert. Your task is to observe the image and produce a prompt that can be directly used with AI text-to-image models. Describe the key elements based on actual image content (e.g. subject, scene, style, materials, perspective, lighting). Keep it concise for simple images and detailed for complex ones — no fixed word limit. Output only the prompt itself.`,
  'sd_phrase_cn': `你是 Stable Diffusion / Flux 提示词反推专家。请观察图片，反推出可直接用于 SD/Flux 文生图的中文短语式提示词。按主体、场景、风格、材质、光影、画面质感的顺序，使用逗号分隔的短语。根据图片复杂度自行控制长度，简单图片精炼，复杂图片详尽。只输出提示词本身。`,
  'sd_phrase_en': `You are a Stable Diffusion / Flux prompt reverse-engineering expert. Observe the image and produce a phrase-style English prompt suitable for SD/Flux text-to-image generation. Use comma-separated natural-language phrases covering subject, scene, style, materials, lighting, and quality modifiers. Adapt length to image complexity. Output only the prompt itself.`,
  'sd_tag_en': `You are a Stable Diffusion tag reverse-engineering expert. Observe the image and produce an English comma-separated tag list suitable for SD text-to-image generation. Include subject, scene, style, and quality tags using concise words or short compounds. Adapt the number of tags to image complexity. Output only the tags.`,
  'mj_cn': `你是 Midjourney 提示词反推专家。请观察图片，反推出可直接用于 Midjourney 的中文提示词。描述主体、场景细节、风格氛围、光影与视角，结尾根据图片内容推荐合适的参数（如 --ar、--v、--style 等）。只输出提示词本身。`,
  'mj_en': `You are a Midjourney prompt reverse-engineering expert. Observe the image and produce an English prompt suitable for Midjourney. Describe the main subject, scene details, style and mood, camera angle and lighting. Append appropriate parameters (e.g. --ar, --v, --style) based on the image content. Output only the prompt itself.`,
  'danbooru_en': `You are a Danbooru tag reverse-engineering expert. Observe the image and produce Danbooru-style English tags separated by commas. Cover subject, clothing, pose, expression, background, and style using standard Danbooru tag format with underscores. Adapt the number of tags to image complexity. Output only the tags.`
}

function buildPromptKey(): string {
  const lang = forceEnglish.value ? 'en' : outputLang.value
  return `${stylePreset.value}_${lang}`
}

function getSystemPrompt(): string {
  const key = buildPromptKey()
  return SYSTEM_PROMPTS[key] || SYSTEM_PROMPTS['general_cn']
}

function resetSystemPrompt() {
  systemPrompt.value = getSystemPrompt()
}

// Auto-update system prompt when language/style changes (only if user hasn't diverged from presets)
const presetTexts = new Set(Object.values(SYSTEM_PROMPTS))
watch([outputLang, stylePreset], () => {
  // Force english for tag/danbooru styles
  if (forceEnglish.value && outputLang.value !== 'en') {
    outputLang.value = 'en'
    return // watch will trigger again with lang=en
  }
  if (!systemPrompt.value || presetTexts.has(systemPrompt.value)) {
    systemPrompt.value = getSystemPrompt()
  }
})

// ---- Image upload ----
function compressImage(dataUri: string, maxSize: number, quality: number): Promise<string> {
  const cleanUri = stripImageMetadata(dataUri)
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
    img.src = cleanUri
  })
}

async function pickImages() {
  if (tasks.value.length >= MAX_TASKS) return
  try {
    const result = await (window as any).api.dialog.openFile({
      title: '选择图片',
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled || !result.filePaths.length) return

    for (const filePath of result.filePaths) {
      if (tasks.value.length >= MAX_TASKS) {
        showToast(`最多支持 ${MAX_TASKS} 张图片`)
        break
      }
      const ext = filePath.split('.').pop()?.toLowerCase() || 'png'
      const raw = await (window as any).api.chat.invoke('readFileBase64', filePath)
      const dataUri = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${raw}`
      const compressed = await compressImage(dataUri, 1280, 0.85)
      const name = filePath.split(/[\\/]/).pop() || `image-${idCounter.value + 1}`
      tasks.value.push(reactive({
        id: `i2p-${++idCounter.value}`,
        image: compressed,
        name,
        status: 'pending' as const,
        result: '',
        error: ''
      }))
    }
  } catch (e) {
    console.error('Failed to pick images:', e)
    showToast('选择图片失败')
  }
}

const showGalleryPicker = ref(false)

async function onGalleryPickImages(paths: string[]) {
  if (!paths.length) return
  try {
    for (const filePath of paths) {
      if (tasks.value.length >= MAX_TASKS) {
        showToast(`最多支持 ${MAX_TASKS} 张图片`)
        break
      }
      const ext = filePath.split('.').pop()?.toLowerCase() || 'png'
      const raw = await (window as any).api.chat.invoke('readFileBase64', filePath)
      const dataUri = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${raw}`
      const compressed = await compressImage(dataUri, 1280, 0.85)
      const name = filePath.split(/[\\/]/).pop() || `image-${idCounter.value + 1}`
      tasks.value.push(reactive({
        id: `i2p-${++idCounter.value}`,
        image: compressed,
        name,
        status: 'pending' as const,
        result: '',
        error: ''
      }))
    }
  } catch (e) {
    console.error('Failed to load gallery images:', e)
    showToast('从图库加载图片失败')
  }
}

function removeTask(idx: number) {
  tasks.value.splice(idx, 1)
}

function clearAll() {
  if (running.value) return
  tasks.value = []
}

// ---- Run ----
const canRunOne = computed(() => !!visionProviderId.value && !!visionModelId.value)
const canRunAll = computed(() =>
  canRunOne.value && tasks.value.some(t => t.status !== 'done' && t.status !== 'running')
)

const pendingCount = computed(() =>
  tasks.value.filter(t => t.status !== 'done').length
)

const completedCount = computed(() =>
  tasks.value.filter(t => t.status === 'done' || t.status === 'error').length
)

async function runOne(task: Task) {
  if (!canRunOne.value) {
    showToast('请先选择视觉模型')
    return
  }
  task.status = 'running'
  task.error = ''
  try {
    const sys = systemPrompt.value.trim() || getSystemPrompt()
    const userText = outputLang.value === 'cn' ? '请为这张图片生成提示词。' : 'Please generate a prompt for this image.'
    const messages = [
      { role: 'system', content: sys },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: task.image } }
        ]
      }
    ]
    const result = await (window as any).api.llm.invoke('call', visionProviderId.value, visionModelId.value, messages)
    if (typeof result === 'string') {
      task.result = result.trim()
    } else if (result?.content) {
      task.result = String(result.content).trim()
    } else {
      task.result = String(result || '').trim()
    }
    task.status = 'done'
    // Record successful usage so this model bubbles to the top of recommended list next time
    await recordUsage('vision', visionProviderId.value, visionModelId.value)
    hintsTick.value++
  } catch (e: any) {
    task.status = 'error'
    task.error = e?.message || '反推失败'
  }
}

async function runAll() {
  if (!canRunAll.value || running.value) return
  running.value = true
  const queue = tasks.value.filter(t => t.status !== 'done' && t.status !== 'running')
  const limit = Math.max(1, concurrency.value)
  let cursor = 0

  async function worker() {
    while (cursor < queue.length) {
      const task = queue[cursor++]
      if (!task) break
      await runOne(task)
    }
  }

  const workers = Array.from({ length: Math.min(limit, queue.length) }, () => worker())
  await Promise.all(workers)
  running.value = false
}

// ---- Utilities ----
function showToast(msg: string) {
  toast.value = msg
  setTimeout(() => { toast.value = '' }, 2000)
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    showToast('已复制')
  } catch {
    showToast('复制失败')
  }
}

async function copyAll() {
  const texts = tasks.value.filter(t => t.result.trim()).map((t, i) => `[#${i + 1}] ${t.name}\n${t.result}`)
  if (!texts.length) {
    showToast('暂无可复制的结果')
    return
  }
  await copyText(texts.join('\n\n'))
}

function sendToImageGen(prompt: string) {
  router.push({ path: '/image-gen', query: { prompt } })
}

function sendToPresets(prompt: string) {
  router.push({
    path: '/prompts',
    query: { action: 'create', type: 'image_gen', content: prompt }
  })
}

// ---- Persistence ----
watch(visionModelId, (v) => {
  if (v) {
    window.api.settings.invoke('set', 'i2p_vision_provider_id', visionProviderId.value)
    window.api.settings.invoke('set', 'i2p_vision_model_id', v)
  }
})
watch(outputLang, (v) => {
  window.api.settings.invoke('set', 'i2p_output_lang', v)
})
watch(stylePreset, (v) => {
  window.api.settings.invoke('set', 'i2p_style_preset', v)
})
watch(concurrency, (v) => {
  window.api.settings.invoke('set', 'i2p_concurrency', String(v))
})

onMounted(async () => {
  await Promise.all([modelStore.fetchProviders(), warmHintsCache()])
  hintsTick.value++
  const all = (await window.api.settings.invoke('getAll')) as Record<string, string>
  if (all['i2p_vision_provider_id']) visionProviderId.value = all['i2p_vision_provider_id']
  if (all['i2p_vision_model_id']) visionModelId.value = all['i2p_vision_model_id']
  // Only accept new values ('cn'/'en' for lang; new 5-value set for style)
  const savedLang = all['i2p_output_lang']
  if (savedLang === 'cn' || savedLang === 'en') outputLang.value = savedLang
  const savedStyle = all['i2p_style_preset']
  const validStyles = ['general', 'sd_phrase', 'sd_tag', 'mj', 'danbooru']
  if (savedStyle && validStyles.includes(savedStyle)) stylePreset.value = savedStyle as any
  if (all['i2p_concurrency']) concurrency.value = Number(all['i2p_concurrency']) || 2
  // Enforce en-only constraint after restoring
  if (forceEnglish.value) outputLang.value = 'en'
  systemPrompt.value = getSystemPrompt()
})
</script>
