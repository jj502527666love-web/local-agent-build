import { join } from 'path'
import { readFileSync, existsSync } from 'fs'

export interface RuntimeConfig {
  buildId: string
  appName: string
  appId: string
  apiDomain: string
  domain: string
  builtAt: string
}

const DEFAULT_CONFIG: RuntimeConfig = {
  buildId: 'dev',
  appName: 'LocalAgent',
  appId: 'com.local-agent.app',
  apiDomain: 'https://agent-admin.o455.com',
  domain: 'https://agent-admin.o455.com',
  builtAt: ''
}

let cached: RuntimeConfig | null = null

function tryLoad(): RuntimeConfig | null {
  // 候选路径：
  // 1. 生产模式：electron-builder 把 resources/ 复制到 process.resourcesPath/
  // 2. 开发模式：从 cwd 派生项目根 resources/
  // 3. fallback：从 __dirname 多级回溯（__dirname 编译后位于 out/main/）
  const candidates: string[] = []
  if (process.resourcesPath) {
    candidates.push(join(process.resourcesPath, 'config.json'))
  }
  candidates.push(join(process.cwd(), 'resources', 'config.json'))
  candidates.push(join(__dirname, '..', '..', 'resources', 'config.json'))
  candidates.push(join(__dirname, '..', '..', '..', 'resources', 'config.json'))

  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const raw = JSON.parse(readFileSync(p, 'utf-8'))
        return { ...DEFAULT_CONFIG, ...raw }
      } catch (e) {
        console.error('[runtime-config] parse error at', p, e)
      }
    }
  }
  return null
}

export function getRuntimeConfig(): RuntimeConfig {
  if (cached) return cached
  cached = tryLoad() || DEFAULT_CONFIG
  return cached
}
