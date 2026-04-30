CREATE TABLE IF NOT EXISTS model_providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'openai_compatible',
  api_base TEXT NOT NULL,
  api_key TEXT NOT NULL DEFAULT '',
  models TEXT NOT NULL DEFAULT '[]',
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
  skill_ids TEXT NOT NULL DEFAULT '[]',
  mcp_ids TEXT NOT NULL DEFAULT '[]',
  prompt_skill_dirs TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (model_provider_id) REFERENCES model_providers(id) ON DELETE SET NULL,
  FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  bot_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'New Chat',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (bot_id) REFERENCES bots(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversation_summaries (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
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
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES image_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_image_generations_session ON image_generations(session_id);

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
