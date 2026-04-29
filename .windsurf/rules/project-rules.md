---
description: 项目级开发规则
trigger: always_on
---


## 设计规则

- **禁止使用 AI 风格的设计**（如 AI 生成的花哨图标、渐变彩色图标等）
- **禁止使用 emoji**
- **弹窗只加阴影，不要背景遮罩**（去掉 bg-black/50 等半透明遮罩层）
- 保持简洁、专业的设计风格

## 文件处理规则

- **禁止使用 PowerShell 读写任何包含中文的文件**：PowerShell 的 UTF-8 编码处理会导致 BOM 添加和中文字符损坏，影响 PHP、Vue、JS、JSON 等所有文件类型

## 文档策略

- **禁止**任务完成后自动创建文档（COMPLETION_REPORT.md 等）
- 仅在用户明确要求、复杂架构变更、API 规范、安装指南时创建

## 清理策略

- 执行成功后立即删除：迁移脚本(`migrate_*.php`)、测试脚本(`test_*.php`)、调试文件(`debug_*.php`)、临时文件(`temp_*.json`)
- 保留：schema 文件、配置、正式业务代码
- 清理前确认脚本已执行成功
