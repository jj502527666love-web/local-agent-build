// 出站回复：markdown 降级清洗 + 长文分段 + 图片抽取（local-file/http）→ 微信 CDN 上传发图。
// 微信侧规则（官方 markdown-filter / send.ts）：
//   - 协议只有 TEXT item，没有 markdown；图片语法整体删除，图片单独走 CDN 上传后发 IMAGE item。
//   - 链接不可点击 → [text](url) 转成 `text: url` 纯文本可读形式。
//   - sendmessage 缺任一必填字段会 HTTP 200 但静默丢失 → 由 ilink-api.buildOutboundMessage 断言。
//   - 每条媒体 item 单独一个 sendmessage 请求（独立 client_id）。

import { readFile } from 'fs/promises'
import { isAbsolute, relative, resolve } from 'path'
import { buildOutboundMessage, getUploadUrl, sendMessage } from './ilink-api'
import { prepareUpload, uploadEncryptedMedia } from './ilink-cdn'
import { MESSAGE_ITEM_TYPE, UPLOAD_MEDIA_TYPE } from './ilink-types'
import type { ClawbotConnection } from './clawbot-store'
import { getDataDir } from '../data-path'

/** 发送间隔（社区经验值：>1s，防风控） */
const SEND_INTERVAL_MS = 1000
/** 长文分段阈值（协议无官方上限，防御性分段） */
const TEXT_SEGMENT_MAX = 1800
/** 单条回复最多回传的图片数 */
const MAX_OUTBOUND_IMAGES = 4
/** http 图片下载超时 */
const IMAGE_DOWNLOAD_TIMEOUT_MS = 8000

let lastSendAt = 0
let sendChain: Promise<void> = Promise.resolve()

/** 全局限速门：串行化 + 任意两条 sendmessage 之间至少间隔 1s（多 peer 并发下也不会挤在一起） */
function sendGate(): Promise<void> {
  const run = sendChain.then(async () => {
    const wait = SEND_INTERVAL_MS - (Date.now() - lastSendAt)
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    lastSendAt = Date.now()
  })
  sendChain = run.catch(() => {})
  return run
}

// ===== markdown 降级 =====

export interface OutboundImage {
  alt: string
  url: string
}

/** 抽出 markdown 图片引用（![alt](url)），在清洗前调用 */
export function extractMarkdownImages(text: string): OutboundImage[] {
  const out: OutboundImage[] = []
  const re = /!\[([^\]]*)\]\(([^)\s]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) out.push({ alt: m[1] || '', url: m[2] })
  return out
}

/**
 * markdown → 微信纯文本（照官方降级规则）：
 * 保留代码块/行内代码/表格/粗体/水平线；剥标题标记与 CJK 斜体标记；
 * 图片语法整体删除（单独发图）；链接转 `text: url`。
 */
export function stripMarkdownForWechat(text: string): string {
  let s = text
  // 图片语法整体删除
  s = s.replace(/!\[[^\]]*\]\([^)]+\)/g, '')
  // H1-H6 标题标记剥除（保留标题文字）
  s = s.replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
  // CJK 斜体标记剥除：*含中日韩的文字* → 文字（粗体 ** 保留，与官方一致）
  s = s.replace(/(?<![*\w])\*([^*\n]*[一-鿿][^*\n]*)\*(?!\*)/g, '$1')
  // 链接转纯文本（微信侧不可点击，转成可读形式）
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1: $2')
  // 连续空行收敛
  s = s.replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

/** 按段落分段，单段 ≤1800 字；超长段落先按行切再硬切 */
export function segmentText(text: string, maxLen = TEXT_SEGMENT_MAX): string[] {
  const segments: string[] = []
  let cur = ''
  const pushCur = (): void => {
    const t = cur.trim()
    if (t) segments.push(t)
    cur = ''
  }
  for (const para of text.split(/\n{2,}/)) {
    if (para.length > maxLen) {
      pushCur()
      let rest = para
      while (rest.length > maxLen) {
        let cut = rest.lastIndexOf('\n', maxLen)
        if (cut < maxLen * 0.5) cut = maxLen
        const piece = rest.slice(0, cut).trim()
        if (piece) segments.push(piece)
        rest = rest.slice(cut)
      }
      cur = rest
      continue
    }
    if ((cur + '\n\n' + para).trim().length > maxLen) pushCur()
    cur = cur ? `${cur}\n\n${para}` : para
  }
  pushCur()
  return segments
}

// ===== 图片回传 =====

/** local-file://img?p=<encodeURIComponent(正斜杠绝对路径)> → 磁盘路径（image_gen 回显格式，core-tools.ts:962-968） */
export function resolveLocalFileUrl(url: string): string | null {
  if (!url.startsWith('local-file://')) return null
  try {
    const u = new URL(url)
    const p = u.searchParams.get('p')
    return p || null
  } catch {
    return null
  }
}

/**
 * 防外泄：local-file 只允许发送应用数据目录（getDataDir）内的文件。
 * 回复文本来自模型输出，可能被微信用户 prompt-injection 诱导引用任意磁盘文件
 * （如 ![x](local-file://img?p=C:/Windows/...)），不限制就是把读盘能力暴露给微信对端。
 */
function isLocalPathAllowedForSend(absPath: string): boolean {
  try {
    const root = resolve(getDataDir())
    const p = resolve(absPath)
    const c = process.platform === 'win32' ? p.toLowerCase() : p
    const r = process.platform === 'win32' ? root.toLowerCase() : root
    const rel = relative(r, c)
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
  } catch {
    return false
  }
}

/** 防 SSRF：http 图片下载拦截明显的内网/环回主机字面量（DNS  rebinding 不在此防御层级，注释说明） */
const PRIVATE_HOST_RE = /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?)/i

function isPrivateHost(url: string): boolean {
  try {
    return PRIVATE_HOST_RE.test(new URL(url).hostname)
  } catch {
    return true
  }
}

async function downloadHttpImage(url: string): Promise<Buffer | null> {
  if (isPrivateHost(url)) return null
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), IMAGE_DOWNLOAD_TIMEOUT_MS)
    try {
      const resp = await fetch(url, { signal: ctrl.signal })
      if (!resp.ok) return null
      const ab = await resp.arrayBuffer()
      const buf = Buffer.from(ab)
      // 防御：超大图不回传
      if (buf.length > 20 * 1024 * 1024) return null
      return buf
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return null
  }
}

/** 图片 URL → Buffer：支持 local-file://（读盘，限数据目录内）与 http(s)（下载，拦内网主机），其余不支持 */
export async function loadImageBuffer(url: string): Promise<Buffer | null> {
  const localPath = resolveLocalFileUrl(url)
  if (localPath) {
    if (!isLocalPathAllowedForSend(localPath)) {
      console.warn('[clawbot] blocked local-file outside data dir:', localPath)
      return null
    }
    try {
      return await readFile(localPath)
    } catch {
      return null
    }
  }
  if (/^https?:\/\//i.test(url)) return downloadHttpImage(url)
  return null
}

export interface SendContext {
  conn: ClawbotConnection
  token: string
  peerId: string
  /** 该 peer 最新入站消息的 context_token（不可复用旧的） */
  contextToken: string
  signal?: AbortSignal
  /** 每成功发出一条（text/image）回调，用于写日志/计数 */
  onSent?: (kind: 'text' | 'image', summary: string) => void
}

async function sendTextSegment(ctx: SendContext, text: string): Promise<void> {
  const msg = buildOutboundMessage({
    toUserId: ctx.peerId,
    contextToken: ctx.contextToken,
    itemList: [{ type: MESSAGE_ITEM_TYPE.TEXT, text_item: { text } }]
  })
  await sendGate()
  const resp = await sendMessage(ctx.conn.baseurl, ctx.token, msg, ctx.signal)
  if (resp.ret !== undefined && resp.ret !== 0) {
    throw new Error(`sendmessage ret=${resp.ret} ${resp.errmsg || ''}`.trim())
  }
  ctx.onSent?.('text', text.slice(0, 200))
}

async function sendImage(ctx: SendContext, buf: Buffer): Promise<void> {
  const prepared = prepareUpload(buf)
  const up = await getUploadUrl(ctx.conn.baseurl, ctx.token, {
    filekey: prepared.filekey,
    media_type: UPLOAD_MEDIA_TYPE.IMAGE,
    to_user_id: ctx.peerId,
    rawsize: prepared.rawsize,
    rawfilemd5: prepared.rawfilemd5,
    filesize: prepared.filesize,
    no_need_thumb: true,
    aeskey: prepared.aeskeyHex
  }, ctx.signal)
  const encryptQueryParam = await uploadEncryptedMedia({
    uploadFullUrl: up.upload_full_url,
    uploadParam: up.upload_param,
    filekey: prepared.filekey,
    cipher: prepared.cipher
  })
  const msg = buildOutboundMessage({
    toUserId: ctx.peerId,
    contextToken: ctx.contextToken,
    itemList: [{
      type: MESSAGE_ITEM_TYPE.IMAGE,
      image_item: {
        media: {
          encrypt_query_param: encryptQueryParam,
          // 出站 aes_key 为 16 字节原始 key 的 base64
          aes_key: Buffer.from(prepared.aeskeyHex, 'hex').toString('base64'),
          encrypt_type: 1
        },
        mid_size: prepared.filesize
      }
    }]
  })
  await sendGate()
  const resp = await sendMessage(ctx.conn.baseurl, ctx.token, msg, ctx.signal)
  if (resp.ret !== undefined && resp.ret !== 0) {
    throw new Error(`sendmessage(image) ret=${resp.ret} ${resp.errmsg || ''}`.trim())
  }
  ctx.onSent?.('image', '[图片]')
}

/**
 * 回复回发主入口：清洗 markdown → 分段发文字 → 抽取图片逐张上传发图。
 * 图片加载失败静默跳过（文字已先行送达）；发送失败向上抛（桥接层记日志并兜底）。
 */
export async function sendOutboundReply(ctx: SendContext, rawText: string): Promise<void> {
  const images = extractMarkdownImages(rawText)
  const cleaned = stripMarkdownForWechat(rawText)
  const segments = segmentText(cleaned)
  for (const seg of segments) {
    await sendTextSegment(ctx, seg)
  }
  for (const img of images.slice(0, MAX_OUTBOUND_IMAGES)) {
    const buf = await loadImageBuffer(img.url)
    if (!buf) continue
    await sendImage(ctx, buf)
  }
}

/** 简易纯文本发送（系统提示/错误兜底用） */
export async function sendPlainText(ctx: SendContext, text: string): Promise<void> {
  for (const seg of segmentText(text)) {
    await sendTextSegment(ctx, seg)
  }
}
