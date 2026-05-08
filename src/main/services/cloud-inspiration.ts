import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
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
  if (stat.size > MAX_BYTES) return { ok: false, error: `图片超过 ${Math.floor(MAX_BYTES / 1024 / 1024)}MB 限制` }

  const ext = extname(absPath).slice(1).toLowerCase()
  if (!ALLOWED_EXTS.has(ext)) return { ok: false, error: '仅支持 PNG / JPEG / WEBP 格式' }

  let buf: Buffer
  try { buf = readFileSync(absPath) } catch (e: any) { return { ok: false, error: '读取图片失败：' + (e?.message || e) } }

  // ---- 构造 multipart/form-data ----
  const filename = 'creation.' + (ext === 'jpg' ? 'jpg' : ext)
  const blob = new Blob([new Uint8Array(buf)], { type: mimeOfExt(ext) })
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

  return { ok: true, data: json }
}
