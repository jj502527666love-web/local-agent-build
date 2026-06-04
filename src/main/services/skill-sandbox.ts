import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, unlinkSync, rmdirSync, renameSync, copyFileSync, appendFileSync } from 'fs'
import { join, resolve, basename, dirname, extname, isAbsolute } from 'path'
import { exec, execSync } from 'child_process'

export interface SkillExecutionResult {
  success: boolean
  result?: any
  error?: string
  duration: number
}

const DEFAULT_TIMEOUT_MS = 180000

const DANGEROUS_PATTERNS = [
  /rm\s+(-rf?|--recursive)\s+[\/\\]/i,
  /format\s+[a-z]:/i,
  /del\s+[\/\\]/i,
  /rmdir\s+[\/\\]/i,
  /shutdown/i,
  /reg\s+(delete|add)/i,
  /net\s+(user|stop)/i
]

/**
 * Unified path resolver.
 * - null/''/'.'  -> sandboxRoot (workspace root) if provided, else cwd
 * - absolute     -> resolve(p) as-is (respect explicit intent, e.g. skill resources)
 * - relative     -> resolve(sandboxRoot, p) when sandboxRoot present; else resolve(p)
 */
export function resolveInWorkspace(p: string | undefined | null, sandboxRoot?: string): string {
  if (sandboxRoot) {
    const root = resolve(sandboxRoot)
    if (!p || p === '.' || p === './' || p === '.\\') return root
    if (isAbsolute(p)) return resolve(p)
    return resolve(root, p)
  }
  return resolve(p || '.')
}

function validateReadPath(p: string, sandboxRoot?: string): string {
  return resolveInWorkspace(p, sandboxRoot)
}

function validateWritePath(p: string, sandboxRoot?: string): string {
  const resolved = resolveInWorkspace(p, sandboxRoot)
  if (sandboxRoot) {
    const normalizedRoot = resolve(sandboxRoot)
    if (!resolved.startsWith(normalizedRoot)) {
      throw new Error(`Write denied: path "${resolved}" is outside workspace "${normalizedRoot}"`)
    }
  }
  return resolved
}

function validateCommand(cmd: string): void {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(cmd)) {
      throw new Error(`Blocked dangerous command: ${cmd}`)
    }
  }
}

function createFileOps(sandboxRoot?: string) {
  return {
    readFile: (p: string, encoding?: string) => readFileSync(validateReadPath(p, sandboxRoot), (encoding || 'utf-8') as BufferEncoding),
    writeFile: (p: string, content: string, encoding?: string) => {
      const vp = validateWritePath(p, sandboxRoot)
      mkdirSync(dirname(vp), { recursive: true })
      writeFileSync(vp, content, (encoding || 'utf-8') as BufferEncoding)
      return true
    },
    appendFile: (p: string, content: string) => {
      appendFileSync(validateWritePath(p, sandboxRoot), content, 'utf-8')
      return true
    },
    listDir: (p: string) => {
      const dir = validateReadPath(p, sandboxRoot)
      return readdirSync(dir, { withFileTypes: true }).map(e => ({
        name: e.name,
        isDirectory: e.isDirectory(),
        size: e.isDirectory() ? 0 : statSync(join(dir, e.name)).size
      }))
    },
    mkdir: (p: string) => { mkdirSync(validateWritePath(p, sandboxRoot), { recursive: true }); return true },
    exists: (p: string) => existsSync(validateReadPath(p, sandboxRoot)),
    stat: (p: string) => {
      const s = statSync(validateReadPath(p, sandboxRoot))
      return { size: s.size, isDirectory: s.isDirectory(), isFile: s.isFile(), mtime: s.mtime.toISOString() }
    },
    deleteFile: (p: string) => { unlinkSync(validateWritePath(p, sandboxRoot)); return true },
    deleteDir: (p: string) => { rmdirSync(validateWritePath(p, sandboxRoot), { recursive: true } as any); return true },
    rename: (from: string, to: string) => { renameSync(validateWritePath(from, sandboxRoot), validateWritePath(to, sandboxRoot)); return true },
    copyFile: (from: string, to: string) => {
      const vTo = validateWritePath(to, sandboxRoot)
      mkdirSync(dirname(vTo), { recursive: true })
      copyFileSync(validateReadPath(from, sandboxRoot), vTo)
      return true
    },
    join: (...parts: string[]) => join(...parts),
    resolve: (...parts: string[]) => resolve(...parts),
    wsResolve: (p: string) => resolveInWorkspace(p, sandboxRoot),
    basename: (p: string) => basename(p),
    dirname: (p: string) => dirname(p),
    extname: (p: string) => extname(p)
  }
}

function resolveShellCwd(cwd: string | undefined, sandboxRoot?: string): string | undefined {
  if (!cwd) return sandboxRoot
  return resolveInWorkspace(cwd, sandboxRoot)
}

function resolveTimeout(timeoutMs?: number): number {
  return Number.isFinite(timeoutMs) && Number(timeoutMs) > 0
    ? Math.max(1, Math.floor(Number(timeoutMs)))
    : DEFAULT_TIMEOUT_MS
}

function createShellOps(sandboxRoot?: string, timeoutMs?: number) {
  const defaultTimeout = resolveTimeout(timeoutMs)
  return {
    exec: (cmd: string, options?: { cwd?: string; timeout?: number }) => {
      validateCommand(cmd)
      const requestedTimeout = resolveTimeout(options?.timeout)
      const result = execSync(cmd, {
        cwd: resolveShellCwd(options?.cwd, sandboxRoot),
        timeout: Math.max(1, Math.min(requestedTimeout, defaultTimeout)),
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024
      })
      return result
    },
    // 异步执行：用 child_process.exec（回调式）替代 execSync，避免命令运行期间
    // （最长可达 180s）阻塞 Electron 主进程事件循环导致整个 App / 全部会话冻结。
    // 返回 Promise，RUN_COMMAND_IMPL 已改为 await 调用；executeSkillSandbox 的
    // Promise.race 超时此时也真正生效（同步 execSync 下 race 形同虚设）。
    execStructured: (cmd: string, options?: { cwd?: string; timeout?: number }): Promise<{
      exit_code: number
      stdout: string
      stderr: string
      ok: boolean
      timed_out?: boolean
    }> => {
      validateCommand(cmd)
      const requestedTimeout = resolveTimeout(options?.timeout)
      const timeout = Math.max(1, Math.min(requestedTimeout, defaultTimeout))
      return new Promise((resolve) => {
        exec(
          cmd,
          {
            cwd: resolveShellCwd(options?.cwd, sandboxRoot),
            timeout,
            encoding: 'utf-8',
            maxBuffer: 2 * 1024 * 1024,
            windowsHide: true
          },
          (err: any, stdout: string, stderr: string) => {
            if (err) {
              // err.code 为退出码(number)；超时被 kill 时 err.killed=true、err.signal 有值
              const timedOut = !!err.killed || err.signal === 'SIGTERM'
              resolve({
                exit_code: typeof err.code === 'number' ? err.code : 1,
                stdout: (stdout || '').slice(0, 8000),
                stderr: ((stderr || err.message || '').toString()).slice(0, 4000),
                ok: false,
                ...(timedOut ? { timed_out: true } : {})
              })
            } else {
              resolve({
                exit_code: 0,
                stdout: (stdout || '').slice(0, 10000),
                stderr: (stderr || '').slice(0, 4000),
                ok: true
              })
            }
          }
        )
      })
    }
  }
}

export async function executeSkillSandbox(
  implementation: string,
  args: Record<string, any>,
  sandboxRoot?: string,
  timeoutMs?: number
): Promise<SkillExecutionResult> {
  const t0 = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    const fileOps = createFileOps(sandboxRoot)
    const executionTimeout = resolveTimeout(timeoutMs)
    const shellOps = createShellOps(sandboxRoot, executionTimeout)

    const wrappedCode = `
      return (async function(args, fetch, AbortSignal, crypto, fs, shell) {
        ${implementation}
      })(args, fetch, AbortSignal, crypto, fs, shell)
    `

    const fn = new Function('args', 'fetch', 'AbortSignal', 'crypto', 'fs', 'shell', wrappedCode)

    const resultPromise = fn(args, globalThis.fetch, globalThis.AbortSignal, globalThis.crypto, fileOps, shellOps)

    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`执行超时 (${executionTimeout}ms)`)), executionTimeout)
    })

    const result = await Promise.race([resultPromise, timeoutPromise])
    const duration = Date.now() - t0

    return { success: true, result, duration }
  } catch (err: any) {
    const duration = Date.now() - t0
    return { success: false, error: err.message || String(err), duration }
  } finally {
    if (timer) clearTimeout(timer)
  }
}
