<template>
  <div class="h-full flex flex-col">
    <header class="page-header">
      <button class="btn-primary" @click="showForm = true; editingId = null; resetForm()">
        + 添加服务商
      </button>
    </header>
    <div class="page-body">
      <!-- Form + Type Guide -->
      <div v-if="showForm" class="flex gap-6 mb-6 max-w-4xl">
        <div class="flex-1 max-w-xl form-card">
          <div>
            <label class="form-label">名称</label>
            <input v-model="form.name" class="input-field" placeholder="例如: DeepSeek" />
          </div>
          <div>
            <label class="form-label">类型</label>
            <select v-model="form.type" class="select-field">
              <option value="openai_compatible">OpenAI 兼容</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>
          <div>
            <label class="form-label">API 基础地址</label>
            <input v-model="form.api_base" placeholder="https://api.openai.com/v1" class="input-field" />
          </div>
          <div>
            <label class="form-label">API 密钥</label>
            <input v-model="form.api_key" type="password" class="input-field" />
          </div>
          <div>
            <label class="form-label">模型列表</label>
            <div class="flex gap-2 mb-2">
              <button
                type="button"
                @click="fetchModels"
                :disabled="fetchingModels || !form.api_base"
                class="btn-secondary text-xs flex items-center gap-1.5"
              >
                <svg v-if="fetchingModels" class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-25" /><path d="M4 12a8 8 0 018-8" stroke="currentColor" stroke-width="3" stroke-linecap="round" class="opacity-75" /></svg>
                <span>{{ fetchingModels ? '获取中...' : '从 API 获取模型' }}</span>
              </button>
              <span v-if="fetchError" class="text-xs text-red-500 self-center">{{ fetchError }}</span>
            </div>
            <!-- Search + Select -->
            <div v-if="remoteModels.length" class="border border-surface-3 rounded-lg overflow-hidden">
              <input
                v-model="modelSearch"
                placeholder="搜索模型..."
                class="w-full px-3 py-2 text-xs border-b border-surface-3 bg-surface-0 outline-none focus:bg-white"
              />
              <div class="max-h-40 overflow-y-auto p-2 space-y-0.5">
                <label v-if="filteredRemoteModels.length" class="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer hover:bg-surface-2 transition-colors font-medium border-b border-surface-3 mb-1 pb-1.5">
                  <input type="checkbox" :checked="isAllFilteredSelected" @change="toggleSelectAll" class="rounded" />
                  <span>全选</span>
                  <span class="text-text-tertiary font-normal">({{ filteredRemoteModels.length }})</span>
                </label>
                <label
                  v-for="m in filteredRemoteModels"
                  :key="m"
                  class="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs cursor-pointer hover:bg-surface-2 transition-colors"
                >
                  <input type="checkbox" :value="m" v-model="selectedModels" class="rounded" />
                  <span class="truncate">{{ m }}</span>
                </label>
                <div v-if="!filteredRemoteModels.length" class="text-xs text-text-tertiary px-2 py-1">无匹配模型</div>
              </div>
            </div>
            <!-- Manual fallback -->
            <div v-else class="mt-1">
              <input v-model="modelsInput" placeholder="手动输入（逗号分隔）: gpt-4o, gpt-4o-mini" class="input-field" />
            </div>
            <!-- Selected models tags -->
            <div v-if="selectedModels.length" class="flex flex-wrap gap-1.5 mt-2">
              <span
                v-for="m in selectedModels"
                :key="m"
                class="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 text-primary-700 rounded-md text-xs"
              >
                {{ m }}
                <button @click="selectedModels = selectedModels.filter(x => x !== m)" class="hover:text-primary-900">&times;</button>
              </span>
            </div>
          </div>
          <div class="flex gap-3 pt-2">
            <button @click="saveProvider" class="btn-primary">{{ editingId ? '更新' : '创建' }}</button>
            <button @click="showForm = false" class="btn-secondary">取消</button>
          </div>
        </div>
        <!-- Type descriptions -->
        <div class="w-64 flex-shrink-0 space-y-3 pt-1">
          <h3 class="text-xs font-semibold text-text-primary mb-2">类型说明</h3>
          <div :class="['p-3 rounded-xl border transition-colors', form.type === 'openai_compatible' ? 'border-primary-300 bg-primary-50/50' : 'border-surface-3 bg-surface-0']">
            <div class="text-xs font-semibold text-text-primary mb-1">OpenAI 兼容</div>
            <p class="text-xs text-text-tertiary leading-relaxed">适用于兼容 OpenAI API 格式的第三方服务，如 DeepSeek、通义千问、Moonshot、Ollama 等本地或云端模型。</p>
          </div>
          <div :class="['p-3 rounded-xl border transition-colors', form.type === 'openai' ? 'border-primary-300 bg-primary-50/50' : 'border-surface-3 bg-surface-0']">
            <div class="text-xs font-semibold text-text-primary mb-1">OpenAI</div>
            <p class="text-xs text-text-tertiary leading-relaxed">直接对接 OpenAI 官方 API，支持 GPT-4o、GPT-4o-mini 等模型，需使用官方 API Key。</p>
          </div>
          <div :class="['p-3 rounded-xl border transition-colors', form.type === 'anthropic' ? 'border-primary-300 bg-primary-50/50' : 'border-surface-3 bg-surface-0']">
            <div class="text-xs font-semibold text-text-primary mb-1">Anthropic</div>
            <p class="text-xs text-text-tertiary leading-relaxed">对接 Anthropic Claude 系列模型，支持 Claude 3.5 Sonnet、Claude 3 Opus 等，需使用 Anthropic API Key。</p>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="store.providers.length === 0 && !showForm" class="empty-state">
        <div class="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-text-disabled" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" /></svg>
        </div>
        <p class="text-sm font-medium text-text-secondary mb-1">暂无模型服务商</p>
        <p class="text-xs">点击上方按钮添加你的第一个模型服务商</p>
      </div>

      <!-- List -->
      <div v-else class="space-y-3 max-w-xl">
        <div v-for="provider in store.providers" :key="provider.id" class="card p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center">
                <span class="text-primary-600 text-sm font-bold">{{ provider.name.charAt(0).toUpperCase() }}</span>
              </div>
              <div>
                <div class="font-semibold text-sm text-text-primary">{{ provider.name }}</div>
                <div class="text-xs text-text-tertiary mt-0.5">{{ provider.type }}</div>
              </div>
            </div>
            <div class="flex gap-1">
              <template v-if="!provider.isCloud">
                <button @click="queryModels(provider)" class="btn-ghost">查询模型</button>
                <button @click="openStats(provider.id)" class="btn-ghost">统计</button>
                <button @click="editProvider(provider)" class="btn-ghost">编辑</button>
                <button @click="removeProvider(provider.id)" class="btn-danger">删除</button>
              </template>
              <span v-else class="text-[10px] px-2 py-1 bg-primary-50 text-primary-600 rounded-lg font-medium">Cloud</span>
            </div>
          </div>
          <div class="text-xs text-text-tertiary space-y-1 pl-[52px]">
            <div v-if="provider.api_base">地址: {{ provider.api_base }}</div>
            <div class="flex flex-wrap gap-1 mt-1">
              <span v-for="m in provider.models.slice(0, 5)" :key="m" class="px-2 py-0.5 bg-surface-2 rounded-md text-text-secondary">{{ m }}</span>
              <span v-if="provider.models.length > 5" class="px-2 py-0.5 text-text-tertiary" :title="provider.models.slice(5).join(', ')">...+{{ provider.models.length - 5 }}</span>
              <span v-if="!provider.models.length" class="text-text-disabled">未配置模型</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Query Models Dialog -->
    <div v-if="showModelsQuery" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="bg-white rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.12)] w-[560px] max-h-[80vh] flex flex-col" @click.stop>
        <div class="flex items-center justify-between px-6 py-4 border-b border-surface-3">
          <h3 class="text-sm font-semibold text-text-primary">{{ queryProviderName }} - 可用模型</h3>
          <button @click="showModelsQuery = false" class="text-text-tertiary hover:text-text-primary transition-colors">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div class="px-6 py-4 overflow-y-auto flex-1">
          <div v-if="queryLoading" class="text-xs text-text-tertiary text-center py-8">查询中...</div>
          <div v-else-if="queryError" class="text-xs text-red-500 text-center py-8">{{ queryError }}</div>
          <div v-else-if="!Object.keys(categorizedModels).length" class="text-xs text-text-tertiary text-center py-8">无可用模型</div>
          <div v-else class="space-y-4">
            <div v-for="(models, category) in categorizedModels" :key="category">
              <div class="flex items-center gap-2 mb-2">
                <span :class="['w-2 h-2 rounded-full', categoryColors[category] || 'bg-gray-400']"></span>
                <span class="text-xs font-semibold text-text-primary">{{ category }}</span>
                <span class="text-[10px] text-text-tertiary">({{ models.length }})</span>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <span v-for="m in models" :key="m" class="px-2 py-0.5 bg-surface-2 rounded-md text-xs text-text-secondary">{{ m }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="px-6 py-3 border-t border-surface-3 flex justify-between items-center">
          <span class="text-[10px] text-text-tertiary">共 {{ queryTotalCount }} 个模型</span>
          <button @click="showModelsQuery = false" class="btn-secondary text-xs">关闭</button>
        </div>
      </div>
    </div>

    <!-- Stats Dialog -->
    <div v-if="showStats" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="bg-white rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.12)] w-[480px] max-h-[80vh] flex flex-col" @click.stop>
        <div class="flex items-center justify-between px-6 py-4 border-b border-surface-3">
          <h3 class="text-sm font-semibold text-text-primary">{{ statsData?.provider_name || '用量统计' }}</h3>
          <button @click="showStats = false" class="text-text-tertiary hover:text-text-primary transition-colors">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div class="px-6 py-4 overflow-y-auto flex-1">
          <div v-if="statsLoading" class="text-xs text-text-tertiary text-center py-8">加载中...</div>
          <div v-else-if="!statsData || statsData.call_count === 0" class="text-xs text-text-tertiary text-center py-8">暂无用量数据</div>
          <div v-else>
            <div class="grid grid-cols-3 gap-3 mb-5">
              <div class="bg-surface-1 rounded-xl p-3 text-center">
                <div class="text-lg font-bold text-text-primary">{{ formatNumber(statsData.total_tokens) }}</div>
                <div class="text-[10px] text-text-tertiary mt-0.5">总 Tokens</div>
              </div>
              <div class="bg-surface-1 rounded-xl p-3 text-center">
                <div class="text-lg font-bold text-text-primary">{{ formatNumber(statsData.prompt_tokens) }}</div>
                <div class="text-[10px] text-text-tertiary mt-0.5">输入 Tokens</div>
              </div>
              <div class="bg-surface-1 rounded-xl p-3 text-center">
                <div class="text-lg font-bold text-text-primary">{{ formatNumber(statsData.completion_tokens) }}</div>
                <div class="text-[10px] text-text-tertiary mt-0.5">输出 Tokens</div>
              </div>
            </div>
            <div class="text-xs text-text-tertiary mb-3">共 {{ statsData.call_count }} 次调用</div>
            <div v-if="statsData.models.length" class="space-y-2">
              <div class="text-xs font-semibold text-text-secondary mb-2">各模型用量</div>
              <div v-for="m in statsData.models" :key="m.model" class="flex items-center justify-between py-2 px-3 bg-surface-1 rounded-lg">
                <div>
                  <div class="text-xs font-medium text-text-primary truncate max-w-[200px]" :title="m.model">{{ m.model }}</div>
                  <div class="text-[10px] text-text-tertiary mt-0.5">{{ m.call_count }} 次</div>
                </div>
                <div class="text-right">
                  <div class="text-xs font-semibold text-text-primary">{{ formatNumber(m.total_tokens) }}</div>
                  <div class="text-[10px] text-text-tertiary">{{ formatNumber(m.prompt_tokens) }} / {{ formatNumber(m.completion_tokens) }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-if="statsData && statsData.call_count > 0" class="px-6 py-3 border-t border-surface-3 flex justify-end">
          <button @click="clearProviderStats" class="text-xs text-red-500 hover:text-red-600 transition-colors">清除统计</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useModelStore, type ModelProvider } from '@/stores/models'

const store = useModelStore()
const showStats = ref(false)
const statsData = ref<any>(null)
const statsLoading = ref(false)
const statsProviderId = ref('')
const showForm = ref(false)
const editingId = ref<string | null>(null)
const modelsInput = ref('')
const form = ref({ name: '', type: 'openai_compatible', api_base: '', api_key: '' })

const remoteModels = ref<string[]>([])
const selectedModels = ref<string[]>([])
const modelSearch = ref('')
const fetchingModels = ref(false)
const fetchError = ref('')

const showModelsQuery = ref(false)
const queryProviderName = ref('')
const queryLoading = ref(false)
const queryError = ref('')
const queryRawModels = ref<string[]>([])

const MODEL_CATEGORIES: { name: string; keywords: string[] }[] = [
  { name: '语言模型', keywords: ['gpt', 'claude', 'qwen', 'glm', 'kimi', 'deepseek', 'llama', 'mistral', 'gemma', 'yi-', 'baichuan', 'internlm', 'chat', 'turbo', 'lite', 'plus', 'pro', 'max', 'sonnet', 'opus', 'haiku'] },
  { name: '视觉/多模态', keywords: ['vision', '-vl', 'vl-', 'multimodal', '4o', 'omni'] },
  { name: '图片生成', keywords: ['image', 'dall-e', 'flux', 'stable-diffusion', 'sdxl', 'cogview', 'wanx', 'kolors'] },
  { name: '嵌入模型', keywords: ['embedding', 'embed', 'bge', 'e5-', 'text-embedding'] },
  { name: '语音/音频', keywords: ['tts', 'whisper', 'audio', 'speech', 'asr'] },
  { name: '代码模型', keywords: ['code', 'codex', 'coder', 'starcoder', 'codellama'] },
  { name: '重排序', keywords: ['rerank', 'reranker'] }
]

const categoryColors: Record<string, string> = {
  '语言模型': 'bg-blue-500',
  '视觉/多模态': 'bg-purple-500',
  '图片生成': 'bg-pink-500',
  '嵌入模型': 'bg-teal-500',
  '语音/音频': 'bg-amber-500',
  '代码模型': 'bg-emerald-500',
  '重排序': 'bg-indigo-500',
  '其他': 'bg-gray-400'
}

function categorizeModel(modelId: string): string {
  const lower = modelId.toLowerCase()
  // Check specific categories first (more specific matches)
  for (const cat of [MODEL_CATEGORIES[3], MODEL_CATEGORIES[4], MODEL_CATEGORIES[5], MODEL_CATEGORIES[6], MODEL_CATEGORIES[2], MODEL_CATEGORIES[1]]) {
    if (cat.keywords.some(k => lower.includes(k))) return cat.name
  }
  // Default language model check
  if (MODEL_CATEGORIES[0].keywords.some(k => lower.includes(k))) return MODEL_CATEGORIES[0].name
  return '其他'
}

const categorizedModels = computed(() => {
  const groups: Record<string, string[]> = {}
  for (const m of queryRawModels.value) {
    const cat = categorizeModel(m)
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(m)
  }
  // Sort: language first, then others, "其他" last
  const order = MODEL_CATEGORIES.map(c => c.name).concat(['其他'])
  const sorted: Record<string, string[]> = {}
  for (const name of order) {
    if (groups[name]) sorted[name] = groups[name].sort()
  }
  return sorted
})

const queryTotalCount = computed(() => queryRawModels.value.length)

async function queryModels(provider: ModelProvider) {
  queryProviderName.value = provider.name
  showModelsQuery.value = true
  queryLoading.value = true
  queryError.value = ''
  queryRawModels.value = []
  try {
    const models = (await window.api.model.invoke('fetchRemote', provider.api_base, provider.api_key)) as string[]
    queryRawModels.value = models
  } catch (e: any) {
    queryError.value = e?.message || '查询失败'
  } finally {
    queryLoading.value = false
  }
}

const filteredRemoteModels = computed(() => {
  if (!modelSearch.value) return remoteModels.value
  const q = modelSearch.value.toLowerCase()
  return remoteModels.value.filter((m) => m.toLowerCase().includes(q))
})

const isAllFilteredSelected = computed(() => {
  return filteredRemoteModels.value.length > 0 && filteredRemoteModels.value.every((m) => selectedModels.value.includes(m))
})

function toggleSelectAll() {
  if (isAllFilteredSelected.value) {
    const filtered = new Set(filteredRemoteModels.value)
    selectedModels.value = selectedModels.value.filter((m) => !filtered.has(m))
  } else {
    const existing = new Set(selectedModels.value)
    for (const m of filteredRemoteModels.value) {
      if (!existing.has(m)) selectedModels.value.push(m)
    }
  }
}

async function fetchModels() {
  if (!form.value.api_base) return
  fetchingModels.value = true
  fetchError.value = ''
  try {
    const models = (await window.api.model.invoke('fetchRemote', form.value.api_base, form.value.api_key)) as string[]
    remoteModels.value = models
    if (!selectedModels.value.length && models.length) {
      selectedModels.value = []
    }
  } catch (e: any) {
    fetchError.value = e?.message || '获取失败'
  } finally {
    fetchingModels.value = false
  }
}

function resetForm() {
  form.value = { name: '', type: 'openai_compatible', api_base: '', api_key: '' }
  modelsInput.value = ''
  remoteModels.value = []
  selectedModels.value = []
  modelSearch.value = ''
  fetchError.value = ''
}

function editProvider(provider: ModelProvider) {
  editingId.value = provider.id
  form.value = {
    name: provider.name,
    type: provider.type,
    api_base: provider.api_base,
    api_key: provider.api_key
  }
  modelsInput.value = provider.models.join(', ')
  selectedModels.value = [...provider.models]
  remoteModels.value = [...provider.models]
  modelSearch.value = ''
  fetchError.value = ''
  showForm.value = true
}

async function saveProvider() {
  if (!form.value.name.trim()) {
    alert('请输入名称')
    return
  }
  if (!form.value.api_base.trim()) {
    alert('请输入 API 基础地址')
    return
  }
  try {
    const models = selectedModels.value.length
      ? selectedModels.value
      : modelsInput.value.split(',').map((m) => m.trim()).filter(Boolean)
    if (editingId.value) {
      await store.updateProvider(editingId.value, { ...form.value, models })
    } else {
      await store.createProvider({ ...form.value, models })
    }
    showForm.value = false
    resetForm()
  } catch (e: any) {
    console.error('saveProvider error:', e)
    alert('保存失败: ' + (e?.message || e))
  }
}

async function removeProvider(id: string) {
  await store.deleteProvider(id)
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

async function openStats(providerId: string) {
  statsProviderId.value = providerId
  showStats.value = true
  statsLoading.value = true
  try {
    statsData.value = await window.api.usage.invoke('getProvider', providerId)
  } catch (e: any) {
    console.error('Failed to load usage stats:', e)
    statsData.value = null
  } finally {
    statsLoading.value = false
  }
}

async function clearProviderStats() {
  if (!statsProviderId.value) return
  try {
    await window.api.usage.invoke('clear', statsProviderId.value)
    statsData.value = { ...statsData.value, call_count: 0, total_tokens: 0, prompt_tokens: 0, completion_tokens: 0, models: [] }
  } catch (e: any) {
    console.error('Failed to clear usage stats:', e)
  }
}

onMounted(() => store.fetchProviders())
</script>
