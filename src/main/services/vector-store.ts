import { getDatabase } from '../database'
import { v4 as uuid } from 'uuid'
import { cosineSimilarity } from './embedding'

export interface VectorChunk {
  id: string
  knowledge_base_id: string
  chunk_index: number
  content: string
  embedding: number[] | null
  token_count: number
  created_at: string
}

export interface SearchResult {
  chunk: VectorChunk
  score: number
}

function embeddingToBuffer(embedding: number[]): Buffer {
  const float32 = new Float32Array(embedding)
  return Buffer.from(float32.buffer)
}

function bufferToEmbedding(buf: Buffer): number[] {
  const float32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
  return Array.from(float32)
}

export function insertChunks(
  knowledgeBaseId: string,
  chunks: Array<{ content: string; embedding: number[] | null; tokenCount: number; index: number }>
): string[] {
  const db = getDatabase()
  const stmt = db.prepare(
    'INSERT INTO vector_chunks (id, knowledge_base_id, chunk_index, content, embedding, token_count) VALUES (?, ?, ?, ?, ?, ?)'
  )

  const ftsStmt = db.prepare(
    'INSERT INTO vector_chunks_fts (chunk_id, knowledge_base_id, content) VALUES (?, ?, ?)'
  )

  const ids: string[] = []
  const insertMany = db.transaction(() => {
    for (const chunk of chunks) {
      const id = uuid()
      const embBuf = chunk.embedding ? embeddingToBuffer(chunk.embedding) : null
      stmt.run(id, knowledgeBaseId, chunk.index, chunk.content, embBuf, chunk.tokenCount)
      ftsStmt.run(id, knowledgeBaseId, chunk.content)
      ids.push(id)
    }
  })
  insertMany()
  return ids
}

export function deleteChunksByKnowledgeBaseId(knowledgeBaseId: string): number {
  const db = getDatabase()
  db.prepare('DELETE FROM vector_chunks_fts WHERE knowledge_base_id = ?').run(knowledgeBaseId)
  const result = db
    .prepare('DELETE FROM vector_chunks WHERE knowledge_base_id = ?')
    .run(knowledgeBaseId)
  return result.changes
}

export function getChunksByKnowledgeBaseId(knowledgeBaseId: string): VectorChunk[] {
  const db = getDatabase()
  const rows = db
    .prepare('SELECT * FROM vector_chunks WHERE knowledge_base_id = ? ORDER BY chunk_index')
    .all(knowledgeBaseId) as any[]

  return rows.map((row) => ({
    ...row,
    embedding: row.embedding ? bufferToEmbedding(row.embedding) : null
  }))
}

export function getChunkCountByKnowledgeBaseId(knowledgeBaseId: string): {
  total: number
  embedded: number
} {
  const db = getDatabase()
  const total = (
    db
      .prepare('SELECT COUNT(*) as cnt FROM vector_chunks WHERE knowledge_base_id = ?')
      .get(knowledgeBaseId) as any
  ).cnt
  const embedded = (
    db
      .prepare(
        'SELECT COUNT(*) as cnt FROM vector_chunks WHERE knowledge_base_id = ? AND embedding IS NOT NULL'
      )
      .get(knowledgeBaseId) as any
  ).cnt
  return { total, embedded }
}

export function getVectorStats(): Array<{
  knowledge_base_id: string
  total_chunks: number
  embedded_chunks: number
  total_tokens: number
}> {
  const db = getDatabase()
  return db
    .prepare(
      `SELECT 
        knowledge_base_id,
        COUNT(*) as total_chunks,
        SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) as embedded_chunks,
        SUM(token_count) as total_tokens
      FROM vector_chunks
      GROUP BY knowledge_base_id`
    )
    .all() as any[]
}

export function searchKeyword(
  query: string,
  knowledgeBaseIds: string[],
  topK: number = 5
): SearchResult[] {
  const db = getDatabase()
  if (knowledgeBaseIds.length === 0 || !query.trim()) return []

  const placeholders = knowledgeBaseIds.map(() => '?').join(',')
  const ftsQuery = query.trim().split(/\s+/).map((w) => `"${w}"`).join(' OR ')

  try {
    const rows = db
      .prepare(
        `SELECT f.chunk_id, f.content, f.knowledge_base_id, rank
         FROM vector_chunks_fts f
         WHERE f.knowledge_base_id IN (${placeholders})
           AND vector_chunks_fts MATCH ?
         ORDER BY rank
         LIMIT ?`
      )
      .all(...knowledgeBaseIds, ftsQuery, topK) as any[]

    return rows.map((row) => ({
      chunk: {
        id: row.chunk_id,
        knowledge_base_id: row.knowledge_base_id,
        chunk_index: 0,
        content: row.content,
        embedding: null,
        token_count: 0,
        created_at: ''
      },
      score: -row.rank
    }))
  } catch {
    return []
  }
}

export function searchHybrid(
  queryEmbedding: number[],
  queryText: string,
  knowledgeBaseIds: string[],
  topK: number = 5,
  threshold: number = 0.3
): SearchResult[] {
  const vectorResults = searchSimilar(queryEmbedding, knowledgeBaseIds, topK, threshold)
  const keywordResults = searchKeyword(queryText, knowledgeBaseIds, topK)

  // Merge and deduplicate by chunk id
  const seen = new Map<string, SearchResult>()
  for (const r of vectorResults) {
    seen.set(r.chunk.id, r)
  }
  for (const r of keywordResults) {
    if (!seen.has(r.chunk.id)) {
      seen.set(r.chunk.id, r)
    }
  }

  // Sort by score descending, take topK
  const merged = Array.from(seen.values())
  merged.sort((a, b) => b.score - a.score)
  return merged.slice(0, topK)
}

export function searchSimilar(
  queryEmbedding: number[],
  knowledgeBaseIds: string[],
  topK: number = 5,
  threshold: number = 0.3
): SearchResult[] {
  const db = getDatabase()

  if (knowledgeBaseIds.length === 0) return []

  const placeholders = knowledgeBaseIds.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT * FROM vector_chunks WHERE knowledge_base_id IN (${placeholders}) AND embedding IS NOT NULL`
    )
    .all(...knowledgeBaseIds) as any[]

  const results: SearchResult[] = []
  for (const row of rows) {
    const embedding = bufferToEmbedding(row.embedding)
    const score = cosineSimilarity(queryEmbedding, embedding)
    if (score >= threshold) {
      results.push({
        chunk: {
          ...row,
          embedding
        },
        score
      })
    }
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, topK)
}
