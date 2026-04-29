import { readFileSync } from 'fs'

export interface Chunk {
  index: number
  content: string
  tokenCount: number
}

export interface ChunkOptions {
  chunkSize?: number
  chunkOverlap?: number
  separators?: string[]
}

const DEFAULT_CHUNK_SIZE = 512
const DEFAULT_CHUNK_OVERLAP = 100
const DEFAULT_SEPARATORS = ['\n\n', '\n', '。', '？', '！', '.', '?', '!', ' ']

function estimateTokens(text: string): number {
  // Rough estimate: ~1.5 chars per token for mixed CJK/English
  return Math.ceil(text.length / 1.5)
}

function splitByRecursiveSeparators(
  text: string,
  separators: string[],
  maxLen: number
): string[] {
  if (text.length <= maxLen || separators.length === 0) {
    return [text]
  }

  const sep = separators[0]
  const remaining = separators.slice(1)
  const parts = text.split(sep)

  const result: string[] = []
  let current = ''

  for (const part of parts) {
    const candidate = current ? current + sep + part : part
    if (candidate.length > maxLen && current) {
      result.push(current)
      current = part
    } else {
      current = candidate
    }
  }
  if (current) result.push(current)

  // If any piece is still too long, recurse with next separator
  const final: string[] = []
  for (const piece of result) {
    if (piece.length > maxLen && remaining.length > 0) {
      final.push(...splitByRecursiveSeparators(piece, remaining, maxLen))
    } else {
      final.push(piece)
    }
  }
  return final
}

export function chunkText(text: string, options?: ChunkOptions): Chunk[] {
  const chunkSize = options?.chunkSize || DEFAULT_CHUNK_SIZE
  const chunkOverlap = options?.chunkOverlap || DEFAULT_CHUNK_OVERLAP
  const separators = options?.separators || DEFAULT_SEPARATORS

  // Approximate character limit from token-based chunkSize
  const charLimit = Math.floor(chunkSize * 1.5)

  const rawPieces = splitByRecursiveSeparators(text, separators, charLimit)

  // Merge small pieces and apply overlap
  const chunks: Chunk[] = []
  let buffer = ''
  let overlapBuffer = ''

  for (const piece of rawPieces) {
    const trimmed = piece.trim()
    if (!trimmed) continue

    if (!buffer) {
      buffer = overlapBuffer ? overlapBuffer + ' ' + trimmed : trimmed
    } else {
      const candidate = buffer + ' ' + trimmed
      if (candidate.length > charLimit) {
        // Flush current buffer as a chunk
        chunks.push({
          index: chunks.length,
          content: buffer.trim(),
          tokenCount: estimateTokens(buffer.trim())
        })
        // Keep overlap from end of current buffer
        const overlapChars = Math.floor(chunkOverlap * 1.5)
        overlapBuffer = buffer.slice(-overlapChars)
        buffer = overlapBuffer + ' ' + trimmed
      } else {
        buffer = candidate
      }
    }
  }

  // Flush remaining
  if (buffer.trim()) {
    chunks.push({
      index: chunks.length,
      content: buffer.trim(),
      tokenCount: estimateTokens(buffer.trim())
    })
  }

  return chunks
}

export function chunkFile(filePath: string, options?: ChunkOptions): Chunk[] {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''

  let text: string
  switch (ext) {
    case 'txt':
    case 'md':
    case 'csv':
    case 'json':
      text = readFileSync(filePath, 'utf-8')
      break
    default:
      // For unsupported formats, try reading as text
      try {
        text = readFileSync(filePath, 'utf-8')
      } catch {
        throw new Error(`Unsupported file format: ${ext}`)
      }
  }

  return chunkText(text, options)
}
