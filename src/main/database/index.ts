import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { getDataDir } from '../services/data-path'
import { seedPresetPersonas } from '../services/persona'
import { seedBuiltinPresets } from '../services/prompt-preset'

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (db) return db

  const dbPath = join(getDataDir(), 'local-agent.db')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  initSchema()

  return db
}

function initSchema(): void {
  if (!db) return
  const isProd = app.isPackaged
  const schemaPath = isProd
    ? join(process.resourcesPath, 'schema.sql')
    : join(__dirname, '../../resources/schema.sql')
  const schema = readFileSync(schemaPath, 'utf-8')
  db.exec(schema)
  runMigrations()
  seedPresetPersonas()
  seedBuiltinPresets()
}

function runMigrations(): void {
  if (!db) return
  const botCols = db.prepare("PRAGMA table_info(bots)").all() as any[]
  const botColNames = botCols.map((c: any) => c.name)
  if (!botColNames.includes('kb_only')) {
    db.exec("ALTER TABLE bots ADD COLUMN kb_only INTEGER NOT NULL DEFAULT 0")
  }
  const catCols = db.prepare("PRAGMA table_info(kb_categories)").all() as any[]
  const catColNames = catCols.map((c: any) => c.name)
  if (!catColNames.includes('watch_paths')) {
    db.exec("ALTER TABLE kb_categories ADD COLUMN watch_paths TEXT NOT NULL DEFAULT '[]'")
  }
  if (!botColNames.includes('prompt_skill_dirs')) {
    db.exec("ALTER TABLE bots ADD COLUMN prompt_skill_dirs TEXT NOT NULL DEFAULT '[]'")
  }
  // canvas_projects: add model provider columns
  const canvasCols = db.prepare("PRAGMA table_info(canvas_projects)").all() as any[]
  const canvasColNames = canvasCols.map((c: any) => c.name)
  if (canvasCols.length > 0 && !canvasColNames.includes('text_provider_id')) {
    db.exec("ALTER TABLE canvas_projects ADD COLUMN text_provider_id TEXT NOT NULL DEFAULT ''")
    db.exec("ALTER TABLE canvas_projects ADD COLUMN text_model_id TEXT NOT NULL DEFAULT ''")
    db.exec("ALTER TABLE canvas_projects ADD COLUMN image_provider_id TEXT NOT NULL DEFAULT ''")
    db.exec("ALTER TABLE canvas_projects ADD COLUMN image_model_id TEXT NOT NULL DEFAULT ''")
  }
  if (canvasCols.length > 0 && !canvasColNames.includes('concurrency')) {
    db.exec("ALTER TABLE canvas_projects ADD COLUMN concurrency INTEGER NOT NULL DEFAULT 1")
  }
  // Populate FTS index from existing chunks if FTS table is empty
  const ftsCount = (db.prepare("SELECT COUNT(*) as cnt FROM vector_chunks_fts").get() as any).cnt
  const chunkCount = (db.prepare("SELECT COUNT(*) as cnt FROM vector_chunks").get() as any).cnt
  if (ftsCount === 0 && chunkCount > 0) {
    db.exec("INSERT INTO vector_chunks_fts (chunk_id, knowledge_base_id, content) SELECT id, knowledge_base_id, content FROM vector_chunks")
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
