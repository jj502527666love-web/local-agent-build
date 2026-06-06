<template>
  <div class="h-full flex flex-col">
    <header class="page-header flex items-center justify-between">
      <div class="flex gap-1">
        <button :class="['tab-btn', activeTab === 'mine' ? 'tab-btn-active' : '']" @click="activeTab = 'mine'">我的智能体</button>
        <button :class="['tab-btn', activeTab === 'market' ? 'tab-btn-active' : '']" @click="switchToMarket">智能体市场</button>
      </div>
      <button v-if="activeTab === 'mine'" class="btn-primary" @click="openCreate">+ 新建智能体</button>
    </header>

    <div class="page-body">
      <!-- ============ 我的智能体 ============ -->
      <template v-if="activeTab === 'mine'">
        <!-- Form -->
        <div v-if="showForm" class="max-w-xl mb-6 form-card">
          <!-- 形象图 2:3 -->
          <div>
            <label class="form-label">形象（2:3 竖图，可选）</label>
            <div class="flex items-center gap-3">
              <div class="w-16 rounded-lg overflow-hidden bg-surface-2 flex items-center justify-center" style="aspect-ratio: 2/3;">
                <img v-if="form.avatar" :src="localFileUrl(form.avatar)" class="w-full h-full object-cover" />
                <span v-else class="text-text-tertiary text-2xl font-bold">{{ (form.name || '?').charAt(0) }}</span>
              </div>
              <div class="flex flex-col gap-2">
                <div class="flex gap-2">
                  <button type="button" class="btn-secondary" :disabled="avatarUploading" @click="avatarInput?.click()">
                    {{ avatarUploading ? '处理中...' : (form.avatar ? '更换形象' : '上传形象') }}
                  </button>
                  <button type="button" class="btn-secondary" :disabled="avatarUploading" @click="showGalleryPicker = true">从图库选择</button>
                </div>
                <button v-if="form.avatar" type="button" class="btn-ghost text-xs self-start" @click="form.avatar = ''">移除</button>
              </div>
              <input ref="avatarInput" type="file" accept="image/png,image/jpeg,image/webp" class="hidden" @change="onPickAvatar" />
            </div>
            <p class="text-[11px] text-text-tertiary mt-1">建议 2:3 比例（如 600x900），发布到市场必须设置形象图。</p>
          </div>
          <div>
            <label class="form-label">名称</label>
            <input v-model="form.name" class="input-field" placeholder="给你的智能体起个名字" />
          </div>
          <div>
            <label class="form-label">描述</label>
            <input v-model="form.description" class="input-field" placeholder="简要描述智能体的用途" />
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
          <div>
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" v-model="form.enable_image_gen" :true-value="1" :false-value="0" class="rounded" />
              <span class="text-xs font-medium text-text-primary">调用生图能力</span>
            </label>
            <p class="text-[11px] text-text-tertiary mt-1 ml-5 leading-snug">开启后，该智能体的对话中会出现「生图：」模型切换条，AI 可调用生图工具。</p>
          </div>
          <div>
            <label class="form-label">工具调用确认</label>
            <div class="flex gap-2">
              <label v-for="opt in approvalOptions" :key="opt.value" :class="['flex-1 cursor-pointer rounded-lg border px-3 py-2 text-xs transition-colors', form.tool_approval === opt.value ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-surface-3 hover:bg-surface-2 text-text-secondary']">
                <input type="radio" :value="opt.value" v-model="form.tool_approval" class="hidden" />
                <div class="font-medium mb-0.5">{{ opt.label }}</div>
                <div class="text-[11px] leading-snug opacity-80">{{ opt.desc }}</div>
              </label>
            </div>
          </div>
          <div class="flex gap-3 pt-2">
            <button @click="saveBot" class="btn-primary">{{ editingId ? '更新' : '创建' }}</button>
            <button @click="showForm = false" class="btn-secondary">取消</button>
          </div>
        </div>

        <!-- Empty -->
        <div v-if="botStore.bots.length === 0 && !showForm" class="empty-state">
          <div class="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
            <svg class="w-8 h-8 text-text-disabled" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg>
          </div>
          <p class="text-sm font-medium text-text-secondary mb-1">暂无智能体</p>
          <p class="text-xs">创建你的第一个智能体，或前往「智能体市场」保存</p>
        </div>

        <!-- Cards -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-w-6xl">
          <div v-for="bot in botStore.bots" :key="bot.id" class="card overflow-hidden flex" style="min-height: 196px;">
            <!-- 左：2:3 形象，铺满卡片高度 -->
            <div class="flex-shrink-0 bg-surface-2" style="width: 128px;">
              <img v-if="bot.avatar" :src="localFileUrl(bot.avatar)" class="w-full h-full object-cover" />
              <div v-else class="w-full h-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
                <span class="text-white text-3xl font-bold">{{ bot.name.charAt(0) }}</span>
              </div>
            </div>
            <!-- 右：内容 -->
            <div class="flex-1 min-w-0 p-4 flex flex-col">
              <div class="flex items-center gap-1.5">
                <span class="font-semibold text-sm text-text-primary truncate">{{ bot.name }}</span>
                <svg class="w-3.5 h-3.5 text-primary-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" /></svg>
              </div>
              <div class="text-[11px] text-text-tertiary mt-0.5 truncate">{{ bot.source === 'market' ? '来自市场' : '本地创建' }}</div>
              <div class="flex flex-wrap gap-1 mt-2">
                <span v-if="bot.kb_category_ids.length" class="status-badge bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">知识库 {{ bot.kb_category_ids.length }}</span>
                <span v-if="bot.cloud_kb_ids && bot.cloud_kb_ids.length" class="status-badge bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300">云端知识库 {{ bot.cloud_kb_ids.length }}</span>
                <span v-if="bot.skill_ids.filter(id => userSkills.some(s => s.id === id)).length" class="status-badge bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">小工具 {{ bot.skill_ids.filter(id => userSkills.some(s => s.id === id)).length }}</span>
                <span v-if="bot.prompt_skill_dirs && bot.prompt_skill_dirs.length" class="status-badge bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">Skills {{ bot.prompt_skill_dirs.length }}</span>
                <span v-if="bot.mcp_ids.length" class="status-badge bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">MCP {{ bot.mcp_ids.length }}</span>
                <span v-if="bot.submission_status" :class="['status-badge', submissionBadgeClass(bot.submission_status)]">{{ submissionLabel(bot.submission_status) }}</span>
              </div>
              <div v-if="bot.description" class="text-xs text-text-tertiary mt-2 line-clamp-2 leading-snug">{{ bot.description }}</div>
              <p v-if="bot.submission_status === 'rejected' && bot.submission_reject_reason" class="text-[11px] text-red-500 mt-1 line-clamp-1">驳回原因：{{ bot.submission_reject_reason }}</p>
              <div class="mt-auto pt-3">
                <button @click="$router.push({ path: '/chat', query: { botId: bot.id } })" class="w-full py-2 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">开始对话</button>
                <div class="flex items-center justify-center gap-2.5 mt-2 text-xs">
                  <button @click="editBot(bot)" class="text-text-tertiary hover:text-text-primary transition-colors">编辑</button>
                  <span class="text-surface-3">|</span>
                  <button @click="botStore.deleteBot(bot.id)" class="text-text-tertiary hover:text-red-500 transition-colors">删除</button>
                  <span class="text-surface-3">|</span>
                  <button v-if="canPublish(bot)" @click="publish(bot)" :disabled="publishingId === bot.id" class="text-primary-600 hover:text-primary-700 transition-colors disabled:opacity-50">{{ publishingId === bot.id ? '发布中...' : '发布到市场' }}</button>
                  <button v-else-if="bot.submission_status === 'pending' || bot.submission_status === 'approved'" @click="withdraw(bot)" class="text-text-tertiary hover:text-text-primary transition-colors">撤回发布</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- ============ 智能体市场 ============ -->
      <template v-else>
        <div class="flex items-center gap-2 mb-4 max-w-5xl">
          <input v-model="marketSearch" class="input-field flex-1" placeholder="搜索智能体名称或能力" @keyup.enter="loadMarket" />
          <button class="btn-secondary" @click="loadMarket">搜索</button>
        </div>

        <div v-if="botStore.marketLoading" class="text-center text-sm text-text-tertiary py-12">加载中...</div>
        <div v-else-if="!botStore.marketAgents.length" class="empty-state">
          <p class="text-sm font-medium text-text-secondary mb-1">市场暂无智能体</p>
          <p class="text-xs">云控端发布并上架后，这里会显示可添加的智能体</p>
        </div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-w-6xl">
          <div v-for="a in botStore.marketAgents" :key="a.id" class="card p-4 flex flex-col">
            <div class="rounded-lg overflow-hidden bg-surface-2 mb-3" style="aspect-ratio: 2/3;">
              <img v-if="a.avatar" :src="a.avatar_thumb || a.avatar" loading="lazy" class="w-full h-full object-cover" />
              <div v-else class="w-full h-full flex items-center justify-center text-text-tertiary text-4xl font-bold">{{ a.name.charAt(0) }}</div>
            </div>
            <div class="font-semibold text-sm text-text-primary truncate">{{ a.name }}</div>
            <div class="text-xs text-text-tertiary mt-1 line-clamp-2 min-h-[2rem]">{{ a.description }}</div>
            <div class="flex flex-wrap gap-1 my-2">
              <span v-for="t in a.tags.slice(0, 3)" :key="t" class="status-badge bg-surface-2 text-text-secondary">{{ t }}</span>
            </div>
            <div class="flex items-center gap-3 text-[11px] text-text-tertiary mb-3">
              <span class="inline-flex items-center gap-0.5">
                <svg class="w-3.5 h-3.5 text-amber-400" viewBox="0 0 24 24" fill="currentColor"><path d="M11.48 3.5a.56.56 0 0 1 1.04 0l2.12 5.11a.56.56 0 0 0 .48.35l5.52.44c.5.04.7.66.32.99l-4.2 3.6a.56.56 0 0 0-.18.56l1.28 5.39a.56.56 0 0 1-.84.6l-4.72-2.88a.56.56 0 0 0-.59 0l-4.72 2.88a.56.56 0 0 1-.84-.6l1.28-5.39a.56.56 0 0 0-.18-.56l-4.2-3.6a.56.56 0 0 1 .32-.99l5.52-.44a.56.56 0 0 0 .48-.35L11.48 3.5Z" /></svg>
                {{ a.rating_count ? a.rating_avg.toFixed(1) : '暂无' }}
                <span v-if="a.rating_count">({{ a.rating_count }})</span>
              </span>
              <span>下载 {{ formatCount(a.download_count) }}</span>
            </div>
            <div class="mt-auto">
              <div class="flex items-center gap-2 text-[11px] mb-2">
                <span v-if="a.price > 0 && !a.is_owned" class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">{{ a.price }} {{ labelOf(a.price_balance_type) }}</span>
                <span v-else-if="a.price > 0 && a.is_owned" class="px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">已拥有</span>
                <span v-else class="text-text-tertiary">免费</span>
              </div>
              <div class="flex gap-2">
                <button v-if="isSaved(a)" disabled class="flex-1 px-3 py-2 text-xs font-medium bg-surface-2 text-text-tertiary rounded-lg cursor-default">已添加</button>
                <button v-else @click="saveToLocal(a)" :disabled="savingId === a.id" class="flex-1 px-3 py-2 text-xs font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50">
                  {{ savingId === a.id ? '添加中...' : (a.price > 0 && !a.is_owned ? '购买并添加' : '添加') }}
                </button>
                <button @click="openRate(a)" class="btn-ghost">评分</button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 评分弹窗（仅阴影，无遮罩） -->
    <div v-if="rateTarget" class="fixed inset-0 z-50 flex items-center justify-center" @click.self="rateTarget = null">
      <div class="w-80 bg-surface-0 rounded-xl shadow-2xl border border-surface-3 p-5">
        <div class="font-semibold text-sm text-text-primary mb-1">给「{{ rateTarget.name }}」评分</div>
        <p class="text-[11px] text-text-tertiary mb-3">需登录晓晓云账号，每人一评（可改分）</p>
        <div class="flex gap-1 mb-3">
          <button v-for="i in 5" :key="i" type="button" @click="rateScore = i" class="p-0.5">
            <svg class="w-7 h-7" :class="i <= rateScore ? 'text-amber-400' : 'text-surface-3'" viewBox="0 0 24 24" fill="currentColor"><path d="M11.48 3.5a.56.56 0 0 1 1.04 0l2.12 5.11a.56.56 0 0 0 .48.35l5.52.44c.5.04.7.66.32.99l-4.2 3.6a.56.56 0 0 0-.18.56l1.28 5.39a.56.56 0 0 1-.84.6l-4.72-2.88a.56.56 0 0 0-.59 0l-4.72 2.88a.56.56 0 0 1-.84-.6l1.28-5.39a.56.56 0 0 0-.18-.56l-4.2-3.6a.56.56 0 0 1 .32-.99l5.52-.44a.56.56 0 0 0 .48-.35L11.48 3.5Z" /></svg>
          </button>
        </div>
        <textarea v-model="rateComment" rows="2" maxlength="500" class="input-field w-full mb-3" placeholder="说点什么（可选）"></textarea>
        <div class="flex gap-2">
          <button @click="submitRate" :disabled="!rateScore || rating" class="btn-primary flex-1 disabled:opacity-50">{{ rating ? '提交中...' : '提交评分' }}</button>
          <button @click="rateTarget = null" class="btn-secondary">取消</button>
        </div>
      </div>
    </div>

    <GalleryPicker v-model:visible="showGalleryPicker" :multiple="false" @select="onGallerySelect" />

    <LowBalanceModal
      v-model:visible="lowBalance.visible"
      :balance-type="lowBalance.balanceType"
      :required="lowBalance.required"
      :available="lowBalance.available"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useBotStore, type Bot, type MarketAgent } from '@/stores/bots'
import { usePersonaStore } from '@/stores/personas'
import { useKnowledgeStore } from '@/stores/knowledge'
import { useSkillStore } from '@/stores/skills'
import { useMcpStore } from '@/stores/mcps'
import { usePromptSkillStore } from '@/stores/prompt-skills'
import { useCloudAuthStore } from '@/stores/cloud-auth'
import { useSiteConfigStore } from '@/stores/site-config'
import GalleryPicker from '@/components/GalleryPicker.vue'
import LowBalanceModal from '@/components/LowBalanceModal.vue'
import { loadAsDataUri } from '@/utils/image-source'

const botStore = useBotStore()
const personaStore = usePersonaStore()
const kbStore = useKnowledgeStore()
const skillStore = useSkillStore()
const CORE_TOOL_NAMES = ['file_ops', 'run_command', 'image_gen']
const userSkills = computed(() =>
  skillStore.skills.filter((s) => !CORE_TOOL_NAMES.includes(s.function_def?.name))
)
const mcpStore = useMcpStore()
const promptSkillStore = usePromptSkillStore()
const router = useRouter()
const cloudAuth = useCloudAuthStore()
const siteConfig = useSiteConfigStore()

const activeTab = ref<'mine' | 'market'>('mine')
const showForm = ref(false)
const editingId = ref<string | null>(null)
const botDropdown = ref('')
type ToolApproval = 'off' | 'destructive' | 'all'
const approvalOptions: { value: ToolApproval; label: string; desc: string }[] = [
  { value: 'off', label: '关闭', desc: '所有工具自动执行' },
  { value: 'destructive', label: '仅破坏性', desc: '写文件 / 命令前确认' },
  { value: 'all', label: '全部', desc: '每个工具调用都确认' }
]

const form = ref({
  name: '',
  description: '',
  persona_id: '',
  kb_only: 0 as number,
  kb_category_ids: [] as string[],
  skill_ids: [] as string[],
  mcp_ids: [] as string[],
  prompt_skill_dirs: [] as string[],
  tool_approval: 'destructive' as ToolApproval,
  enable_image_gen: 0 as number,
  avatar: ''
})

function resetForm() {
  form.value = { name: '', description: '', persona_id: '', kb_only: 0, kb_category_ids: [], skill_ids: [], mcp_ids: [], prompt_skill_dirs: [], tool_approval: 'destructive', enable_image_gen: 0, avatar: '' }
}

function openCreate() {
  resetForm()
  editingId.value = null
  showForm.value = true
}

function editBot(bot: Bot) {
  editingId.value = bot.id
  form.value = {
    name: bot.name,
    description: bot.description,
    persona_id: bot.persona_id || '',
    kb_only: bot.kb_only || 0,
    kb_category_ids: [...bot.kb_category_ids],
    skill_ids: bot.skill_ids.filter(id => userSkills.value.some(s => s.id === id)),
    mcp_ids: [...bot.mcp_ids],
    prompt_skill_dirs: [...(bot.prompt_skill_dirs || [])],
    tool_approval: bot.tool_approval || 'destructive',
    enable_image_gen: bot.enable_image_gen || 0,
    avatar: bot.avatar || ''
  }
  showForm.value = true
}

async function saveBot() {
  try {
    const data: any = { ...form.value, persona_id: form.value.persona_id || null }
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

// ===== 形象图 =====
const avatarInput = ref<HTMLInputElement | null>(null)
const avatarUploading = ref(false)
const showGalleryPicker = ref(false)

function localFileUrl(p: string): string {
  if (!p) return ''
  if (/^(https?:|data:|file:|local-file:)/i.test(p)) return p
  return 'local-file://img?p=' + encodeURIComponent(p.replace(/\\/g, '/'))
}

function checkAspect(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(Math.abs(img.height / img.width - 1.5) <= 0.1) }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(false) }
    img.src = url
  })
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = reject
    fr.readAsDataURL(file)
  })
}

async function onPickAvatar(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  avatarUploading.value = true
  try {
    if (!(await checkAspect(file))) {
      alert('形象图需为 2:3 竖图（如 600x900），请重新选择')
      return
    }
    const dataUrl = await fileToDataUrl(file)
    form.value.avatar = await botStore.saveAvatar(dataUrl)
  } catch (err: any) {
    alert('形象图处理失败：' + (err?.message || err))
  } finally {
    avatarUploading.value = false
    input.value = ''
  }
}

// 从图库选择形象图：取所选图片 → 读为 dataUri（带宽高）→ 2:3 校验 → 落盘
async function onGallerySelect(paths: string[]) {
  if (!paths.length) return
  avatarUploading.value = true
  try {
    const [img] = await loadAsDataUri(paths.slice(0, 1), { maxSize: 1024, quality: 0.85 })
    if (!img) { alert('读取图库图片失败'); return }
    if (Math.abs(img.height / img.width - 1.5) > 0.1) {
      alert(`形象图需为 2:3 竖图（当前 ${img.width}x${img.height}），请选择 2:3 比例的图片`)
      return
    }
    form.value.avatar = await botStore.saveAvatar(img.dataUri)
  } catch (err: any) {
    alert('形象图处理失败：' + (err?.message || err))
  } finally {
    avatarUploading.value = false
  }
}

// ===== 投稿 / 发布 =====
const publishingId = ref<string | null>(null)
function submissionLabel(s: string): string {
  return ({ pending: '审核中', approved: '已上架市场', rejected: '已驳回', withdrawn: '已撤回' } as Record<string, string>)[s] || s
}
function submissionBadgeClass(s: string): string {
  return ({
    pending: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    approved: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    rejected: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    withdrawn: 'bg-surface-2 text-text-tertiary'
  } as Record<string, string>)[s] || 'bg-surface-2 text-text-tertiary'
}
function canPublish(bot: Bot): boolean {
  return !bot.submission_status || bot.submission_status === 'rejected' || bot.submission_status === 'withdrawn'
}
async function publish(bot: Bot) {
  if (!bot.avatar) { alert('请先在「编辑」里为该智能体设置 2:3 形象图，再发布到市场'); return }
  publishingId.value = bot.id
  try {
    const res = await botStore.submitToMarket(bot.id)
    await botStore.fetchBots()
    alert(res.ok ? '已提交，等待管理员审核' : ('发布失败：' + (res.error || '')))
  } finally {
    publishingId.value = null
  }
}
async function withdraw(bot: Bot) {
  const res = await botStore.withdrawSubmission(bot.id)
  await botStore.fetchBots()
  if (!res.ok) alert('撤回失败：' + (res.error || ''))
}

// ===== 市场 =====
const marketSearch = ref('')
const marketLoaded = ref(false)
const savingId = ref<number | null>(null)
const lowBalance = reactive({ visible: false, balanceType: 'credit' as 'token' | 'credit', required: 0, available: 0 })

function labelOf(type: 'token' | 'credit'): string {
  return siteConfig.labelOf(type)
}

async function switchToMarket() {
  activeTab.value = 'market'
  if (!marketLoaded.value) await loadMarket()
}
async function loadMarket() {
  marketLoaded.value = true
  await botStore.fetchMarket({ search: marketSearch.value })
}
function isSaved(a: MarketAgent): boolean {
  return botStore.bots.some((b) => b.cloud_agent_id === a.id)
}
function formatCount(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + 'w'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}
async function saveToLocal(a: MarketAgent) {
  // 未登录：收费 / 受限智能体需登录才能获取，直接引导登录
  if (!cloudAuth.isLoggedIn) {
    if (confirm('保存智能体需要先登录晓晓云账号，是否前往登录？')) router.push('/login')
    return
  }
  savingId.value = a.id
  try {
    const res = await botStore.importFromMarket(a)
    if (res.ok) {
      if (res.alreadyExists) {
        alert('该智能体已添加过')
      } else {
        // 收费智能体此时已扣费，刷新余额并标记已拥有
        cloudAuth.refreshBalancesThrottled(true).catch(() => {})
        a.is_owned = true
      }
    } else if (res.needLogin) {
      if (confirm('登录态已失效，请重新登录后再保存，是否前往登录？')) router.push('/login')
    } else if (res.forbidden) {
      alert(res.error || '你没有权限获取该智能体')
    } else if (res.needRecharge) {
      lowBalance.balanceType = res.balanceType || a.price_balance_type
      lowBalance.required = res.needed || a.price
      lowBalance.available = res.current || 0
      lowBalance.visible = true
    } else {
      alert('添加失败：' + (res.error || ''))
    }
  } finally {
    savingId.value = null
  }
}

// ===== 评分 =====
const rateTarget = ref<MarketAgent | null>(null)
const rateScore = ref(0)
const rateComment = ref('')
const rating = ref(false)
function openRate(a: MarketAgent) {
  rateTarget.value = a
  rateScore.value = 0
  rateComment.value = ''
}
async function submitRate() {
  const target = rateTarget.value
  if (!target || !rateScore.value) return
  rating.value = true
  try {
    const res = await botStore.rateAgent(target.id, rateScore.value, rateComment.value)
    if (res.ok) {
      if (res.data) {
        target.rating_avg = Number(res.data.rating_avg ?? target.rating_avg)
        target.rating_count = Number(res.data.rating_count ?? target.rating_count)
      }
      rateTarget.value = null
    } else {
      alert('评分失败：' + (res.error || ''))
    }
  } finally {
    rating.value = false
  }
}

onMounted(async () => {
  await Promise.all([
    botStore.fetchBots(),
    personaStore.fetchPersonas(),
    kbStore.fetchCategories(),
    skillStore.fetchSkills(),
    mcpStore.fetchServers(),
    promptSkillStore.fetchSkills(),
  ])
  // 静默刷新投稿过的 bot 的审核态
  const submittedIds = botStore.bots.filter((b) => b.submission_status && b.submission_status !== 'withdrawn').map((b) => b.id)
  if (submittedIds.length) {
    try {
      const res = await botStore.syncSubmissionStatus(submittedIds)
      if (res.ok) await botStore.fetchBots()
    } catch { /* ignore */ }
  }
})
</script>

<style scoped>
.tab-btn {
  @apply px-3 py-1.5 text-sm font-medium text-text-secondary rounded-lg hover:text-text-primary transition-colors;
}
.tab-btn-active {
  @apply bg-surface-2 text-text-primary;
}
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
