import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync
} from 'fs'
import { join } from 'path'
import { getDataDir } from '../data-path'

/**
 * 备份系统的目录布局工具 + 原子化 rename 辅助。
 *
 * 目录结构（位于 dataDir 下）：
 *   backups/                          ← 用户可见的备份文件 + records.json
 *   backups/.staging/                 ← 正在写入的 .partial 备份
 *   backups/.restore-staging-<ts>/    ← 恢复时的解压暂存
 *   backups/.restore-previous-<ts>/   ← 恢复时把当前数据 rename 进来作保险
 *
 * 全部位于 dataDir 同一卷，rename 才能保持原子性。
 */

const BACKUP_DIR = 'backups'
const STAGING_DIR = '.staging'
const RESTORE_STAGING_PREFIX = '.restore-staging-'
const RESTORE_PREVIOUS_PREFIX = '.restore-previous-'
/** 这些根级条目在恢复时不被纳入 .restore-previous，恢复后保持原样。 */
const RESTORE_PRESERVE_ROOTS = new Set([BACKUP_DIR, 'data-path.json'])
/** 恢复时保险目录的过期天数：超过则后台清理。 */
const PREVIOUS_TTL_DAYS = 7

export function getBackupDir(): string {
  const dir = join(getDataDir(), BACKUP_DIR)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function getStagingDir(): string {
  const dir = join(getBackupDir(), STAGING_DIR)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function newRestoreStagingDir(ts: string): string {
  const dir = join(getBackupDir(), `${RESTORE_STAGING_PREFIX}${ts}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function newRestorePreviousDir(ts: string): string {
  const dir = join(getBackupDir(), `${RESTORE_PREVIOUS_PREFIX}${ts}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * 列出 dataDir 下"恢复时需要被保险归档/替换"的根级条目。
 * 排除 backups/ 自身（备份文件不能被自己的恢复操作搬走）和 data-path.json。
 */
export function listRootEntriesForRestore(): string[] {
  const dataDir = getDataDir()
  if (!existsSync(dataDir)) return []
  return readdirSync(dataDir).filter((name) => !RESTORE_PRESERVE_ROOTS.has(name))
}

/**
 * 把 src（可以是文件或目录）原子 rename 到 dest。
 * Windows 下若 dest 存在会失败，先 force 删 dest。
 */
export function moveAtomic(src: string, dest: string): void {
  if (!existsSync(src)) return
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true })
  }
  renameSync(src, dest)
}

/** 安全删除。失败时记录但不抛，避免清理代码本身把恢复流程搞炸。 */
export function safeRemove(path: string): void {
  if (!existsSync(path)) return
  try {
    const st = statSync(path)
    if (st.isDirectory()) rmSync(path, { recursive: true, force: true })
    else unlinkSync(path)
  } catch (e) {
    console.error('[backup] safeRemove failed:', path, e)
  }
}

/**
 * 删除 SQLite 的 WAL/SHM 兄弟文件。
 *
 * 关键：覆盖 .db 之前必须删 .db-wal / .db-shm，否则下次打开 db 时
 * SQLite 会把"旧 WAL 中尚未 checkpoint 的页"应用到刚恢复的 db 上，
 * 导致恢复结果被静默篡改 → 数据损坏。
 */
export function removeSqliteSidecars(dbPath: string): void {
  for (const ext of ['-wal', '-shm']) {
    safeRemove(dbPath + ext)
  }
}

/**
 * 清理过期的 .restore-previous-* 保险目录。
 * 仅在主进程启动后异步调用一次，给用户留 PREVIOUS_TTL_DAYS 天反悔窗口。
 */
export function cleanupExpiredPreviousDirs(): void {
  const backupDir = getBackupDir()
  if (!existsSync(backupDir)) return
  const now = Date.now()
  const ttlMs = PREVIOUS_TTL_DAYS * 24 * 60 * 60 * 1000
  for (const name of readdirSync(backupDir)) {
    if (!name.startsWith(RESTORE_PREVIOUS_PREFIX)) continue
    const full = join(backupDir, name)
    try {
      const st = statSync(full)
      if (now - st.mtimeMs > ttlMs) {
        rmSync(full, { recursive: true, force: true })
      }
    } catch {}
  }
}

/**
 * 启动时清理 .staging/ 下的 .partial 残骸（上次备份被中断或崩溃留下的）。
 */
export function cleanupOrphanedPartials(): void {
  const staging = getStagingDir()
  if (!existsSync(staging)) return
  for (const name of readdirSync(staging)) {
    safeRemove(join(staging, name))
  }
}

/** 文件名安全的时间戳，精确到毫秒，避免同秒内冲突。 */
export function timestamp(): string {
  const d = new Date()
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}` +
    `-${pad(d.getMilliseconds(), 3)}`
  )
}
