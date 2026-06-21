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
          <button class="btn-primary" @click="openCreateForm">+ 添加服务器</button>
        </div>
      </div>
    </header>
    <div class="page-body">
      <!-- ===== Installed Tab ===== -->
      <template v-if="activeTab === 'installed'">
        <div v-if="showForm" class="max-w-xl mb-6 form-card">
          <div>
            <label class="form-label">名称 <span class="text-red-500">*</span></label>
            <input v-model="form.name" class="input-field" placeholder="例如: 文件系统服务" />
          </div>
          <div>
            <label class="form-label">命令 <span class="text-red-500">*</span></label>
            <input v-model="form.command" placeholder="npx, node, python..." class="input-field" />
            <p class="text-xs text-text-tertiary mt-1">Windows 下 npx / uvx 等命令可直接填写，无需扩展名</p>
          </div>
          <div>
            <label class="form-label">参数（每行一个）</label>
            <textarea v-model="argsStr" rows="3" class="textarea-field font-mono" placeholder="-y&#10;@modelcontextprotocol/server-filesystem&#10;D:\workspace"></textarea>
          </div>
          <div>
            <label class="form-label">环境变量 (JSON)</label>
            <textarea v-model="envStr" rows="3" class="textarea-field font-mono" :class="envError ? 'border-red-400' : ''" placeholder='{"API_KEY":"..."}'></textarea>
            <p v-if="envError" class="text-xs text-red-500 mt-1">{{ envError }}</p>
          </div>
          <div>
            <label class="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" v-model="form.always_load" class="rounded w-3.5 h-3.5 mt-0.5" />
              <span class="text-sm text-text-secondary">
                始终加载到对话工具列表（高频工具勾选）
                <span class="block text-xs text-text-tertiary mt-0.5">
                  不勾时该服务器的工具不会直接暴露给模型，需通过 mcp_list_servers / mcp_describe_tools / mcp_call 三元元工具按需发现与调用，节省 prompt token、避免工具过多造成模型困惑
                </span>
              </span>
            </label>
          </div>
          <p v-if="formError" class="text-sm text-red-500">{{ formError }}</p>
          <div class="flex gap-3 pt-2">
            <button @click="saveServer" class="btn-primary" :disabled="saving">{{ saving ? '保存中...' : editingId ? '更新' : '创建' }}</button>
            <button @click="closeForm" class="btn-secondary">取消</button>
          </div>
          <p class="text-xs text-text-tertiary">保存后会自动启动服务器并获取工具列表，结果显示在卡片上</p>
        </div>

        <div v-if="store.servers.length === 0 && !showForm" class="empty-state">
          <div class="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
            <svg class="w-8 h-8 text-text-disabled" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7m0 0a3 3 0 0 1-3 3m0 3h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Zm-3 6h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Z" /></svg>
          </div>
          <p class="text-sm font-medium text-text-secondary mb-1">暂无 MCP 服务</p>
          <p class="text-xs">配置 MCP 服务器，为智能体提供外部工具能力</p>
        </div>

        <div v-else-if="!showForm" class="grid grid-cols-3 gap-3">
          <div v-for="server in store.servers" :key="server.id" class="card p-4">
            <div class="flex items-start gap-3 mb-3">
              <div class="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                <svg class="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7" /></svg>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-sm text-text-primary truncate">{{ server.name }}</span>
                  <span :class="['status-badge', statusBadgeClass(server)]">{{ statusText(server) }}</span>
                </div>
                <div class="text-xs text-text-tertiary mt-0.5 font-mono truncate" :title="server.command + ' ' + server.args.join(' ')">{{ server.command }} {{ server.args.join(' ') }}</div>
              </div>
            </div>

            <p v-if="statusError(server)" class="text-xs text-red-500 mb-2 break-all whitespace-pre-line max-h-16 overflow-hidden" :title="statusError(server)">{{ truncate(statusError(server), 180) }}</p>

            <div v-if="server.tools.length" class="flex flex-wrap gap-1 mb-3">
              <span v-for="t in server.tools.slice(0, 8)" :key="toolName(t)" class="text-[10px] px-1.5 py-0.5 bg-surface-2 rounded text-text-secondary" :title="toolDescription(t)">{{ toolName(t) }}</span>
              <span v-if="server.tools.length > 8" class="text-[10px] px-1.5 py-0.5 text-text-tertiary">+{{ server.tools.length - 8 }}</span>
            </div>
            <p v-else class="text-xs text-text-tertiary mb-3">未获取到工具，启动或刷新后自动获取</p>

            <div class="flex items-center gap-1">
              <label class="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer mr-auto" title="停用后该服务器的工具不会注入对话">
                <input type="checkbox" class="rounded w-3.5 h-3.5" :checked="server.enabled" @change="onToggleEnabled(server, $event)" />
                启用
              </label>
              <button v-if="isRunning(server)" @click="onStop(server)" :disabled="!!store.busy[server.id]" class="btn-ghost text-amber-600 dark:text-amber-400 hover:!bg-amber-50 dark:hover:!bg-amber-900/30">{{ store.busy[server.id] === 'stopping' ? '停止中...' : '停止' }}</button>
              <button v-else @click="onStart(server)" :disabled="!!store.busy[server.id]" class="btn-ghost text-emerald-600 dark:text-emerald-400 hover:!bg-emerald-50 dark:hover:!bg-emerald-900/30">{{ store.busy[server.id] === 'starting' ? '启动中...' : '启动' }}</button>
              <button @click="onRefreshTools(server)" :disabled="!!store.busy[server.id]" class="btn-ghost">{{ store.busy[server.id] === 'refreshing' ? '刷新中...' : '刷新工具' }}</button>
              <button @click="editServer(server)" class="btn-ghost">编辑</button>
              <button @click="onDelete(server)" class="btn-danger">删除</button>
            </div>
          </div>
        </div>
      </template>

      <!-- ===== Market Tab ===== -->
      <template v-if="activeTab === 'market'">
        <div class="max-w-3xl">
          <div class="flex items-center gap-2 mb-4">
            <div class="flex bg-surface-2 rounded-lg p-0.5">
              <button
                v-for="src in sources" :key="src.key"
                @click="onChangeSource(src.key)"
                :class="['px-3 py-1.5 text-xs font-medium rounded-md transition-all', market.currentSource === src.key ? 'bg-surface-0 text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-secondary']"
              >{{ src.label }}</button>
            </div>
            <input v-model="marketKeyword" @keyup.enter="doSearch" class="input-field flex-1" placeholder="搜索 MCP..." />
            <button @click="doSearch" class="btn-primary" :disabled="market.loading">{{ market.loading ? '搜索中...' : '搜索' }}</button>
            <button v-if="market.searchKeyword" @click="clearSearch" class="btn-secondary">清空</button>
          </div>

          <div v-if="market.error" class="card p-4 mb-3 border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
            <div class="text-xs text-amber-700 dark:text-amber-300">{{ market.error }}</div>
          </div>

          <div v-if="!market.items.length && !market.loading && !market.error" class="empty-state py-10">
            <div class="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
              <svg class="w-8 h-8 text-text-disabled" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
            </div>
            <p class="text-sm font-medium text-text-secondary mb-1">暂无 MCP 条目</p>
            <p class="text-xs text-text-tertiary">切换源或输入关键词搜索</p>
          </div>

          <div class="space-y-3">
            <div v-for="item in market.items" :key="item.source + ':' + item.id" class="card p-4">
              <div class="flex items-start gap-3">
                <img v-if="item.logo" :src="item.logo" class="w-9 h-9 rounded-lg object-cover flex-shrink-0 bg-surface-2" @error="onLogoError" />
                <div v-else class="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                  <svg class="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3" /></svg>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm font-semibold text-text-primary">{{ item.name }}</span>
                    <span v-if="item.featured" class="text-[10px] px-1.5 py-0.5 bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300 rounded-full font-medium">精选</span>
                    <span v-if="item.category" class="text-[10px] px-1.5 py-0.5 bg-surface-2 text-text-tertiary rounded-full">{{ item.category }}</span>
                    <span v-if="typeof item.stars === 'number'" class="text-[10px] text-text-tertiary">★ {{ item.stars }}</span>
                  </div>
                  <div class="text-xs text-text-tertiary mt-0.5 line-clamp-2">{{ item.description || '—' }}</div>
                </div>
                <button
                  @click="onClickInstall(item)"
                  class="btn-primary text-xs px-3 py-1 flex-shrink-0"
                  :disabled="installingId === itemKey(item)"
                >{{ installingId === itemKey(item) ? '安装中...' : '安装' }}</button>
              </div>
            </div>
          </div>

          <div v-if="market.hasMore" class="flex justify-center mt-4">
            <button @click="market.loadMore()" class="btn-secondary" :disabled="market.loading">{{ market.loading ? '加载中...' : '加载更多' }}</button>
          </div>
        </div>

        <!-- 环境变量补全弹窗（只加阴影，不加背景遮罩） -->
        <div v-if="envDialog.open" class="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <div class="card p-5 w-full max-w-md pointer-events-auto shadow-2xl">
            <div class="text-sm font-semibold text-text-primary mb-2">{{ envDialog.title }}</div>
            <p class="text-xs text-text-tertiary mb-4">请填写该 MCP 所需的环境变量，占位符（如 &lt;your-api-key&gt;）必须替换为真实值才能正常运行。</p>
            <div class="space-y-3 max-h-[50vh] overflow-auto">
              <div v-for="(_, k) in envDialog.values" :key="k">
                <label class="form-label">{{ k }}</label>
                <input v-model="envDialog.values[k]" class="input-field font-mono text-xs" :placeholder="envDialog.placeholders[k] || ''" />
              </div>
              <p v-if="!Object.keys(envDialog.values).length" class="text-xs text-text-tertiary">该 MCP 无需额外环境变量，点确认开始安装。</p>
            </div>
            <p v-if="envDialog.error" class="text-xs text-red-500 mt-3">{{ envDialog.error }}</p>
            <div class="flex gap-2 justify-end mt-4">
              <button @click="closeEnvDialog" class="btn-secondary">取消</button>
              <button @click="confirmEnvDialog" class="btn-primary" :disabled="envDialog.installing">{{ envDialog.installing ? '安装中...' : '确认安装' }}</button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, reactive } from 'vue'
import { useMcpStore, cleanIpcError, type McpServer } from '@/stores/mcps'
import { useMcpMarketStore, type McpMarketSource, type McpMarketListItem, type McpMarketDetail } from '@/stores/mcpMarket'

const store = useMcpStore()
const market = useMcpMarketStore()

const tabs = [
  { key: 'installed', label: '已安装' },
  { key: 'market', label: 'MCP 市场' }
]
const sources: { key: McpMarketSource; label: string }[] = [
  { key: 'mcp-cn', label: 'mcp-cn 精选' },
  { key: 'mcpmarket-cn', label: 'mcpmarket 全量' }
]
const activeTab = ref<'installed' | 'market'>('installed')

const showForm = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const form = ref<{ name: string; command: string; always_load: boolean }>({
  name: '',
  command: '',
  always_load: false
})
const argsStr = ref('')
const envStr = ref('{}')
const formError = ref('')

// 环境变量 JSON 实时校验：填错时红字提示并阻断保存，杜绝「保存成功但 env 静默变空」
const envError = computed(() => {
  const text = envStr.value.trim()
  if (!text) return ''
  try {
    const parsed = JSON.parse(text)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return '环境变量必须是 JSON 对象，例如 {"API_KEY":"xxx"}'
    }
    return ''
  } catch {
    return 'JSON 格式错误，请检查引号和逗号（需使用双引号）'
  }
})

function resetForm() {
  // always_load 默认不勾：新增服务器默认走收敛模式，避免一次添加把大量工具塞进 prompt
  form.value = { name: '', command: '', always_load: false }
  argsStr.value = ''
  envStr.value = '{}'
  formError.value = ''
}

function openCreateForm() {
  editingId.value = null
  resetForm()
  showForm.value = true
}

function closeForm() {
  showForm.value = false
  resetForm()
}

function editServer(server: McpServer) {
  editingId.value = server.id
  form.value = { name: server.name, command: server.command, always_load: !!server.always_load }
  argsStr.value = server.args.join('\n')
  envStr.value = JSON.stringify(server.env, null, 2)
  formError.value = ''
  showForm.value = true
}

async function saveServer() {
  formError.value = ''
  if (!form.value.name.trim()) {
    formError.value = '请填写名称'
    return
  }
  if (!form.value.command.trim()) {
    formError.value = '请填写命令'
    return
  }
  if (envError.value) {
    formError.value = '请先修正环境变量 JSON 格式'
    return
  }
  saving.value = true
  try {
    const args = argsStr.value.split('\n').map((a) => a.trim()).filter(Boolean)
    const env: Record<string, string> = envStr.value.trim() ? JSON.parse(envStr.value) : {}
    const payload = {
      name: form.value.name.trim(),
      command: form.value.command.trim(),
      args,
      env,
      always_load: !!form.value.always_load
    }
    if (editingId.value) {
      await store.updateServerAndProbe(editingId.value, payload)
    } else {
      await store.createServer(payload)
    }
    showForm.value = false
    resetForm()
  } catch (e: any) {
    formError.value = '保存失败: ' + cleanIpcError(e)
  } finally {
    saving.value = false
  }
}

function isRunning(server: McpServer): boolean {
  return store.serverStatus[server.id]?.status === 'running'
}

function statusError(server: McpServer): string {
  const s = store.serverStatus[server.id]
  return s?.status === 'error' ? s.error || '' : ''
}

function statusText(server: McpServer): string {
  if (!server.enabled) return '已禁用'
  const s = store.serverStatus[server.id]?.status
  if (s === 'starting') return '启动中'
  if (s === 'running') return '运行中'
  if (s === 'error') return '启动失败'
  return '已停止'
}

function statusBadgeClass(server: McpServer): string {
  if (!server.enabled) return 'status-inactive'
  const s = store.serverStatus[server.id]?.status
  if (s === 'starting') return 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
  if (s === 'running') return 'status-active'
  if (s === 'error') return 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  return 'status-inactive'
}

function toolName(t: any): string {
  return typeof t === 'string' ? t : String(t?.name || '')
}

function toolDescription(t: any): string {
  return typeof t === 'object' && t ? String(t.description || '') : ''
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '...' : text
}

async function onStart(server: McpServer) {
  try {
    await store.startServer(server.id)
  } catch (e: any) {
    window.alert(`启动「${server.name}」失败:\n${truncate(cleanIpcError(e), 600)}`)
  }
}

async function onStop(server: McpServer) {
  try {
    await store.stopServer(server.id)
  } catch (e: any) {
    window.alert(`停止「${server.name}」失败: ${cleanIpcError(e)}`)
  }
}

async function onRefreshTools(server: McpServer) {
  try {
    const updated = await store.refreshTools(server.id)
    if (!updated.tools.length) {
      window.alert(`「${server.name}」已连接，但未发现任何工具（该服务器可能不提供 tools 能力）`)
    }
  } catch (e: any) {
    window.alert(`获取「${server.name}」工具列表失败:\n${truncate(cleanIpcError(e), 600)}`)
  }
}

async function onToggleEnabled(server: McpServer, event: Event) {
  const checkbox = event.target as HTMLInputElement
  const enabled = checkbox.checked
  try {
    await store.toggleEnabled(server.id, enabled)
  } catch (e: any) {
    checkbox.checked = server.enabled
    window.alert(`操作失败: ${cleanIpcError(e)}`)
  }
}

async function onDelete(server: McpServer) {
  if (!window.confirm(`确定删除 MCP 服务器「${server.name}」吗？\n已绑定该服务器的智能体会自动解绑。`)) return
  try {
    await store.deleteServer(server.id)
  } catch (e: any) {
    window.alert(`删除失败: ${cleanIpcError(e)}`)
  }
}

// ===== 市场 =====
const marketKeyword = ref('')
const installingId = ref<string>('')

function itemKey(item: McpMarketListItem): string {
  return `${item.source}:${item.id}`
}

function onChangeSource(src: McpMarketSource) {
  market.setSource(src)
  marketKeyword.value = ''
  void market.fetchList(true)
}

async function doSearch() {
  await market.search(marketKeyword.value)
}

async function clearSearch() {
  marketKeyword.value = ''
  await market.search('')
}

function onLogoError(e: Event) {
  (e.target as HTMLImageElement).style.display = 'none'
}

const envDialog = reactive<{
  open: boolean
  title: string
  detail: McpMarketDetail | null
  values: Record<string, string>
  placeholders: Record<string, string>
  error: string
  installing: boolean
}>({
  open: false,
  title: '',
  detail: null,
  values: {},
  placeholders: {},
  error: '',
  installing: false
})

function closeEnvDialog() {
  envDialog.open = false
  envDialog.detail = null
  envDialog.values = {}
  envDialog.placeholders = {}
  envDialog.error = ''
  envDialog.installing = false
}

async function onClickInstall(item: McpMarketListItem) {
  installingId.value = itemKey(item)
  try {
    const detail = await market.fetchDetail(item.id)
    if (detail.install.type !== 'stdio') {
      window.alert('该 MCP 是远程服务（HTTP/SSE），当前版本暂不支持安装。')
      return
    }
    const env = detail.install.env || {}
    const needsEnv = Object.keys(env).length > 0
    if (needsEnv) {
      envDialog.title = `配置环境变量 · ${detail.name}`
      envDialog.detail = detail
      envDialog.values = {}
      envDialog.placeholders = {}
      for (const [k, v] of Object.entries(env)) {
        envDialog.placeholders[k] = v
        // 占位符（含 <xxx> 形态）清空让用户填，否则保留原值
        envDialog.values[k] = /^<.+>$/.test(v) ? '' : v
      }
      envDialog.error = ''
      envDialog.installing = false
      envDialog.open = true
    } else {
      await doInstall(detail, {})
    }
  } catch (e: any) {
    window.alert(`获取详情失败: ${cleanIpcError(e)}`)
  } finally {
    installingId.value = ''
  }
}

async function confirmEnvDialog() {
  if (!envDialog.detail) return
  envDialog.installing = true
  envDialog.error = ''
  try {
    await doInstall(envDialog.detail, { ...envDialog.values })
    closeEnvDialog()
  } catch (e: any) {
    envDialog.error = cleanIpcError(e)
  } finally {
    envDialog.installing = false
  }
}

async function doInstall(detail: McpMarketDetail, envOverrides: Record<string, string>) {
  await market.install(detail, envOverrides)
  await store.fetchServers()
  await store.fetchAllStatus()
  activeTab.value = 'installed'
}

onMounted(async () => {
  store.listenStatus()
  await store.fetchServers()
  await store.fetchAllStatus()
})

onUnmounted(() => {
  store.unlistenStatus()
})
</script>
