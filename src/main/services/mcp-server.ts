import { getDatabase } from '../database'
import { v4 as uuid } from 'uuid'
import { spawn, ChildProcess } from 'child_process'

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

function parseMcpServer(row: any): McpServer {
  return {
    ...row,
    args: JSON.parse(row.args || '[]'),
    env: JSON.parse(row.env || '{}'),
    tools: JSON.parse(row.tools || '[]'),
    enabled: Boolean(row.enabled)
  }
}

const runningProcesses = new Map<string, ChildProcess>()

export function listMcpServers(): McpServer[] {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM mcp_servers ORDER BY created_at DESC').all() as any[]
  return rows.map(parseMcpServer)
}

export function getMcpServer(id: string): McpServer | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as any
  if (!row) return null
  return parseMcpServer(row)
}

export function createMcpServer(data: {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
}): McpServer {
  const db = getDatabase()
  const id = uuid()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO mcp_servers (id, name, command, args, env, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, data.name, data.command, JSON.stringify(data.args || []), JSON.stringify(data.env || {}), now)
  return getMcpServer(id)!
}

export function updateMcpServer(
  id: string,
  data: Partial<{
    name: string
    command: string
    args: string[]
    env: Record<string, string>
    enabled: boolean
    tools: any[]
  }>
): McpServer | null {
  const db = getDatabase()
  const existing = getMcpServer(id)
  if (!existing) return null

  db.prepare(
    'UPDATE mcp_servers SET name=?, command=?, args=?, env=?, enabled=?, tools=? WHERE id=?'
  ).run(
    data.name ?? existing.name,
    data.command ?? existing.command,
    JSON.stringify(data.args ?? existing.args),
    JSON.stringify(data.env ?? existing.env),
    data.enabled !== undefined ? (data.enabled ? 1 : 0) : existing.enabled ? 1 : 0,
    JSON.stringify(data.tools ?? existing.tools),
    id
  )
  return getMcpServer(id)
}

export function deleteMcpServer(id: string): boolean {
  stopMcpServer(id)
  const db = getDatabase()
  const result = db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id)
  if (result.changes > 0) {
    const bots = db.prepare("SELECT id, mcp_ids FROM bots WHERE mcp_ids LIKE '%' || ? || '%'").all(id) as any[]
    for (const bot of bots) {
      const ids: string[] = JSON.parse(bot.mcp_ids || '[]')
      const filtered = ids.filter((mid: string) => mid !== id)
      if (filtered.length !== ids.length) {
        db.prepare('UPDATE bots SET mcp_ids = ? WHERE id = ?').run(JSON.stringify(filtered), bot.id)
      }
    }
  }
  return result.changes > 0
}

export function startMcpServer(id: string): boolean {
  const server = getMcpServer(id)
  if (!server || runningProcesses.has(id)) return false

  try {
    const proc = spawn(server.command, server.args, {
      env: { ...process.env, ...server.env },
      stdio: ['pipe', 'pipe', 'pipe']
    })

    proc.on('error', (err) => {
      console.error(`MCP server ${server.name} error:`, err)
      runningProcesses.delete(id)
    })

    proc.on('exit', () => {
      runningProcesses.delete(id)
    })

    runningProcesses.set(id, proc)
    return true
  } catch (err) {
    console.error(`Failed to start MCP server ${server.name}:`, err)
    return false
  }
}

export function stopMcpServer(id: string): boolean {
  const proc = runningProcesses.get(id)
  if (!proc) return false
  proc.kill()
  runningProcesses.delete(id)
  return true
}

export function getMcpServerStatus(id: string): 'running' | 'stopped' {
  return runningProcesses.has(id) ? 'running' : 'stopped'
}

export function stopAllMcpServers(): void {
  runningProcesses.forEach((proc) => {
    proc.kill()
  })
  runningProcesses.clear()
}

let jsonRpcId = 1

function sendJsonRpc(
  proc: ChildProcess,
  method: string,
  params?: any,
  timeoutMs = 30000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = jsonRpcId++
    const request = JSON.stringify({ jsonrpc: '2.0', id, method, params: params || {} }) + '\n'

    let buffer = ''
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`MCP JSON-RPC timeout after ${timeoutMs}ms`))
    }, timeoutMs)

    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim()
        if (!line) continue
        try {
          const msg = JSON.parse(line)
          if (msg.id === id) {
            cleanup()
            if (msg.error) {
              reject(new Error(msg.error.message || JSON.stringify(msg.error)))
            } else {
              resolve(msg.result)
            }
            return
          }
        } catch {}
      }
      buffer = lines[lines.length - 1]
    }

    const cleanup = (): void => {
      clearTimeout(timer)
      proc.stdout?.removeListener('data', onData)
    }

    proc.stdout?.on('data', onData)
    proc.stdin?.write(request)
  })
}

export async function callMcpTool(
  serverId: string,
  toolName: string,
  args: Record<string, any>
): Promise<any> {
  const proc = runningProcesses.get(serverId)
  if (!proc) {
    // Auto-start the server
    const started = startMcpServer(serverId)
    if (!started) throw new Error('Failed to start MCP server')
    const newProc = runningProcesses.get(serverId)
    if (!newProc) throw new Error('MCP server process not found after start')

    // Wait briefly for server initialization
    await new Promise((r) => setTimeout(r, 1000))

    return sendJsonRpc(newProc, 'tools/call', { name: toolName, arguments: args })
  }

  return sendJsonRpc(proc, 'tools/call', { name: toolName, arguments: args })
}

export async function listMcpToolsFromServer(serverId: string): Promise<any[]> {
  const proc = runningProcesses.get(serverId)
  if (!proc) throw new Error('MCP server not running')

  const result = await sendJsonRpc(proc, 'tools/list', {})
  return result?.tools || []
}
