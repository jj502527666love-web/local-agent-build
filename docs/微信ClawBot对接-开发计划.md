# 微信 ClawBot 对接开发计划

> 状态：已拍板，待开工。调研与事实核查已完成（两轮多代理调研 + 对抗核查，关键结论全部经代码第一手确认）。
> 目标读者：实施开发者。文中所有 文件:行号 均为当前代码锚点，开工时若漂移以符号索引（ccgui-index）重新定位。

## 1. 背景与目标

微信官方 ClawBot 插件（iLink 协议，`ilinkai.weixin.qq.com`）允许把个人微信扫码绑定到自建后端：微信消息经 35 秒长轮询推给后端，后端处理后回发。桌面端的对话引擎完整运行在 Electron 主进程（`chat-engine.ts:713 sendMessage(options, window)`），且 `window` 可传 `null` 纯后台跑、回复保证落本地 SQLite——**这就是一个现成的、不需要聊天页开着的程序化对话入口**。

目标：新增主进程常驻服务 `clawbot-bridge`，把微信会话桥接到桌面端对话引擎。微信里发的消息出现在桌面端聊天页（按微信联系人映射会话），回复自动回发微信；切页面、关窗口（托盘常驻）均不中断。

**零云控端改动**：模型调用走既有云网关（`POST /api/gateway/chat/completions`），图片换 URL 走既有 `materializeMessageImages` 链路，均无需新增云端 API。

## 2. 范围与拍板决策

| 决策点 | 结论 |
|---|---|
| 首期范围 | 一次到位：文字、图片、文档双向 + 生图回传微信；语音降级为文字（用微信侧 ASR 文本，为空则提示不支持）；视频降级提示 |
| 管理界面 | 独立页面 + 侧栏入口（比照 ewei 连接器），含二维码登录卡、状态、绑定、映射列表、消息日志 |
| 智能体绑定 | 用户从现有智能体任选 + 默认自动新建「微信助手」；同一连接下所有微信联系人共享绑定智能体 |
| 工具审批 | 桥内自动审批白名单策略（改造 `chat-engine` 注入审批决策器，见 §6），不做桌面端在线审批、不做全自动 |

非目标（本期不做）：群聊（官方协议未开放）、语音消息发送（协议不支持）、视频内容理解、回复流式输出到微信（先最终态整条发，流式编辑为后续候选）、云端桥部署形态、多微信账号同时绑定（架构按多连接设计，UI 首期只暴露单连接）。

## 3. 总体架构

```
微信用户 ──► ilinkai.weixin.qq.com
                │  getupdates 长轮询(35s)  ◄── 游标 get_updates_buf 持久化
                ▼
┌─ clawbot-bridge（主进程常驻服务，模块级单例）────────────────┐
│  ilink-api.ts     协议封装（请求头/base_info/七个端点/超时纪律）│
│  ilink-cdn.ts     AES-128-ECB 加解密、媒体上传下载             │
│  clawbot-login.ts 扫码登录状态机                               │
│  clawbot-inbound.ts  入站消息解析 → 附件装配                    │
│  clawbot-outbound.ts 回复清洗/分段/图片还原 → sendmessage      │
│  clawbot-store.ts    三张表的 CRUD（凭据密文）                 │
│  clawbot-ipc.ts      registerClawbotIpc（照 deck-ipc 范式）    │
└──────────────┬─────────────────────────────────┬────────────┘
               │ 直接 import 调用                 │ webContents.send 广播
               ▼                                 ▼
   chat-engine.sendMessage(opts, null)   clawbot:status / clawbot:peerMessage
   （注入审批决策器 approvalDecider）     渲染层 stores/clawbot.ts（常驻监听）
               │                                 ▼
               ▼                          views/clawbot/ClawbotView.vue
   回复落本地 SQLite → getMessages 取回 → outbound 清洗 → 回发微信
```

关键架构事实（均已代码确认）：

- 对话引擎在主进程，渲染层只是经 `chat:*` IPC 的瘦客户端；`ChatView` 卸载不 abort，`chat:stream` 监听 app 级常驻（`chat.ts:401-417`）；`window-all-closed` 空处理器 + 托盘常驻（`main/index.ts:503, 225-240`）。
- `sendMessage` resolve 恒为 `undefined`；仅 3 种 throw（Bot not found / Conversation not found / 未选模型，`chat-engine.ts:717-734`）；LLM 失败不 reject，错误落库为 `[Error] ...` 开头的 assistant 消息（`chat-engine.ts:1621-1626`）——桥靠完成后读 `getMessages` 末条判定成败。
- 同会话连发会 abort 旧轮（`replaced`，`chat-engine.ts:745-751`）→ 桥必须按微信用户 FIFO 串行。
- `window=null` 时工具审批 fail-closed 自动拒绝（`chat-engine.ts:335-339`）→ §6 的审批决策器改造。

## 4. 数据设计（账号库新增三张表）

落库惯例（已确认）：**双写**——① `resources/schema.sql` 末尾追加权威 `CREATE TABLE IF NOT EXISTS`（带中文列注释，ewei 先例 schema.sql:519-557）；② `runMigrations()` 末尾（`database/index.ts:637` 之后、638 闭括号之前）加同款幂等 `db.exec` 兜底块。新表不注册进 `sync/registry.ts` 的 SYNC_ENTITIES，即不参与云同步（凭据密文本来跨设备不可解，registry.ts:11-21 有同款排除先例）。备份为整库快照，新表自动包含，无需登记。

```sql
-- 微信 ClawBot 连接（一行为一个扫码绑定的微信 Bot）
CREATE TABLE IF NOT EXISTS clawbot_connections (
  id TEXT PRIMARY KEY,                    -- uuid
  ilink_bot_id TEXT NOT NULL DEFAULT '',  -- xxx@im.bot，每次扫码登录会变，更新而非新建
  ilink_user_id TEXT NOT NULL DEFAULT '', -- 扫码者微信 id
  baseurl TEXT NOT NULL DEFAULT '',       -- confirmed 返回的 baseurl（可覆盖默认域名）
  bot_token_enc TEXT NOT NULL DEFAULT '', -- bot_token 密文（encryptSecret，v1:iv:tag:ct）
  bot_id TEXT NOT NULL DEFAULT '',        -- 绑定的本地智能体 bots.id
  enabled INTEGER NOT NULL DEFAULT 1,     -- 总开关
  status TEXT NOT NULL DEFAULT 'offline', -- offline/connecting/online/paused/expired
  get_updates_buf TEXT NOT NULL DEFAULT '',-- 长轮询游标，每轮持久化，重启续传
  paused_until TEXT NOT NULL DEFAULT '',  -- errcode=-14 后的暂停截止时刻（ISO）
  last_error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 微信联系人 → 本地会话映射（上下文连续性靠它）
CREATE TABLE IF NOT EXISTS clawbot_peers (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,            -- FK clawbot_connections.id
  peer_id TEXT NOT NULL,                  -- 微信 from_user_id（如 o9cq80xxx@im.wechat）
  conversation_id TEXT NOT NULL DEFAULT '',-- 映射的本地会话 conversations.id
  last_context_token TEXT NOT NULL DEFAULT '',-- 最新入站消息的 context_token（回复必用最新）
  last_message_at TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(connection_id, peer_id)
);
CREATE INDEX IF NOT EXISTS idx_clawbot_peers_conn ON clawbot_peers(connection_id);

-- 消息流水（UI 日志页 + 排障），定期清理
CREATE TABLE IF NOT EXISTS clawbot_logs (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL DEFAULT '',
  peer_id TEXT NOT NULL DEFAULT '',
  direction TEXT NOT NULL DEFAULT 'in',   -- in/out
  msg_type TEXT NOT NULL DEFAULT 'text',  -- text/image/file/voice/video/system
  summary TEXT NOT NULL DEFAULT '',       -- 内容摘要（截断 200 字）
  status TEXT NOT NULL DEFAULT 'ok',      -- ok/error/dropped
  error TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_clawbot_logs_created ON clawbot_logs(created_at);
```

凭据加密：`import { encryptSecret, decryptSecret } from './matting-providers'`（AES-256-GCM，key=scrypt(deviceId)，`matting-providers.ts:73-95`；ewei-connectors.ts:6 同款复用）。解密失败按 `ewei-connectors.ts:246-253` 先例转成中文可操作提示（「请重新扫码绑定」）。

配置项（账号库 settings 表，`getSetting/setSetting`）：
- `clawbot_approval_whitelist`：JSON，审批白名单配置（见 §6），缺省值内置。
- `clawbot_daily_send_count` / `clawbot_daily_send_date`：日发送计数（风控，见 §12）。

## 5. 主进程模块设计（新增 `src/main/services/clawbot/` 目录）

### 5.1 `ilink-api.ts` — 协议封装

纯协议层，不碰 DB。全部请求走全局 fetch + AbortController 超时（项目无 axios/代理，`llm.ts:381-397` 的超时纪律先例）。

```ts
// 公共请求头构造：Content-Type / AuthorizationType: ilink_bot_token /
// Authorization: Bearer <token> / X-WECHAT-UIN: base64(随机uint32十进制串) /
// iLink-App-Id: bot / iLink-App-ClientVersion: uint32(0x00MMNNPP)
// 每个 POST body 必带 base_info: { channel_version: '2.4.3', bot_agent: '<UA≤256B ASCII>' }

getBotQrcode(baseurl): Promise<{ qrcode, qrcodeImgContent }>          // GET/POST /ilink/bot/get_bot_qrcode?bot_type=3
getQrcodeStatus(baseurl, qrcode, verifyCode?): Promise<QrStatus>      // GET 35s 长轮询；状态枚举 wait/scaned/need_verifycode/scaned_but_redirect/binded_redirect/verify_code_blocked/expired/confirmed
getUpdates(baseurl, token, buf, timeoutMs=40000): Promise<{ ret, errcode, msgs, getUpdatesBuf }>  // POST，客户端超时=35s+5s
sendMessage(baseurl, token, msg): Promise<{ ret, errmsg }>            // POST，15s 超时
getUploadUrl(baseurl, token, req): Promise<{ uploadParam, uploadFullUrl }>  // POST，15s
getConfig(baseurl, token, ilinkUserId, contextToken?): Promise<{ typingTicket }> // POST，10s
sendTyping(baseurl, token, ilinkUserId, ticket, status: 1|2): Promise<void>      // POST，10s
```

类型文件 `ilink-types.ts`：`WeixinMessage` / `MessageItem`（type 1TEXT/2IMAGE/3VOICE/4FILE/5VIDEO）/ `CDNMedia`（encrypt_query_param / aes_key / encrypt_type / full_url）/ `TextItem|ImageItem|VoiceItem|FileItem|VideoItem`。字段结构以官方 npm 包 `@tencent-weixin/openclaw-weixin` 源码为准（调研已逐字段核读）。

### 5.2 `ilink-cdn.ts` — 媒体加解密与传输

Node `crypto` 实现 AES-128-ECB + PKCS7：

- `decryptMedia(buf, aesKey): Buffer`；密钥两编码兼容：base64 解出 16 字节直接用（图片），base64 解出 32 字符 hex 串再 fromhex（文件/语音/视频）；入站图片优先用 `ImageItem.aeskey`（hex）。
- `downloadMedia(cdn: CDNMedia): Promise<Buffer>`：`full_url` 优先，缺省拼 `{cdn_base}/download?encrypted_query_param=...`。
- `uploadMedia(buf, aesKeyHex, uploadUrl): Promise<string>`：PKCS7 补长到 16 倍数 → AES-128-ECB 加密 → POST `application/octet-stream` → **从响应头 `x-encrypted-param` 取下载参数**（缺失视为失败；错误在响应头 `x-error-message`）；重试最多 3 次，4xx 停、5xx 重。
- `prepareUpload(...)` 辅助：rawsize / rawfilemd5(明文MD5 hex) / filesize(密文大小) / filekey(16B随机hex) / aeskey(16B随机)。

### 5.3 `clawbot-login.ts` — 扫码登录状态机

状态：`idle → qr_ready → scanned → need_verifycode → confirmed / expired / blocked`。
纪律：二维码 TTL 5 分钟，expired 最多刷新 3 次，总等待上限 8 分钟；`scaned_but_redirect` 切换 baseurl 到 `https://{redirect_host}`；confirmed 拿 `bot_token / ilink_bot_id / ilink_user_id / baseurl` 写库（encryptSecret 密文）并触发桥启动。状态变化全程经 `clawbot:status` 广播给渲染层。

### 5.4 `clawbot-bridge.ts` — 主编排（核心）

模块级单例，对外导出：

```ts
export async function startClawbotBridge(): Promise<void>   // 启动全部 enabled=1 连接的轮询（进程启动/热切换后/登录成功后调用）
export function stopClawbotBridge(): void                   // abort 全部 inflight、清 timer（热切换/before-quit/登出调用）
export function getClawbotState(): ClawbotState             // IPC 用：连接状态+绑定+统计
```

每连接一个运行单元：

- **长轮询循环**：`getUpdates`（40-45s 超时）→ 处理 msgs → **每轮先持久化 `get_updates_buf` 再处理消息**（防重复消费；崩溃最多重放一轮，配合 message_id 去重）。网络失败退避：连续 1-2 次等 2s，≥3 次等 30s（官方 SDK 节奏）。循环体包 `runInEpoch`（防热切换串库，`video-generation.ts:763-787` 的「停+包」双保险模板）。
- **-14 会话失效**：置 `status='expired'`、`paused_until=now+60min`，停轮询，广播状态 + 系统通知「微信 ClawBot 已掉线，请重新扫码」（Notification 先例 `main/index.ts:243-258`）；到期后尝试用残 token 重连一次，失败则保持 expired 等待用户重扫。
- **入站去重**：connection 级 Set 缓存最近 500 个 `message_id`（重启后靠游标兜底，允许极端情况下一条重复）。
- **群消息丢弃**：`group_id` 非空直接记日志 dropped（官方未开放群聊）。
- **按 peer FIFO 队列**：`Map<peerId, Promise链>`，同一微信用户的消息串行处理（规避同会话 `replaced` 打断）；不同 peer 并行，全局并发上限 3。
- **单条处理流水线**：
  1. 取/建 peer 映射：无映射则 `createConversation(botId, '微信-<peerId后6位>', { provider_id, model_id })`（initialModel 取自绑定 bot 的 `model_provider_id/model_id`，保证模型回退链非空，`chat-engine.ts:729-734`），写 `clawbot_peers`。
  2. inbound 解析（§5.5）得 `{ content, attachments }`。
  3. `sendtyping(1)` + 5s keepalive（ticket 由 getconfig 拿、按用户缓存 24h）。
  4. `await sendMessage({ conversationId, botId, content, attachments, approvalDecider: bridgeDecider }, null)`。
  5. `getMessages(conversationId)` 取末条 assistant → outbound（§5.6）→ `sendmessage` 回发（context_token 用该 peer 最新入站值）。
  6. `sendtyping(2)`；写 `clawbot_logs`；广播 `clawbot:peerMessage`（含 conversationId，供对话页刷新）。
  7. 异常兜底：任何一步抛错 → 回发一条中文错误提示（「处理出错，请稍后再试」），记日志 error，队列继续。
- **失败判定**：末条 assistant content 以 `[Error] ` 开头 → 转译中文友好文案（余额不足/模型报错/超时分类）；`[已中断]`/`[上一轮已被新消息中断]` 标记同类转译。

### 5.5 `clawbot-inbound.ts` — 入站消息解析

| 微信类型 | 处理 |
|---|---|
| TEXT | 直接作 content |
| IMAGE | 下载解密 → `nativeImage` 缩放到 ≤1024px、JPEG 80（复刻 ChatView.vue:1200-1221 压缩语义）→ `{ name, type:'image', data:'data:image/jpeg;base64,...' }`（`isImageAttachment` 硬要求 `data:image/` 前缀，`chat-engine.ts:658-660`） |
| FILE | 扩展名在文档白名单（txt/md/pdf/doc/docx/xls/xlsx/csv/json）→ 下载解密 → `parseDocumentFromBuffer`（document-parser.ts，ipc/index.ts:268-271 底层同款）→ `{ name, type:'document', data:text }`（>8000 字符引擎自动 RAG）；非白名单 → 降级为文字说明「[收到文件: xxx.zip，暂不支持该类型]」 |
| VOICE | `VoiceItem.text`（服务端 ASR）非空 → content 加前缀「[语音转文字]」；为空 → 回复「暂不支持语音消息，请发文字」 |
| VIDEO | 降级回复「暂不支持视频消息」 |
| 引用(ref_msg) | 被引用内容有文本时拼入上下文：`> 引用：...\n\n正文` |

### 5.6 `clawbot-outbound.ts` — 回复清洗与回发

- **markdown 降级**（照官方 `markdown-filter` 规则）：保留代码块/行内代码/表格/粗体；剥 H1-H6 标题标记、CJK 斜体标记；**`![图片](url)` 语法整体抽出**，图片单独发；`[text](url)` 保留原文（微信侧不可点，必要时转成 `text: url` 纯文本）。
- **图片抽取**：扫描 `![alt](url)`——`local-file://img?p=<encoded>` 读磁盘文件（image_gen 产物格式，`core-tools.ts:962-968`）；`http(s)` 图尝试下载（5s 超时，失败则弃图保留文字）；逐张走 `getuploadurl → uploadMedia → sendmessage`（media_type=1，每图独立一条消息，独立 client_id）。
- **长文本分段**：按段落切，单段 ≤1800 字，段间间隔 ≥1s（协议无官方上限，防御性分段）。
- **发送纪律**：`from_user_id:''`、`message_type:2`、`message_state:2`、`client_id:'local-agent-<hex>'` 防重、`context_token` 用最新——**缺任一必填字段会 HTTP 200 但静默丢失**，封装层做字段断言 + 写日志。
- **全局限流**：发送间隔 ≥1s；日计数写 settings，超阈值（默认 450，可配）暂停外发并提示（社区经验值，风控见 §12）。

### 5.7 `clawbot-store.ts` — 表 CRUD

`getDatabase()` prepared statements（唯一读库入口，`database/index.ts:16`）。Summary 类型不含 `bot_token_enc`，密文永不下发渲染层（ewei 的「脱敏在 IPC 层完成」先例，`ipc/index.ts:1464`）。含日志清理：`pruneClawbotLogs()` 保留最近 7 天，启动时跑。

### 5.8 `clawbot-ipc.ts` — IPC 注册

照 deck-ipc 范式：`export function registerClawbotIpc(ipcMain: IpcLike)`，在 `registerIpcHandlers()` 内用已 wrapWithEpoch 的 ipcMain 调用（`ipc/index.ts:90` 的 registerDeckIpc 旁）。

## 6. 对话引擎最小改造（审批决策器注入）

用户拍板「桥内自动审批白名单」，而 `window=null` 时 `requestToolApproval` 硬编码 fail-closed（`chat-engine.ts:335-339`），需一处最小侵入改造：

1. `SendMessageOptions`（chat-engine.ts:619-629）新增可选字段：
   ```ts
   approvalDecider?: (req: { name: string; args: any }) => boolean
   ```
2. `requestToolApproval` 的 `window=null` 分支：存在 `approvalDecider` 时改为 `resolve(decider({name, args}))`（decider 抛错按 false）；不存在则保持现状 fail-closed。**向后兼容，渲染层路径零影响**。
3. 桥内置默认白名单 `bridgeApprovalDecider`（可被 settings 的 `clawbot_approval_whitelist` JSON 覆盖）：
   - 自动批：`file_ops` 写类且目标在**该会话工作区内**（`workspaces/<conversationId>`，`createConversation` 已预建）；内置小工具（get_current_time/calculator/fetch_webpage/json_tool/text_tool/random_generator）；其余 `needsApproval` 返回 false 的工具本来就不会进审批（kb_*/use_skill/image_gen/ask_user/readOnlyHint MCP，chat-engine.ts:274-292）。
   - 自动拒：`run_command`（恒批类，远程触发执行命令风险不可接受）、`file_ops` 写工作区外、全部 `deck_*`、无 readOnlyHint 的 MCP 工具。
4. 绑定页展示白名单说明文案（「微信对话将自动批准工作区内文件操作与只读工具，命令执行一律拒绝」）。

配套约定（绑定智能体时校验并提示）：绑定 bot 的 `tool_approval` 建议保持 `'destructive'`；`enable_deck` 建议关（deck_* 全需批且微信场景无用）；`prompt_skill_dirs` 空 = 暴露全部技能（`chat-engine.ts:2012-2015`），收紧须传非空子集（`[]` 不是禁用，计划与 UI 提示都要写清这个反直觉语义）。

## 7. IPC 接口清单（`clawbot:*`）

| Handler | 说明 |
|---|---|
| `clawbot:getState` | 连接状态机 + 绑定 bot + 今日已发计数 + peer 数 |
| `clawbot:startLogin` | 启动扫码登录状态机（状态经推送返回） |
| `clawbot:cancelLogin` | 取消进行中的扫码 |
| `clawbot:logout` | 清 token、停轮询、置 offline（保留 peer 映射） |
| `clawbot:bindBot` | (connectionId, botId)，换绑不重建会话 |
| `clawbot:createDefaultBot` | 一键新建「微信助手」并绑定（见 §9.3） |
| `clawbot:setEnabled` | 总开关 |
| `clawbot:listPeers` | 映射列表（peerId、会话标题、最近消息时间） |
| `clawbot:resetPeerConversation` | 断开映射并下次消息新建会话（「清空上下文」） |
| `clawbot:listLogs` | 日志分页（created_at 游标） |
| `clawbot:getApprovalPolicy` / `clawbot:setApprovalPolicy` | 白名单读写 |

推送通道（全窗口广播，`ewei-client.ts:78-86` 样板）：`clawbot:status`（连接/登录状态机）、`clawbot:peerMessage`（一轮完成，含 conversationId 与摘要）。

## 8. 渲染层设计

### 8.1 preload

照 ewei 新惯例（`preload/index.ts:188-200`）加 `clawbot` 域：泛型 `invoke` + `onStatus(cb)` / `onPeerMessage(cb)` 返回 unsubscribe。类型走 `(window as any).api.clawbot` any 桥接（`stores/ewei.ts:4-5` 先例，不改 env.d.ts）。

### 8.2 store（`stores/clawbot.ts`）

setup 语法；常驻监听模式：`initClawbotListeners()` 幂等 ready 标志、永不退订（照 `chat.ts:408-478`），由 ClawbotView onMounted 安装。`onPeerMessage` 里若 `chatStore.currentConversationId === payload.conversationId` 则触发 `chatStore` 重拉 `getMessages`（对话页实时可见微信轮次）；同时刷新会话列表。

### 8.3 页面（`views/clawbot/ClawbotView.vue`）

区块：连接状态卡（状态灯 + ilink_bot_id + 今日已发计数 + 总开关）、扫码登录卡（二维码 + 状态文案 + 取消；二维码由 `qrcode` npm 包把 `qrcode_img_content` 链接转 dataURL，**新增渲染层依赖 `qrcode`**）、智能体绑定卡（下拉选现有 bot + 「新建微信助手」按钮 + 白名单说明）、联系人映射列表（peerId、会话标题、最近消息、「清空上下文」按钮）、消息日志列表（方向/类型/摘要/状态/时间，分页）。

### 8.4 路由与导航

- 路由（`router/index.ts`，ewei 页组 127-153 旁）：`{ path: 'clawbot', name: 'clawbot', component: () => import('@/views/clawbot/ClawbotView.vue'), meta: { title: '微信 ClawBot' } }`。**不加云端权限门控**（本地功能，避免云端改动；后续商业化再议）。
- 侧栏（`MainLayout.vue:208-262` allNavItems）：新增叶子项 `{ path: '/clawbot', label: '微信 ClawBot', icon: IconClawbot }`，新图标 `components/icons/IconClawbot.vue`（简洁线条 SVG，遵守「禁 AI 风格图标、禁 emoji」设计规则）。

## 9. 生命周期集成清单

| 挂点 | 位置 | 动作 |
|---|---|---|
| 进程启动 | `main/index.ts:366-397` runInEpoch 块内（startAutoDownloadScheduler:390 旁） | `startClawbotBridge()` + `pruneClawbotLogs()` + 僵尸状态清理（残留 connecting → offline，照 cleanupStaleGenerations 先例） |
| 账号热切换-停 | `account-context.ts:218-225` 清场段（closeDatabase 前） | `stopClawbotBridge()` |
| 账号热切换-启 | `account-context.ts:235` 后 | `startClawbotBridge()` + 僵尸清理（热切换不重启进程，两处都要调） |
| 退出 | `main/index.ts:505-512` before-quit | `stopClawbotBridge()` |
| 登出 | `cloud:setToken` 清空路径 | `stopClawbotBridge()`（token 失效模型必败，直接停） |

### 9.3 默认「微信助手」智能体

`createBot`（`bot.ts:83-136`，仅 name 必填）：`{ name:'微信助手', description:'微信 ClawBot 默认智能体', tool_approval:'destructive', enable_image_gen:1, enable_deck:0, skill_ids:[], mcp_ids:[], kb_category_ids:[], prompt_skill_dirs:['<收紧子集或留空>'] }`，模型字段留空走「云控端 chatDefaultModel → 本地第一个 chat 能力模型」解析链（ChatView.vue:983-1014 同款逻辑抽到主进程或桥内简化版：取已授权模型列表第一个 chat 模型写 bot.model_*）。幂等：按 name='微信助手' 查找复用。人设 persona 可选（`persona_id` → personas.system_prompt），首期留空。

## 10. 风控与合规

- 发送间隔 ≥1s、日上限默认 450 可配（社区经验值；官方未公布）。
- 绑定页固定展示合规提示：灰度功能（微信 8.0.70+，我→设置→插件）、禁止营销/骚扰用途、消息经腾讯服务器、token 约 24h 可能掉线需重扫。
- 日志只存摘要（200 字截断），媒体不落盘（解密后内存转 base64/文本即用即弃；生图回传是读既有产物文件）。
- 内容安全依赖模型侧与腾讯侧既有机制，桥不做额外过滤。

## 11. 分期实施计划

> 用户已拍板「一次到位」，以下为内部交付顺序，每期可独立编译验证。估算为单人工作日。

**P0 准备（0.5d）**
- [ ] `services/clawbot/` 目录骨架 + `ilink-types.ts`（协议类型全集）
- [ ] 渲染层加依赖 `qrcode`
- [ ] 三张表双写落库（schema.sql + runMigrations 兜底块）
- 验收：`npm run build` 通过；新库/旧库启动均建表成功

**P1 协议层（2.5d）——全项目最重头**
- [ ] `ilink-api.ts` 七端点 + 请求头/base_info 封装 + 超时纪律
- [ ] `ilink-cdn.ts` AES-128-ECB 加解密（两编码兼容）+ 上传下载（x-encrypted-param 响应头）
- [ ] `clawbot-login.ts` 扫码状态机（QR 刷新/配对码/redirect/confirmed 落库）
- [ ] `getUpdates` 长轮询循环 + 游标持久化 + 退避 + 回声自测（先 echo 文字验证全链路）
- 验收：真实灰度微信号扫码 → 发文字 → 收到 echo 回复；重启进程游标续传不重复收

**P2 对话桥接（1.5d）**
- [ ] `clawbot-store.ts` CRUD + 脱敏 Summary
- [ ] peer 映射建会话（initialModel 兜底链）+ FIFO 队列 + 并发上限
- [ ] `sendMessage` 注入 + 完成后 getMessages 取回复 + 文字回发 + context_token 缓存
- [ ] chat-engine `approvalDecider` 改造 + 桥内白名单 + settings 覆盖
- [ ] sendtyping（getconfig ticket 缓存 + 5s keepalive）
- [ ] -14 失效处理 + 错误转译（[Error]/[已中断]）
- 验收：微信发文字 → 桌面端聊天页可见完整轮次 → 微信收到回复；需审批工具按白名单自动批/拒

**P3 多媒体（1.5d）**
- [ ] 入站：图片下载解密 + nativeImage 压缩 + image 附件；FILE → parseDocumentFromBuffer → document 附件；VOICE 降级；VIDEO 降级；引用消息
- [ ] 出站：markdown 降级清洗 + 分段 + `![img](local-file://…)` 还原读盘 → 微信 CDN 上传发图；http 图下载转发
- [ ] 全局限流 + 日计数
- 验收：微信发图/发 PDF → 对话正确理解并回复；对话生图 → 微信收到图片消息

**P4 UI（1.5d）**
- [ ] preload 域 + stores/clawbot.ts（常驻监听 + 对话页联动刷新）
- [ ] ClawbotView.vue 五区块 + 路由 + 侧栏项 + 图标
- [ ] 系统通知（掉线/重连成功）
- 验收：扫码登录全流程 UI 可操作；关窗后微信对话继续，回桌面端记录完整

**P5 加固与联调（1.5d）**
- [ ] 生命周期挂点全部接入（启动/热切换/退出/登出）+ 僵尸清理双调用
- [ ] 压测：连续 20 条消息排队、3 人并行、大文档、大图、断网恢复
- [ ] 边界：token 过期重扫、换绑 bot、清空上下文、账号热切换后旧连接不串库（epoch）
- [ ] 发版三处同步：package.json version、CHANGELOG.md（研发档案）、shared/changelog.ts（用户文案）

**合计：约 8.5 个工作日**（不含等待灰度微信号的联调窗口）。

## 12. 测试与联调

项目无测试框架（package.json 无 test 脚本）。策略：
- 协议纯函数（AES 加解密/两编码兼容/markdown 清洗/分段/消息解析）写 `scripts/clawbot-selftest-*.mjs` 临时脚本验证，**执行成功后删除**（项目清理规则）。
- 联调清单（前置：一个有 ClawBot 插件入口的灰度微信号）：登录（含过期刷新/配对码）→ 文字/图片/文件/语音/视频/引用 → 断线重连 → -14 → 重启续传 → 关窗继续 → 账号热切换 → 审批白名单生效路径逐项。

## 13. 风险与开放问题

| 风险 | 缓解 |
|---|---|
| 无灰度微信号无法联调 | 开工前置确认；协议层可先用 mock server 自测 |
| bot_token 有效期官方未公布（社区称 24h） | -14 自动暂停 + 状态 UI + 一键重扫；连接记录更新而非新建 |
| `from_user_id` 跨重扫是否稳定未确认 | P2 联调验证项；若不稳定，映射键改为「稳定标识 + 重扫后迁移」 |
| 发送字段缺失静默丢失（HTTP 200） | 发送封装字段断言 + 每条写日志 + 联调用真实对话验证投递 |
| 会话模型不支持视觉时图片轮次上游报错 | 绑定页提示选视觉模型；[Error] 转译提示 |
| `prompt_skill_dirs` 空=全技能暴露的反直觉语义 | 绑定页与默认 bot 创建时显式处理，注释写清 |
| 桌面端须开机且云控登录（模型走云网关必须 token） | 绑定页明示「电脑关机或退出登录时微信侧暂停服务」 |
| 腾讯单方变更协议/灰度回收 | 协议层隔离在 ilink-* 两文件，桥接逻辑不耦合 |

## 14. 已知协议限制备忘（写代码时对照）

- 不可发语音、链接卡片；链接不可点；群聊未开放；无历史消息 API（断档期消息丢失可接受）。
- 每次扫码 ilink_bot_id 都变；context_token 不可复用旧消息的。
- `qrcode_img_content` 是 URL 不是图片，需自行渲染二维码。
- typing_ticket TTL 24h；CDN 上传 4xx 不重试、5xx 最多 3 次。
- 长轮询失败退避：1-2 次等 2s，≥3 次等 30s。
