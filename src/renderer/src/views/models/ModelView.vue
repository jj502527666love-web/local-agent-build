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
              <option value="duomi">多米 API</option>
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

            <!-- 多米 API：固定只支持 gpt-image-2，不提供获取 / 手输入口 -->
            <div v-if="form.type === 'duomi'" class="text-xs space-y-1">
              <div class="flex items-center gap-2 px-3 py-2 bg-surface-1 rounded-lg border border-surface-3">
                <span class="text-text-tertiary">固定支持模型：</span>
                <span class="px-2 py-0.5 bg-primary-50 text-primary-700 rounded-md font-medium">gpt-image-2</span>
              </div>
              <p class="text-text-tertiary leading-relaxed">多米 API 不提供 /v1/models 端点，且现阶段仅支持 gpt-image-2，无需手动配置。</p>
            </div>

            <!-- 其他类型：原有获取 + 列表 + 手动输入 -->
            <template v-else>
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
                  class="w-full px-3 py-2 text-xs border-b border-surface-3 bg-surface-0 outline-none focus:bg-surface-1"
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
            </template>
          </div>
          <!-- 高级配置（可折叠）：生图请求 body 的自定义参数 + 最终覆盖 patch -->
          <!-- 仅作用于自定义 / OpenAI / 多米生图分支；云端走固定网关协议不受影响 -->
          <div class="pt-2">
            <button
              type="button"
              class="text-xs text-text-tertiary hover:text-text-primary transition-colors flex items-center gap-1"
              @click="showAdvanced = !showAdvanced"
            >
              <svg class="w-3 h-3 transition-transform" :class="showAdvanced ? 'rotate-90' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
              <span>高级配置（生图请求扩展）</span>
            </button>
            <div v-if="showAdvanced" class="mt-3 space-y-4 p-3 bg-surface-1 rounded-lg border border-surface-3">
              <!-- 自定义参数 -->
              <div>
                <div class="flex items-center justify-between mb-2">
                  <label class="form-label !mb-0">自定义参数</label>
                  <button type="button" @click="addCustomParam" class="text-xs text-primary-600 hover:text-primary-700">+ 添加</button>
                </div>
                <p class="text-[11px] text-text-tertiary leading-relaxed mb-2">
                  按顺序写入请求 body 顶层。空 value 仅占位、不下发。值会自动识别数字 / 布尔 / JSON。
                </p>
                <div v-if="form.custom_params.length === 0" class="text-[11px] text-text-disabled px-2 py-1.5">
                  暂无参数
                </div>
                <div v-else class="space-y-1.5">
                  <div v-for="(p, idx) in form.custom_params" :key="idx" class="flex gap-2">
                    <input
                      v-model="p.name"
                      placeholder="参数名 (如 seed)"
                      class="input-field flex-1 text-xs"
                    />
                    <input
                      v-model="p.value"
                      placeholder="值 (如 42 / true / hd)"
                      class="input-field flex-1 text-xs"
                    />
                    <button
                      type="button"
                      @click="removeCustomParam(idx)"
                      class="px-2 text-text-tertiary hover:text-red-500 transition-colors text-xs"
                      :title="`移除参数 ${p.name || idx + 1}`"
                    >&times;</button>
                  </div>
                </div>
              </div>

              <!-- 请求覆盖 patch (JSON) -->
              <div>
                <label class="form-label">请求覆盖 patch（JSON）</label>
                <p class="text-[11px] text-text-tertiary leading-relaxed mb-2">
                  在自定义参数之后做最终覆盖。必须是 JSON 对象（{} 形式），留空表示不下发。
                </p>
                <textarea
                  v-model="form.request_override_patch_text"
                  @input="validatePatchText"
                  placeholder='例如：{"safety_filter_level":"strict","seed":12345}'
                  rows="4"
                  class="input-field text-xs font-mono"
                ></textarea>
                <p v-if="patchParseError" class="text-[11px] text-red-500 mt-1">{{ patchParseError }}</p>
              </div>
            </div>
          </div>

          <div class="flex gap-3 pt-2">
            <button @click="saveProvider" class="btn-primary" :disabled="!!patchParseError">{{ editingId ? '更新' : '创建' }}</button>
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
          <div :class="['p-3 rounded-xl border transition-colors', form.type === 'duomi' ? 'border-primary-300 bg-primary-50/50' : 'border-surface-3 bg-surface-0']">
            <div class="text-xs font-semibold text-text-primary mb-1">多米 API</div>
            <p class="text-xs text-text-tertiary leading-relaxed">duomiapi.com 中转服务，仅支持图片生成（gpt-image-2 异步路径）。提交后内部轮询任务直至完成。不支持参考图（多米只接受图片 URL）与单次多图。</p>
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
      <div class="bg-surface-0 rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.12)] w-[560px] max-h-[80vh] flex flex-col" @click.stop>
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
                <span :class="['w-2 h-2 rounded-full', categoryColors[category] || 'bg-surface-4']"></span>
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
      <div class="bg-surface-0 rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.12)] w-[480px] max-h-[80vh] flex flex-col" @click.stop>
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
import { ref, computed, onMounted, watch } from 'vue'
import { useModelStore, type ModelProvider } from '@/stores/models'

const store = useModelStore()
const showStats = ref(false)
const statsData = ref<any>(null)
const statsLoading = ref(false)
const statsProviderId = ref('')
const showForm = ref(false)
const editingId = ref<string | null>(null)
const modelsInput = ref('')

interface ProviderFormCustomParam {
  name: string
  value: string
}

interface ProviderFormState {
  name: string
  type: string
  api_base: string
  api_key: string
  /** 自定义参数（按顺序写入 body 顶层；空 value 不下发） */
  custom_params: ProviderFormCustomParam[]
  /** 最终 body 覆盖 patch 的 JSON 文本（保存时解析；空字符串视为 {}） */
  request_override_patch_text: string
}

function createEmptyFormState(): ProviderFormState {
  return {
    name: '',
    type: 'openai_compatible',
    api_base: '',
    api_key: '',
    custom_params: [],
    request_override_patch_text: ''
  }
}

const form = ref<ProviderFormState>(createEmptyFormState())

/** 高级配置展开开关（默认折叠避免干扰新用户） */
const showAdvanced = ref(false)
/** request_override_patch 解析错误提示（实时校验，保存前阻断） */
const patchParseError = ref('')

function addCustomParam(): void {
  form.value.custom_params.push({ name: '', value: '' })
}

function removeCustomParam(idx: number): void {
  form.value.custom_params.splice(idx, 1)
}

/** 实时校验 patch 文本是否合法 JSON object（空字符串视为合法 = 不下发 patch） */
function validatePatchText(): void {
  const t = form.value.request_override_patch_text.trim()
  if (!t) {
    patchParseError.value = ''
    return
  }
  try {
    const parsed = JSON.parse(t)
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      patchParseError.value = '必须是 JSON 对象（{} 形式）'
    } else {
      patchParseError.value = ''
    }
  } catch (e: any) {
    patchParseError.value = 'JSON 解析失败: ' + (e?.message || '')
  }
}

// 某些服务商类型有固定接入地址，选中后为空则自动填充；已填写过不覆盖。
const PROVIDER_DEFAULT_API_BASE: Record<string, string> = {
  duomi: 'https://duomiapi.com/v1'
}
// 某些服务商类型有固定模型清单，选中后强制锁定。
const PROVIDER_FIXED_MODELS: Record<string, string[]> = {
  duomi: ['gpt-image-2']
}
// 不用 immediate：handler 里会访问下面才声明的 selectedModels / remoteModels / fetchError（TDZ）；
// editProvider 进入老 duomi provider 时 type 未变不会触发 watch，在 editProvider 内手动兼底。
watch(() => form.value.type, (t) => {
  const def = PROVIDER_DEFAULT_API_BASE[t]
  if (def && !form.value.api_base.trim()) {
    form.value.api_base = def
  }
  const fixed = PROVIDER_FIXED_MODELS[t]
  if (fixed) {
    selectedModels.value = [...fixed]
    remoteModels.value = []
    modelsInput.value = ''
    fetchError.value = ''
  }
})

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
  '其他': 'bg-surface-4'
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
  form.value = createEmptyFormState()
  modelsInput.value = ''
  remoteModels.value = []
  selectedModels.value = []
  modelSearch.value = ''
  fetchError.value = ''
  showAdvanced.value = false
  patchParseError.value = ''
}

const SUPPORTED_PROVIDER_TYPES = ['openai_compatible', 'openai', 'duomi']

function editProvider(provider: ModelProvider) {
  editingId.value = provider.id
  // 老数据（如历史 anthropic）type 不在白名单内时回落 openai_compatible，避免 select 显示空白
  const safeType = SUPPORTED_PROVIDER_TYPES.includes(provider.type) ? provider.type : 'openai_compatible'
  // 高级配置：custom_params 深拷贝（避免直接绑定 store 内引用），patch 序列化为多行 JSON 文本
  const customParams = Array.isArray(provider.custom_params)
    ? provider.custom_params.map((p) => ({ name: String(p.name || ''), value: String(p.value ?? '') }))
    : []
  const patch = provider.request_override_patch && typeof provider.request_override_patch === 'object'
    ? provider.request_override_patch
    : {}
  const patchText = Object.keys(patch).length > 0 ? JSON.stringify(patch, null, 2) : ''
  form.value = {
    name: provider.name,
    type: safeType,
    api_base: provider.api_base,
    api_key: provider.api_key,
    custom_params: customParams,
    request_override_patch_text: patchText
  }
  // 进入编辑时如有高级配置，自动展开方便用户看到
  showAdvanced.value = customParams.length > 0 || patchText.length > 0
  patchParseError.value = ''
  // duomi 等固定模型清单的类型：忽略 provider.models（可能是老数据不规范），强制锁定。
  // type 未变 watch 不会触发，需要这里手动兼底。
  const fixed = PROVIDER_FIXED_MODELS[safeType]
  if (fixed) {
    modelsInput.value = ''
    selectedModels.value = [...fixed]
    remoteModels.value = []
  } else {
    modelsInput.value = provider.models.join(', ')
    selectedModels.value = [...provider.models]
    remoteModels.value = [...provider.models]
  }
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
  // 实时校验已写在 onInput；这里二次确认 patch_text 合法（防止用户没触发 input 直接点保存）
  validatePatchText()
  if (patchParseError.value) {
    alert('高级配置 - 请求覆盖 patch：' + patchParseError.value)
    showAdvanced.value = true
    return
  }
  // 解析 patch 文本 → JSON 对象（空字符串视为不下发 patch = 空对象）
  const patchText = form.value.request_override_patch_text.trim()
  let requestOverridePatch: Record<string, any> = {}
  if (patchText) {
    try {
      requestOverridePatch = JSON.parse(patchText)
    } catch (e: any) {
      alert('高级配置 - 请求覆盖 patch JSON 解析失败：' + (e?.message || e))
      showAdvanced.value = true
      return
    }
  }
  // 清洗 custom_params：丢弃空 name 行（空 value 仍保留作为占位，但运行时不下发）
  const customParams = form.value.custom_params
    .map((p) => ({ name: String(p.name || '').trim(), value: String(p.value ?? '') }))
    .filter((p) => p.name.length > 0)
  try {
    const models = selectedModels.value.length
      ? selectedModels.value
      : modelsInput.value.split(',').map((m) => m.trim()).filter(Boolean)
    const payload = {
      name: form.value.name,
      type: form.value.type,
      api_base: form.value.api_base,
      api_key: form.value.api_key,
      models,
      custom_params: customParams,
      request_override_patch: requestOverridePatch
    }
    if (editingId.value) {
      await store.updateProvider(editingId.value, payload)
    } else {
      await store.createProvider(payload)
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
