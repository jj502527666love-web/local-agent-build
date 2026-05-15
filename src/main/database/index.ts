import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { getDataDir } from '../services/data-path'
import { seedPresetPersonas } from '../services/persona'
import { seedBuiltinPresets } from '../services/prompt-preset'
import { seedBuiltinSkillPresets } from '../services/skill'

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
  seedBuiltinSkillPresets()
}

function runMigrations(): void {
  if (!db) return
  // model_providers: 生图扩展字段（custom_params + request_override_patch）
  // 旧库升级幂等加列；JSON 文本，默认空数组 / 空对象。
  const mpCols = db.prepare("PRAGMA table_info(model_providers)").all() as any[]
  const mpColNames = mpCols.map((c: any) => c.name)
  if (mpCols.length > 0 && !mpColNames.includes('custom_params')) {
    db.exec("ALTER TABLE model_providers ADD COLUMN custom_params TEXT NOT NULL DEFAULT '[]'")
  }
  if (mpCols.length > 0 && !mpColNames.includes('request_override_patch')) {
    db.exec("ALTER TABLE model_providers ADD COLUMN request_override_patch TEXT NOT NULL DEFAULT '{}'")
  }

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
  if (!botColNames.includes('tool_approval')) {
    db.exec("ALTER TABLE bots ADD COLUMN tool_approval TEXT NOT NULL DEFAULT 'destructive'")
  }
  // v0.6.6+ 「调用生图能力」总开关：智能体级别控制是否暴露 image_gen tool +「生图：」切换条
  // 默认 0=关：避免对没图片需求的智能体浪费 system prompt token、避免 LLM 误调
  if (!botColNames.includes('enable_image_gen')) {
    db.exec("ALTER TABLE bots ADD COLUMN enable_image_gen INTEGER NOT NULL DEFAULT 0")
  }
  // messages: persist tool_call_id so OpenAI tool_calls/tool pairs replay correctly
  const msgCols = db.prepare("PRAGMA table_info(messages)").all() as any[]
  const msgColNames = msgCols.map((c: any) => c.name)
  if (!msgColNames.includes('tool_call_id')) {
    db.exec("ALTER TABLE messages ADD COLUMN tool_call_id TEXT NOT NULL DEFAULT ''")
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
  if (canvasCols.length > 0 && !canvasColNames.includes('system_prompt')) {
    db.exec("ALTER TABLE canvas_projects ADD COLUMN system_prompt TEXT NOT NULL DEFAULT ''")
  }
  // vector_chunks: track which embedding model/dim/source produced each chunk's vector
  // 用于检测模型变更后强制重向量化（不同模型的向量空间不可混用）
  const chunkCols = db.prepare("PRAGMA table_info(vector_chunks)").all() as any[]
  const chunkColNames = chunkCols.map((c: any) => c.name)
  if (!chunkColNames.includes('embedding_model')) {
    db.exec("ALTER TABLE vector_chunks ADD COLUMN embedding_model TEXT NOT NULL DEFAULT ''")
  }
  if (!chunkColNames.includes('embedding_dim')) {
    db.exec("ALTER TABLE vector_chunks ADD COLUMN embedding_dim INTEGER NOT NULL DEFAULT 0")
  }
  if (!chunkColNames.includes('embedding_source')) {
    db.exec("ALTER TABLE vector_chunks ADD COLUMN embedding_source TEXT NOT NULL DEFAULT ''")
  }
  // skills: 加 is_builtin 字段，用于标识 6 个内置预设（不可删除、启动自动 seed）
  const skillCols = db.prepare("PRAGMA table_info(skills)").all() as any[]
  const skillColNames = skillCols.map((c: any) => c.name)
  if (skillCols.length > 0 && !skillColNames.includes('is_builtin')) {
    db.exec("ALTER TABLE skills ADD COLUMN is_builtin INTEGER NOT NULL DEFAULT 0")
  }

  // image_generations: 失败诊断用「原始请求快照」字段（v0.6.7+）
  // 每次生图调用上游 API 前抓一份脱敏后的 {url, method, headers, body} JSON，失败时写入此列
  // 与 error 字段一同展示，供用户复制贴给排错方定位字段/协议问题
  const igCols = db.prepare("PRAGMA table_info(image_generations)").all() as any[]
  const igColNames = igCols.map((c: any) => c.name)
  if (igCols.length > 0 && !igColNames.includes('raw_request')) {
    db.exec("ALTER TABLE image_generations ADD COLUMN raw_request TEXT NOT NULL DEFAULT ''")
  }

  // conversations: 「智能体不再绑定模型」改造（v0.6.5+）
  // 每个会话独立记忆模型：新建会话从云控端默认拉取，用户输入框切换持久写回
  // 旧库的 conversation 行为：active_model_* 为空字符串，sendMessage 时按回退链解析
  const convCols = db.prepare("PRAGMA table_info(conversations)").all() as any[]
  const convColNames = convCols.map((c: any) => c.name)
  if (convCols.length > 0 && !convColNames.includes('active_model_provider_id')) {
    db.exec("ALTER TABLE conversations ADD COLUMN active_model_provider_id TEXT NOT NULL DEFAULT ''")
  }
  if (convCols.length > 0 && !convColNames.includes('active_model_id')) {
    db.exec("ALTER TABLE conversations ADD COLUMN active_model_id TEXT NOT NULL DEFAULT ''")
  }
  // v0.6.6+ 「对话内生图模型独立选择」：会话级记忆生图服务商/模型，输入框第二个切换器写回。
  // 默认空字符串：chat-engine 调 image_gen tool 时若 args 缺 provider/model 才回退到这两列；
  // 仍空则让 LLM 自行 list_providers（保持向后兼容）
  if (convCols.length > 0 && !convColNames.includes('active_image_provider_id')) {
    db.exec("ALTER TABLE conversations ADD COLUMN active_image_provider_id TEXT NOT NULL DEFAULT ''")
  }
  if (convCols.length > 0 && !convColNames.includes('active_image_model_id')) {
    db.exec("ALTER TABLE conversations ADD COLUMN active_image_model_id TEXT NOT NULL DEFAULT ''")
  }

  // Populate FTS index from existing chunks if FTS table is empty
  const ftsCount = (db.prepare("SELECT COUNT(*) as cnt FROM vector_chunks_fts").get() as any).cnt
  const chunkCount = (db.prepare("SELECT COUNT(*) as cnt FROM vector_chunks").get() as any).cnt
  if (ftsCount === 0 && chunkCount > 0) {
    db.exec("INSERT INTO vector_chunks_fts (chunk_id, knowledge_base_id, content) SELECT id, knowledge_base_id, content FROM vector_chunks")
  }

  // gallery 系统默认「创作」分类：AI 生图 / 批量生图 / 画布产图自动归档
  // 固定 id __sys_creation__ 便于服务端 hardcoded 引用，避免查表开销
  const sysCreationExists = db
    .prepare("SELECT id FROM gallery_categories WHERE id = ?")
    .get('__sys_creation__') as any
  if (!sysCreationExists) {
    db.prepare(
      "INSERT INTO gallery_categories (id, name, description, is_system, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      '__sys_creation__',
      '创作',
      'AI 生图 / 批量生图 / 画布产图自动归档',
      1,
      -1000,
      new Date().toISOString()
    )
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
