# Local Agent Desktop Changelog

本文档记录桌面端版本变更历史。版本号遵循语义化版本（SemVer）规范：`MAJOR.MINOR.PATCH`。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

---

## [0.7.19] - 2026-06-07

> **配合云控端 1.5.39：AI 视频可使用云端新接入的服务商（桌面端无代码改动）**：云控端 1.5.39 预置了一个 OpenAI 兼容的视频服务商（New API 中转）。云控端管理员填写自己的接口密钥并启用后，桌面端「AI 视频」即可直接使用其提供的 Seedance 2.0 等模型，无需桌面端升级。本版桌面端无功能代码改动，仅记录该云端联动变化。

## [0.7.18] - 2026-06-06

> **灵感广场 / 创意模板 / 智能体市场列表改用缩略图**：三处网格列表改为「缩略图优先、原图回退」，详情与灯箱仍用原图，显著降低列表加载流量。缩略图由上传端生成、云控端原样存为独立文件，对存储后端（local / COS / OSS）零特性要求；旧记录无缩略图时自动回退原图，不影响显示。需配合云控端 1.5.35。

### 新增

- **云端知识库在线检索（hybrid，需配合云控端 1.5.36）**：智能体可在云控端绑定知识库；用户从市场获取该智能体后，对话时桌面端在线检索其绑定的云端知识库并注入上下文，权限随智能体授权传递，知识内容留在云端。
  - `bots` 表新增 `cloud_kb_ids` / `cloud_kb_only` / `cloud_kb_top_k`；新增 `cloud_kb_cache` 表（schema.sql + `database/index.ts` 幂等迁移）；`main/services/bot.ts` 同步类型与 CRUD。
  - 新增 `main/services/cloud-kb-search.ts`（调云控端 `POST /api/client/knowledge-bases/search`，`fetchWithCloudAuth`）+ `cloud-kb-cache.ts`（queryHash + 7 天 TTL 的命中片段缓存，断网/超时降级）。
  - `chat-engine.ts` 在本地 RAG 之外并列注入云端检索结果（命中标注来源 / 离线），`buildToolsList` / `executeToolCall` 透传 `cloudKbIds`，`kb_only` 约束扩展到云端库。
  - `core-tools.ts` 的 `kb_search` 改为同时检索本地与云端知识库并按分数合并；`cloud-agent-market.ts` 的 `importAgentAsLocal` 在 acquire 时写入 kb 绑定。
  - `renderer/stores/bots.ts` 同步类型；`BotListView.vue` 卡片加「云端知识库 N」徽标，`ChatView.vue` 工具栏只读提示已绑定云端知识库。
- **三大云端页面网格缩略图（上传端生成，零服务器依赖）**：
  - `main/services/thumbnail-upload.ts`（新）：用 Electron `nativeImage` 把原图等比缩放为 JPEG 缩略图（封面长边 720 / 头像 512，只缩不放），失败返回 null 由调用方跳过，云端与客户端均回退原图。
  - 三处投稿路径在发原图的同时附带缩略图：`cloud-inspiration.ts`（`cover_thumb`）、`cloud-creative-template-submit.ts`（`cover_thumb`）、`cloud-agent-submit.ts`（`avatar_thumb`，`loadAvatarBlob` 顺带回传 buffer）。
  - 三处 mapper 透传缩略字段：`main/services/inspiration.ts`（`fetchOnlineInspirations`）、`cloud-creative-template.ts`（`mapTemplate`）、`cloud-agent-market.ts`（`mapAgent`）；`renderer/stores/bots.ts` 的 `MarketAgent` 加 `avatar_thumb`。

### 改进

- **网格缩略优先、原图回退**：`renderer/views/image-gen/InspirationView.vue`（网格 `cover_thumb || cover_image`，详情大图不变）、`renderer/views/creative-templates/CreativeTemplatesView.vue`（`resolveCover` 云端项优先缩略图，本地模板无缩略则回退原图）、`renderer/views/bots/BotListView.vue`（市场卡片 `avatar_thumb || avatar`）。

### 修复

- **恢复「数据库备份」会误删非 DB 文件（数据安全）**：`backup/index.ts` 的 `doRestoreV1` 原先无差别归档 dataDir 全部根目录、只搬回 db → 恢复 db-only 备份后技能 / 图片 / 知识库源文件等被移入 `.restore-previous-*`（7 天后清理），与 UI「技能文件和图片不受影响」相反。现按 `manifest.type` 缩小范围：`auto` 仅替换 `local-agent.db`，`full` 仍精确镜像全部根条目。

### 增强（备份/恢复健壮性）

- **恢复中断自愈**：替换 dataDir 前写 `backups/.restore-in-progress.json` 标记（previous / staging / 受影响条目），成功或回滚后清除；主进程在 `getDatabase()` 之前同步调用 `recoverInterruptedRestore()`，崩溃 / 断电中断后下次启动自动把 previous 归档的恢复前数据搬回，闭合"半成品 dataDir"窗口（`backup/staging.ts` + `main/index.ts`）。
- **磁盘空间预检**：`backup/staging.ts` 新增 `getFreeSpace`/`ensureFreeSpace`（`statfsSync`，不支持则跳过）；`packV1` 在快照前（~db 大小）与写 zip 前（~totalSize）预检，`doRestoreV1` 解压前预检（~totalSize），空间不足提前给中文报错而非中途 ENOSPC。
- **孤儿备份回补**：`records.json` 损坏被隔离后磁盘上的 `*.zip/.sqlite/.bak` 会成孤儿（不显示、不清理）；启动 `reconcileOrphanBackups` 扫描回补（v1 读 manifest，legacy 用 mtime），重新纳入列表与 retention。
- **列表 / 保留排序按 createdAt**：`listValidRecords` 改为按 `createdAt` 倒序（原为 append 顺序 reverse）；外部「从文件恢复」导入的备份 `createdAt` 改用导入时间，避免按原始旧时间被 retention 提前清理或在列表错位。

## [0.7.17] - 2026-06-04

> **智能体市场：付费购买 + 定向可见**：从市场「保存到本地」前先经云控端 `acquire` 校验——收费智能体扣金币 / 积分（余额不足弹「前往充值」引导）、定向智能体仅被授权的用户 / 用户组可见可存；收费智能体购买后才下发系统提示词，删本地后重存不重复扣费。需配合云控端 1.5.34。
>
> **新增「精细抠图」+ 原「AI 抠图」更名「快速抠图」**：精细抠图对接抠抠图（koukoutu）高清抠图，按上传图片长边尺寸三档计费（4K 以下 / 4K–8K / 8K 以上，后台自定义价格），仅云端中转、全站并发 5；原「AI 抠图」更名「快速抠图」，两者并存。两套抠图的报错 / 余额不足提示同步中文友好化。
>
> 本版另含图生图手动中止生成中任务 + 队列记录管理、AI 视频参考图上传前自动压缩、长任务历史上下文自动精简、超大工具结果转存文件等改进（详见应用内「更新日志」）。

### 新增

- **精细抠图（抠抠图 koukoutu，按尺寸三档计费）**：
  - 新增独立「精细抠图」：`renderer/views/fine-matting/FineMattingView.vue` + `renderer/stores/fine-matting.ts` + 主进程 `services/fine-matting.ts` / `services/cloud-fine-matting.ts` + `fineMatting:*` IPC + preload / `env.d.ts` 命名空间 + 本地 `fine_matting_tasks` 表（`schema.sql` / `database/index.ts`）+ 图库「我的精细抠图」分类（`gallery.ts`）+ 图标 `IconFineMatting.vue` + 路由 `/fine-matting` + 侧栏菜单（受 `allow_fine_matting` 控制）。
  - 对接抠抠图通用抠图异步 API（create → poll，Image File 模式，输出透明 PNG），仅云端中转、API Key 不下发桌面端；结果落 `dataDir/fine-matting/` 并自动归档。
  - 按上传图片长边尺寸三档计费（默认 <4096 / 4096–7680 / ≥7680，阈值与三档积分价均后台可配）；待处理缩略图实时显示档位 + 预估价。
  - 原「AI 抠图」更名为「快速抠图」（菜单 / 路由标题、`DesktopMenuController` 文案；路由 `/ai-matting` 与本地数据不变）。
  - 需配合云控端：网关 `/gateway/fine-matting/*`、管理后台「精细抠图」、权限 `allow_fine_matting` + `fine_matting_quota_per_month`。

- **智能体市场付费购买 + 定向可见**：
  - `main/services/cloud-agent-market.ts`：列表 / 详情请求改带云端 token（`getCloudToken`）——登录后按可见范围过滤并取得 `is_owned`，未登录仍可浏览公开智能体；`CloudAgent` 加 `price` / `price_balance_type` / `is_owned`；新增 `acquireAgent`（`POST /client/agents/{id}/acquire`，区分 401 未登录 / 403 无权限 / 402 余额不足）；`importAgentAsLocal` 改为「先购买 / 获取成功，再用服务端下发的完整数据（含购买后才返回的 `system_prompt`）建本地智能体」，删本地后重存不重复扣费。
  - `renderer/stores/bots.ts`：`MarketAgent` 加 `price` / `price_balance_type` / `is_owned`；`importFromMarket` 透传 `needLogin` / `needRecharge` / `forbidden` / `needed` / `current` / `balanceType`。
  - `renderer/views/bots/BotListView.vue`：市场卡片展示「价格 / 已拥有 / 免费」，按钮按是否收费显示「购买并添加」；保存流程处理未登录（引导登录）、无权限、余额不足（弹 `LowBalanceModal`），购买成功刷新余额。
  - `renderer/components/LowBalanceModal.vue`：新增「前往充值」按钮（此前仅「套餐商城」）。
  - 需配合云控端 1.5.34。

- **图生图手动中止生成中的任务（真中止 / 计费不返还）**：
  - `main/services/image-generation.ts`：新增 `GenerationCanceledError` 与 `genId → AbortController` 注册表，导出 `cancelGeneration` / `cancelGenerations`；`fetchWithTimeout` / `fetchWithRetry` / `pollAsyncTask` 全链路接入外部 `AbortSignal`——自定义渠道立即断开 HTTP 连接，云端 / 多米异步轮询用可打断的 `interruptibleSleep` 立即停止轮询，中止错误不参与退避重试、不计入瞬态失败；`callImageAPI` / `callCloudImageAPI` / `callDuoMiImageAPI` 透传信号；`generateImages.runOne` 为每个生成项注册 controller，捕获中止后标记 `status='canceled'`（区别于 `error`）并回发带完整记录的 `canceled` 进度事件，`finally` 注销句柄。
  - `main/ipc/index.ts`：新增 `imageGen:cancelGeneration` / `imageGen:cancelGenerations`。
  - `renderer/stores/image-gen.ts`：新增 `cancelGeneration`（占位卡乐观置 `canceling`，IPC 失败回滚）/ `cancelAllInFlight`；`onProgress` 处理 `canceled` 事件，用带真实参数（prompt / 模型 / 尺寸）的记录替换占位卡，便于查看 / 重新生成 / 删除。
  - `renderer/views/image-gen/ImageGenView.vue`：生成中卡片（网格 / 列表）新增「中止」按钮，新增「已取消」状态卡，队列区加「中止生成」批量入口；`isInFlightStatus` / `statusLabel` 纳入 `canceling` / `canceled`。
  - 计费不返还：仅断开桌面端本地请求并停止等待 / 落盘，已提交到云端 / 多米的异步任务上游若已执行仍照常扣费；未触碰云控端。

### 修复

- **画布 AI 视频带参考图生成报 `Failed to fetch`**：`views/canvas/composables/useWorkflowEngine.ts` 的 `dataUriToFile` 改用 base64 解码直接构造 `File`，替代原 `fetch(dataUri)`。图生视频 / 首尾帧模式上传参考图时，`fetch` 一个 `data:` URI 会被 Electron 生产 CSP 的 `connect-src`（仅 `'self' https: http:`，不含 `data:`）拦截，抛原生 `Failed to fetch` 致提交中止；改为本地解析 base64 绕开网络栈与 CSP（更高效、对大图更稳）。纯文生视频不受影响。
- **多入口 / 多会话生图进度卡片串台**：`renderer/stores/image-gen.ts` 的 `onProgress` 监听此前不区分来源，会把编辑页 / 聊天 / 画布的生图进度并入图生图列表的 `inFlight` 占位与顶部进度条；改为仅处理 `source==='image-gen' | 'batch'`。`renderer/components/ChatImageGenProgress.vue` 此前只按 `source==='chat'` 过滤、未按会话隔离（注释与实现不符），多会话同时生图时卡片会串台；改为按 `conversationId` 过滤 + 切换会话清空浮窗，`ProgressTask` 补 `conversationId` 字段。
- **刚登录即生图的错路由隐患**：`main/services/image-generation.ts` 云端生图分支，若 `cloudModels` 尚未从渲染端 IPC 同步到主进程（此时 `cloud_model_id` 必为 `null`），此前会照发请求、由云端按 `model_id` 兜底（多家同名服务商可能错路由 / 错扣费）；改为在模型缓存为空（明确未就绪）时抛「云端模型尚未同步完成，请稍候重试」，多家同名场景交由云端返回明确错误。

### 改进

- **快速抠图 / 精细抠图：报错与余额提示优化**：
  - 余额不足、配额用尽改中文友好提示（含所需 / 当前、已用 / 上限），不再显示英文 `Insufficient credit balance` / `Quota exceeded`；新增 `renderer/utils/matting-error.ts` 统一归类队列失败原因（余额 / 配额 / 繁忙 / 网络 / 超时 / 格式 / 登录）。
  - 云端处理阶段新增「处理中」进度相位；轮询超时文案改为「任务可能仍在云端处理，请稍后重试」。
  - 两页顶部新增服务状态条，批量结束给失败数量汇总；精细抠图提交前预检图片尺寸（测量完成才可提交、长边超 10000px 标红拦截）。

- **编辑页生图标记来源**：`renderer/views/image-gen/ImageEditView.vue` 重绘提交补 `progressContext.source='edit'`，避免被图生图 / 批量列表的进度监听误并入其 `inFlight`。
- **聊天生图默认 2K 档位**：`main/services/core-tools.ts` 的 `image_gen` 工具补默认 `tierId='2k'`（与画布节点一致；图片按 per-call 计费，分辨率档位不影响扣费）。
- **图生图队列记录可视化 + 单条移除**：`renderer/views/image-gen/ImageGenView.vue` 左侧原仅「清空队列」，扩展为完整排队记录列表（序号 / 提示词摘要 / 批量数 ×N + 逐条「移出队列」按钮，复用 store 既有 `removeFromQueue`），并保留「清空队列」；正在生成的任务通过卡片「中止」或队列区「中止生成」处理。
- **账单明细充值类记录文案中文化**：`renderer/components/BalanceLogsDialog.vue` 的 `changeTypeLabel` 补全 `recharge`（充值）/ `recharge_bonus`（充值赠送）/ `deduct`（扣减），不再回退显示英文 `change_type`；`displayRemark` 剥除备注内部技术前缀（`[tianque_sync]` / `[recharge]` / `[order]` / `[admin_sync]`），充值到账备注由 `[tianque_sync] PO… 充值到账` 变为 `PO… 充值到账`；筛选下拉补充「充值 / 充值赠送 / 扣减」三项（后端真实存在但此前缺失的 `change_type`）。
- **套餐商城 / 充值入口按云控端开关显隐**：`stores/site-config.ts` 解析公开配置新增 `plans_store` / `recharge`（token/credit）开关 + 本地缓存 + `hasAnyRecharge`；`UserCenterView.vue`（顶部与侧边栏「去套餐商城」、「充值」入口）、`LowBalanceModal.vue`（「套餐商城」「前往充值」按钮）、`RechargeView.vue`（按 `config.token/credit.enabled` 过滤充值 tab、选中类型被关时自动切到可用类型）据此显隐。配合云控端 1.5.34 的三个开关。

## [0.7.16] - 2026-06-04

> **智能体市场（桌面端）**：智能体页重构为「我的智能体 / 智能体市场」双 Tab，可从云控端上架的市场拉取智能体并「保存到本地」（自动建人格承载系统提示词、下载 2:3 形象图落盘、绑定 6 个内置小工具，并按 `cloud_agent_id` 去重）；本地智能体支持设置 2:3 形象图、发布到市场（投稿）+ 审核状态徽标 + 撤回、对市场智能体评分。需配合云控端 1.5.31。
>
> **修复对话内生图进度卡片潜在崩溃**：`ChatImageGenProgress.vue` 误用未 import 的 `watchEffect`，组件挂载时会抛 `ReferenceError`，已修复。

### 新增

- **智能体市场（云端创建 → 桌面端保存到本地）**：
  - `renderer/views/bots/BotListView.vue`：双 Tab（我的智能体 / 智能体市场）；本地卡片渲染 2:3 形象图（`local-file://`，无图回退首字母）+ 投稿状态徽标 +「发布到市场 / 撤回」；市场卡片展示形象 / 标签 / 评分 / 下载量 +「添加（保存到本地）」+ 评分弹窗（仅阴影无遮罩）；编辑表单新增 2:3 形象图上传（前端比例校验）。
  - `main/services/cloud-agent-market.ts`（新）：匿名拉取 `/public/agents` 列表 / 详情；`importAgentAsLocal` 保存到本地（建人格写 `system_prompt` → 建 bot 绑 6 个内置小工具 → 下载形象图落盘 → 下载量 +1 → 按 `cloud_agent_id` 去重）。
  - `main/services/cloud-agent-submit.ts`（新）：投稿 `submit` / 状态轮询 `status-batch` / 撤回 / 评分 `rate`（JWT）。
  - `main/services/bot-avatar.ts`（新）：2:3 形象图落盘 `{dataDir}/bot-avatars/`、远程下载、`data:URL` 落盘、删除清理。
  - `main/services/bot.ts` + `resources/schema.sql` + `main/database/index.ts`：`bots` 表加列 `avatar` / `source` / `cloud_agent_id` / `submission_*`（幂等迁移）；新增 `getBotByCloudAgentId` / `setBotSubmissionState`。
  - `main/ipc/index.ts`：新增 `bot:saveAvatar` / `bot:listMarket` / `bot:getMarket` / `bot:importFromMarket` / `bot:submitToMarket` / `bot:syncSubmissionStatus` / `bot:withdrawSubmission` / `bot:rate`；`bot:delete` 同步清理形象图文件。
  - `renderer/stores/bots.ts`：`Bot` 接口加市场字段，新增 `MarketAgent` 类型与市场 / 投稿 / 评分 actions。
  - 需配合云控端 1.5.31（智能体管理后台 + `/api/public|client|admin/agents` 接口）。

### 修复

- **对话内生图进度卡片潜在崩溃**：`renderer/components/ChatImageGenProgress.vue` 使用了未 import 的 `watchEffect`（且 `watch` 导入未用），组件挂载即抛 `ReferenceError`；改为正确 import `watchEffect`。

### 其他

- 清理两处既有未使用变量告警：`views/canvas/composables/useWorkflowEngine.ts`（`projectId` → `_projectId`）、`views/models/ModelView.vue`（移除未使用的 `normalizedApiBasePreview`）。

## [0.7.15] - 2026-06-04

> **知识库向量化失败不再「假就绪」**：整批向量化全部失败时（如云端向量服务返回异常），知识库不再被错误标记为 `ready`，改为如实置 `error` 并中断，避免到对话检索时才暴露；同时把上游 HTML 错误页归纳为可读提示。纯桌面端改动，后端零改动。
>
> **多米生图支持参考图**：补上「多米图片渠道带参考图」的桥接——参考图先转存为公网 URL 再提交，此前多米带参考图实际不生效（仅能纯文生图）。需配合云控端 1.5.29。
>
> **对话体验与安全加固**：消息顺序稳定、长命令不卡界面、中断/报错保留已生成内容、支持思维链展示、增量摘要修复记忆空洞；AI 读取工作区外文件需确认，设置页可配置可信目录白名单。

### 新增

- **文件读取安全（工作区外确认 + 可信目录白名单）**：
  - `main/services/chat-engine.ts`：`needsApproval` 在 `destructive` 模式下，对 `file_ops` 的读类操作（`read` / `read_json` / `list` / `glob` / `find_latest` / `tree`）若目标路径落在工作区外且不在白名单内，弹审批确认；工作区内与白名单目录内免确认。`stat` / `exists` 不拦。限制仅作用于模型发起的 `file_ops`，不影响附件解析、技能读资源目录等内部读取。
  - `main/services/core-tools.ts`：新增 `previewFileRead` / `FileReadPreview`，审批弹窗展示真实绝对路径及「工作区外」标记。
  - `renderer/views/chat/ChatView.vue`：审批弹窗新增读取文件预览分支。
  - `renderer/views/settings/SettingsView.vue`：新增「文件读取安全」区块，可信目录白名单（`settings.trusted_read_dirs` JSON 数组），添加/移除后自动保存。

- **多米生图支持参考图（base64 → 云端 URL 桥接）**：多米图片 API 上游只可靠接受图片 URL，`dataUri` / 裸 base64 会被其 nginx WAF 拒收或静默忽略参考图（此前 `callDuoMiImageAPI` 把参考图补成 dataUri 直传，实测无效，多米实际仅能纯文生图）。
  - `main/services/image-generation.ts`：新增 `uploadRefImageToCloud()`，参考图先 POST 到云控端 `client/images/reference-assets` 落对象存储换成公网 URL，再交给多米 `/generations`；`callDuoMiImageAPI` 改为「已是 http URL 直通，否则 `prepareRefImageForUpload` 取 buffer + mime → 上传换 URL」。临时素材 6h 过期、由云端 `video:purge-reference-assets` 自动清理。
  - 需配合云控端 1.5.29（新增 `client/images/reference-assets` 接口，与 `DuoMiAdapter` 的同源 base64→COS→URL 桥接配套）。

### 改进

- **对话上下文与多模态 token 管理**：
  - `main/services/chat-engine.ts`：图片 token 按 data URI 长度估算；历史消息仅保留最近若干轮用户消息中的图片，更早轮次替换为文字占位，降低上下文膨胀。
  - `main/services/chat-engine.ts` + `conversation-summary.ts` + `schema.sql` / `database/index.ts`：摘要改为增量生成，新增 `covered_count` 水位线，只压缩滑出窗口且尚未被摘要覆盖的段落，避免每轮全量重压与「滑出窗口却未进摘要」的记忆空洞。

- **LLM 思维链（reasoning）流式展示**：
  - `main/services/llm.ts`：解析 `delta.reasoning_content` / `delta.reasoning`，通过 IPC 推送 `reasoning` 事件。
  - `renderer/stores/chat.ts` + `views/chat/ChatView.vue`：对话中可展开查看「思考中… / 已深度思考」面板（流式 UI，不落库）。

- **套餐描述支持「展开 / 收起」**：新增可复用组件 `renderer/components/ExpandableText.vue`，折叠态用 `-webkit-line-clamp` 限制行数，配合 `ResizeObserver` + 高度测量判断文本是否真被截断，仅在溢出时才显示「展开 / 收起」按钮（短描述不显示按钮），并保留描述换行（`whitespace-pre-line`）。
  - `views/plans-store/PlansStoreView.vue`（套餐商店，折叠 2 行）与 `components/MyPlansBox.vue`（我的套餐，折叠 1 行）接入，替换原先的 `line-clamp` 纯截断标签。此前云控端套餐描述最多可填数百字，桌面端仅显示 1～2 行且无法查看完整内容。

### 修复

- **同时间戳消息顺序不稳定**：`main/services/conversation.ts` 的 `getMessages` 改为 `ORDER BY created_at ASC, rowid ASC`，一轮内 `assistant(tool_calls) → tool` 同步插入时 `created_at` 相同导致重建历史错乱的问题由 SQLite 隐式 `rowid` 兜底，无需新增 `seq` 列与迁移。
- **run_command 阻塞主进程**：`main/services/skill-sandbox.ts` 的 `execStructured` 由 `execSync` 改为异步 `exec`；`core-tools.ts` 的 `RUN_COMMAND_IMPL` 对应 `await`，长命令执行时界面不再卡死。
- **中断或 LLM 报错时丢失已生成内容**：`llm.ts` 在流式错误上附带 `__partialContent`；`chat-engine.ts` 落库保留片段；`stores/chat.ts` 在 `aborted` / `error` 时追加标记而非覆盖 `msg.content`。
- **整批向量化失败被静默标记为「就绪」（假就绪）**：`main/services/vectorize.ts` 在 `embeddedCount === 0`（所有分块均未成功向量化）时，将知识库状态由 `ready` 改为 `error` 并抛出明确错误（与「余额不足」等致命错误一致），不再出现"写入全 `null` 向量却标记就绪"的情况。此前云端向量服务异常时入库"看似成功"，直到对话 `kb_search` 检索才报错。新增 `lastBatchError` 记录最后一次非致命批次错误用于上报原因。
- **上游错误页被透传为大段 HTML**：`main/services/embedding.ts` 新增 `summarizeUpstreamErrorBody`，本地 / 云端向量请求失败且响应体为 HTML / XML 错误页时，归纳为「服务端返回 HTML 错误页而非 JSON…」的可读提示，否则截断前 300 字符，避免大段 HTML 刷屏。
- **向量源偏好被「登录态/权限」覆盖**：`renderer/views/settings/SettingsView.vue` 加载逻辑与 `vectorMode` watch 中，`cloud-locked` / `local-only` 仅纠正 UI 显示，不再持久化覆盖 `vector_source`（运行时 `getEmbeddingConfig` 已按登录态/权限兜底）；watch 回到 `dual` 时从持久化恢复显示值。修复「选了云端向量、token 过期后重启打开设置页，偏好被悄悄改成自定义且重新登录也回不来」的问题。
- **灵感广场分类筛选只过滤当前页**：`renderer/views/image-gen/InspirationView.vue` 此前 `fetchOnline` 不传 `category` / `search`，仅在当前页 40 条里前端 `filter`，导致选分类只显示当前页内属于该分类的记录。改为切分类 / 搜索（防抖 350ms）时重置到第 1 页、把 `category` / `search` 传给后端查询（对齐创意模板做法），列表直接渲染后端分页结果，并缓存所选分类 / 搜索以保证跨页面返回一致。

---

## [0.7.14] - 2026-05-30

> **流式画布「视频创作 + 智能分镜 + 角色一致性」**：在 0.7.13 的 AI 视频节点之上，补齐从「视频素材 → 关键帧 / 反推回喂」「小说 → 分镜」到「角色定妆图生成 / 复用」的完整创作链，后端零改动（仅画布本地服务与本地库扩展）。

### 新增

- **视频创作链节点**（`videoInput` / `videoFrames` / `videoReverse` / `storyboard`）：
  - `views/canvas/composables/useNodeTypes.ts`：新增上述 4 节点定义（`videoFrames` / `storyboard` 为 `dynamicOutputs`，每帧 / 每镜头一个 `output-{id}`）。
  - `views/canvas/composables/useVideoFrames.ts`（新）：纯前端抽帧（`fetch → blob → video.seek → canvas.drawImage → toDataURL`）。
  - `views/canvas/nodes/VideoInputNode.vue`（新）：导入本地视频并以 `video` 输出。
  - `views/canvas/nodes/VideoFramesNode.vue`（新）：均匀 / 按秒抽帧，逐帧落盘后按动态 handle 输出 image。
  - `views/canvas/nodes/VideoReverseNode.vue`（新）：抽代表帧 + 多模态反推，输出提示词 / 分镜 text。
  - `views/canvas/nodes/StoryboardNode.vue`（新）：小说 / 剧情 → 镜头提示词列表，逐镜头动态输出 text。
  - `views/canvas/composables/useWorkflowEngine.ts`：新增 `case 'videoFrames' / 'videoReverse' / 'storyboard'` 与对应 `executeVideoFramesNode` / `executeVideoReverseNode` / `executeStoryboardNode`；`getUpstreamData` 支持分镜文本 + videoFrames 动态图片、`getUpstreamImagesByHandle` 支持 videoFrames、新增 `getUpstreamVideo`。
  - `main/services/canvas.ts`：新增 `saveNodeVideo`（copyFile）、`saveNodeFrames`（批量落帧）。

- **角色一致性库**（`createCharacter` / `characterRef`）：
  - `main/database/index.ts`：新增 `canvas_characters` 表（项目级角色库）。
  - `main/services/canvas.ts`：`listCharacters` / `createCharacter` / `deleteCharacter` CRUD。
  - `main/ipc/index.ts`：`canvas:saveNodeVideo` / `saveNodeFrames` / `listCharacters` / `createCharacter` / `deleteCharacter`。
  - `views/canvas/nodes/CreateCharacterNode.vue`（新）：角色名 + 描述（或上游文本）→ 生成定妆图并入库，输出 image。
  - `views/canvas/nodes/CharacterRefNode.vue`（新）：从角色库下拉选角色，输出其定妆图作为下游参考图。
  - `views/canvas/composables/useWorkflowEngine.ts`：新增 `case 'createCharacter'`（`executeCreateCharacterNode`：生成定妆图 → 入库失败不阻断产出）与 `case 'characterRef'`（纯数据源）。
  - `CanvasEditorView.vue` / `stores/canvas.ts`：注册 6 个新节点、`getDefaultNodeData` 默认值、`cleanNodeData` 复制画布时保留可复用字段并清运行态。
  - **复制项目连角色库一起克隆**：`main/services/canvas.ts` 新增 `cloneCharacters`（复制角色行 + 把定妆图以 `char_{uuid}` 复制到新项目目录）+ `canvas:cloneCharacters` IPC；`stores/canvas.ts` 的 `duplicateProject` 在复制节点前先克隆角色库拿到旧→新映射，`cleanNodeData` 据此把 `characterRef` 节点的 `character_id` / `image_path` 重写到新项目，引用不再悬空。

### 修复

- **流式画布 AI 视频生成完成后账户余额不自动刷新**：`useWorkflowEngine.ts` 的 `applyVideoTaskToNode` 在任务首次进入完成态时调用 `refreshCloudBalances()`（仅「非完成→完成」刷一次），覆盖单节点后台轮询 / 工作流等待 / 重开恢复三条路径，对齐独立视频页与画布抠图节点。此前画布生成视频扣积分后，界面余额需手动刷新才更新（实际扣费由后端按 `sku_key`「完成才扣」处理，金额一直正确）。

---

## [0.7.13] - 2026-05-29

> **直充 + 永久套餐复购 + AI 视频通用服务商 + 画布视频节点**：新增用户按金额/档位充值金币与积分；永久套餐支持再次购买；AI 视频参考素材交互改为「协议能力表」驱动以兼容通用视频服务商；流式画布新增 AI 视频节点（文本 / 图片生成视频，支持图生视频与首尾帧）。

### 新增

- **`src/renderer/src/components/RechargeDialog.vue`** + **`src/renderer/src/views/recharge/RechargeView.vue`**：用户直充（选金币/积分 + 快捷档位 / 自由金额 + 实时到账预览 + 扫码支付，复用支付轮询/二维码），用户中心头部新增「充值」入口；`utils/cloud-api.ts` 新增直充配置与下单接口。

- **流式画布 AI 视频节点**（`aiVideo` + `videoResult`）：
  - `views/canvas/composables/useNodeTypes.ts`：dataType 扩展 `video`；新增 `aiVideo`（文本 / 参考图 / 首帧 / 尾帧 4 输入 handle）与 `videoResult` 节点。
  - `views/canvas/composables/useVideoCatalogSelection.ts`（新）：复用云控端 L2 catalog 的计费档 / 能力选择逻辑（catalog 模块级缓存 + 选项推导 + SKU 匹配 + 归一化）。
  - `views/canvas/composables/useVideoTaskPolling.ts`（新）：模块级单例轮询（单 timer + 多任务登记 + 终态自动注销）。
  - `views/canvas/nodes/AiVideoNode.vue`（新）：规格选择 + 进度 + 视频播放 + 模式驱动动态 handle（图生视频 `image-input`，首尾帧 `first/last-frame-input` 分槽）+ 重开恢复轮询 + 下载完成回填 + 删记录复位。
  - `views/canvas/nodes/VideoResultNode.vue`（新）：实时读取上游视频产物展示。
  - `views/canvas/composables/useWorkflowEngine.ts`：新增 `case 'aiVideo'`（按 handle 收图 → 参考图懒上传 → 提交 → 轮询）；单节点后台轮询 / 工作流等待双模式；`getUpstreamData` 支持 video 上游、`getUpstreamImagesByHandle` 按槽收图。
  - `main/services/video-generation.ts` + `main/database/index.ts`：视频落盘支持画布上下文，画布产物落 `canvas/{projectId}/{nodeId}_{taskId}.mp4`（对齐画布生图），`video_generations` 加 `canvas_project_id` / `canvas_node_id` 列；下载调度天然复用。
  - `main/services/canvas.ts`：删画布节点级联软删其视频创作记录。
  - `CanvasEditorView.vue` / `HandleCreateMenu.vue` / `stores/canvas.ts`：注册节点、handle-video 样式与连线校验、点 output 一键创建 `videoResult`、复制画布保留规格清运行态。
  - 计费沿用「完成才扣 / 失败不扣」，落盘与创作记录与独立视频页一致。

### 变更

- **`src/renderer/src/views/plans-store/PlansStoreView.vue`**：永久套餐放开复购，已拥有时购买按钮显示「再次购买」（每次充一份额度）。

- **`src/renderer/src/views/video/AiVideoView.vue`**：
  - 新增 `PROTOCOL_CAPABILITIES` 协议能力表（`assetTypes` / `firstLastFrameByImage`），替代散落的 `provider_protocol === 'veo' / 'seedance'` 硬编码判断。
  - `referenceSubmitReady` / `referenceHint` / `referenceGuide` / `referenceAccept` / `normalizeReferenceAssetList` / `normalizedReferencePayload` / `onPickReferences` 改为按 `protocolCapability(provider_protocol)` 取能力。
  - 新增 `openai_video` 协议支持图片 + 视频参考素材；未知协议回落仅图片，行为安全。
  - **AI 视频规格精简（L2 计费维度模型）**：规格选择改为「计费档（取自 SKU 锁定维度）+ 自选维度（取自模型 `supported_*`）」——`modeOptions` / `durationOptions` / `resolutionOptions` / `aspectRatioOptions` 按 `skuLocks()` 判断取自 SKU 或模型能力；`selectedSku` 仅按 SKU 锁定的计费维度匹配；`submitTask` 改传用户自选的模式/时长/清晰度/比例。修复 Seedance Fast、GROK 此前无可用规格，以及 Seedance Fast 误含 1080p 的问题。

---

## [0.7.11] - 2026-05-28

### 修复

- AI 视频参考图用途选择后会正确保存，不再回到通用参考。

### 变更

- AI 视频页面去掉重复标题，界面更简洁。

---

## [0.7.8] - 2026-05-23

> **灵感广场默认源切换**：移除百度文心 ERNIE 兜底数据，桌面端灵感广场统一只读云控端自定义灵感。

### 变更

- **`src/main/services/inspiration.ts`**：
  - 删除 `ERNIE_API`、`totalPages`、`mapErnieItem`、`fetchErnieInspirations`、`getInspirationConfig`。
  - `fetchOnlineInspirations` 直接转发到 `fetchCustomInspirations`，不再依赖云控端 `publicConfig` 判定来源。
  - `categories` 字段从 optional 改为 required（云端始终返回数组，即使为空）。

- **`src/main/ipc/index.ts`**：
  - 删除 `imageGen:getInspirationConfig` IPC handler（preload 未暴露此 API，删除无副作用）。

- **`src/renderer/src/views/image-gen/InspirationView.vue`**：
  - 删除「换一批」按钮与对应 SVG。
  - 删除 `isCustomSource` 状态及其分支逻辑。
  - 删除 `DEFAULT_CATEGORIES = ['人物', '风景', '动漫', '设计', '创意']`，`displayCategories` 直接返回云端 `dynamicCategories`。
  - 删除 `refreshRandom` 函数。
  - 分页控件常驻：`v-if="!loading && total > pageSize"`。
  - 空状态文案改为「尝试切换分类或翻页查看更多灵感」。
  - `fetchOnline` 简化为直接读取云端返回值。

- **`src/renderer/src/views/plans-store/PlansStoreView.vue`**：
  - 套餐商城新增分类切换，套餐列表和套餐对比表按当前分类同步过滤。
  - 套餐卡片不再显示套餐编码，分类名会在套餐名称下方辅助展示。

- **`src/renderer/src/components/MyPlansBox.vue`**：
  - 用户中心「我的套餐」移除剩余天数进度条，套餐卡片信息更简洁。

- **`src/renderer/src/views/user-center/UserCenterView.vue`**：
  - 「退出登录」移动到用户中心顶部右侧，与「查看明细」同排展示。
  - 「退出登录」改为次要按钮红色文字样式，并适配深色模式。

- **`src/renderer/src/views/creative-templates/components/TemplateUseModal.vue`**：
  - 创意模板未填写的非必填字段不再进入最终提示词，避免生图时带入原始字段占位内容。

- **`src/main/services/creative-template.ts`**：
  - 本地模板提示词渲染同步过滤空的非必填字段，保持预览、复制和填入生图结果一致。

### 兼容性

- 老云控端（1.5.13 及以下）的 `publicConfig` 返回值 `source` 字段被本版桌面端忽略，行为一致：直接走云端分页。
- 新云控端（1.5.14+）的 `publicConfig` 写死返回 `source: 'custom'`，与本版桌面端的行为完全对齐。
- 升级后若云控端没有审核通过的灵感，灵感广场会显示空，可在云控端后台录入或开启共享灵感库。
- 套餐商城分类切换依赖云控端 `/client/plans` 返回套餐分类字段；旧接口未返回分类时仍会按全部套餐展示。

---
