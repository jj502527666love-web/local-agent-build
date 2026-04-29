import { BrowserWindow } from 'electron'
import { chunkFile } from './chunker'
import { embedBatch } from './embedding'
import { insertChunks, deleteChunksByKnowledgeBaseId, getChunkCountByKnowledgeBaseId, getVectorStats } from './vector-store'
import { getDatabase } from '../database'
import { getSetting } from './settings'

export interface VectorizeProgress {
  knowledgeBaseId: string
  status: 'chunking' | 'embedding' | 'done' | 'error'
  current: number
  total: number
  message: string
}

function sendProgress(win: BrowserWindow | null, progress: VectorizeProgress): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send('vectorize:progress', progress)
  }
}

export async function vectorizeDocument(
  knowledgeBaseId: string,
  win: BrowserWindow | null
): Promise<{ chunkCount: number; embeddedCount: number }> {
  const db = getDatabase()

  // Get the knowledge base record
  const kb = db.prepare('SELECT * FROM knowledge_bases WHERE id = ?').get(knowledgeBaseId) as any
  if (!kb) throw new Error('知识文档不存在')
  if (!kb.file_path) throw new Error('文档文件路径为空')

  // Check vector service config
  const apiBase = getSetting('vector_api_base')
  if (!apiBase) throw new Error('向量服务未配置：请在设置中配置向量服务')

  // Update status to processing
  db.prepare('UPDATE knowledge_bases SET status = ? WHERE id = ?').run('processing', knowledgeBaseId)

  try {
    // Step 1: Chunk the document
    sendProgress(win, {
      knowledgeBaseId,
      status: 'chunking',
      current: 0,
      total: 0,
      message: '正在分块文档...'
    })

    // Delete existing chunks for re-vectorization
    deleteChunksByKnowledgeBaseId(knowledgeBaseId)

    const chunks = chunkFile(kb.file_path, {
      chunkSize: 512,
      chunkOverlap: 100
    })

    if (chunks.length === 0) {
      db.prepare('UPDATE knowledge_bases SET status = ?, chunk_count = ? WHERE id = ?').run(
        'ready',
        0,
        knowledgeBaseId
      )
      return { chunkCount: 0, embeddedCount: 0 }
    }

    sendProgress(win, {
      knowledgeBaseId,
      status: 'embedding',
      current: 0,
      total: chunks.length,
      message: `正在向量化 0/${chunks.length} 个分块...`
    })

    // Step 2: Embed in batches
    const BATCH_SIZE = 20
    const allChunkData: Array<{
      content: string
      embedding: number[] | null
      tokenCount: number
      index: number
    }> = []

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE)
      const texts = batch.map((c) => c.content)

      try {
        const embeddings = await embedBatch(texts)
        for (let j = 0; j < batch.length; j++) {
          allChunkData.push({
            content: batch[j].content,
            embedding: embeddings[j].embedding,
            tokenCount: embeddings[j].tokenCount || batch[j].tokenCount,
            index: batch[j].index
          })
        }
      } catch (err: any) {
        // If embedding fails, store chunks without embeddings
        for (const chunk of batch) {
          allChunkData.push({
            content: chunk.content,
            embedding: null,
            tokenCount: chunk.tokenCount,
            index: chunk.index
          })
        }
        sendProgress(win, {
          knowledgeBaseId,
          status: 'embedding',
          current: Math.min(i + BATCH_SIZE, chunks.length),
          total: chunks.length,
          message: `向量化批次失败: ${err.message?.slice(0, 100)}`
        })
      }

      const done = Math.min(i + BATCH_SIZE, chunks.length)
      sendProgress(win, {
        knowledgeBaseId,
        status: 'embedding',
        current: done,
        total: chunks.length,
        message: `正在向量化 ${done}/${chunks.length} 个分块...`
      })
    }

    // Step 3: Insert into vector store
    insertChunks(knowledgeBaseId, allChunkData)

    const embeddedCount = allChunkData.filter((c) => c.embedding !== null).length

    // Update knowledge base status
    db.prepare('UPDATE knowledge_bases SET status = ?, chunk_count = ? WHERE id = ?').run(
      'ready',
      allChunkData.length,
      knowledgeBaseId
    )

    sendProgress(win, {
      knowledgeBaseId,
      status: 'done',
      current: chunks.length,
      total: chunks.length,
      message: `完成：${allChunkData.length} 个分块，${embeddedCount} 个已向量化`
    })

    return { chunkCount: allChunkData.length, embeddedCount }
  } catch (err: any) {
    db.prepare('UPDATE knowledge_bases SET status = ? WHERE id = ?').run('error', knowledgeBaseId)
    sendProgress(win, {
      knowledgeBaseId,
      status: 'error',
      current: 0,
      total: 0,
      message: `向量化失败: ${err.message}`
    })
    throw err
  }
}

export async function vectorizeCategory(
  categoryId: string,
  win: BrowserWindow | null
): Promise<{ processed: number; failed: number }> {
  const db = getDatabase()

  // Get all pending/error knowledge bases in the category
  const kbs = db
    .prepare(
      "SELECT * FROM knowledge_bases WHERE category_id = ? AND status IN ('pending', 'error')"
    )
    .all(categoryId) as any[]

  let processed = 0
  let failed = 0

  for (const kb of kbs) {
    try {
      await vectorizeDocument(kb.id, win)
      processed++
    } catch {
      failed++
    }
  }

  return { processed, failed }
}

export async function vectorizeAll(
  win: BrowserWindow | null
): Promise<{ processed: number; failed: number }> {
  const db = getDatabase()

  const kbs = db
    .prepare("SELECT * FROM knowledge_bases WHERE status IN ('pending', 'error')")
    .all() as any[]

  let processed = 0
  let failed = 0

  for (const kb of kbs) {
    try {
      await vectorizeDocument(kb.id, win)
      processed++
    } catch {
      failed++
    }
  }

  return { processed, failed }
}

export async function resetAndVectorizeCategory(
  categoryId: string,
  win: BrowserWindow | null
): Promise<{ processed: number; failed: number }> {
  const db = getDatabase()

  // Reset all docs in category to pending and delete their chunks
  const kbs = db
    .prepare('SELECT id FROM knowledge_bases WHERE category_id = ?')
    .all(categoryId) as any[]

  for (const kb of kbs) {
    deleteChunksByKnowledgeBaseId(kb.id)
    db.prepare('UPDATE knowledge_bases SET status = ?, chunk_count = 0 WHERE id = ?').run('pending', kb.id)
  }

  // Re-vectorize all
  let processed = 0
  let failed = 0
  for (const kb of kbs) {
    try {
      await vectorizeDocument(kb.id, win)
      processed++
    } catch {
      failed++
    }
  }

  return { processed, failed }
}

export function getVectorStatsForUI(): Array<{
  category_id: string
  category_name: string
  total_docs: number
  pending_docs: number
  ready_docs: number
  error_docs: number
  total_chunks: number
  embedded_chunks: number
  total_tokens: number
}> {
  const db = getDatabase()

  const stats = db
    .prepare(
      `SELECT 
        c.id as category_id,
        c.name as category_name,
        COUNT(kb.id) as total_docs,
        SUM(CASE WHEN kb.status = 'pending' THEN 1 ELSE 0 END) as pending_docs,
        SUM(CASE WHEN kb.status = 'ready' THEN 1 ELSE 0 END) as ready_docs,
        SUM(CASE WHEN kb.status = 'error' THEN 1 ELSE 0 END) as error_docs,
        COALESCE(SUM(kb.chunk_count), 0) as total_chunks
      FROM kb_categories c
      LEFT JOIN knowledge_bases kb ON kb.category_id = c.id
      GROUP BY c.id, c.name
      ORDER BY c.created_at DESC`
    )
    .all() as any[]

  // Get vector chunk stats per knowledge base
  const vectorStats = getVectorStats()
  const vectorMap = new Map<string, { embedded: number; tokens: number }>()
  for (const vs of vectorStats) {
    vectorMap.set(vs.knowledge_base_id, {
      embedded: vs.embedded_chunks,
      tokens: vs.total_tokens
    })
  }

  // Get knowledge bases grouped by category to aggregate vector stats
  const kbs = db.prepare('SELECT id, category_id FROM knowledge_bases').all() as any[]
  const catVectorStats = new Map<string, { embedded: number; tokens: number }>()
  for (const kb of kbs) {
    const vs = vectorMap.get(kb.id)
    if (vs) {
      const existing = catVectorStats.get(kb.category_id) || { embedded: 0, tokens: 0 }
      existing.embedded += vs.embedded
      existing.tokens += vs.tokens
      catVectorStats.set(kb.category_id, existing)
    }
  }

  return stats.map((s: any) => {
    const cvs = catVectorStats.get(s.category_id) || { embedded: 0, tokens: 0 }
    return {
      ...s,
      embedded_chunks: cvs.embedded,
      total_tokens: cvs.tokens
    }
  })
}
