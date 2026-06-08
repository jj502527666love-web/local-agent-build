import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync, mkdirSync } from 'fs'
import { getDataDir } from '../services/data-path'
import { seedPresetPersonas } from '../services/persona'
import { seedBuiltinPresets } from '../services/prompt-preset'
import { seedBuiltinSkillPresets } from '../services/skill'
import { seedCreativeTemplatePresets } from '../services/creative-template'
import { assertEpoch } from '../services/account-epoch'
import { installSyncSchema } from '../services/sync/schema'

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  // 账号热切换守卫：旧账号的 inflight 任务在切库后调用本函数，会因账号代次不符抛错，
  // 从而拒绝拿到新库写入（防串数据，详见 services/account-epoch.ts）。
  // 必须在 `if (db) return db` 之前，否则旧任务会直接返回已切换的新库实例。
  assertEpoch()
  if (db) return db

  // 账号子目录（accounts/...）首次使用前可能尚不存在；better-sqlite3 不会自动建目录，
  // 必须先 mkdir，否则 new Database() 抛 "unable to open database file"。
  const dir = getDataDir()
  mkdirSync(dir, { recursive: true })
  const dbPath = join(dir, 'local-agent.db')
  db = new Database(dbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  // 让 FK 级联删除（如删会话级联删消息）也触发子表的 AFTER DELETE 触发器，
  // 使云同步能捕获到级联产生的子记录删除并生成对应墓碑，跨设备正确传播删除。
  // 应用内除云同步触发器外无其它触发器，开启此项无副作用。
  db.pragma('recursive_triggers = ON')

  tryLoadSqliteVec(db)

  initSchema()

  return db
}

// sqlite-vec 原生扩展:可用时为向量检索提供 vec0 KNN 加速;不可用时静默回退 JS cosine(零降级)。
let sqliteVecAvailable = false
export function isSqliteVecAvailable(): boolean {
  return sqliteVecAvailable
}
function tryLoadSqliteVec(database: Database.Database): void {
  try {
    // 延迟 require:未安装 / 原生未随 Electron 版本 rebuild 时不影响应用启动
    const sqliteVec = require('sqlite-vec')
    sqliteVec.load(database)
    sqliteVecAvailable = true
    console.log('[db] sqlite-vec extension loaded (vector KNN enabled)')
  } catch (e: any) {
    sqliteVecAvailable = false
    console.warn('[db] sqlite-vec unavailable, using JS cosine fallback:', e?.message || e)
  }
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
  expireStalePendingCards()
  seedPresetPersonas()
  seedBuiltinPresets()
  seedBuiltinSkillPresets()
  seedCreativeTemplatePresets()
  // 同步基础设施放在内置数据 seed 之后安装：触发器此刻才生效，
  // 内置预设（persona/skill/prompt）不会被记入 oplog 推送到云端，
  // 新设备靠各自本地 seed 自然拥有同 id 的内置数据。
  installSyncSchema(db)
}

// 进程重启后，DB 里仍处于 pending 的交互卡片（ask_user / 生图参数卡）必然已失去其等待回环
// （pendingChoices 是内存态，随进程消失），标记为 expired，避免重开会话时出现「可点击但点了无反应」
// 的僵尸卡片。在 installSyncSchema 之前调用：此刻同步触发器尚未安装，不产生 oplog 噪音。
function expireStalePendingCards(): void {
  if (!db) return
  try {
    db.exec(
      `UPDATE messages SET card = REPLACE(card, '"status":"pending"', '"status":"expired"') WHERE card LIKE '%"status":"pending"%'`
    )
  } catch (e) {
    console.warn('[db] expireStalePendingCards failed:', e)
  }
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
  // 智能体市场（云端创建/投稿 → 桌面保存到本地）：旧库幂等加列
  if (!botColNames.includes('avatar')) {
    db.exec("ALTER TABLE bots ADD COLUMN avatar TEXT NOT NULL DEFAULT ''")
  }
  if (!botColNames.includes('source')) {
    db.exec("ALTER TABLE bots ADD COLUMN source TEXT NOT NULL DEFAULT 'local'")
  }
  if (!botColNames.includes('cloud_agent_id')) {
    db.exec("ALTER TABLE bots ADD COLUMN cloud_agent_id INTEGER NOT NULL DEFAULT 0")
  }
  if (!botColNames.includes('submission_status')) {
    db.exec("ALTER TABLE bots ADD COLUMN submission_status TEXT NOT NULL DEFAULT ''")
  }
  if (!botColNames.includes('submission_reject_reason')) {
    db.exec("ALTER TABLE bots ADD COLUMN submission_reject_reason TEXT NOT NULL DEFAULT ''")
  }
  if (!botColNames.includes('submission_reviewed_at')) {
    db.exec("ALTER TABLE bots ADD COLUMN submission_reviewed_at TEXT NOT NULL DEFAULT ''")
  }
  if (!botColNames.includes('submission_synced_at')) {
    db.exec("ALTER TABLE bots ADD COLUMN submission_synced_at TEXT NOT NULL DEFAULT ''")
  }
  // 云端知识库绑定（云控端智能体预设下发；对话时在线检索 + 离线缓存降级）：旧库幂等加列
  if (!botColNames.includes('cloud_kb_ids')) {
    db.exec("ALTER TABLE bots ADD COLUMN cloud_kb_ids TEXT NOT NULL DEFAULT '[]'")
  }
  if (!botColNames.includes('cloud_kb_only')) {
    db.exec("ALTER TABLE bots ADD COLUMN cloud_kb_only INTEGER NOT NULL DEFAULT 0")
  }
  if (!botColNames.includes('cloud_kb_top_k')) {
    db.exec("ALTER TABLE bots ADD COLUMN cloud_kb_top_k INTEGER NOT NULL DEFAULT 5")
  }
  // 单轮对话最大工具调用步数(0=用默认)。长任务(如多页 PPT)可调高，避免被步数上限中断 bug1
  if (!botColNames.includes('max_tool_rounds')) {
    db.exec("ALTER TABLE bots ADD COLUMN max_tool_rounds INTEGER NOT NULL DEFAULT 0")
  }
  // messages: persist tool_call_id so OpenAI tool_calls/tool pairs replay correctly
  const msgCols = db.prepare("PRAGMA table_info(messages)").all() as any[]
  const msgColNames = msgCols.map((c: any) => c.name)
  if (!msgColNames.includes('tool_call_id')) {
    db.exec("ALTER TABLE messages ADD COLUMN tool_call_id TEXT NOT NULL DEFAULT ''")
  }
  // reasoning 思维链持久化(仅 UI 展示用，不回传模型)：旧库幂等加列
  if (!msgColNames.includes('reasoning')) {
    db.exec("ALTER TABLE messages ADD COLUMN reasoning TEXT NOT NULL DEFAULT ''")
  }
  // 对话内交互卡片（ask_user / 生图参数确认卡）的 JSON 留痕：仅 UI 用，不回传模型。
  // 已在 sync/registry.ts 的 messages.skipColumns 排除，不参与云同步。
  if (!msgColNames.includes('card')) {
    db.exec("ALTER TABLE messages ADD COLUMN card TEXT NOT NULL DEFAULT ''")
  }
  // conversation_summaries: 增量摘要水位线列（旧库幂等加列）
  const csCols = db.prepare("PRAGMA table_info(conversation_summaries)").all() as any[]
  const csColNames = csCols.map((c: any) => c.name)
  if (csCols.length > 0 && !csColNames.includes('covered_count')) {
    db.exec("ALTER TABLE conversation_summaries ADD COLUMN covered_count INTEGER NOT NULL DEFAULT 0")
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
  // 画布自动整理布局方向：'LR' 左到右（默认，保持老画布行为不变）/ 'TB' 上到下。
  // dagre.rankdir 的子集，仅暴露 LR / TB 两种到 UI；RL / BT 算法层支持但不暴露。
  if (canvasCols.length > 0 && !canvasColNames.includes('layout_direction')) {
    db.exec("ALTER TABLE canvas_projects ADD COLUMN layout_direction TEXT NOT NULL DEFAULT 'LR'")
  }
  // v0.6.9+ 「图片反推」节点的视觉模型默认值（project 级）：
  // 反推节点本身可单独覆盖；不覆盖时回退到这两列。
  // 默认空字符串：未配置时反推节点会要求用户先在画布设置或节点上选模型
  if (canvasCols.length > 0 && !canvasColNames.includes('vision_provider_id')) {
    db.exec("ALTER TABLE canvas_projects ADD COLUMN vision_provider_id TEXT NOT NULL DEFAULT ''")
    db.exec("ALTER TABLE canvas_projects ADD COLUMN vision_model_id TEXT NOT NULL DEFAULT ''")
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
  if (igCols.length > 0) {
    db.exec('CREATE INDEX IF NOT EXISTS idx_image_generations_status_created ON image_generations(status, created_at DESC)')
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS video_generations (
      id TEXT PRIMARY KEY,
      cloud_task_id TEXT NOT NULL DEFAULT '',
      task_id TEXT NOT NULL DEFAULT '',
      provider_protocol TEXT NOT NULL DEFAULT '',
      model_id TEXT NOT NULL DEFAULT '',
      model_name TEXT NOT NULL DEFAULT '',
      sku_key TEXT NOT NULL DEFAULT '',
      sku_title TEXT NOT NULL DEFAULT '',
      mode TEXT NOT NULL DEFAULT '',
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      resolution TEXT NOT NULL DEFAULT '',
      aspect_ratio TEXT NOT NULL DEFAULT '',
      quality TEXT NOT NULL DEFAULT '',
      prompt TEXT NOT NULL DEFAULT '',
      negative_prompt TEXT NOT NULL DEFAULT '',
      reference_assets TEXT NOT NULL DEFAULT '[]',
      reference_image_urls TEXT NOT NULL DEFAULT '[]',
      reference_video_urls TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      progress INTEGER NOT NULL DEFAULT 0,
      estimated_credits REAL NOT NULL DEFAULT 0,
      credits_used REAL NOT NULL DEFAULT 0,
      error TEXT NOT NULL DEFAULT '',
      remote_url TEXT NOT NULL DEFAULT '',
      storage_url TEXT NOT NULL DEFAULT '',
      cover_url TEXT NOT NULL DEFAULT '',
      local_path TEXT NOT NULL DEFAULT '',
      file_size INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT NOT NULL DEFAULT '',
      download_status TEXT NOT NULL DEFAULT 'pending',
      download_error TEXT NOT NULL DEFAULT '',
      download_attempts INTEGER NOT NULL DEFAULT 0,
      remote_expires_at TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT NOT NULL DEFAULT '',
      downloaded_at TEXT NOT NULL DEFAULT '',
      is_deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT NOT NULL DEFAULT '',
      canvas_project_id TEXT NOT NULL DEFAULT '',
      canvas_node_id TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_video_generations_cloud_task ON video_generations(cloud_task_id);
    CREATE INDEX IF NOT EXISTS idx_video_generations_status_created ON video_generations(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_video_generations_download_status ON video_generations(download_status);
  `)
  const videoCols = db.prepare("PRAGMA table_info(video_generations)").all() as any[]
  const videoColNames = videoCols.map((c: any) => c.name)
  if (videoCols.length > 0 && !videoColNames.includes('is_deleted')) {
    db.exec("ALTER TABLE video_generations ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0")
  }
  if (videoCols.length > 0 && !videoColNames.includes('deleted_at')) {
    db.exec("ALTER TABLE video_generations ADD COLUMN deleted_at TEXT NOT NULL DEFAULT ''")
  }
  // v0.7.14+ 流式画布视频节点：标记任务来源画布，用于落盘到 canvas/{projectId}/ 与删节点级联清理
  if (videoCols.length > 0 && !videoColNames.includes('canvas_project_id')) {
    db.exec("ALTER TABLE video_generations ADD COLUMN canvas_project_id TEXT NOT NULL DEFAULT ''")
  }
  if (videoCols.length > 0 && !videoColNames.includes('canvas_node_id')) {
    db.exec("ALTER TABLE video_generations ADD COLUMN canvas_node_id TEXT NOT NULL DEFAULT ''")
  }
  db.exec('CREATE INDEX IF NOT EXISTS idx_video_generations_deleted ON video_generations(is_deleted, created_at DESC)')
  db.exec('CREATE INDEX IF NOT EXISTS idx_video_generations_canvas ON video_generations(canvas_project_id, canvas_node_id)')

  // v0.7.14+ 流式画布角色一致性库：跨镜头复用同一角色参考图，保证人物一致
  db.exec(`
    CREATE TABLE IF NOT EXISTS canvas_characters (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      ref_image_path TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_canvas_characters_project ON canvas_characters(project_id);
  `)

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

  // v0.6.9+ gallery 系统「我的抠图」分类：AI 抠图 / 画布抠图节点产图自动归档
  // 固定 id __sys_matting__ 跟 __sys_creation__ 同等地位
  const sysMattingExists = db
    .prepare("SELECT id FROM gallery_categories WHERE id = ?")
    .get('__sys_matting__') as any
  if (!sysMattingExists) {
    db.prepare(
      "INSERT INTO gallery_categories (id, name, description, is_system, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      '__sys_matting__',
      '我的抠图',
      'AI 抠图 / 画布抠图节点自动归档（透明 PNG）',
      1,
      -999,
      new Date().toISOString()
    )
  }

  // 精细抠图系统「我的精细抠图」分类：精细抠图产图自动归档
  const sysFineMattingExists = db
    .prepare("SELECT id FROM gallery_categories WHERE id = ?")
    .get('__sys_fine_matting__') as any
  if (!sysFineMattingExists) {
    db.prepare(
      "INSERT INTO gallery_categories (id, name, description, is_system, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      '__sys_fine_matting__',
      '我的精细抠图',
      '精细抠图自动归档（透明 PNG）',
      1,
      -998,
      new Date().toISOString()
    )
  } else {
    db.prepare(
      "UPDATE gallery_categories SET description = ? WHERE id = ? AND description LIKE '%抠抠图%'"
    ).run('精细抠图自动归档（透明 PNG）', '__sys_fine_matting__')
  }

  // v0.7.7+ creative_templates / creative_template_categories 表幂等建表（旧库升级路径）
  // 完整字段语义见 resources/schema.sql 顶部注释
  db.exec(`
    CREATE TABLE IF NOT EXISTS creative_template_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_visible INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS creative_templates (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      cover_image TEXT NOT NULL DEFAULT '',
      example_ref_images TEXT NOT NULL DEFAULT '[]',
      requires_ref_image INTEGER NOT NULL DEFAULT 0,
      default_size TEXT NOT NULL DEFAULT '',
      prompt_template TEXT NOT NULL,
      variables TEXT NOT NULL DEFAULT '[]',
      source_type TEXT NOT NULL DEFAULT 'manual',
      source_image TEXT NOT NULL DEFAULT '',
      source_inspiration_id TEXT NOT NULL DEFAULT '',
      cloud_template_id INTEGER NOT NULL DEFAULT 0,
      submission_status TEXT NOT NULL DEFAULT '',
      submission_reject_reason TEXT NOT NULL DEFAULT '',
      submission_reviewed_at TEXT NOT NULL DEFAULT '',
      submission_published_at TEXT NOT NULL DEFAULT '',
      submission_synced_at TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_visible INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES creative_template_categories(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_creative_templates_category ON creative_templates(category_id);
    CREATE INDEX IF NOT EXISTS idx_creative_templates_source ON creative_templates(source_type);
    CREATE INDEX IF NOT EXISTS idx_creative_templates_created ON creative_templates(created_at);
  `)
  const creativeTemplateCols = db.prepare("PRAGMA table_info(creative_templates)").all() as any[]
  const creativeTemplateColNames = creativeTemplateCols.map((c: any) => c.name)
  if (creativeTemplateCols.length > 0 && !creativeTemplateColNames.includes('requires_ref_image')) {
    db.exec("ALTER TABLE creative_templates ADD COLUMN requires_ref_image INTEGER NOT NULL DEFAULT 0")
  }
  if (creativeTemplateCols.length > 0 && !creativeTemplateColNames.includes('cloud_template_id')) {
    db.exec("ALTER TABLE creative_templates ADD COLUMN cloud_template_id INTEGER NOT NULL DEFAULT 0")
  }
  if (creativeTemplateCols.length > 0 && !creativeTemplateColNames.includes('submission_status')) {
    db.exec("ALTER TABLE creative_templates ADD COLUMN submission_status TEXT NOT NULL DEFAULT ''")
  }
  if (creativeTemplateCols.length > 0 && !creativeTemplateColNames.includes('submission_reject_reason')) {
    db.exec("ALTER TABLE creative_templates ADD COLUMN submission_reject_reason TEXT NOT NULL DEFAULT ''")
  }
  if (creativeTemplateCols.length > 0 && !creativeTemplateColNames.includes('submission_reviewed_at')) {
    db.exec("ALTER TABLE creative_templates ADD COLUMN submission_reviewed_at TEXT NOT NULL DEFAULT ''")
  }
  if (creativeTemplateCols.length > 0 && !creativeTemplateColNames.includes('submission_published_at')) {
    db.exec("ALTER TABLE creative_templates ADD COLUMN submission_published_at TEXT NOT NULL DEFAULT ''")
  }
  if (creativeTemplateCols.length > 0 && !creativeTemplateColNames.includes('submission_synced_at')) {
    db.exec("ALTER TABLE creative_templates ADD COLUMN submission_synced_at TEXT NOT NULL DEFAULT ''")
  }

  // v0.6.9+ matting_providers / matting_tasks 表幂等建表（旧库升级路径）
  // 注：schema.sql 已 CREATE TABLE IF NOT EXISTS，正常启动时由 db.exec(schema) 完成；
  // 这里仅作兜底，处理 schema.sql 未及时刷新但 migrations 已跑的边界场景
  db.exec(`
    CREATE TABLE IF NOT EXISTS matting_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'aliyun_viapi',
      access_key_id TEXT NOT NULL DEFAULT '',
      access_key_secret_enc TEXT NOT NULL DEFAULT '',
      endpoint TEXT NOT NULL DEFAULT 'imageseg.cn-shanghai.aliyuncs.com',
      region_id TEXT NOT NULL DEFAULT 'cn-shanghai',
      is_default INTEGER NOT NULL DEFAULT 0,
      remark TEXT NOT NULL DEFAULT '',
      last_test_at TEXT NOT NULL DEFAULT '',
      last_test_status TEXT NOT NULL DEFAULT '',
      last_test_message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS matting_tasks (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'cloud',
      provider_id TEXT NOT NULL DEFAULT '',
      source_image_path TEXT NOT NULL DEFAULT '',
      result_path TEXT NOT NULL DEFAULT '',
      result_url TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT NOT NULL DEFAULT '',
      aliyun_request_id TEXT NOT NULL DEFAULT '',
      elapsed_ms INTEGER NOT NULL DEFAULT 0,
      canvas_project_id TEXT NOT NULL DEFAULT '',
      canvas_node_id TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_matting_tasks_status ON matting_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_matting_tasks_created ON matting_tasks(created_at);
    CREATE INDEX IF NOT EXISTS idx_matting_tasks_canvas ON matting_tasks(canvas_project_id);
  `)

  // 精细抠图本地任务表幂等建表（旧库升级路径）。完整字段语义见 resources/schema.sql。
  db.exec(`
    CREATE TABLE IF NOT EXISTS fine_matting_tasks (
      id TEXT PRIMARY KEY,
      source_image_path TEXT NOT NULL DEFAULT '',
      result_path TEXT NOT NULL DEFAULT '',
      result_url TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT NOT NULL DEFAULT '',
      request_id TEXT NOT NULL DEFAULT '',
      provider_task_id TEXT NOT NULL DEFAULT '',
      elapsed_ms INTEGER NOT NULL DEFAULT 0,
      tier INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_fine_matting_tasks_status ON fine_matting_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_fine_matting_tasks_created ON fine_matting_tasks(created_at);
  `)
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
