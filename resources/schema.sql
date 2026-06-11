CREATE TABLE IF NOT EXISTS model_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'openai_compatible',
  api_base TEXT NOT NULL,
  api_key TEXT NOT NULL DEFAULT '',
  models TEXT NOT NULL DEFAULT '[]',
  -- 生图扩展字段（仅作用于 callImageAPI 的自定义 + 多米分支，云端固定协议不受影响）
  -- custom_params: JSON 数组 [{name, value}]，逐条 set 进 body 顶层；空字符串值仅占位不下发
  -- request_override_patch: JSON 对象，最后 Object.assign 到 body 上做最终覆盖
  custom_params TEXT NOT NULL DEFAULT '[]',
  request_override_patch TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vector_provider (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'openai',
  api_base TEXT NOT NULL,
  api_key TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kb_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  watch_paths TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL DEFAULT '',
  file_type TEXT NOT NULL DEFAULT '',
  chunk_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (category_id) REFERENCES kb_categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS personas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  system_prompt TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bots (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  model_provider_id TEXT,
  model_id TEXT NOT NULL DEFAULT '',
  persona_id TEXT,
  kb_only INTEGER NOT NULL DEFAULT 0,
  kb_category_ids TEXT NOT NULL DEFAULT '[]',
  -- 云端知识库绑定（来自云控端智能体预设，acquire 时下发；对话时在线检索）
  cloud_kb_ids TEXT NOT NULL DEFAULT '[]',
  cloud_kb_only INTEGER NOT NULL DEFAULT 0,
  cloud_kb_top_k INTEGER NOT NULL DEFAULT 5,
  skill_ids TEXT NOT NULL DEFAULT '[]',
  mcp_ids TEXT NOT NULL DEFAULT '[]',
  prompt_skill_dirs TEXT NOT NULL DEFAULT '[]',
  tool_approval TEXT NOT NULL DEFAULT 'destructive',
  -- 智能体市场相关：avatar 本地形象图（2:3，落盘绝对路径）；source 'local'|'market'；
  -- cloud_agent_id 市场来源云端 id（去重）；submission_* 投稿到市场的审核态
  avatar TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'local',
  cloud_agent_id INTEGER NOT NULL DEFAULT 0,
  submission_status TEXT NOT NULL DEFAULT '',
  submission_reject_reason TEXT NOT NULL DEFAULT '',
  submission_reviewed_at TEXT NOT NULL DEFAULT '',
  submission_synced_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (model_provider_id) REFERENCES model_providers(id) ON DELETE SET NULL,
  FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'New Chat',
  -- 当前会话使用的模型（每个会话独立持久记忆）：
  -- - 新建时：填入云控端「对话页面默认模型」（site-config.chat_default_model）；缺省时留空
  -- - 用户在对话页输入框左下角切换：写回这两列
  -- - sendMessage 时优先用这两列，缺省时回退到云端默认 / 本地第一个 chat 模型
  -- 之前依赖 bots.model_provider_id / bots.model_id 强绑定的设计已废弃，新模型策略「智能体不再绑定模型」
  active_model_provider_id TEXT NOT NULL DEFAULT '',
  active_model_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversation_summaries (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  -- 已被摘要覆盖的 user/assistant 消息数（增量摘要水位线）：
  -- 下次摘要只压缩 covered_count 之后、滑动窗口之前的新增段落，避免每轮全量重压，
  -- 同时让摘要覆盖范围紧贴最近窗口，消除「滑出窗口但未被摘要覆盖」的记忆空洞。
  covered_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  attachments TEXT NOT NULL DEFAULT '[]',
  tool_calls TEXT NOT NULL DEFAULT '[]',
  tool_call_id TEXT NOT NULL DEFAULT '',
  -- 对话内交互卡片（ask_user / 生图参数确认卡）的 JSON 留痕；仅 UI 用，不回传模型、不跨设备同步
  card TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  function_def TEXT NOT NULL DEFAULT '{}',
  implementation TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'local',
  version TEXT NOT NULL DEFAULT '1.0.0',
  enabled INTEGER NOT NULL DEFAULT 1,
  is_builtin INTEGER NOT NULL DEFAULT 0,
  unsandboxed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  args TEXT NOT NULL DEFAULT '[]',
  env TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  tools TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vector_chunks (
  id TEXT PRIMARY KEY,
  knowledge_base_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding BLOB,
  token_count INTEGER NOT NULL DEFAULT 0,
  embedding_model TEXT NOT NULL DEFAULT '',
  embedding_dim INTEGER NOT NULL DEFAULT 0,
  embedding_source TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vector_chunks_kb ON vector_chunks(knowledge_base_id);

CREATE VIRTUAL TABLE IF NOT EXISTS vector_chunks_fts USING fts5(
  content, knowledge_base_id UNINDEXED, chunk_id UNINDEXED,
  tokenize='unicode61'
);

CREATE TABLE IF NOT EXISTS usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_usage_logs_provider ON usage_logs(provider_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created ON usage_logs(created_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS image_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'New Image',
  model_provider_id TEXT,
  model_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (model_provider_id) REFERENCES model_providers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS image_generations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  revised_prompt TEXT NOT NULL DEFAULT '',
  ref_images TEXT NOT NULL DEFAULT '[]',
  model_provider_id TEXT NOT NULL DEFAULT '',
  model_id TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL DEFAULT '1:1',
  quality TEXT NOT NULL DEFAULT 'auto',
  result_path TEXT NOT NULL DEFAULT '',
  result_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT NOT NULL DEFAULT '',
  -- 失败诊断用：发送给上游 API 的原始请求快照（脱敏后 JSON 字符串）；成功记录通常为空
  raw_request TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES image_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_image_generations_session ON image_generations(session_id);
CREATE INDEX IF NOT EXISTS idx_image_generations_status_created ON image_generations(status, created_at DESC);

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
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_video_generations_cloud_task ON video_generations(cloud_task_id);
CREATE INDEX IF NOT EXISTS idx_video_generations_status_created ON video_generations(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_video_generations_download_status ON video_generations(download_status);
CREATE TABLE IF NOT EXISTS prompt_categories (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prompt_categories_type ON prompt_categories(type);

CREATE TABLE IF NOT EXISTS prompt_presets (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  is_builtin INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (category_id) REFERENCES prompt_categories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prompt_presets_type ON prompt_presets(type);
CREATE INDEX IF NOT EXISTS idx_prompt_presets_category ON prompt_presets(category_id);

CREATE TABLE IF NOT EXISTS canvas_projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'New Canvas',
  text_provider_id TEXT NOT NULL DEFAULT '',
  text_model_id TEXT NOT NULL DEFAULT '',
  image_provider_id TEXT NOT NULL DEFAULT '',
  image_model_id TEXT NOT NULL DEFAULT '',
  concurrency INTEGER NOT NULL DEFAULT 1,
  system_prompt TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS canvas_nodes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  type TEXT NOT NULL,
  position_x REAL NOT NULL DEFAULT 0,
  position_y REAL NOT NULL DEFAULT 0,
  width REAL NOT NULL DEFAULT 240,
  height REAL NOT NULL DEFAULT 0,
  data TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES canvas_projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canvas_nodes_project ON canvas_nodes(project_id);

CREATE TABLE IF NOT EXISTS canvas_edges (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source_node_id TEXT NOT NULL,
  source_handle TEXT NOT NULL DEFAULT 'output',
  target_node_id TEXT NOT NULL,
  target_handle TEXT NOT NULL DEFAULT 'input',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES canvas_projects(id) ON DELETE CASCADE,
  FOREIGN KEY (source_node_id) REFERENCES canvas_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (target_node_id) REFERENCES canvas_nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_canvas_edges_project ON canvas_edges(project_id);

CREATE TABLE IF NOT EXISTS gallery_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_system INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gallery_items (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT '',
  file_size INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'file',
  folder_root TEXT NOT NULL DEFAULT '',
  folder_recursive INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (category_id) REFERENCES gallery_categories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_gallery_items_category ON gallery_items(category_id);
CREATE INDEX IF NOT EXISTS idx_gallery_items_path ON gallery_items(file_path);
CREATE INDEX IF NOT EXISTS idx_gallery_items_name ON gallery_items(name);

-- AI 抠图自定义接口（v0.6.9+）。仅当用户在「模型服务 → 抠图接口」tab 配置自己的阿里 AK 时
-- 才写入；云控端中转模式不依赖此表。ak/sk 用 AES-256-GCM 加密后存储（key 由 device-id 派生）。
CREATE TABLE IF NOT EXISTS matting_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- 当前仅支持 type='aliyun_viapi'（阿里 SegmentHDCommonImage）。预留字段方便后续接腾讯 / 移除轻量等
  type TEXT NOT NULL DEFAULT 'aliyun_viapi',
  -- AK ID 明文存，便于列表展示（masked）
  access_key_id TEXT NOT NULL DEFAULT '',
  -- AK Secret 加密存：格式 "v1:{iv_hex}:{authTag_hex}:{ciphertext_hex}"，解密 key 由 device-id 派生
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

-- 抠图本地任务历史（v0.6.9+）。云端模式 / 自定义模式都记一条，便于「我的抠图」分类展示 + 失败重试
CREATE TABLE IF NOT EXISTS matting_tasks (
  id TEXT PRIMARY KEY,
  -- 任务来源：'cloud'（云控端中转）/ 'custom'（自定义阿里 AK 直连）
  source TEXT NOT NULL DEFAULT 'cloud',
  -- custom 模式下指向 matting_providers.id；cloud 模式留空
  provider_id TEXT NOT NULL DEFAULT '',
  -- 原图绝对路径（用户选的或临时落盘的）；用于失败重试
  source_image_path TEXT NOT NULL DEFAULT '',
  -- 结果 PNG 绝对路径；保存到 dataDir/matting/{taskId}.png
  result_path TEXT NOT NULL DEFAULT '',
  -- 结果 URL（阿里临时 URL，24h 过期，仅作 trace）
  result_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT NOT NULL DEFAULT '',
  -- 阿里端 trace ID
  aliyun_request_id TEXT NOT NULL DEFAULT '',
  elapsed_ms INTEGER NOT NULL DEFAULT 0,
  -- 关联画布节点（画布抠图节点用），普通 AI 抠图页面留空
  canvas_project_id TEXT NOT NULL DEFAULT '',
  canvas_node_id TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_matting_tasks_status ON matting_tasks(status);
CREATE INDEX IF NOT EXISTS idx_matting_tasks_created ON matting_tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_matting_tasks_canvas ON matting_tasks(canvas_project_id);

-- 精细抠图本地任务历史（抠抠图 koukoutu，仅云端中转）。
-- 记录 tier（1/2/3 长边尺寸档）与 cost（本系统积分扣费），便于「我的精细抠图」分类展示 + 失败重试。
CREATE TABLE IF NOT EXISTS fine_matting_tasks (
  id TEXT PRIMARY KEY,
  -- 原图绝对路径（用户选的或临时落盘的）；用于失败重试
  source_image_path TEXT NOT NULL DEFAULT '',
  -- 结果 PNG 绝对路径；保存到 dataDir/fine-matting/{taskId}.png
  result_path TEXT NOT NULL DEFAULT '',
  -- 结果 URL（抠抠图临时 URL，仅作 trace）
  result_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT NOT NULL DEFAULT '',
  -- 我们端 trace ID
  request_id TEXT NOT NULL DEFAULT '',
  -- 抠抠图端 task_id
  provider_task_id TEXT NOT NULL DEFAULT '',
  elapsed_ms INTEGER NOT NULL DEFAULT 0,
  -- 长边尺寸档位（1=4K以下 / 2=4K-8K / 3=8K以上）
  tier INTEGER NOT NULL DEFAULT 0,
  -- 本次扣费（本系统积分）
  cost REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_fine_matting_tasks_status ON fine_matting_tasks(status);
CREATE INDEX IF NOT EXISTS idx_fine_matting_tasks_created ON fine_matting_tasks(created_at);

-- 创意模板（v0.7.7+）：本地用户私有的创意模板系统
-- 数据完全本地，与云端模板独立；云端模板由云控端提供，不写入此表。
-- 用 TEXT/UUID 主键以便与 ipc 调用 stringly 兼容。
CREATE TABLE IF NOT EXISTS creative_template_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 模板表
-- - variables: JSON 数组，每项 {key,label,type,required,placeholder,default,options}
-- - example_ref_images: JSON 字符串数组，单条最长不限（path/data uri/http url 都可能存）
-- - source_type: manual / image / inspiration
-- - source_image: 图片反推创建时记录用户原图（绝对路径或 data uri）
-- - source_inspiration_id: 灵感转换创建时记录关联灵感来源 id（字符串，桌面端 inspiration id 是 'custom-N' / 'ernie-N'）
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

-- 云端知识库检索结果离线缓存（hybrid 降级用）：云端不可达/超时时回退命中过的片段
CREATE TABLE IF NOT EXISTS cloud_kb_cache (
  id TEXT PRIMARY KEY,
  query_hash TEXT NOT NULL,           -- sha256(normalized_query + sorted_kb_ids + top_k)
  cloud_kb_id INTEGER NOT NULL DEFAULT 0,
  chunk_id INTEGER NOT NULL DEFAULT 0,
  source_doc TEXT NOT NULL DEFAULT '',
  kb_name TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  score REAL NOT NULL DEFAULT 0,
  rank INTEGER NOT NULL DEFAULT 0,
  cached_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cloud_kb_cache_query ON cloud_kb_cache(query_hash);
CREATE INDEX IF NOT EXISTS idx_cloud_kb_cache_cached ON cloud_kb_cache(cached_at);
