import { app } from 'electron'
import { join, basename } from 'path'
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  copyFileSync,
  rmSync
} from 'fs'

const CONFIG_FILE = 'data-path.json'

let cachedDataDir: string | null = null

function getConfigPath(): string {
  return join(app.getPath('userData'), CONFIG_FILE)
}

function getDefaultDataDir(): string {
  return app.getPath('userData')
}

function readConfig(): Record<string, string> {
  const configPath = getConfigPath()
  if (existsSync(configPath)) {
    try {
      return JSON.parse(readFileSync(configPath, 'utf-8'))
    } catch {}
  }
  return {}
}

function writeConfig(config: Record<string, string>): void {
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8')
}

export function getDataDir(): string {
  if (cachedDataDir) return cachedDataDir

  const config = readConfig()
  if (config.dataDir && existsSync(config.dataDir)) {
    cachedDataDir = config.dataDir
    return cachedDataDir!
  }

  cachedDataDir = getDefaultDataDir()
  return cachedDataDir!
}

function isRootDir(dir: string): boolean {
  return /^[A-Z]:\\?$/i.test(dir) || dir === '/'
}

export function setDataDir(dir: string): void {
  const config = readConfig()
  const currentDir = getDataDir()
  if (currentDir !== dir && !isRootDir(currentDir)) {
    config.oldDataDir = currentDir
  }
  config.dataDir = dir
  writeConfig(config)
  mkdirSync(dir, { recursive: true })
  cachedDataDir = dir
}

export function isFirstLaunch(): boolean {
  return !existsSync(getConfigPath())
}

export function initDataDir(dir?: string): void {
  const dataDir = dir || getDefaultDataDir()
  mkdirSync(dataDir, { recursive: true })
  setDataDir(dataDir)
}

// --- Migration ---

function collectFiles(dir: string, base: string = ''): string[] {
  const results: string[] = []
  if (!existsSync(dir)) return results
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const rel = base ? join(base, entry) : entry
    const st = statSync(full)
    if (st.isDirectory()) {
      results.push(...collectFiles(full, rel))
    } else {
      results.push(rel)
    }
  }
  return results
}

export function checkMigration(): { needed: boolean; oldDir: string; newDir: string; fileCount: number } {
  const config = readConfig()
  const oldDir = config.oldDataDir
  const newDir = config.dataDir

  if (!oldDir || !newDir || oldDir === newDir) {
    return { needed: false, oldDir: '', newDir: '', fileCount: 0 }
  }

  if (!existsSync(oldDir) || isRootDir(oldDir)) {
    clearOldDataDir()
    return { needed: false, oldDir: '', newDir: '', fileCount: 0 }
  }

  const files = collectFiles(oldDir)
  if (files.length === 0 || files.length > 10000) {
    clearOldDataDir()
    return { needed: false, oldDir: '', newDir: '', fileCount: 0 }
  }

  return { needed: true, oldDir, newDir, fileCount: files.length }
}

export function migrateFiles(
  onProgress: (current: number, total: number, fileName: string) => void
): { success: boolean; error?: string } {
  const config = readConfig()
  const oldDir = config.oldDataDir
  const newDir = config.dataDir

  if (!oldDir || !newDir || !existsSync(oldDir)) {
    return { success: false, error: 'Old directory not found' }
  }

  try {
    const files = collectFiles(oldDir)
    const total = files.length

    for (let i = 0; i < files.length; i++) {
      const rel = files[i]
      const src = join(oldDir, rel)
      const dest = join(newDir, rel)
      const destDir = join(dest, '..')
      if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
      copyFileSync(src, dest)
      onProgress(i + 1, total, basename(rel))
    }

    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) }
  }
}

export function deleteOldDir(): { success: boolean; error?: string } {
  const config = readConfig()
  const oldDir = config.oldDataDir
  if (!oldDir || !existsSync(oldDir)) {
    clearOldDataDir()
    return { success: true }
  }
  try {
    const userDataDir = app.getPath('userData')
    const isUserData = oldDir.replace(/[\\/]+$/, '').toLowerCase() === userDataDir.replace(/[\\/]+$/, '').toLowerCase()

    if (isUserData) {
      // Delete contents but keep the dir and config file
      for (const entry of readdirSync(oldDir)) {
        if (entry === CONFIG_FILE) continue
        const full = join(oldDir, entry)
        try {
          rmSync(full, { recursive: true, force: true })
        } catch {}
      }
    } else {
      rmSync(oldDir, { recursive: true, force: true })
    }

    clearOldDataDir()
    return { success: true }
  } catch (e: any) {
    // Always clear record to prevent repeated prompts
    clearOldDataDir()
    return { success: false, error: e?.message || String(e) }
  }
}

export function clearOldDataDir(): void {
  const config = readConfig()
  delete config.oldDataDir
  writeConfig(config)
}

export function skipMigration(): void {
  clearOldDataDir()
}
