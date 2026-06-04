# Local Agent Desktop Changelog

本文档记录桌面端版本变更历史。版本号遵循语义化版本（SemVer）规范：`MAJOR.MINOR.PATCH`。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

---

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
