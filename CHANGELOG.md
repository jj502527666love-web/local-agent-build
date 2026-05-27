# Local Agent Desktop Changelog

本文档记录桌面端版本变更历史。版本号遵循语义化版本（SemVer）规范：`MAJOR.MINOR.PATCH`。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)。

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
