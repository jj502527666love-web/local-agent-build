import { existsSync, mkdirSync, writeFileSync, renameSync, rmSync, chmodSync } from 'fs'
import { join, dirname } from 'path'
import { spawn, spawnSync } from 'child_process'
import { createHash } from 'crypto'
import { getRootDir } from '../data-path'

// ffmpeg 按需交付(D11 三层模型): 桌面端从【其绑定云控端 API】拉 ffmpeg/ffprobe,
// SHA256 强校验 → 落 设备级 getRootDir()/bin/ → mac chmod+ad-hoc签名 → spawn(绝对路径不走shell)。
// binDir / fetchBytes 依赖注入, 便于无网络/无真实 ffmpeg 单测。

export type FfPlatform = 'win32-x64' | 'darwin-x64' | 'darwin-arm64'

/** ffmpeg 未就绪(需安装/下载)。UI 捕获后弹「请安装 ffmpeg」门控。 */
export class FfmpegNotReadyError extends Error {
  reason: string
  constructor(reason: string) {
    super(reason)
    this.name = 'FfmpegNotReadyError'
    this.reason = reason
  }
}

/** 按 process.platform+arch 选包(Rosetta 下 arch 报 x64 → darwin-x64) */
export function platformKey(): FfPlatform | null {
  if (process.platform === 'win32' && process.arch === 'x64') return 'win32-x64'
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64'
  return null
}

function binName(base: 'ffmpeg' | 'ffprobe'): string {
  return process.platform === 'win32' ? `${base}.exe` : base
}

export function defaultBinDir(): string {
  return join(getRootDir(), 'bin')
}

export interface FfmpegStatus {
  ready: boolean
  ffmpeg?: string
  ffprobe?: string
  reason?: string
}

function probe(binPath: string): boolean {
  try {
    const r = spawnSync(binPath, ['-version'], { timeout: 6000, windowsHide: true })
    return r.status === 0
  } catch {
    return false
  }
}

/**
 * 检测 ffmpeg/ffprobe 是否就绪: 优先 binDir 绝对路径(并 -version 自检), 回退 PATH。
 * skipPathFallback=true 时不回退 PATH(部署方强制用托管二进制 / 测试用)。
 */
export function detect(
  binDir: string = defaultBinDir(),
  opts: { skipPathFallback?: boolean } = {}
): FfmpegStatus {
  const ff = join(binDir, binName('ffmpeg'))
  const fp = join(binDir, binName('ffprobe'))
  if (existsSync(ff) && existsSync(fp)) {
    if (probe(ff)) return { ready: true, ffmpeg: ff, ffprobe: fp }
    return { ready: false, reason: 'ffmpeg 已下载但无法执行(可能损坏或未签名), 需重新安装' }
  }
  if (!opts.skipPathFallback && probe('ffmpeg') && probe('ffprobe')) {
    return { ready: true, ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' }
  }
  return { ready: false, reason: 'ffmpeg/ffprobe 未安装' }
}

export interface FfmpegManifestEntry {
  platform: FfPlatform
  version: string
  ffmpegUrl: string
  ffmpegSha256: string
  ffprobeUrl: string
  ffprobeSha256: string
}
export interface FfmpegManifest {
  schema_version: number
  builds: FfmpegManifestEntry[]
}
export type FetchBytes = (url: string, signal?: AbortSignal) => Promise<Buffer>

const sha256 = (b: Buffer): string => createHash('sha256').update(b).digest('hex')

async function downloadVerifyPlace(
  url: string,
  expectSha: string,
  dest: string,
  fetchBytes: FetchBytes,
  signal?: AbortSignal
): Promise<void> {
  const buf = await fetchBytes(url, signal)
  const actual = sha256(buf)
  if (actual !== expectSha) {
    throw new Error(`ffmpeg 资源 SHA256 不符(期望 ${expectSha.slice(0, 12)}… 实得 ${actual.slice(0, 12)}…), 拒绝使用`)
  }
  mkdirSync(dirname(dest), { recursive: true })
  const tmp = `${dest}.dltmp`
  writeFileSync(tmp, buf)
  try {
    rmSync(dest, { force: true })
  } catch {
    /* ignore */
  }
  renameSync(tmp, dest)
  // mac/linux: 可执行位 + (mac)ad-hoc 签名 + 去隔离
  if (process.platform !== 'win32') {
    chmodSync(dest, 0o755)
    if (process.platform === 'darwin') {
      // arm64 未签名二进制会被内核拒绝执行; 已签名则跳过, 否则本地 ad-hoc 重签(/usr/bin/codesign 自带)
      const verify = spawnSync('codesign', ['--verify', dest], { windowsHide: true })
      if (verify.status !== 0) {
        spawnSync('codesign', ['--force', '--sign', '-', dest], { windowsHide: true })
      }
      spawnSync('xattr', ['-d', 'com.apple.quarantine', dest], { windowsHide: true }) // 失败忽略
    }
  }
}

/** 确保 ffmpeg 就绪: 已就绪直接返回; 否则按平台从 manifest 下载 ffmpeg+ffprobe(强校验+签名)后重测。 */
export async function ensureFfmpeg(
  manifest: FfmpegManifest,
  opts: {
    binDir?: string
    fetchBytes: FetchBytes
    signal?: AbortSignal
    onProgress?: (p: { stage: string }) => void
    skipPathFallback?: boolean
  }
): Promise<FfmpegStatus> {
  const binDir = opts.binDir ?? defaultBinDir()
  const cur = detect(binDir, { skipPathFallback: opts.skipPathFallback })
  if (cur.ready) return cur

  const key = platformKey()
  if (!key) throw new Error('当前平台不支持 ffmpeg 按需安装')
  const entry = manifest.builds.find((b) => b.platform === key)
  if (!entry) throw new Error(`manifest 缺少 ${key} 的 ffmpeg 构建`)

  opts.onProgress?.({ stage: '下载 ffmpeg' })
  await downloadVerifyPlace(entry.ffmpegUrl, entry.ffmpegSha256, join(binDir, binName('ffmpeg')), opts.fetchBytes, opts.signal)
  opts.onProgress?.({ stage: '下载 ffprobe' })
  await downloadVerifyPlace(entry.ffprobeUrl, entry.ffprobeSha256, join(binDir, binName('ffprobe')), opts.fetchBytes, opts.signal)
  return detect(binDir)
}

/** spawn ffmpeg(绝对路径, 不走 shell, 规避中文/空格路径与注入); signal 可中止。 */
export function spawnFfmpeg(
  ffmpegPath: string,
  args: string[],
  opts: { cwd?: string; signal?: AbortSignal } = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { cwd: opts.cwd, windowsHide: true })
    let stderr = ''
    child.stderr.on('data', (d) => {
      stderr += d.toString()
      if (stderr.length > 100000) stderr = stderr.slice(-50000)
    })
    opts.signal?.addEventListener('abort', () => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* ignore */
      }
    })
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg 退出码 ${code}: ${stderr.slice(-500)}`))
    )
  })
}
