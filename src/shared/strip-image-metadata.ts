/**
 * 剥离 JPEG/PNG 字节流中的元数据段，包括：
 *   - JPEG: APP0~APP15(EXIF/ICC/XMP/Photoshop/Adobe 等)、COM 注释
 *   - PNG:  iCCP/iTXt/tEXt/zTXt/eXIf
 *
 * 目的：阻断 Chromium Canvas 的 color management pipeline，
 * 避免微信/小红书等平台嵌入的非标 ICC v4 mini profile 触发解码异常，
 * 导致 canvas 重编码后像素被污染、上游 /images/edits 拒绝请求。
 *
 * 同时兼容 Node(主进程) 与 Renderer(浏览器)：
 *   - 内部不使用 Buffer，只用 Uint8Array + atob/btoa
 *   - Node 16+ 全局已提供 atob/btoa，Electron 31 用 Node 18+，安全
 */

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesToBase64(bytes: Uint8Array): string {
  // 分块以避免 String.fromCharCode 在大数组上爆栈
  const CHUNK = 0x8000
  let bin = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as any)
  }
  return btoa(bin)
}

/**
 * 扫描 JPEG marker，丢弃 APPn(0xE0~0xEF) 与 COM(0xFE) 段，保留其余结构。
 * 注意 SOS(0xDA) 之后是熵编码扫描数据，需按 FF 转义规则透传到 EOI(0xD9)。
 */
function stripJpeg(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes
  const out: number[] = [0xff, 0xd8]
  let i = 2
  while (i < bytes.length - 1) {
    if (bytes[i] !== 0xff) return bytes // 结构异常，保守原样返回
    while (i < bytes.length - 1 && bytes[i] === 0xff) i++
    const marker = bytes[i]
    i++
    // 单字节 marker：RST0~7、TEM；EOI 终止
    if (marker === 0xd9) {
      out.push(0xff, 0xd9)
      break
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(0xff, marker)
      continue
    }
    if (i + 1 >= bytes.length) return bytes
    const segLen = (bytes[i] << 8) | bytes[i + 1]
    if (segLen < 2 || i + segLen > bytes.length) return bytes
    const segEnd = i + segLen
    const isApp = marker >= 0xe0 && marker <= 0xef
    const isCom = marker === 0xfe
    if (isApp || isCom) {
      i = segEnd
      continue
    }
    // 保留段
    out.push(0xff, marker)
    for (let k = i; k < segEnd; k++) out.push(bytes[k])
    i = segEnd
    if (marker === 0xda) {
      // SOS：透传扫描数据直到 FFD9 (EOI)
      while (i < bytes.length) {
        const b = bytes[i]
        out.push(b)
        i++
        if (b === 0xff && i < bytes.length) {
          const nxt = bytes[i]
          out.push(nxt)
          i++
          if (nxt === 0xd9) return new Uint8Array(out) // EOI
          // FF00 是字节填充；FFD0~D7 是 RST；其余视作异常但仍透传
        }
      }
      break
    }
  }
  return new Uint8Array(out)
}

/**
 * 扫描 PNG chunks，丢弃元数据 chunk，保留 IHDR/PLTE/IDAT/IEND/tRNS/gAMA/cHRM 等渲染必需。
 * iCCP 是色彩 profile，必须丢弃；其它文本/EXIF chunk 一并清掉。
 */
function stripPng(bytes: Uint8Array): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 8) return bytes
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) return bytes
  const out: number[] = []
  for (let i = 0; i < 8; i++) out.push(sig[i])
  let i = 8
  const DROP = new Set(['iCCP', 'iTXt', 'tEXt', 'zTXt', 'eXIf'])
  while (i + 8 <= bytes.length) {
    const len = ((bytes[i] << 24) >>> 0) + (bytes[i + 1] << 16) + (bytes[i + 2] << 8) + bytes[i + 3]
    const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7])
    const chunkEnd = i + 8 + len + 4
    if (chunkEnd > bytes.length) return bytes // 结构异常
    if (!DROP.has(type)) {
      for (let k = i; k < chunkEnd; k++) out.push(bytes[k])
    }
    i = chunkEnd
    if (type === 'IEND') break
  }
  return new Uint8Array(out)
}

/**
 * 入参可以是 data URI 或纯 base64：
 *   - `data:image/jpeg;base64,xxxx`
 *   - `data:image/png;base64,xxxx`
 *   - 任何其它类型原样返回（webp/gif 等本身不会触发 ICC 问题）
 */
export function stripImageMetadata(input: string): string {
  const m = input.match(/^data:image\/(jpeg|jpg|png);base64,/i)
  if (!m) return input
  const format = m[1].toLowerCase() === 'png' ? 'png' : 'jpeg'
  const base64 = input.slice(m[0].length)
  let bytes: Uint8Array
  try {
    bytes = base64ToBytes(base64)
  } catch {
    return input
  }
  const stripped = format === 'png' ? stripPng(bytes) : stripJpeg(bytes)
  if (stripped === bytes) return input // 未变更
  const mime = format === 'png' ? 'image/png' : 'image/jpeg'
  return `data:${mime};base64,${bytesToBase64(stripped)}`
}

/**
 * 主进程便捷版：直接处理 Buffer/base64 字符串，返回相同形态。
 */
export function stripBase64(base64: string, format: 'jpeg' | 'png' = 'jpeg'): string {
  let bytes: Uint8Array
  try {
    bytes = base64ToBytes(base64)
  } catch {
    return base64
  }
  const stripped = format === 'png' ? stripPng(bytes) : stripJpeg(bytes)
  if (stripped === bytes) return base64
  return bytesToBase64(stripped)
}
