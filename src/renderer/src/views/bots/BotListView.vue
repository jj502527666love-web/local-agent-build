<template>
  <div class="h-full flex flex-col">
    <header class="page-header">
      <button class="btn-primary" @click="showForm = true; editingId = null; resetForm()">+ 新建机器人</button>
    </header>
    <div class="page-body">
      <!-- Form -->
      <div v-if="showForm" class="max-w-xl mb-6 form-card">
        <div>
          <label class="form-label">名称</label>
          <input v-model="form.name" class="input-field" placeholder="给你的机器人起个名字" />
        </div>
        <div>
          <label class="form-label">描述</label>
          <input v-model="form.description" class="input-field" placeholder="简要描述机器人的用途" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="form-label">模型服务商</label>
            <select v-model="form.model_provider_id" class="select-field">
              <option value="">-- 选择 --</option>
              <option v-for="p in modelStore.providers" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <div>
            <label class="form-label">模型</label>
            <select v-if="selectedProviderModels.length" v-model="form.model_id" class="select-field">
              <option value="">-- 选择 --</option>
              <option v-for="m in selectedProviderModels" :key="m" :value="m">{{ m }}</option>
            </select>
            <input v-else v-model="form.model_id" placeholder="e.g. gpt-4o" class="input-field" />
          </div>
        </div>
        <div>
          <label class="form-label">人格</label>
          <select v-model="form.persona_id" class="select-field">
            <option value="">-- 无 --</option>
            <option v-for="p in personaStore.personas" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
        <div>
          <label class="form-label">知识库分类</label>
          <div class="space-y-1.5 max-h-32 overflow-y-auto border border-surface-3 rounded-lg p-3">
            <label v-for="cat in kbStore.categories" :key="cat.id" class="flex items-center gap-2.5 text-xs cursor-pointer hover:text-text-primary transition-colors">
              <input type="checkbox" :value="cat.id" v-model="form.kb_category_ids" class="rounded" />
              {{ cat.name }}
            </label>
            <div v-if="!kbStore.categories.length" class="text-xs text-text-tertiary">暂无可选分类</div>
          </div>
          <label v-if="form.kb_category_ids.length" class="flex items-center gap-2 mt-2 cursor-pointer">
            <input type="checkbox" v-model="form.kb_only" :true-value="1" :false-value="0" class="rounded" />
            <span class="text-xs text-text-secondary">仅参考知识库回答</span>
          </label>
        </div>
        <div class="flex gap-3 flex-wrap">
          <!-- 小工具 -->
          <div class="relative">
            <label class="form-label">小工具</label>
            <button type="button" @click="botDropdown = botDropdown === 'skill' ? '' : 'skill'" class="bot-select-btn">
              {{ form.skill_ids.length ? `已选 ${form.skill_ids.length} 项` : '选择小工具' }}
              <svg class="w-3.5 h-3.5 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
            </button>
            <div v-if="botDropdown === 'skill'" class="bot-dropdown">
              <label v-for="s in userSkills" :key="s.id" class="bot-dropdown-item">
                <input type="checkbox" :value="s.id" v-model="form.skill_ids" class="rounded w-3.5 h-3.5" />
                <span class="truncate">{{ s.name }}</span>
              </label>
              <div v-if="!userSkills.length" class="text-xs text-text-tertiary px-3 py-2">暂无小工具</div>
            </div>
          </div>
          <!-- Skills 技能 -->
          <div class="relative">
            <label class="form-label">Skills 技能</label>
            <button type="button" @click="botDropdown = botDropdown === 'prompt' ? '' : 'prompt'" class="bot-select-btn">
              {{ form.prompt_skill_dirs.length ? `已选 ${form.prompt_skill_dirs.length} 项` : '选择 Skills' }}
              <svg class="w-3.5 h-3.5 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
            </button>
            <div v-if="botDropdown === 'prompt'" class="bot-dropdown">
              <label v-for="ps in promptSkillStore.skills" :key="ps.dirName" class="bot-dropdown-item">
                <input type="checkbox" :value="ps.dirName" v-model="form.prompt_skill_dirs" class="rounded w-3.5 h-3.5" />
                <span class="truncate">{{ ps.name }}</span>
              </label>
              <div v-if="!promptSkillStore.skills.length" class="text-xs text-text-tertiary px-3 py-2">暂无 Skills</div>
            </div>
          </div>
          <!-- MCP 服务器 -->
          <div class="relative">
            <label class="form-label">MCP 服务器</label>
            <button type="button" @click="botDropdown = botDropdown === 'mcp' ? '' : 'mcp'" class="bot-select-btn">
              {{ form.mcp_ids.length ? `已选 ${form.mcp_ids.length} 项` : '选择 MCP' }}
              <svg class="w-3.5 h-3.5 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
            </button>
            <div v-if="botDropdown === 'mcp'" class="bot-dropdown">
              <label v-for="m in mcpStore.servers" :key="m.id" class="bot-dropdown-item">
                <input type="checkbox" :value="m.id" v-model="form.mcp_ids" class="rounded w-3.5 h-3.5" />
                <span class="truncate">{{ m.name }}</span>
              </label>
              <div v-if="!mcpStore.servers.length" class="text-xs text-text-tertiary px-3 py-2">暂无服务器</div>
            </div>
          </div>
        </div>
        <div class="flex gap-3 pt-2">
          <button @click="saveBot" class="btn-primary">{{ editingId ? '更新' : '创建' }}</button>
          <button @click="showForm = false" class="btn-secondary">取消</button>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="botStore.bots.length === 0 && !showForm" class="empty-state">
        <div class="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-text-disabled" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" /></svg>
        </div>
        <p class="text-sm font-medium text-text-secondary mb-1">暂无机器人</p>
        <p class="text-xs">创建你的第一个智能机器人，绑定模型和知识库</p>
      </div>

      <!-- Bot Cards Grid -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl">
        <div v-for="bot in botStore.bots" :key="bot.id" class="card p-5 flex flex-col">
          <div class="flex items-start justify-between mb-3">
            <div class="flex items-center gap-3">
              <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center flex-shrink-0">
                <span class="text-white text-base font-bold">{{ bot.name.charAt(0) }}</span>
              </div>
              <div class="min-w-0">
                <div class="font-semibold text-sm text-text-primary truncate">{{ bot.name }}</div>
                <div class="text-xs text-text-tertiary mt-0.5 truncate">{{ bot.model_id || '未配置模型' }}</div>
              </div>
            </div>
          </div>
          <div v-if="bot.description" class="text-xs text-text-tertiary mb-3 line-clamp-2">{{ bot.description }}</div>
          <div class="flex flex-wrap gap-1.5 mb-4">
            <span v-if="bot.kb_category_ids.length" class="status-badge bg-teal-50 text-teal-700">知识库 {{ bot.kb_category_ids.length }}</span>
            <span v-if="bot.skill_ids.filter(id => userSkills.some(s => s.id === id)).length" class="status-badge bg-amber-50 text-amber-700">小工具 {{ bot.skill_ids.filter(id => userSkills.some(s => s.id === id)).length }}</span>
            <span v-if="bot.prompt_skill_dirs && bot.prompt_skill_dirs.length" class="status-badge bg-purple-50 text-purple-700">Skills {{ bot.prompt_skill_dirs.length }}</span>
            <span v-if="bot.mcp_ids.length" class="status-badge bg-blue-50 text-blue-700">MCP {{ bot.mcp_ids.length }}</span>
          </div>
          <div class="mt-auto flex gap-2">
            <button @click="$router.push({ path: '/chat', query: { botId: bot.id } })" class="flex-1 px-3 py-2 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">开始对话</button>
            <button @click="editBot(bot)" class="btn-ghost">编辑</button>
            <button @click="botStore.deleteBot(bot.id)" class="btn-danger">删除</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useBotStore, type Bot } from '@/stores/bots'
import { useModelStore } from '@/stores/models'
import { usePersonaStore } from '@/stores/personas'
import { useKnowledgeStore } from '@/stores/knowledge'
import { useSkillStore } from '@/stores/skills'
import { useMcpStore } from '@/stores/mcps'
import { usePromptSkillStore } from '@/stores/prompt-skills'

const botStore = useBotStore()
const modelStore = useModelStore()
const personaStore = usePersonaStore()
const kbStore = useKnowledgeStore()
const skillStore = useSkillStore()
const CORE_TOOL_NAMES = ['file_ops', 'run_command', 'image_gen']
const userSkills = computed(() =>
  skillStore.skills.filter((s) => !CORE_TOOL_NAMES.includes(s.function_def?.name))
)
const mcpStore = useMcpStore()
const promptSkillStore = usePromptSkillStore()

const showForm = ref(false)
const editingId = ref<string | null>(null)
const botDropdown = ref('')
const form = ref({
  name: '',
  description: '',
  model_provider_id: '',
  model_id: '',
  persona_id: '',
  kb_only: 0 as number,
  kb_category_ids: [] as string[],
  skill_ids: [] as string[],
  mcp_ids: [] as string[],
  prompt_skill_dirs: [] as string[]
})

const selectedProviderModels = computed(() => {
  if (!form.value.model_provider_id) return []
  const p = modelStore.providers.find((p) => p.id === form.value.model_provider_id)
  return p?.models || []
})

function resetForm() {
  form.value = { name: '', description: '', model_provider_id: '', model_id: '', persona_id: '', kb_only: 0, kb_category_ids: [], skill_ids: [], mcp_ids: [], prompt_skill_dirs: [] }
}

function editBot(bot: Bot) {
  editingId.value = bot.id
  form.value = {
    name: bot.name,
    description: bot.description,
    model_provider_id: bot.model_provider_id || '',
    model_id: bot.model_id,
    persona_id: bot.persona_id || '',
    kb_only: bot.kb_only || 0,
    kb_category_ids: [...bot.kb_category_ids],
    skill_ids: bot.skill_ids.filter(id => userSkills.value.some(s => s.id === id)),
    mcp_ids: [...bot.mcp_ids],
    prompt_skill_dirs: [...(bot.prompt_skill_dirs || [])]
  }
  showForm.value = true
}

async function saveBot() {
  try {
    const data = {
      ...form.value,
      model_provider_id: form.value.model_provider_id || null,
      persona_id: form.value.persona_id || null
    }
    if (editingId.value) {
      await botStore.updateBot(editingId.value, data)
    } else {
      await botStore.createBot(data)
    }
    showForm.value = false
    resetForm()
  } catch (e: any) {
    console.error('saveBot error:', e)
    alert('保存失败: ' + (e?.message || e))
  }
}

onMounted(async () => {
  await Promise.all([
    botStore.fetchBots(),
    modelStore.fetchProviders(),
    personaStore.fetchPersonas(),
    kbStore.fetchCategories(),
    skillStore.fetchSkills(),
    mcpStore.fetchServers(),
    promptSkillStore.fetchSkills()
  ])
})
</script>

<style scoped>
.bot-select-btn {
  @apply flex items-center gap-2 w-48 px-3 py-2 text-xs text-text-secondary bg-surface-0 border border-surface-3 rounded-lg hover:border-primary-400 transition-colors cursor-pointer;
}
.bot-dropdown {
  @apply absolute top-full left-0 mt-1 w-48 max-h-48 overflow-y-auto bg-surface-0 border border-surface-3 rounded-lg shadow-lg z-50 py-1;
}
.bot-dropdown-item {
  @apply flex items-center gap-2.5 px-3 py-1.5 text-xs cursor-pointer text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors;
}
</style>
