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

import { readFileSync, statSync } from 'fs'
import { extname } from 'path'

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

async function parsePdf(filePath: string): Promise<{ text: string }> {
  // pdf-parse 默认入口在加载时会跑一段示例代码，直接 require 子模块绕过
  const pdfParse = require('pdf-parse/lib/pdf-parse.js')
  const buffer = readFileSync(filePath)
  const result = await pdfParse(buffer)
  return { text: String(result?.text || '') }
}

async function parseDocx(filePath: string): Promise<{ text: string }> {
  const mammoth = require('mammoth')
  const buffer = readFileSync(filePath)
  const result = await mammoth.extractRawText({ buffer })
  return { text: String(result?.value || '') }
}

async function parseDoc(filePath: string): Promise<{ text: string }> {
  const WordExtractor = require('word-extractor')
  const extractor = new WordExtractor()
  const doc = await extractor.extract(filePath)
  // word-extractor 提供 getBody / getEndnotes 等；正文优先
  return { text: String(doc?.getBody?.() || '') }
}

function parseXlsx(filePath: string): { text: string } {
  const XLSX = require('xlsx')
  const wb = XLSX.readFile(filePath, { type: 'file' })
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
 * 主入口：根据扩展名分发到对应解析器，统一返回 ParsedDocument。
 * 本函数永不抛错（除非文件根本读不到 stat），错误以 ok=false 返回。
 */
export async function parseDocument(filePath: string): Promise<ParsedDocument> {
  const ext = extname(filePath).slice(1).toLowerCase()
  let size = 0
  try {
    size = statSync(filePath).size
  } catch (e: any) {
    return { ok: false, text: '', ext, size: 0, parser: 'error', error: `读取文件失败：${e?.message || e}` }
  }

  if (size > MAX_DOC_SIZE_BYTES) {
    return {
      ok: false, text: '', ext, size, parser: 'error',
      error: `文件过大（${(size / 1024 / 1024).toFixed(1)}MB），超过 50MB 限制`
    }
  }

  try {
    if (ext === 'pdf') {
      const { text } = await parsePdf(filePath)
      const c = clamp(text)
      return { ok: true, text: c.text, ext, size, parser: 'pdf', truncated: c.truncated }
    }
    if (ext === 'docx') {
      const { text } = await parseDocx(filePath)
      const c = clamp(text)
      return { ok: true, text: c.text, ext, size, parser: 'docx', truncated: c.truncated }
    }
    if (ext === 'doc') {
      const { text } = await parseDoc(filePath)
      const c = clamp(text)
      return { ok: true, text: c.text, ext, size, parser: 'doc', truncated: c.truncated }
    }
    if (ext === 'xlsx' || ext === 'xls') {
      const { text } = parseXlsx(filePath)
      const c = clamp(text)
      return { ok: true, text: c.text, ext, size, parser: 'xlsx', truncated: c.truncated }
    }
    return { ok: false, text: '', ext, size, parser: 'unsupported', error: `不支持的二进制文档扩展名：${ext}` }
  } catch (e: any) {
    return {
      ok: false, text: '', ext, size, parser: 'error',
      error: `解析失败：${e?.message || String(e)}`
    }
  }
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
    return { ok: false, text: '', ext, size: 0, parser: 'error', error: `读取文件失败：${e?.message || e}` }
  }
  if (size > MAX_DOC_SIZE_BYTES) {
    return {
      ok: false, text: '', ext, size, parser: 'error',
      error: `文件过大（${(size / 1024 / 1024).toFixed(1)}MB），超过 50MB 限制`
    }
  }
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const c = clamp(raw)
    return { ok: true, text: c.text, ext, size, parser: 'utf8', truncated: c.truncated }
  } catch (e: any) {
    return { ok: false, text: '', ext, size, parser: 'error', error: `读取失败：${e?.message || e}` }
  }
}
