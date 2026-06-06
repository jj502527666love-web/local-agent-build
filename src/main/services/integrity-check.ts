import { app, dialog, shell } from 'electron'
import { readFileSync, existsSync, statSync } from 'fs'
import { createHash } from 'crypto'
import { join, dirname } from 'path'
import { is } from '@electron-toolkit/utils'
import { getRuntimeConfig } from './runtime-config'

interface ManifestEntry {
  path: string
  size: number
  sha256: string
  critical: boolean
}

interface CheckResult {
  ok: boolean
  missing: string[]
  corrupted: string[]
}

// 生产布局：ffmpeg.dll 等运行时文件与 exe 同级（win-unpacked 根），
// process.resourcesPath = <root>/resources，故根目录 = 其上一级。
function appRootDir(): string {
  return dirname(process.resourcesPath)
}

function sha256Of(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function loadManifest(): ManifestEntry[] | null {
  try {
    const p = join(process.resourcesPath, 'integrity-manifest.json')
    if (!existsSync(p)) return null
    const parsed = JSON.parse(readFileSync(p, 'utf-8'))
    return Array.isArray(parsed?.files) ? (parsed.files as ManifestEntry[]) : null
  } catch {
    return null
  }
}

/**
 * 校验关键运行时文件是否齐全且未损坏。
 * - 有 manifest：逐项做 存在性 → 大小快筛 → critical 文件 hash 复核
 * - 无 manifest（被删 / 老包）：降级为仅确认 ffmpeg.dll 存在
 * 自检自身任何异常都不得阻断启动，一律降级放行。
 */
export function runIntegrityCheck(): CheckResult {
  const result: CheckResult = { ok: true, missing: [], corrupted: [] }
  if (is.dev) return result // dev 下 ffmpeg.dll 在 node_modules，路径不同且无杀软场景

  try {
    const root = appRootDir()
    const manifest = loadManifest()

    if (manifest && manifest.length) {
      for (const e of manifest) {
        const abs = join(root, e.path)
        if (!existsSync(abs)) {
          result.missing.push(e.path)
          continue
        }
        if (statSync(abs).size !== e.size) {
          result.corrupted.push(e.path)
          continue
        }
        if (e.critical && sha256Of(abs) !== e.sha256) {
          result.corrupted.push(e.path)
        }
      }
    } else if (!existsSync(join(root, 'ffmpeg.dll'))) {
      result.missing.push('ffmpeg.dll')
    }
  } catch (e) {
    console.error('[integrity] self-check error, skip:', e)
    return { ok: true, missing: [], corrupted: [] }
  }

  result.ok = result.missing.length === 0 && result.corrupted.length === 0
  return result
}

/**
 * 启动期自检入口：组件正常返回 true；异常时弹原生对话框引导修复并返回 false。
 * 调用方在返回 false 时应终止启动（app.quit），不要再创建窗口，避免白屏 / 崩溃。
 */
export function ensureIntegrityOrPrompt(): boolean {
  const r = runIntegrityCheck()
  if (r.ok) return true

  const broken = [...r.missing, ...r.corrupted]
  const appName = (() => {
    try {
      return getRuntimeConfig().appName
    } catch {
      return app.getName()
    }
  })()

  const detail =
    `缺失或损坏的文件：\n${broken.join('\n')}\n\n` +
    '该问题通常由杀毒软件（360 / 电脑管家 / 火绒 / Windows 安全中心）将核心组件 ffmpeg.dll 误删或隔离导致，' +
    '也可能是安装包下载不完整。\n\n' +
    '解决办法：\n' +
    '1. 打开杀毒软件的“隔离区 / 恢复区”，恢复被删除的文件；\n' +
    `2. 将 ${appName} 的安装目录加入杀毒软件白名单（信任区）；\n` +
    '3. 重新下载并运行安装包，覆盖安装。'

  const choice = dialog.showMessageBoxSync({
    type: 'error',
    title: '程序组件检测',
    message: `${appName} 核心组件缺失，无法正常启动`,
    detail,
    buttons: ['打开所在目录', '前往官网重新下载', '退出'],
    defaultId: 1,
    cancelId: 2,
    noLink: true
  })

  try {
    if (choice === 0) {
      shell.openPath(appRootDir())
    } else if (choice === 1) {
      const url = getRuntimeConfig().domain
      if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    }
  } catch (e) {
    console.error('[integrity] repair action failed:', e)
  }

  return false
}
