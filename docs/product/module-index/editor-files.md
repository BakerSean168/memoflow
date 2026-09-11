---
tags:
  - product
  - module-index
  - editor
description: 编辑器模块相关文件索引（运行时包退役后的知识呈现面）
created: 2026-06-02T00:00:00
updated: 2026-07-22T00:00:00
---

# 编辑器模块文件索引

本索引连接编辑器模块业务说明与**当前**代码。旧 `@memoflow/editor` 包与
`packages/app-vue/src/modules/editor` 已删除；知识呈现、安全预览、Web 快捷创建与
Desktop Obsidian 打开入口落在 repository 工作区与共享 Markdown 工具上。

做优化前仍以当前代码、配置和测试为准。

## 前端页面与路由

| 文件 | 说明 |
| --- | --- |
| [`packages/app-vue/src/modules/repository/router/index.ts`](../../../packages/app-vue/src/modules/repository/router/index.ts) | Note 模块仅注册 `/repository`（无 `/note/:id`） |
| [`packages/app-vue/src/modules/repository/views/RepositoryEntryView.vue`](../../../packages/app-vue/src/modules/repository/views/RepositoryEntryView.vue) | Web/Desktop 入口分发 |
| [`packages/app-vue/src/modules/repository/views/KnowledgeProjectionWorkspaceView.vue`](../../../packages/app-vue/src/modules/repository/views/KnowledgeProjectionWorkspaceView.vue) | Web 投影只读工作区 + confirmed create |
| [`packages/app-vue/src/modules/repository/views/LocalVaultWorkspaceView.vue`](../../../packages/app-vue/src/modules/repository/views/LocalVaultWorkspaceView.vue) | Desktop Local Vault 浏览/预览/Obsidian 打开 |
| [`packages/app-vue/src/modules/repository/views/NoteModuleLayout.vue`](../../../packages/app-vue/src/modules/repository/views/NoteModuleLayout.vue) | Note 模块壳（笔记 / 规范分段） |

## 安全 Markdown 与共享工具

| 文件 | 说明 |
| --- | --- |
| [`packages/app-vue/src/shared/utils/safe-markdown.ts`](../../../packages/app-vue/src/shared/utils/safe-markdown.ts) | 关闭原始 HTML 的安全 Markdown 渲染 |
| [`packages/app-vue/src/shared/utils/safe-markdown.spec.ts`](../../../packages/app-vue/src/shared/utils/safe-markdown.spec.ts) | XSS / 危险 URL / Obsidian 语法边界测试 |
| [`packages/app-vue/src/modules/repository/composables/useRecentKnowledgeNotes.ts`](../../../packages/app-vue/src/modules/repository/composables/useRecentKnowledgeNotes.ts) | 壳层/AI 最近笔记（projection / Local Vault） |

## Repository 服务端知识面

| 文件 | 说明 |
| --- | --- |
| [`packages/repository/src/api/routes/knowledge-repository-connection.routes.ts`](../../../packages/repository/src/api/routes/knowledge-repository-connection.routes.ts) | knowledge connection / projection / confirmed create |
| [`packages/repository/src/server/application/services/knowledge-note-commit.service.ts`](../../../packages/repository/src/server/application/services/knowledge-note-commit.service.ts) | Web 确认后唯一 commit 写入 |
| [`packages/repository/src/infrastructure-client/adapters/http/repository-http.adapter.ts`](../../../packages/repository/src/infrastructure-client/adapters/http/repository-http.adapter.ts) | 客户端 HTTP；knowledge + Local Vault 面 only（无 legacy CRUD 方法/硬失败 stub） |

## 可重新导入业务备份（非运行时编辑）

旧 Editor workspace 表与 portable 导出/导入仍保留，仅服务可重新导入业务备份，
不构成运行时 Markdown 编辑通道。独立的服务端持有数据披露见
`memoflow.server-held-data-disclosure`。

| 文件 | 说明 |
| --- | --- |
| [`packages/database/prisma/schema/editor.prisma`](../../../packages/database/prisma/schema/editor.prisma) | `editor_*` Prisma 模型 |
| [`packages/powersync-schema/src/index.ts`](../../../packages/powersync-schema/src/index.ts) | PowerSync `editor_*` 表定义 |
| [`packages/data-portability/src/server/application/use-cases/projections/editor.projection.ts`](../../../packages/data-portability/src/server/application/use-cases/projections/editor.projection.ts) | portable 导出投影 |
| [`packages/data-portability/src/server/application/use-cases/importers/editor.importer.ts`](../../../packages/data-portability/src/server/application/use-cases/importers/editor.importer.ts) | portable 导入 |
| [`packages/contracts/src/modules/data-portability/`](../../../packages/contracts/src/modules/data-portability/) | portable editor workspace 类型（唯一保留的 editor 相关契约） |

## 测试入口

| 文件 | 说明 |
| --- | --- |
| [`packages/app-vue/src/shared/utils/safe-markdown.spec.ts`](../../../packages/app-vue/src/shared/utils/safe-markdown.spec.ts) | 安全 Markdown 边界 |
| [`packages/app-vue/src/modules/repository/views/notePanelAdaptation.spec.ts`](../../../packages/app-vue/src/modules/repository/views/notePanelAdaptation.spec.ts) | 无 `/note/:id`、confirmed create 与深链 |
| [`packages/app-vue/src/modules/repository/router/index.spec.ts`](../../../packages/app-vue/src/modules/repository/router/index.spec.ts) | repository 路由契约 |
| [`packages/repository/src/server/infrastructure/adapters/prisma/__tests__/controlled-note-write-boundary.surface.spec.ts`](../../../packages/repository/src/server/infrastructure/adapters/prisma/__tests__/controlled-note-write-boundary.surface.spec.ts) | residual 201：controlled create/adoption / generic 已有笔记编辑关闭 |
| [`packages/repository/src/server/infrastructure/adapters/prisma/__tests__/legacy-editor-repository-runtime.surface.spec.ts`](../../../packages/repository/src/server/infrastructure/adapters/prisma/__tests__/legacy-editor-repository-runtime.surface.spec.ts) | legacy editor/repository 运行时未挂载 |
| [`packages/data-portability/src/server/application/use-cases/__tests__/editor-portability-retirement.surface.spec.ts`](../../../packages/data-portability/src/server/application/use-cases/__tests__/editor-portability-retirement.surface.spec.ts) | Editor Portability 退役边界 |
| [`packages/app-vue/src/modules/repository/views/KnowledgeProjectionWorkspaceView.spec.ts`](../../../packages/app-vue/src/modules/repository/views/KnowledgeProjectionWorkspaceView.spec.ts) | Web 投影工作区 |
| [`packages/repository/src/infrastructure-client/adapters/http/repository-http.adapter.spec.ts`](../../../packages/repository/src/infrastructure-client/adapters/http/repository-http.adapter.spec.ts) | projection/confirmed-create；断言无 legacy CRUD 方法 |

## 需要重点关注的改动风险

- 不要把可重新导入的 `editor_*` 备份表与服务端披露 artifact 混为同一导出通道。
- 不要恢复 `/note/:id` 或挂载旧 Editor API / Electron runtime。
- Web Markdown 必须继续走 sanitizer；禁止重新启用原始 HTML。
- 删除或收缩 portable editor 备份前，先更新 data-portability 契约与用户隐私说明。
