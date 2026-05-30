# Local Agent Desktop Changelog

本文档记录桌面端版本变更历史。版本号遵循语义化版本（SemVer）规范：`MAJOR.MINOR.PATCH`。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

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
