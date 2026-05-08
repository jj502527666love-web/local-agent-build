import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
import { nativeImage } from 'electron'
import { getDataDir } from './data-path'
import { getCloudApiBase, getCloudToken } from './cloud-token'

/**
 * 桌面端用户「上传创作到灵感广场」服务（主进程侧）。
 *
 * 渲染端通过 IPC 调用此函数，由主进程：
 *  1. 拼接 getDataDir() + result_path 读字节（兼容旧绝对路径）
 *  2. 用 Node 18+ 原生 FormData + Blob 组装 multipart 请求
 *  3. 带 Bearer token POST 到云控端 /client/inspirations
 *  4. 云控端 controller 内部走 StorageService::upload —— local 或 COS 自动适配
 *
 * 不依赖第三方 form-data 库，借助 Electron 主进程的 Node 18+ 全局 fetch / FormData / Blob。
 */

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp'])

export interface UploadInspirationParams {
  resultPath: string
  title: string
  categoryId: number
  promptLang: 'cn' | 'en'
  promptText: string
}

export interface UploadInspirationResult {
  ok: boolean
  error?: string
  data?: any
  /** 原图超过 MAX_BYTES 触发自动 JPEG 阶梯压缩后上传时为 true，前端可据此提示用户 */
  compressed?: boolean
}

/**
 * 当原图超过 MAX_BYTES 时，使用 Electron 内置 nativeImage 按 85 / 70 / 55 阶梯
 * 重编码为 JPEG，命中第一个 ≤ MAX_BYTES 的档位即返回。
 *
 * 返回 { error } 表示无法决码或所有档位都超限，调用方按对应文案提示。
 * 注意：toJPEG 会丢失 PNG / WEBP 的 alpha 通道，但 AI 创作图基本不透明，
 * 这是为了零依赖的合理折中（替代方案 sharp 会带来数十 MB binary 依赖）。
 */
function maybeCompress(buf: Buffer, ext: string): {
  buf: Buffer
  ext: string
  mime: string
  compressed: boolean
  error?: 'cannot_decode' | 'still_too_large'
} {
  if (buf.length <= MAX_BYTES) {
    return { buf, ext, mime: mimeOfExt(ext), compressed: false }
  }

  let img
  try {
    img = nativeImage.createFromBuffer(buf)
    if (!img || img.isEmpty()) {
      return { buf, ext, mime: mimeOfExt(ext), compressed: false, error: 'cannot_decode' }
    }
  } catch {
    return { buf, ext, mime: mimeOfExt(ext), compressed: false, error: 'cannot_decode' }
  }

  for (const quality of [85, 70, 55]) {
    let jpeg: Buffer
    try { jpeg = img.toJPEG(quality) } catch { continue }
    if (jpeg && jpeg.length > 0 && jpeg.length <= MAX_BYTES) {
      return { buf: jpeg, ext: 'jpg', mime: 'image/jpeg', compressed: true }
    }
  }

  return { buf, ext, mime: mimeOfExt(ext), compressed: false, error: 'still_too_large' }
}

function mimeOfExt(ext: string): string {
  switch (ext) {
    case 'png': return 'image/png'
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'webp': return 'image/webp'
    default: return 'application/octet-stream'
  }
}

function resolveAbsolutePath(p: string): string {
  // image_generations.result_path 历史上既可能是绝对路径（盘符 / Unix /），也可能是相对数据目录
  const isAbsolute = /^[A-Za-z]:|^\//.test(p)
  return isAbsolute ? p : join(getDataDir(), p)
}

export async function uploadInspiration(params: UploadInspirationParams): Promise<UploadInspirationResult> {
  const { resultPath, title, categoryId, promptLang, promptText } = params

  // ---- 入参基础校验（前端已校验过，这里兜底防御）----
  if (!resultPath) return { ok: false, error: '创作图片路径为空' }
  if (!title || !title.trim()) return { ok: false, error: '标题不能为空' }
  if (!categoryId) return { ok: false, error: '请选择分类' }
  if (promptLang !== 'cn' && promptLang !== 'en') return { ok: false, error: '提示词语言无效' }
  if (!promptText || !promptText.trim()) return { ok: false, error: '提示词内容为空' }

  const token = getCloudToken()
  if (!token) return { ok: false, error: '未登录云控账号，无法上传' }

  // ---- 读本地图片字节 ----
  const absPath = resolveAbsolutePath(resultPath)
  if (!existsSync(absPath)) return { ok: false, error: '本地图片文件不存在或已被删除' }

  let stat: ReturnType<typeof statSync>
  try { stat = statSync(absPath) } catch (e: any) { return { ok: false, error: '读取图片失败：' + (e?.message || e) } }
  if (!stat.isFile()) return { ok: false, error: '路径不是一个文件' }

  const ext = extname(absPath).slice(1).toLowerCase()
  if (!ALLOWED_EXTS.has(ext)) return { ok: false, error: '仅支持 PNG / JPEG / WEBP 格式' }

  let buf: Buffer
  try { buf = readFileSync(absPath) } catch (e: any) { return { ok: false, error: '读取图片失败：' + (e?.message || e) } }

  // ---- 过大自动 JPEG 阶梯压缩 ----
  const cmp = maybeCompress(buf, ext)
  if (cmp.error === 'cannot_decode') {
    return { ok: false, error: '图片格式无法解析，请检查文件是否损坏' }
  }
  if (cmp.error === 'still_too_large') {
    return { ok: false, error: `原图过大，自动压缩后仍超过 ${Math.floor(MAX_BYTES / 1024 / 1024)}MB，请手动调整尺寸后重试` }
  }
  const finalBuf = cmp.buf
  const finalExt = cmp.ext
  const finalMime = cmp.mime

  // ---- 构造 multipart/form-data ----
  const filename = 'creation.' + (finalExt === 'jpg' ? 'jpg' : finalExt)
  const blob = new Blob([new Uint8Array(finalBuf)], { type: finalMime })
  const fd = new FormData()
  fd.append('category_id', String(categoryId))
  fd.append('title', title.trim())
  fd.append('prompt_lang', promptLang)
  fd.append('prompt_text', promptText)
  fd.append('cover_image', blob, filename)

  // ---- POST 到云控端 ----
  const url = `${getCloudApiBase()}/client/inspirations`
  let resp: Response
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    })
  } catch (e: any) {
    return { ok: false, error: '网络请求失败：' + (e?.message || '未知错误') }
  }

  // ---- 解析响应 ----
  let json: any = null
  try { json = await resp.json() } catch { /* 非 JSON 响应 */ }

  if (resp.status === 401) {
    return { ok: false, error: '登录已过期，请重新登录' }
  }
  if (resp.status === 403) {
    return { ok: false, error: json?.message || '当前账号未开启灵感大王权限' }
  }
  if (resp.status === 422) {
    const details = json?.details
    if (details && typeof details === 'object') {
      const firstKey = Object.keys(details)[0]
      const firstMsg = Array.isArray(details[firstKey]) ? details[firstKey][0] : ''
      return { ok: false, error: firstMsg || '参数校验失败' }
    }
    return { ok: false, error: '参数校验失败' }
  }
  if (!resp.ok) {
    return { ok: false, error: json?.error || `HTTP ${resp.status}` }
  }

  return { ok: true, data: json, compressed: cmp.compressed }
}
