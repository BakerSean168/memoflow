---
tags:
  - product
  - module-index
  - repository
description: 资源库模块相关文件索引（knowledge + Local Vault 真值）
created: 2026-06-02T00:00:00
updated: 2026-09-11T00:02:00+08:00
---

# 资源库模块文件索引

本索引连接资源库模块业务说明与当前代码。优化前仍以代码、配置和测试为准。

> 旧数据库 Repository/Folder/Resource CRUD 与 Editor 运行时入口已退役。索引只列 knowledge
> connection、投影、Web confirmed create、Desktop Local Vault / Git 同步，以及可重新导入备份边界。

## vNext 建模文档（已采纳，实施中）

| 文件                                                                                                                                                      | 说明                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [`docs/product/knowledge-repository-vnext.md`](../knowledge-repository-vnext.md)                                                                          | KnowledgeSpace / Binding / Stable Document / Projection / AI Index North Star |
| [`docs/analysis/2026-09-08-knowledge-repository-vnext-current-system-map.md`](../../analysis/2026-09-08-knowledge-repository-vnext-current-system-map.md) | 当前代码事实与目标差距                                                        |
| [`ADR-089`](../../architecture/adr/ADR-089-knowledge-space-source-binding-and-health-boundaries.md)                                                       | Local/Remote Binding、Health/Observation、Sync/Projection cursor 分离         |
| [`ADR-090`](../../architecture/adr/ADR-090-stable-knowledge-document-identity.md)                                                                         | 稳定 `KnowledgeDocumentId` 与 path-independent durable reference              |
| [`ADR-091`](../../architecture/adr/ADR-091-knowledge-projection-index-and-operation-boundaries.md)                                                        | 单一 ProjectionEngine、AI Index ownership、可靠 Operation 与 capability ports |

> 2026-09-11：ADR-089 的 Local Vault ownership/health split 已进入生产代码；Remote Binding/Observation/Fence/Checkpoint、ADR-090 与 ADR-091 仍待实施。

## 前端页面与路由

| 文件                                                                                                                                                                                          | 说明                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`packages/app-vue/src/modules/repository/router/index.ts`](../../../packages/app-vue/src/modules/repository/router/index.ts)                                                                 | `/repository` 入口；无 `/note/:id` 编辑路由                                 |
| [`packages/app-vue/src/modules/repository/views/RepositoryEntryView.vue`](../../../packages/app-vue/src/modules/repository/views/RepositoryEntryView.vue)                                     | 按平台选择 Web 投影或 Desktop Vault 工作区                                  |
| [`packages/app-vue/src/modules/repository/views/KnowledgeProjectionWorkspaceView.vue`](../../../packages/app-vue/src/modules/repository/views/KnowledgeProjectionWorkspaceView.vue)           | Web：GitHub default-branch 只读投影、搜索、安全预览、关系、confirmed create |
| [`packages/app-vue/src/modules/repository/views/LocalVaultWorkspaceView.vue`](../../../packages/app-vue/src/modules/repository/views/LocalVaultWorkspaceView.vue)                             | Desktop：本地 Vault 浏览、预览、Obsidian 打开、确认写入                     |
| [`packages/app-vue/src/modules/repository/views/NoteModuleLayout.vue`](../../../packages/app-vue/src/modules/repository/views/NoteModuleLayout.vue)                                           | 工作区布局壳                                                                |
| [`packages/app-vue/src/modules/repository/components/KnowledgeProjectionRelationsView.vue`](../../../packages/app-vue/src/modules/repository/components/KnowledgeProjectionRelationsView.vue) | 投影 Link Graph / 关系视图                                                  |
| [`packages/app-vue/src/modules/repository/components/NoteSegmentBar.vue`](../../../packages/app-vue/src/modules/repository/components/NoteSegmentBar.vue)                                     | 笔记分段导航                                                                |

## 前端组合函数与设置

| 文件                                                                                                                                                                          | 说明                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| [`packages/app-vue/src/modules/repository/composables/useLocalVault.ts`](../../../packages/app-vue/src/modules/repository/composables/useLocalVault.ts)                       | Desktop Local Vault 编排                     |
| [`packages/app-vue/src/modules/repository/composables/useRecentKnowledgeNotes.ts`](../../../packages/app-vue/src/modules/repository/composables/useRecentKnowledgeNotes.ts)   | 壳层/AI 最近笔记（projection / Local Vault） |
| [`packages/app-vue/src/shared/utils/safe-markdown.ts`](../../../packages/app-vue/src/shared/utils/safe-markdown.ts)                                                           | 关闭原始 HTML 的安全 Markdown 渲染           |
| [`packages/app-vue/src/modules/setting/components/KnowledgeRepositorySettings.vue`](../../../packages/app-vue/src/modules/setting/components/KnowledgeRepositorySettings.vue) | GitHub App 连接、对账、断开/清理与披露入口   |

## Desktop 主进程

| 文件                                                                                                                                                                                                          | 说明                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [`packages/repository/src/electron/local-vault-runtime.ts`](../../../packages/repository/src/electron/local-vault-runtime.ts)                                                                                 | ADR-089 Local Vault runtime：profile-owned binding V2 + read-time `LocalVaultHealth`，无 cloud identity owner |
| [`packages/repository/src/electron/index.ts`](../../../packages/repository/src/electron/index.ts)                                                                                                             | Desktop repository Electron 模块装配                                                                          |
| [`apps/desktop/src/main/modules/repository/desktop-knowledge-repository-sync.service.ts`](../../../apps/desktop/src/main/modules/repository/desktop-knowledge-repository-sync.service.ts)                     | Git 同步（commit/fetch/rebase/push、冲突、离线队列）                                                          |
| [`apps/desktop/src/main/modules/repository/desktop-knowledge-repository-reconciliation.service.ts`](../../../apps/desktop/src/main/modules/repository/desktop-knowledge-repository-reconciliation.service.ts) | 首次/持续对账                                                                                                 |
| [`apps/desktop/src/main/modules/repository/desktop-knowledge-repository-git.runtime.ts`](../../../apps/desktop/src/main/modules/repository/desktop-knowledge-repository-git.runtime.ts)                       | Git runtime 边界                                                                                              |
| [`apps/desktop/src/main/modules/repository/desktop-knowledge-repository-auto-sync.scheduler.ts`](../../../apps/desktop/src/main/modules/repository/desktop-knowledge-repository-auto-sync.scheduler.ts)       | profile-scoped 自动同步                                                                                       |
| [`apps/desktop/src/main/modules/repository/knowledge-repository-remote.gateway.ts`](../../../apps/desktop/src/main/modules/repository/knowledge-repository-remote.gateway.ts)                                 | 远端 GitHub App gateway                                                                                       |

## API、应用面与客户端适配

| 文件                                                                                                                                                                                                        | 说明                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [`packages/repository/src/api/module.ts`](../../../packages/repository/src/api/module.ts)                                                                                                                   | API 模块；只挂 knowledge routes                                  |
| [`packages/repository/src/api/routes/knowledge-repository-connection.routes.ts`](../../../packages/repository/src/api/routes/knowledge-repository-connection.routes.ts)                                     | connection / projection / attachment / confirmed create          |
| [`packages/repository/src/server/transport/knowledge-repository-connection.controller.ts`](../../../packages/repository/src/server/transport/knowledge-repository-connection.controller.ts)                 | transport 控制器                                                 |
| [`packages/repository/src/server/application/repository.application.port.ts`](../../../packages/repository/src/server/application/repository.application.port.ts)                                           | knowledge-only application port                                  |
| [`packages/repository/src/server/application/services/knowledge-repository-connection.service.ts`](../../../packages/repository/src/server/application/services/knowledge-repository-connection.service.ts) | GitHub App 安装与连接                                            |
| [`packages/repository/src/server/application/services/knowledge-repository-projection.service.ts`](../../../packages/repository/src/server/application/services/knowledge-repository-projection.service.ts) | webhook 投影、附件、索引状态                                     |
| [`packages/repository/src/server/application/services/knowledge-note-commit.service.ts`](../../../packages/repository/src/server/application/services/knowledge-note-commit.service.ts)                     | Web 确认后幂等 commit                                            |
| [`packages/repository/src/server/application/services/knowledge-note-link-graph.ts`](../../../packages/repository/src/server/application/services/knowledge-note-link-graph.ts)                             | Markdown Link Graph 派生                                         |
| [`packages/repository/src/server/infrastructure/repository.module.ts`](../../../packages/repository/src/server/infrastructure/repository.module.ts)                                                         | knowledge-only 组合根                                            |
| [`packages/repository/src/application-client/repository-client.port.ts`](../../../packages/repository/src/application-client/repository-client.port.ts)                                                     | 客户端 port（knowledge + Local Vault）                           |
| [`packages/repository/src/infrastructure-client/adapters/http/repository-http.adapter.ts`](../../../packages/repository/src/infrastructure-client/adapters/http/repository-http.adapter.ts)                 | HTTP 适配器；knowledge + Local Vault only（无 legacy CRUD 方法） |
| [`packages/repository/src/infrastructure-client/adapters/ipc/repository-ipc.adapter.ts`](../../../packages/repository/src/infrastructure-client/adapters/ipc/repository-ipc.adapter.ts)                     | IPC 适配器；仅 knowledge + vault channels                        |
| [`packages/repository/src/client/index.ts`](../../../packages/repository/src/client/index.ts)                                                                                                               | 公共 client 缝                                                   |

## 契约与事件

| 文件                                                                                                                                                                | 说明                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [`packages/contracts/src/modules/repository/`](../../../packages/contracts/src/modules/repository/)                                                                 | knowledge / Local Vault / projection / confirmed create 契约 |
| [`packages/contracts/src/modules/repository/protocol/repository-event-map.ts`](../../../packages/contracts/src/modules/repository/protocol/repository-event-map.ts) | 仅 `repository:note:mutated`                                 |
| [`packages/contracts/src/electron/ipc-channels.ts`](../../../packages/contracts/src/electron/ipc-channels.ts)                                                       | `RepositoryChannels`：knowledge connection + Local Vault     |

## 可重新导入业务备份（非运行时编辑）

旧 Repository/Resource/Folder 与 Editor workspace 表只服务 portable 备份再导入，
不构成运行时 Markdown 编辑通道。独立服务端持有数据披露见
`memoflow.server-held-data-disclosure`。

| 文件                                                                                                                                                                                                          | 说明                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| [`packages/database/prisma/schema/editor.prisma`](../../../packages/database/prisma/schema/editor.prisma)                                                                                                     | `editor_*` Prisma 模型                          |
| [`packages/powersync-schema/src/index.ts`](../../../packages/powersync-schema/src/index.ts)                                                                                                                   | PowerSync `editor_*` / resource 相关表          |
| [`packages/data-portability/src/server/application/use-cases/projections/repository.projection.ts`](../../../packages/data-portability/src/server/application/use-cases/projections/repository.projection.ts) | portable repository/resource 导出               |
| [`packages/data-portability/src/server/application/use-cases/projections/editor.projection.ts`](../../../packages/data-portability/src/server/application/use-cases/projections/editor.projection.ts)         | portable editor workspace 导出                  |
| [`packages/data-portability/src/server/application/use-cases/importers/`](../../../packages/data-portability/src/server/application/use-cases/importers/)                                                     | portable 导入（含 repository/editor）           |
| [`packages/contracts/src/modules/data-portability/`](../../../packages/contracts/src/modules/data-portability/)                                                                                               | portable 契约（含 server-held-data-disclosure） |

## 测试入口

| 文件                                                                                                                                                                                                                                                                  | 说明                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [`packages/app-vue/src/modules/repository/router/index.spec.ts`](../../../packages/app-vue/src/modules/repository/router/index.spec.ts)                                                                                                                               | 无 `/note/:id` 路由契约                                  |
| [`packages/app-vue/src/modules/repository/views/notePanelAdaptation.spec.ts`](../../../packages/app-vue/src/modules/repository/views/notePanelAdaptation.spec.ts)                                                                                                     | confirmed create 与深链                                  |
| [`packages/repository/src/server/infrastructure/adapters/prisma/__tests__/confirmed-create-only-note-boundary.surface.spec.ts`](../../../packages/repository/src/server/infrastructure/adapters/prisma/__tests__/confirmed-create-only-note-boundary.surface.spec.ts) | residual 201：confirmed-create-only 边界                 |
| [`packages/app-vue/src/modules/repository/views/KnowledgeProjectionWorkspaceView.spec.ts`](../../../packages/app-vue/src/modules/repository/views/KnowledgeProjectionWorkspaceView.spec.ts)                                                                           | Web 投影工作区                                           |
| [`packages/app-vue/src/shared/utils/safe-markdown.spec.ts`](../../../packages/app-vue/src/shared/utils/safe-markdown.spec.ts)                                                                                                                                         | Markdown 安全边界                                        |
| [`packages/repository/src/infrastructure-client/adapters/http/repository-http.adapter.spec.ts`](../../../packages/repository/src/infrastructure-client/adapters/http/repository-http.adapter.spec.ts)                                                                 | projection/confirmed-create；断言无 legacy CRUD 方法     |
| [`packages/repository/src/infrastructure-client/adapters/ipc/repository-ipc.adapter.spec.ts`](../../../packages/repository/src/infrastructure-client/adapters/ipc/repository-ipc.adapter.spec.ts)                                                                     | knowledge + vault IPC                                    |
| [`packages/repository/src/server/application/services/knowledge-note-commit.service.spec.ts`](../../../packages/repository/src/server/application/services/knowledge-note-commit.service.spec.ts)                                                                     | 幂等 confirmed create                                    |
| [`packages/repository/src/server/application/services/knowledge-repository-projection.service.spec.ts`](../../../packages/repository/src/server/application/services/knowledge-repository-projection.service.spec.ts)                                                 | webhook / 投影                                           |
| [`apps/web/e2e/note/legacy-note-mutation-boundary.spec.ts`](../../../apps/web/e2e/note/legacy-note-mutation-boundary.spec.ts)                                                                                                                                         | 旧 CRUD 路径 404 边界                                    |
| [`apps/web/src/mocks/handlers/repository.handlers.ts`](../../../apps/web/src/mocks/handlers/repository.handlers.ts)                                                                                                                                                   | MSW knowledge-only（无 legacy Resource/Folder 404 stub） |

## 需要重点关注的改动风险

- Goal/Task durable Knowledge relation 不得指向 `connectionId + relativePath` 派生的 projection id；必须等待 ADR-090 stable `KnowledgeDocumentId`。
- AI indexing 状态最终由 AI owner；迁移期间不得新增 Repository `indexStatus` 的新消费者。
- Web confirmed commit / webhook / reconciliation 不得继续扩散第三套 projection apply 逻辑；目标是 ADR-091 单一 ProjectionEngine。
- 不要恢复 `/note/:id`、Editor API/Electron、或 Repository/Folder/Resource CRUD 运行时入口。
- 不要把 portable `editor_*`/`resources` 备份与 `memoflow.server-held-data-disclosure` 混为同一导出通道。
- Web Markdown 必须继续走 sanitizer；禁止重新启用原始 HTML。
- Desktop Git 同步禁止 force push；双非空仓库首次对账必须人工确认。
- AI 写入路径必须用户确认；确认创建返回 `KnowledgeNotePersistedRef`，不要恢复 Resource CRUD DTO。
