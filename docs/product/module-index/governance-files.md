---
tags:
  - product
  - module-index
  - governance
description: 治理模块相关文件索引
created: 2026-06-02T00:00:00
updated: 2026-09-11T00:00:00+09:00
---

# 治理模块文件索引

本索引用于连接治理模块的业务说明和真实代码。

## 前端页面与路由

| 文件                                                                                                                                                        | 说明                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| [`packages/app-vue/src/modules/governance/router/index.ts`](../../../packages/app-vue/src/modules/governance/router/index.ts)                               | Vue 治理模块路由（5 个路由） |
| [`packages/app-vue/src/modules/governance/views/GovernanceListView.vue`](../../../packages/app-vue/src/modules/governance/views/GovernanceListView.vue)     | 规则列表页                   |
| [`packages/app-vue/src/modules/governance/views/GovernanceDetailView.vue`](../../../packages/app-vue/src/modules/governance/views/GovernanceDetailView.vue) | 规则详情页                   |
| [`packages/app-vue/src/modules/governance/views/RuleEditorView.vue`](../../../packages/app-vue/src/modules/governance/views/RuleEditorView.vue)             | 规则编辑页                   |
| [`packages/app-vue/src/modules/governance/views/RevisionHistoryView.vue`](../../../packages/app-vue/src/modules/governance/views/RevisionHistoryView.vue)   | 修订历史页                   |

## 前端状态、组合函数与展示派生

| 文件                                                                                                                                                                | 说明             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| [`packages/app-vue/src/modules/governance/stores/governance-store.ts`](../../../packages/app-vue/src/modules/governance/stores/governance-store.ts)                 | 治理 Pinia store |
| [`packages/app-vue/src/modules/governance/composables/useGovernance.ts`](../../../packages/app-vue/src/modules/governance/composables/useGovernance.ts)             | 治理操作组合函数 |
| [`packages/app-vue/src/modules/governance/display-rule.ts`](../../../packages/app-vue/src/modules/governance/display-rule.ts)                                       | UI 展示模型派生  |
| [`packages/app-vue/src/modules/governance/components/RuleCard.vue`](../../../packages/app-vue/src/modules/governance/components/RuleCard.vue)                       | 规则卡片组件     |
| [`packages/app-vue/src/modules/governance/components/RevisionCard.vue`](../../../packages/app-vue/src/modules/governance/components/RevisionCard.vue)               | 修订卡片组件     |
| [`packages/app-vue/src/modules/governance/components/CodeSnippetView.vue`](../../../packages/app-vue/src/modules/governance/components/CodeSnippetView.vue)         | 代码片段展示组件 |
| [`packages/app-vue/src/modules/governance/components/RuleStatusBadge.vue`](../../../packages/app-vue/src/modules/governance/components/RuleStatusBadge.vue)         | 规则状态徽章     |
| [`packages/app-vue/src/modules/governance/components/GovernanceSearchBar.vue`](../../../packages/app-vue/src/modules/governance/components/GovernanceSearchBar.vue) | 搜索栏组件       |

## API、客户端与桌面接线

| 文件                                                                                                                                                        | 说明                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| [`packages/governance/src/api/routes/governance-rules.routes.ts`](../../../packages/governance/src/api/routes/governance-rules.routes.ts)                   | 规则 HTTP routes                         |
| [`packages/governance/src/api/routes/governance-rule-revisions.routes.ts`](../../../packages/governance/src/api/routes/governance-rule-revisions.routes.ts) | 修订 HTTP routes                         |
| [`packages/governance/src/api/module.ts`](../../../packages/governance/src/api/module.ts)                                                                   | 治理 API 模块定义                        |
| [`packages/governance/src/server/transport/governance.controller.ts`](../../../packages/governance/src/server/transport/governance.controller.ts)           | 治理控制器                               |
| [`packages/governance/src/client/index.ts`](../../../packages/governance/src/client/index.ts)                                                               | Web / Renderer 客户端 seam               |
| [`packages/governance/src/electron/index.ts`](../../../packages/governance/src/electron/index.ts)                                                           | Desktop main 治理入口                    |
| [`apps/api/src/runtime/compose-governance.ts`](../../../apps/api/src/runtime/compose-governance.ts)                                                         | API host-owned Prisma composition        |
| [`apps/desktop/src/main/runtime/compose-governance.ts`](../../../apps/desktop/src/main/runtime/compose-governance.ts)                                       | Desktop host-owned PowerSync composition |

## 领域、用例、运行时与仓储

| 文件                                                                                                                                                                                                  | 说明                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| [`packages/governance/src/server/domain/aggregates/rule.ts`](../../../packages/governance/src/server/domain/aggregates/rule.ts)                                                                       | Rule 聚合根                 |
| [`packages/governance/src/server/domain/entities/rule-revision.ts`](../../../packages/governance/src/server/domain/entities/rule-revision.ts)                                                         | RuleRevision 实体           |
| [`packages/governance/src/server/application/use-cases/commands/create-rule.use-case.ts`](../../../packages/governance/src/server/application/use-cases/commands/create-rule.use-case.ts)             | 创建规则用例                |
| [`packages/governance/src/server/application/use-cases/commands/update-rule.use-case.ts`](../../../packages/governance/src/server/application/use-cases/commands/update-rule.use-case.ts)             | 更新规则用例                |
| [`packages/governance/src/server/application/use-cases/commands/delete-rule.use-case.ts`](../../../packages/governance/src/server/application/use-cases/commands/delete-rule.use-case.ts)             | 删除规则用例                |
| [`packages/governance/src/server/application/use-cases/queries/search-rules.use-case.ts`](../../../packages/governance/src/server/application/use-cases/queries/search-rules.use-case.ts)             | 搜索规则查询                |
| [`packages/governance/src/server/application/use-cases/queries/get-rule-revisions.use-case.ts`](../../../packages/governance/src/server/application/use-cases/queries/get-rule-revisions.use-case.ts) | 修订历史查询                |
| [`packages/governance/src/server/infrastructure/runtime/governance-event-log.runtime.ts`](../../../packages/governance/src/server/infrastructure/runtime/governance-event-log.runtime.ts)             | 模块事件日志 runtime 适配器 |
| [`packages/governance/src/server/infrastructure/governance.module.ts`](../../../packages/governance/src/server/infrastructure/governance.module.ts)                                                   | 服务端治理模块组合根        |
| [`packages/governance/src/server/infrastructure/prisma.ts`](../../../packages/governance/src/server/infrastructure/prisma.ts)                                                                         | Prisma 便捷组合根           |
| [`packages/governance/src/server/infrastructure/powersync.ts`](../../../packages/governance/src/server/infrastructure/powersync.ts)                                                                   | PowerSync 便捷组合根        |

## 公共 Contracts 与数据结构

| 文件                                                                                                                                                                | 说明                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| [`packages/contracts/src/modules/governance/index.ts`](../../../packages/contracts/src/modules/governance/index.ts)                                                 | 治理公共 contracts 主入口         |
| [`packages/contracts/src/modules/governance/aggregates/rule-client.ts`](../../../packages/contracts/src/modules/governance/aggregates/rule-client.ts)               | Rule 客户端 DTO（API 唯一传输面） |
| [`packages/contracts/src/modules/governance/entities/rule-revision-server.ts`](../../../packages/contracts/src/modules/governance/entities/rule-revision-server.ts) | RuleRevision 服务端 DTO           |
| [`packages/contracts/src/modules/governance/api/rules.ts`](../../../packages/contracts/src/modules/governance/api/rules.ts)                                         | 规则 API 请求 / 查询 schema       |
| [`packages/contracts/src/modules/governance/api/rule-revisions.ts`](../../../packages/contracts/src/modules/governance/api/rule-revisions.ts)                       | 修订历史 API schema               |
| [`packages/contracts/src/modules/governance/api/response-schemas.ts`](../../../packages/contracts/src/modules/governance/api/response-schemas.ts)                   | 路由响应 schema                   |
| [`packages/contracts/src/modules/governance/protocol/governance-channels.ts`](../../../packages/contracts/src/modules/governance/protocol/governance-channels.ts)   | 治理 RPC channel 常量             |
| [`packages/contracts/src/modules/governance/protocol/governance-event-map.ts`](../../../packages/contracts/src/modules/governance/protocol/governance-event-map.ts) | 治理事件 map                      |
| [`packages/contracts/src/modules/governance/protocol/governance-rpc-map.ts`](../../../packages/contracts/src/modules/governance/protocol/governance-rpc-map.ts)     | 治理 RPC map                      |
| [`packages/contracts/src/mocks/governance.mock.ts`](../../../packages/contracts/src/mocks/governance.mock.ts)                                                       | 治理 mocks                        |
| [`packages/database/prisma/schema/governance.prisma`](../../../packages/database/prisma/schema/governance.prisma)                                                   | 治理 Prisma schema                |

## Reference feature 可执行锁

| 文件                                                                                                                                                                                                                  | 说明                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [`packages/governance/src/reference-module-invariants.surface.spec.ts`](../../../packages/governance/src/reference-module-invariants.surface.spec.ts)                                                                 | public seams、完整 vertical slice、host composition、README/QUICK_REFERENCE anti-drift |
| [`packages/governance/src/server/infrastructure/__tests__/governance-persistence-parity.spec.ts`](../../../packages/governance/src/server/infrastructure/__tests__/governance-persistence-parity.spec.ts)             | Prisma / PowerSync Rule + RuleRevision round-trip 与 search/filter parity              |
| [`packages/governance/src/api/routes/governance-transport-parity.spec.ts`](../../../packages/governance/src/api/routes/governance-transport-parity.spec.ts)                                                           | HTTP / IPC validation 与 Result parity                                                 |
| [`packages/governance/src/server/infrastructure/__tests__/governance-composition-root.surface.spec.ts`](../../../packages/governance/src/server/infrastructure/__tests__/governance-composition-root.surface.spec.ts) | host-owned composition 与禁止 deep import                                              |

## 仓库级治理文档

| 文件                                                                                | 说明         |
| ----------------------------------------------------------------------------------- | ------------ |
| [`docs/governance/README.md`](../../../docs/governance/README.md)                   | 治理规范入口 |
| [`docs/governance/QUICK_REFERENCE.md`](../../../docs/governance/QUICK_REFERENCE.md) | 快速参考     |
| [`docs/governance/DECISIONS.md`](../../../docs/governance/DECISIONS.md)             | 设计决策     |
| [`docs/governance/CHANGE_PLAYBOOK.md`](../../../docs/governance/CHANGE_PLAYBOOK.md) | 变更手册     |
