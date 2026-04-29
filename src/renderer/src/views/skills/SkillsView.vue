<template>
  <div class="h-full flex flex-col">
    <header class="page-header">
      <div class="flex items-center gap-4">
        <div class="flex bg-surface-2 rounded-lg p-0.5">
          <button
            v-for="t in tabs" :key="t.key"
            @click="activeTab = t.key"
            :class="['px-3 py-1.5 text-xs font-medium rounded-md transition-all', activeTab === t.key ? 'bg-surface-0 text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-secondary']"
          >{{ t.label }}</button>
        </div>
        <div class="flex gap-2" v-if="activeTab === 'installed'">
          <button class="btn-primary" @click="showCreateForm = true">+ 创建技能</button>
          <button class="btn-secondary" @click="openSkillsDir">打开目录</button>
          <button class="btn-secondary" @click="store.fetchSkills()">刷新</button>
        </div>
      </div>
    </header>
    <div class="page-body">
      <!-- ===== Installed Tab ===== -->
      <template v-if="activeTab === 'installed'">
        <!-- Create Skill Form -->
        <div v-if="showCreateForm" class="max-w-xl mb-6 form-card">
          <div>
            <label class="form-label">技能名称</label>
            <input v-model="createForm.name" class="input-field" placeholder="例如: web-search" />
          </div>
          <div>
            <label class="form-label">简要描述</label>
            <input v-model="createForm.description" class="input-field" placeholder="一句话描述技能功能" />
          </div>
          <div>
            <label class="form-label">SKILL.md 内容</label>
            <textarea v-model="createForm.content" rows="12" class="textarea-field font-mono text-xs" placeholder="# 技能名称&#10;&#10;## 功能&#10;&#10;..."></textarea>
          </div>
          <div class="flex gap-3 pt-2">
            <button @click="doCreate" class="btn-primary">创建</button>
            <button @click="showCreateForm = false" class="btn-secondary">取消</button>
          </div>
        </div>

        <!-- Skill Detail View -->
        <div v-else-if="viewingSkill" class="max-w-3xl mb-6">
          <div class="flex items-center gap-3 mb-4">
            <button @click="viewingSkill = null; viewContent = ''" class="btn-ghost text-xs">返回</button>
            <span class="text-sm font-semibold text-text-primary">{{ viewingSkill.name }}</span>
          </div>
          <div class="card p-5 overflow-auto max-h-[60vh]">
            <pre class="whitespace-pre-wrap text-xs font-mono leading-relaxed text-text-primary">{{ viewContent }}</pre>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else-if="store.skills.length === 0 && !showCreateForm" class="empty-state">
          <div class="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
            <svg class="w-8 h-8 text-text-disabled" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg>
          </div>
          <p class="text-sm font-medium text-text-secondary mb-1">暂无 Skills 技能</p>
          <p class="text-xs text-text-tertiary">创建自定义技能、从 URL 安装、或在技能市场中搜索安装</p>
        </div>

        <!-- Skills List -->
        <div v-else-if="!showCreateForm && !viewingSkill" class="grid grid-cols-3 gap-3">
          <div v-for="skill in store.skills" :key="skill.id" class="card p-4">
            <div class="flex items-start gap-3 mb-3">
              <div class="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                <svg class="w-4.5 h-4.5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" /></svg>
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold text-text-primary truncate">{{ skill.name }}</span>
                  <span :class="['text-[10px] px-1.5 py-0.5 rounded-full font-medium', skill.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-surface-2 text-text-tertiary']">
                    {{ skill.enabled ? '启用' : '禁用' }}
                  </span>
                </div>
                <div class="text-xs text-text-tertiary mt-0.5 line-clamp-2">{{ skill.description || skill.dirName }}</div>
              </div>
            </div>
            <div class="flex gap-1 justify-end">
              <button @click="viewSkill(skill)" class="btn-ghost text-xs">查看</button>
              <button @click="store.toggleSkill(skill.dirName, !skill.enabled)" class="btn-ghost text-xs">{{ skill.enabled ? '禁用' : '启用' }}</button>
              <button @click="store.deleteSkill(skill.dirName)" class="btn-danger text-xs">删除</button>
            </div>
          </div>
        </div>
      </template>

      <!-- ===== Market Tab ===== -->
      <template v-if="activeTab === 'market'">
        <div class="max-w-xl">
          <div class="flex gap-2 mb-4">
            <input v-model="searchKeyword" @keyup.enter="doSearch" class="input-field flex-1" placeholder="搜索技能..." />
            <button @click="doSearch" class="btn-primary" :disabled="searching">{{ searching ? '搜索中...' : '搜索' }}</button>
            <select v-if="searchResults.length" v-model="sortBy" class="input-field w-28 text-xs">
              <option value="relevance">相关度</option>
              <option value="downloads">下载量</option>
              <option value="stars">收藏数</option>
              <option value="updated">最近更新</option>
            </select>
            <button v-if="searchResults.length" @click="searchResults = []; searchDone = false; searchKeyword = ''" class="btn-secondary">清空</button>
          </div>

          <div v-if="searchError" class="card p-4 mb-3 border-amber-200 bg-amber-50">
            <div class="text-xs text-amber-700">{{ searchError }}</div>
          </div>

          <div v-if="!searchResults.length && !searching && searchDone && !searchError" class="empty-state py-10">
            <p class="text-sm text-text-secondary">未找到相关技能</p>
          </div>

          <div v-if="!searchResults.length && !searchDone && !searchError" class="empty-state py-10">
            <div class="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
              <svg class="w-8 h-8 text-text-disabled" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
            </div>
            <p class="text-sm font-medium text-text-secondary mb-1">搜索技能市场</p>
            <p class="text-xs text-text-tertiary">输入关键词搜索 SkillHub 技能</p>
          </div>

          <div class="space-y-3">
            <div v-for="(item, idx) in sortedResults" :key="idx" class="card p-4">
              <div class="flex items-center justify-between">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-semibold text-text-primary">{{ item.name }}</span>
                    <span v-if="item.version" class="text-[10px] px-1.5 py-0.5 bg-surface-2 rounded-full text-text-tertiary">v{{ item.version }}</span>
                  </div>
                  <div class="text-xs text-text-tertiary mt-0.5">{{ item.description }}</div>
                  <div class="flex items-center gap-3 mt-1.5 text-[10px] text-text-disabled">
                    <span v-if="item.author">{{ item.author }}</span>
                    <span v-if="item.downloads">{{ item.downloads }} downloads</span>
                  </div>
                </div>
                <span v-if="isInstalled(item)" class="text-[10px] px-2 py-1 bg-emerald-50 text-emerald-600 rounded-full font-medium flex-shrink-0">已安装</span>
                <button
                  v-else
                  @click="doInstallMarketSkill(item)"
                  class="btn-primary text-xs px-3 py-1 flex-shrink-0"
                  :disabled="installingMarket === idx"
                >{{ installingMarket === idx ? '安装中...' : '安装' }}</button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { usePromptSkillStore, type PromptSkill } from '@/stores/prompt-skills'

const store = usePromptSkillStore()

const tabs = [
  { key: 'installed', label: '已安装' },
  { key: 'market', label: '技能市场' }
]
const activeTab = ref('installed')

const showCreateForm = ref(false)
const createForm = ref({ name: '', description: '', content: '' })

const viewingSkill = ref<PromptSkill | null>(null)
const viewContent = ref('')

const searchKeyword = ref('')
const searchResults = ref<any[]>([])
const searching = ref(false)
const searchDone = ref(false)
const searchError = ref('')
const installingMarket = ref<number | null>(null)
const sortBy = ref('relevance')

const installedSet = computed(() => {
  const names = new Set<string>()
  for (const s of store.skills) {
    names.add(s.name.toLowerCase())
    names.add(s.dirName.toLowerCase())
  }
  return names
})
function isInstalled(item: any): boolean {
  const set = installedSet.value
  return set.has(item.name?.toLowerCase()) || set.has(item.slug?.toLowerCase())
}

const sortedResults = computed(() => {
  const list = [...searchResults.value]
  const kw = searchKeyword.value.toLowerCase()
  switch (sortBy.value) {
    case 'downloads':
      list.sort((a, b) => {
        const aMatch = a.name?.toLowerCase().includes(kw) ? 1 : 0
        const bMatch = b.name?.toLowerCase().includes(kw) ? 1 : 0
        if (bMatch !== aMatch) return bMatch - aMatch
        return (b.downloads || 0) - (a.downloads || 0)
      })
      break
    case 'stars':
      list.sort((a, b) => {
        const aMatch = a.name?.toLowerCase().includes(kw) ? 1 : 0
        const bMatch = b.name?.toLowerCase().includes(kw) ? 1 : 0
        if (bMatch !== aMatch) return bMatch - aMatch
        return (b.stars || 0) - (a.stars || 0)
      })
      break
    case 'updated':
      list.sort((a, b) => {
        const aMatch = a.name?.toLowerCase().includes(kw) ? 1 : 0
        const bMatch = b.name?.toLowerCase().includes(kw) ? 1 : 0
        if (bMatch !== aMatch) return bMatch - aMatch
        return (b.updated_at || 0) - (a.updated_at || 0)
      })
      break
    default: // relevance - title match first, then score
      list.sort((a, b) => {
        const aMatch = a.name?.toLowerCase().includes(kw) ? 1 : 0
        const bMatch = b.name?.toLowerCase().includes(kw) ? 1 : 0
        if (bMatch !== aMatch) return bMatch - aMatch
        return (b.score || 0) - (a.score || 0)
      })
  }
  return list
})

async function doCreate() {
  if (!createForm.value.name.trim()) return
  await store.createSkill(
    createForm.value.name.trim(),
    createForm.value.description.trim(),
    createForm.value.content
  )
  showCreateForm.value = false
  createForm.value = { name: '', description: '', content: '' }
}

async function viewSkill(skill: PromptSkill) {
  viewingSkill.value = skill
  viewContent.value = await store.getContent(skill.dirName)
}

async function openSkillsDir() {
  const dir = await store.getSkillsDir()
  window.api.shell.openPath(dir)
}

async function doSearch() {
  if (!searchKeyword.value.trim()) return
  searching.value = true
  searchError.value = ''
  searchDone.value = false
  try {
    const data = await store.searchMarket(searchKeyword.value.trim())
    searchResults.value = data.results
    searchDone.value = true
  } catch (e: any) {
    searchError.value = e.message || '搜索失败'
    searchDone.value = true
  } finally {
    searching.value = false
  }
}

async function doInstallMarketSkill(item: any) {
  if (!item.url) {
    searchError.value = '该技能没有下载链接'
    return
  }
  const idx = searchResults.value.indexOf(item)
  installingMarket.value = idx
  try {
    const result = await store.installFromUrl(item.url)
    if (result.success) {
      await store.fetchSkills()
    } else {
      searchError.value = result.error || '安装失败'
    }
  } catch (e: any) {
    searchError.value = e.message || '安装失败'
  } finally {
    installingMarket.value = null
  }
}

onMounted(() => {
  store.fetchSkills()
})
</script>
