import { defineStore } from 'pinia'
import { ref } from 'vue'

function plain<T>(data: T): T {
  return JSON.parse(JSON.stringify(data))
}

export interface McpServer {
  id: string
  name: string
  command: string
  args: string[]
  env: Record<string, string>
  enabled: boolean
  tools: any[]
  created_at: string
}

export const useMcpStore = defineStore('mcps', () => {
  const servers = ref<McpServer[]>([])
  const loading = ref(false)
  const serverStatus = ref<Record<string, string>>({})

  async function fetchServers() {
    loading.value = true
    try {
      servers.value = (await window.api.mcp.invoke('list')) as McpServer[]
    } finally {
      loading.value = false
    }
  }

  async function createServer(data: Partial<McpServer>) {
    const result = (await window.api.mcp.invoke('create', plain(data))) as McpServer
    servers.value.unshift(result)
    return result
  }

  async function updateServer(id: string, data: Partial<McpServer>) {
    const result = (await window.api.mcp.invoke('update', id, plain(data))) as McpServer
    const idx = servers.value.findIndex((s) => s.id === id)
    if (idx !== -1) servers.value[idx] = result
    return result
  }

  async function deleteServer(id: string) {
    await window.api.mcp.invoke('delete', id)
    servers.value = servers.value.filter((s) => s.id !== id)
  }

  async function startServer(id: string) {
    await window.api.mcp.invoke('start', id)
    serverStatus.value[id] = 'running'
  }

  async function stopServer(id: string) {
    await window.api.mcp.invoke('stop', id)
    serverStatus.value[id] = 'stopped'
  }

  async function checkStatus(id: string) {
    const status = (await window.api.mcp.invoke('status', id)) as string
    serverStatus.value[id] = status
    return status
  }

  return {
    servers,
    loading,
    serverStatus,
    fetchServers,
    createServer,
    updateServer,
    deleteServer,
    startServer,
    stopServer,
    checkStatus
  }
})
