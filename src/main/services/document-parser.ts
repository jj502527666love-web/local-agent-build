/**
 * 文档解析统一入口：把 PDF / DOC / DOCX / XLS / XLSX 等二进制办公文档
 * 提取为纯文本，让 LLM 上下文 / file_ops / 知识库 / 附件能正确"看到"内容。
 *
 * 设计要点：
 *  - 仅在主进程使用：依赖 fs + 三方 native-ish 库，不能在渲染端运行
 *  - 失败兜底：解析失败时返回 { ok: false, error: '...' }，调用方决定 fallback
 *  - 大小限制：避免几百 MB 的 PDF 把主进程内存打爆
 *  - 编码：返回的 text 是已 utf-8 化的纯字符串，可直接送给 LLM
 *
 * 各扩展支持矩阵：
 *  - .txt / .md / .json / .csv  → utf-8 直读（不调本模块）
 *  - .pdf                       → pdf-parse（限：扫描型 PDF 无文本层会返回空）
 *  - .docx                      → mammoth（仅文本，丢失图片/复杂样式）
 *  - .doc                       → word-extractor（pure JS 兜底，复杂格式效果有限）
 *  - .xls / .xlsx               → xlsx (SheetJS) → 每 sheet 拼成 TSV 文本
 */

import { readFileSync, statSync, writeFileSync, unlinkSync } from 'fs'
import { dirname, extname, join } from 'path'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'
import { pathToFileURL } from 'url'

/** 单个文档的最大允许大小（解析前检查 stat），避免 OOM */
const MAX_DOC_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB

/** 解析后返回结果。text 永远是 utf-8 字符串；失败时 ok=false */
export interface ParsedDocument {
  ok: boolean
  text: string
  /** 原始扩展名（小写、不含点） */
  ext: string
  /** 文件大小（字节） */
  size: number
  /** 解析器名称，便于排查 */
  parser: 'utf8' | 'pdf' | 'docx' | 'doc' | 'xlsx' | 'unsupported' | 'error'
  /** 失败时的错误说明 */
  error?: string
  errorCode?: 'NO_EXTRACTABLE_TEXT' | 'TOO_LARGE' | 'READ_ERROR' | 'UNSUPPORTED_FORMAT' | 'PARSE_ERROR'
  warnings?: string[]
  features?: {
    hasImages?: boolean
    imageCount?: number
    pageCount?: number
    textLength?: number
  }
  /** 截断标记：text 是否因过长被截断；调用方可决定要不要走 RAG */
  truncated?: boolean
}

/** 这些扩展名走二进制文档解析器；其他扩展名调用方应自行 utf-8 直读 */
export const BINARY_DOCUMENT_EXTENSIONS = new Set(['pdf', 'docx', 'doc', 'xlsx', 'xls'])

/** 判断扩展名是否走本模块解析；调用方按此分流 */
export function isBinaryDocument(filePath: string): boolean {
  const ext = extname(filePath).slice(1).toLowerCase()
  return BINARY_DOCUMENT_EXTENSIONS.has(ext)
}

/** 单 sheet/单文档最多保留的字符数（防御性，超出可由调用方走 RAG） */
const MAX_TEXT_CHARS = 200_000

function clamp(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_TEXT_CHARS) return { text, truncated: false }
  return {
    text: text.slice(0, MAX_TEXT_CHARS) + `\n...(truncated, total ${text.length} chars)`,
    truncated: true
  }
}

function emptyTextError(ext: string): string {
  if (ext === 'pdf') {
    return '未从 PDF 中提取到可读文字。该文件可能是扫描件、图片型 PDF、转曲文字或缺少可还原文字映射，当前版本不会 OCR 识别图片文字，请上传文字层 PDF 或文本版文档。'
  }
  return '未从文档中提取到可读文字，文件可能为空、加密或内容为图片。'
}

function imageWarning(ext: string): string {
  if (ext === 'pdf') return '该 PDF 可能包含图片、扫描页、截图、盖章或照片；当前仅提取可读文字，图片内容不会进入会话上下文，也不会被向量化。'
  if (ext === 'docx' || ext === 'doc') return '该文档可能包含图片、截图或照片；当前仅提取文字内容，图片内容不会进入会话上下文，也不会被向量化。'
  if (ext === 'xlsx' || ext === 'xls') return '该表格可能包含图片；当前仅提取单元格文字，图片内容不会进入会话上下文，也不会被向量化。'
  return '当前仅提取文字内容，图片内容不会进入会话上下文，也不会被向量化。'
}

function detectEmbeddedImages(buffer: Buffer, ext: string): { hasImages: boolean; imageCount?: number } {
  if (ext === 'pdf') {
    const sample = buffer.toString('latin1')
    const matches = sample.match(/\/Subtype\s*\/Image\b|\/Image\b/g)
    return { hasImages: !!matches?.length, imageCount: matches?.length || 0 }
  }
  if (ext === 'docx') {
    const sample = buffer.toString('latin1')
    const matches = sample.match(/word\/media\//g)
    return { hasImages: !!matches?.length, imageCount: matches?.length || 0 }
  }
  if (ext === 'xlsx' || ext === 'xls') {
    const sample = buffer.toString('latin1')
    const matches = sample.match(/xl\/media\//g)
    return { hasImages: !!matches?.length, imageCount: matches?.length || 0 }
  }
  return { hasImages: ext === 'doc' }
}

function buildWarnings(ext: string, features: ParsedDocument['features']): string[] {
  return features?.hasImages ? [imageWarning(ext)] : []
}

function hasUsefulExtractedText(text: string, ext: string): boolean {
  const normalized = text.trim()
  if (!normalized) return false
  if (ext !== 'pdf') return true
  const withoutPageMarkers = normalized
    .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, '')
    .replace(/\s+/g, '')
  return withoutPageMarkers.length > 0
}

function getPdfParseOptions(): Record<string, any> {
  try {
    const pdfjsRoot = dirname(require.resolve('pdfjs-dist/package.json'))
    return {
      cMapUrl: pathToFileURL(`${join(pdfjsRoot, 'cmaps')}/`).href,
      cMapPacked: true,
      standardFontDataUrl: pathToFileURL(`${join(pdfjsRoot, 'standard_fonts')}/`).href,
      useSystemFonts: true,
      disableFontFace: false
    }
  } catch {
    return {}
  }
}

/**
 * 以下 4 个 Buffer 版本全部不依赖磁盘路径，供拖拽 / IPC 上传 / 安全沙箱场景使用。
 * - PDF / DOCX / XLSX 本身接受 Buffer
 * - DOC (word-extractor) 只接受路径，写临时文件兼容
 */
async function parsePdfBuffer(buffer: Buffer): Promise<{ text: string }> {
  // pdf-parse 默认入口在加载时会跑一段示例代码，直接 require 子模块绕过
  const options = getPdfParseOptions()
  try {
    const pdfParse = require('pdf-parse/lib/pdf-parse.js')
    const result = await pdfParse(buffer, options)
    return { text: String(result?.text || '') }
  } catch (legacyError) {
    const pdfParseModule = require('pdf-parse')

    const directParser = typeof pdfParseModule === 'function'
      ? pdfParseModule
      : typeof pdfParseModule.default === 'function'
        ? pdfParseModule.default
        : null
    if (directParser) {
      const result = await directParser(buffer, options)
      return { text: String(result?.text || '') }
    }
    if (typeof pdfParseModule.PDFParse === 'function') {
      const parser = new pdfParseModule.PDFParse({ data: buffer, ...options })

      try {
        const result = await parser.getText()
        return { text: String(result?.text || '') }
      } finally {
        await parser.destroy?.()
      }
    }
    throw legacyError
  }
}

async function parseDocxBuffer(buffer: Buffer): Promise<{ text: string }> {
  const mammoth = require('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return { text: String(result?.value || '') }
}

async function parseDocBuffer(buffer: Buffer): Promise<{ text: string }> {
  // word-extractor 只能从路径读，写个临时文件兼容。
  // 路径用 randomBytes 加拼避免同名冲突；finally 中能刪就刪。
  const tmpPath = join(tmpdir(), `local-agent-doc-${randomBytes(8).toString('hex')}.doc`)
  try {
    writeFileSync(tmpPath, buffer)
    const WordExtractor = require('word-extractor')
    const extractor = new WordExtractor()
    const doc = await extractor.extract(tmpPath)
    return { text: String(doc?.getBody?.() || '') }
  } finally {
    try { unlinkSync(tmpPath) } catch { /* ignore */ }
  }
}

function parseXlsxBuffer(buffer: Buffer): { text: string } {
  const XLSX = require('xlsx')
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const parts: string[] = []
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    if (!sheet) continue
    // CSV 化（保留单元格内容、丢弃格式），多 sheet 之间空行分隔
    const csv: string = XLSX.utils.sheet_to_csv(sheet)
    parts.push(`# ${sheetName}\n${csv}`)
  }
  return { text: parts.join('\n\n') }
}

/**
 * 内部分发：按扩展名选对应解析器，都走 Buffer 路径。
 * 调用方（parseDocument / parseDocumentFromBuffer）负责 size / clamp / 错误包装。
 */
async function dispatchBuffer(
  buffer: Buffer,
  ext: string
): Promise<{ ok: boolean; text: string; parser: ParsedDocument['parser']; error?: string; errorCode?: ParsedDocument['errorCode']; features?: ParsedDocument['features']; warnings?: string[] }> {
  const imageInfo = detectEmbeddedImages(buffer, ext)
  const features: ParsedDocument['features'] = {
    hasImages: imageInfo.hasImages,
    imageCount: imageInfo.imageCount
  }
  try {
    if (ext === 'pdf') {
      const { text } = await parsePdfBuffer(buffer)
      features.textLength = text.length
      return { ok: true, text, parser: 'pdf', features, warnings: buildWarnings(ext, features) }
    }
    if (ext === 'docx') {
      const { text } = await parseDocxBuffer(buffer)
      features.textLength = text.length
      return { ok: true, text, parser: 'docx', features, warnings: buildWarnings(ext, features) }
    }
    if (ext === 'doc') {
      const { text } = await parseDocBuffer(buffer)
      features.textLength = text.length
      return { ok: true, text, parser: 'doc', features, warnings: buildWarnings(ext, features) }
    }
    if (ext === 'xlsx' || ext === 'xls') {
      const { text } = parseXlsxBuffer(buffer)
      features.textLength = text.length
      return { ok: true, text, parser: 'xlsx', features, warnings: buildWarnings(ext, features) }
    }
    return { ok: false, text: '', parser: 'unsupported', error: `不支持的二进制文档扩展名：${ext}`, errorCode: 'UNSUPPORTED_FORMAT', features }
  } catch (e: any) {
    return { ok: false, text: '', parser: 'error', error: `解析失败：${e?.message || String(e)}`, errorCode: 'PARSE_ERROR', features }
  }
}

/**
 * 主入口：根据扩展名分发到对应解析器，统一返回 ParsedDocument。
 * 本函数永不抛错（除非文件根本读不到 stat），错误以 ok=false 返回。
 */
export async function parseDocument(filePath: string): Promise<ParsedDocument> {
  const ext = extname(filePath).slice(1).toLowerCase()
  let size = 0
  try {
    size = statSync(filePath).size
  } catch (e: any) {
    return { ok: false, text: '', ext, size: 0, parser: 'error', error: `读取文件失败：${e?.message || e}`, errorCode: 'READ_ERROR' }
  }

  if (size > MAX_DOC_SIZE_BYTES) {
    return {
      ok: false, text: '', ext, size, parser: 'error',
      error: `文件过大（${(size / 1024 / 1024).toFixed(1)}MB），超过 50MB 限制`,
      errorCode: 'TOO_LARGE'
    }
  }

  let buffer: Buffer
  try {
    buffer = readFileSync(filePath)
  } catch (e: any) {
    return { ok: false, text: '', ext, size, parser: 'error', error: `读取文件失败：${e?.message || e}`, errorCode: 'READ_ERROR' }
  }
  const r = await dispatchBuffer(buffer, ext)
  if (!r.ok) {
    return { ok: false, text: '', ext, size, parser: r.parser, error: r.error, errorCode: r.errorCode, warnings: r.warnings, features: r.features }
  }
  if (!hasUsefulExtractedText(r.text, ext)) {
    const warnings = r.features?.hasImages ? buildWarnings(ext, r.features) : r.warnings
    return { ok: false, text: '', ext, size, parser: r.parser, error: emptyTextError(ext), errorCode: 'NO_EXTRACTABLE_TEXT', warnings, features: r.features }
  }
  const c = clamp(r.text)
  return { ok: true, text: c.text, ext, size, parser: r.parser, truncated: c.truncated, warnings: r.warnings, features: r.features }
}

/**
 * Buffer 版本：不走磁盘路径，供拖拽 / IPC 远程上传场景使用。
 * - 与 parseDocument 等价的返回结构，调用方可复用上层拼 prompt 逻辑
 * - size 取 buffer.length
 * - ext 由调用方从文件名提取（已 lower-case，不带点）
 */
export async function parseDocumentFromBuffer(buffer: Buffer, ext: string): Promise<ParsedDocument> {
  const size = buffer.length
  if (size > MAX_DOC_SIZE_BYTES) {
    return {
      ok: false, text: '', ext, size, parser: 'error',
      error: `文件过大（${(size / 1024 / 1024).toFixed(1)}MB），超过 50MB 限制`,
      errorCode: 'TOO_LARGE'
    }
  }
  const r = await dispatchBuffer(buffer, ext)
  if (!r.ok) {
    return { ok: false, text: '', ext, size, parser: r.parser, error: r.error, errorCode: r.errorCode, warnings: r.warnings, features: r.features }
  }
  if (!hasUsefulExtractedText(r.text, ext)) {
    const warnings = r.features?.hasImages ? buildWarnings(ext, r.features) : r.warnings
    return { ok: false, text: '', ext, size, parser: r.parser, error: emptyTextError(ext), errorCode: 'NO_EXTRACTABLE_TEXT', warnings, features: r.features }
  }
  const c = clamp(r.text)
  return { ok: true, text: c.text, ext, size, parser: r.parser, truncated: c.truncated, warnings: r.warnings, features: r.features }
}

/**
 * 统一文件读取：对二进制办公文档走 parseDocument；其他扩展名 utf-8 直读。
 * 用于替换原来无差别 readFileSync(p, 'utf-8') 的位置。
 */
export async function readFileSmart(filePath: string): Promise<ParsedDocument> {
  const ext = extname(filePath).slice(1).toLowerCase()
  if (BINARY_DOCUMENT_EXTENSIONS.has(ext)) {
    return parseDocument(filePath)
  }
  // 非二进制文档：utf-8 直读，统一返回 ParsedDocument 形态便于上层一致处理
  let size = 0
  try {
    size = statSync(filePath).size
  } catch (e: any) {
    return { ok: false, text: '', ext, size: 0, parser: 'error', error: `读取文件失败：${e?.message || e}`, errorCode: 'READ_ERROR' }
  }
  if (size > MAX_DOC_SIZE_BYTES) {
    return {
      ok: false, text: '', ext, size, parser: 'error',
      error: `文件过大（${(size / 1024 / 1024).toFixed(1)}MB），超过 50MB 限制`,
      errorCode: 'TOO_LARGE'
    }
  }
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const c = clamp(raw)
    return { ok: true, text: c.text, ext, size, parser: 'utf8', truncated: c.truncated }
  } catch (e: any) {
    return { ok: false, text: '', ext, size, parser: 'error', error: `读取失败：${e?.message || e}`, errorCode: 'READ_ERROR' }
  }
}
