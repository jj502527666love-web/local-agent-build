import { join, basename } from 'path'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  readFileSync,
  writeFileSync,
  copyFileSync
} from 'fs'
import { deflateSync, inflateSync } from 'zlib'
import { getDataDir } from './data-path'
import { getDatabase, closeDatabase } from '../database'
import { getSetting, setSetting } from './settings'

export interface BackupInfo {
  fileName: string
  type: 'auto' | 'full'
  size: number
  createdAt: string
}

const BACKUP_DIR_NAME = 'backups'
const EXCLUDE_DIRS = new Set(['backups', 'node_modules'])
const EXCLUDE_FILES = new Set(['data-path.json'])
const EXCLUDE_EXTENSIONS = new Set(['.db-wal', '.db-shm'])

function getBackupDir(): string {
  const dir = join(getDataDir(), BACKUP_DIR_NAME)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function timestamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

// === Auto Backup (DB only) ===

export async function backupDatabase(): Promise<BackupInfo> {
  const db = getDatabase()
  const backupDir = getBackupDir()
  const ts = timestamp()
  const fileName = `backup-db-${ts}.sqlite`
  const destPath = join(backupDir, fileName)

  await db.backup(destPath)

  const stat = statSync(destPath)
  const info: BackupInfo = {
    fileName,
    type: 'auto',
    size: stat.size,
    createdAt: new Date().toISOString()
  }

  saveBackupRecord(info)
  setSetting('backup_last_auto', new Date().toISOString())
  return info
}

// === Full Backup (tar-like custom archive) ===

function collectDataFiles(dir: string, base: string = ''): { path: string; size: number }[] {
  const results: { path: string; size: number }[] = []
  if (!existsSync(dir)) return results
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const rel = base ? base + '/' + entry : entry
    if (EXCLUDE_DIRS.has(entry) && !base) continue
    if (!base && EXCLUDE_FILES.has(entry)) continue
    if (EXCLUDE_EXTENSIONS.has(entry.substring(entry.lastIndexOf('.')))) continue
    const st = statSync(full)
    if (st.isDirectory()) {
      results.push(...collectDataFiles(full, rel))
    } else {
      results.push({ path: rel, size: st.size })
    }
  }
  return results
}

export async function backupFull(
  onProgress?: (current: number, total: number, fileName: string) => void
): Promise<BackupInfo> {
  const dataDir = getDataDir()
  const backupDir = getBackupDir()
  const ts = timestamp()
  const fileName = `backup-full-${ts}.bak`
  const destPath = join(backupDir, fileName)

  // First, backup the database to a clean snapshot
  const db = getDatabase()
  const dbSnapshotPath = join(backupDir, `_temp_db_${ts}.sqlite`)
  await db.backup(dbSnapshotPath)

  // Collect files
  const files = collectDataFiles(dataDir)
  // Replace the live db with the clean snapshot in our list
  const dbIndex = files.findIndex((f) => f.path === 'local-agent.db')
  if (dbIndex >= 0) {
    files[dbIndex] = { path: 'local-agent.db', size: statSync(dbSnapshotPath).size }
  }

  const total = files.length

  // Build a simple archive: JSON manifest + concatenated file data, then compress
  const manifest: { path: string; size: number }[] = []
  const chunks: Buffer[] = []

  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    const fullPath =
      f.path === 'local-agent.db' && dbSnapshotPath
        ? dbSnapshotPath
        : join(dataDir, f.path)

    const data = readFileSync(fullPath)
    manifest.push({ path: f.path, size: data.length })
    chunks.push(data)

    if (onProgress) onProgress(i + 1, total, basename(f.path))
  }

  // Archive format: [4 bytes manifest length][manifest JSON][file data...]
  const manifestBuf = Buffer.from(JSON.stringify(manifest), 'utf-8')
  const header = Buffer.alloc(4)
  header.writeUInt32LE(manifestBuf.length, 0)

  const archive = Buffer.concat([header, manifestBuf, ...chunks])

  // Compress with zlib
  const compressed = deflateSync(archive, { level: 6 })
  writeFileSync(destPath, compressed)

  // Cleanup temp db
  try {
    unlinkSync(dbSnapshotPath)
  } catch {}

  const stat = statSync(destPath)
  const info: BackupInfo = {
    fileName,
    type: 'full',
    size: stat.size,
    createdAt: new Date().toISOString()
  }

  saveBackupRecord(info)
  return info
}

// === Restore ===

export async function restoreDatabase(fileName: string): Promise<{ success: boolean; error?: string }> {
  try {
    const backupDir = getBackupDir()
    const filePath = join(backupDir, fileName)
    if (!existsSync(filePath)) return { success: false, error: '备份文件不存在' }

    const dataDir = getDataDir()
    const dbPath = join(dataDir, 'local-agent.db')

    // Close database to release file lock before overwriting
    closeDatabase()

    copyFileSync(filePath, dbPath)

    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) }
  }
}

export async function restoreFull(
  fileName: string,
  onProgress?: (current: number, total: number, fileName: string) => void
): Promise<{ success: boolean; error?: string }> {
  try {
    const backupDir = getBackupDir()
    const filePath = join(backupDir, fileName)
    if (!existsSync(filePath)) return { success: false, error: '备份文件不存在' }

    const dataDir = getDataDir()

    // Close database to release file lock before overwriting
    closeDatabase()

    const compressed = readFileSync(filePath)
    const archive = inflateSync(compressed)

    // Parse archive
    const manifestLen = archive.readUInt32LE(0)
    const manifest: { path: string; size: number }[] = JSON.parse(
      archive.subarray(4, 4 + manifestLen).toString('utf-8')
    )

    let offset = 4 + manifestLen
    const total = manifest.length

    for (let i = 0; i < manifest.length; i++) {
      const entry = manifest[i]
      const data = archive.subarray(offset, offset + entry.size)
      offset += entry.size

      const destPath = join(dataDir, entry.path)
      const destDir = join(destPath, '..')
      if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
      writeFileSync(destPath, data)

      if (onProgress) onProgress(i + 1, total, basename(entry.path))
    }

    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message || String(e) }
  }
}

// === List & Delete ===

export function listBackups(): BackupInfo[] {
  const backupDir = getBackupDir()
  const recordPath = join(backupDir, 'backup-records.json')
  if (!existsSync(recordPath)) return []
  try {
    const records: BackupInfo[] = JSON.parse(readFileSync(recordPath, 'utf-8'))
    // Filter out records whose files no longer exist
    return records.filter((r) => existsSync(join(backupDir, r.fileName))).reverse()
  } catch {
    return []
  }
}

export function deleteBackup(fileName: string): boolean {
  const backupDir = getBackupDir()
  const filePath = join(backupDir, fileName)
  if (existsSync(filePath)) {
    try {
      unlinkSync(filePath)
    } catch {
      return false
    }
  }
  // Remove from records
  const recordPath = join(backupDir, 'backup-records.json')
  if (existsSync(recordPath)) {
    try {
      const records: BackupInfo[] = JSON.parse(readFileSync(recordPath, 'utf-8'))
      const updated = records.filter((r) => r.fileName !== fileName)
      writeFileSync(recordPath, JSON.stringify(updated, null, 2), 'utf-8')
    } catch {}
  }
  return true
}

// === Auto Backup Check ===

export function shouldAutoBackup(intervalSetting: string): boolean {
  if (intervalSetting === 'off') return false
  const lastAuto = getSetting('backup_last_auto')
  if (!lastAuto) return true

  const lastDate = new Date(lastAuto)
  const now = new Date()
  const diffHours = (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60)

  if (intervalSetting === 'daily') return diffHours >= 24
  if (intervalSetting === 'weekly') return diffHours >= 168
  return false
}

export function getAutoBackupInterval(): string {
  return getSetting('backup_auto_interval') || 'off'
}

export function setAutoBackupInterval(interval: string): void {
  setSetting('backup_auto_interval', interval)
}

export function getMaxBackupCount(): number {
  const val = getSetting('backup_max_count')
  return val ? parseInt(val, 10) : 5
}

export function setMaxBackupCount(count: number): void {
  setSetting('backup_max_count', String(count))
}

export async function runAutoBackupIfNeeded(): Promise<BackupInfo | null> {
  const interval = getAutoBackupInterval()
  if (!shouldAutoBackup(interval)) return null

  try {
    const info = await backupDatabase()
    cleanupOldBackups('auto')
    return info
  } catch (e) {
    console.error('Auto backup failed:', e)
    return null
  }
}

function cleanupOldBackups(type: 'auto' | 'full'): void {
  const maxCount = getMaxBackupCount()
  const backupDir = getBackupDir()
  const recordPath = join(backupDir, 'backup-records.json')
  if (!existsSync(recordPath)) return

  try {
    const records: BackupInfo[] = JSON.parse(readFileSync(recordPath, 'utf-8'))
    const typed = records.filter((r) => r.type === type)
    const other = records.filter((r) => r.type !== type)

    if (typed.length > maxCount) {
      const toRemove = typed.slice(0, typed.length - maxCount)
      for (const r of toRemove) {
        const fp = join(backupDir, r.fileName)
        if (existsSync(fp)) {
          try { unlinkSync(fp) } catch {}
        }
      }
      const kept = typed.slice(typed.length - maxCount)
      writeFileSync(recordPath, JSON.stringify([...other, ...kept], null, 2), 'utf-8')
    }
  } catch {}
}

// === Internal Helpers ===

function saveBackupRecord(info: BackupInfo): void {
  const backupDir = getBackupDir()
  const recordPath = join(backupDir, 'backup-records.json')
  let records: BackupInfo[] = []
  if (existsSync(recordPath)) {
    try {
      records = JSON.parse(readFileSync(recordPath, 'utf-8'))
    } catch {}
  }
  records.push(info)
  writeFileSync(recordPath, JSON.stringify(records, null, 2), 'utf-8')
}
