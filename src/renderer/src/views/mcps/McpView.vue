<template>
  <div class="h-full flex flex-col">
    <header class="page-header">
      <button class="btn-primary" @click="showForm = true; editingId = null; resetForm()">+ 添加服务器</button>
    </header>
    <div class="page-body">
      <div v-if="showForm" class="max-w-xl mb-6 form-card">
        <div>
          <label class="form-label">名称</label>
          <input v-model="form.name" class="input-field" placeholder="例如: 文件系统服务" />
        </div>
        <div>
          <label class="form-label">命令</label>
          <input v-model="form.command" placeholder="npx, node, python..." class="input-field" />
        </div>
        <div>
          <label class="form-label">参数（每行一个）</label>
          <textarea v-model="argsStr" rows="3" class="textarea-field font-mono" placeholder="-y&#10;@modelcontextprotocol/server-filesystem"></textarea>
        </div>
        <div>
          <label class="form-label">环境变量 (JSON)</label>
          <textarea v-model="envStr" rows="3" class="textarea-field font-mono" placeholder='{"API_KEY":"..."}'></textarea>
        </div>
        <div class="flex gap-3 pt-2">
          <button @click="saveServer" class="btn-primary">{{ editingId ? '更新' : '创建' }}</button>
          <button @click="showForm = false" class="btn-secondary">取消</button>
        </div>
      </div>

      <div v-if="store.servers.length === 0 && !showForm" class="empty-state">
        <div class="w-16 h-16 rounded-2xl bg-surface-2 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-text-disabled" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7m0 0a3 3 0 0 1-3 3m0 3h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Zm-3 6h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Z" /></svg>
        </div>
        <p class="text-sm font-medium text-text-secondary mb-1">暂无 MCP 服务</p>
        <p class="text-xs">配置 MCP 服务器，为智能体提供外部工具能力</p>
      </div>

      <div v-else class="grid grid-cols-3 gap-3">
        <div v-for="server in store.servers" :key="server.id" class="card p-4">
          <div class="flex items-start gap-3 mb-3">
            <div class="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <svg class="w-4.5 h-4.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7" /></svg>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-semibold text-sm text-text-primary truncate">{{ server.name }}</span>
                <span :class="['status-badge', store.serverStatus[server.id] === 'running' ? 'status-active' : 'status-inactive']">
                  {{ store.serverStatus[server.id] === 'running' ? '运行中' : '已停止' }}
                </span>
              </div>
              <div class="text-xs text-text-tertiary mt-0.5 font-mono truncate">{{ server.command }} {{ server.args.join(' ') }}</div>
            </div>
          </div>
          <div v-if="server.tools.length" class="flex flex-wrap gap-1 mb-3">
            <span v-for="t in server.tools" :key="t" class="text-[10px] px-1.5 py-0.5 bg-surface-2 rounded text-text-secondary">{{ t }}</span>
          </div>
          <div class="flex gap-1 justify-end">
            <button v-if="store.serverStatus[server.id] !== 'running'" @click="store.startServer(server.id)" class="btn-ghost text-emerald-600 hover:!bg-emerald-50">启动</button>
            <button v-else @click="store.stopServer(server.id)" class="btn-ghost text-amber-600 hover:!bg-amber-50">停止</button>
            <button @click="editServer(server)" class="btn-ghost">编辑</button>
            <button @click="store.deleteServer(server.id)" class="btn-danger">删除</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMcpStore, type McpServer } from '@/stores/mcps'

const store = useMcpStore()
const showForm = ref(false)
const editingId = ref<string | null>(null)
const form = ref({ name: '', command: '' })
const argsStr = ref('')
const envStr = ref('{}')

function resetForm() {
  form.value = { name: '', command: '' }
  argsStr.value = ''
  envStr.value = '{}'
}

function editServer(server: McpServer) {
  editingId.value = server.id
  form.value = { name: server.name, command: server.command }
  argsStr.value = server.args.join('\n')
  envStr.value = JSON.stringify(server.env, null, 2)
  showForm.value = true
}

async function saveServer() {
  try {
    const args = argsStr.value.split('\n').map((a) => a.trim()).filter(Boolean)
    let env: Record<string, string> = {}
    try { env = JSON.parse(envStr.value) } catch {}
    if (editingId.value) {
      await store.updateServer(editingId.value, { ...form.value, args, env })
    } else {
      await store.createServer({ ...form.value, args, env })
    }
    showForm.value = false
    resetForm()
  } catch (e: any) {
    console.error('saveServer error:', e)
    alert('保存失败: ' + (e?.message || e))
  }
}

onMounted(async () => {
  await store.fetchServers()
  for (const s of store.servers) {
    await store.checkStatus(s.id)
  }
})
</script>
