---
tags:
  - product
  - module-index
  - notification
description: 通知模块相关文件索引
created: 2026-06-02T00:00:00
updated: 2026-09-10T21:18:00+08:00
---

# 通知模块文件索引

本索引用于连接通知模块的业务说明和真实代码。它不是代码注释替代品；做优化前仍需以当前代码、配置和测试为准。

## 2026-09-08 vNext 设计入口

| 文件                                                                                                                          | 说明                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`docs/product/notification-vnext.md`](../notification-vnext.md)                                                              | Notification vNext North Star：Fact / Workflow / Delivery / Interaction / Preference / Ops |
| [`docs/analysis/2026-09-08-notification-current-system-map.md`](../../analysis/2026-09-08-notification-current-system-map.md) | 当前代码真值、legacy residue 与 current-to-target matrix                                   |
| [`ADR-084`](../../architecture/adr/ADR-084-notification-fact-and-inbox-lifecycle.md)                                          | NotificationFact 与 Inbox lifecycle                                                        |
| [`ADR-085`](../../architecture/adr/ADR-085-notification-workflow-semantics-and-template-retirement.md)                        | Workflow semantic registry 与 Template 退役                                                |
| [`ADR-086`](../../architecture/adr/ADR-086-notification-delivery-plan-projection-and-channel-retirement.md)                   | DeliveryPlan / Projection 与 NotificationChannel 退役                                      |
| [`ADR-087`](../../architecture/adr/ADR-087-notification-interaction-and-typed-action-intents.md)                              | NotificationInteraction 与 typed actions                                                   |
| [`ADR-088`](../../architecture/adr/ADR-088-notification-preference-quiet-hours-realtime-and-operations-boundary.md)           | Preference / QuietHours / realtime / ops boundary                                          |

> 以上 ADR 已采纳但尚未实施。当前 `NotificationChannel / NotificationHistory / NotificationTemplate` 等文件仍是代码真值的一部分，不能从索引删除直到实际迁移完成。

## 前端页面与路由

| 文件                                                                                                                                                            | 说明                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| [`packages/app-vue/src/modules/notification/router/index.ts`](../../../packages/app-vue/src/modules/notification/router/index.ts)                               | Vue 通知模块路由，定义通知中心和 SSE 监控入口 |
| [`packages/app-vue/src/modules/notification/views/NotificationListPage.vue`](../../../packages/app-vue/src/modules/notification/views/NotificationListPage.vue) | 通知中心列表页                                |
| [`packages/app-vue/src/modules/notification/views/SSEMonitorPage.vue`](../../../packages/app-vue/src/modules/notification/views/SSEMonitorPage.vue)             | SSE 监控页（开发用）                          |

## 前端状态、组合函数与组件

| 文件                                                                                                                                                                                  | 说明                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| [`packages/app-vue/src/modules/notification/stores/notification-store.ts`](../../../packages/app-vue/src/modules/notification/stores/notification-store.ts)                           | 通知模块 Pinia store        |
| [`packages/app-vue/src/modules/notification/composables/useNotificationListQuery.ts`](../../../packages/app-vue/src/modules/notification/composables/useNotificationListQuery.ts)     | 通知列表查询组合函数        |
| [`packages/app-vue/src/modules/notification/composables/useNotificationUnreadQuery.ts`](../../../packages/app-vue/src/modules/notification/composables/useNotificationUnreadQuery.ts) | 未读计数查询组合函数        |
| [`packages/app-vue/src/modules/notification/composables/useNotificationMutations.ts`](../../../packages/app-vue/src/modules/notification/composables/useNotificationMutations.ts)     | 通知操作组合函数            |
| [`packages/app-vue/src/modules/notification/composables/useNotificationPreferences.ts`](../../../packages/app-vue/src/modules/notification/composables/useNotificationPreferences.ts) | 通知偏好组合函数            |
| [`packages/app-vue/src/modules/notification/initialization/index.ts`](../../../packages/app-vue/src/modules/notification/initialization/index.ts)                                     | 通知启动钩子，订阅 SSE 事件 |
| [`packages/app-vue/src/modules/notification/components/NotificationBell.vue`](../../../packages/app-vue/src/modules/notification/components/NotificationBell.vue)                     | 通知铃铛图标（含未读计数）  |
| [`packages/app-vue/src/modules/notification/components/NotificationDrawer.vue`](../../../packages/app-vue/src/modules/notification/components/NotificationDrawer.vue)                 | 通知侧边抽屉                |
| [`packages/app-vue/src/modules/notification/components/NotificationList.vue`](../../../packages/app-vue/src/modules/notification/components/NotificationList.vue)                     | 通知列表组件                |
| [`packages/app-vue/src/modules/notification/components/NotificationItem.vue`](../../../packages/app-vue/src/modules/notification/components/NotificationItem.vue)                     | 通知条目组件                |
| [`packages/app-vue/src/modules/notification/components/InAppNotification.vue`](../../../packages/app-vue/src/modules/notification/components/InAppNotification.vue)                   | 应用内 Toast 通知组件       |

## 移动端入口

| 文件                                                                                                                  | 说明               |
| --------------------------------------------------------------------------------------------------------------------- | ------------------ |
| [`apps/mobile/src/app/explore/notifications.tsx`](../../../apps/mobile/src/app/explore/notifications.tsx)             | 移动端通知列表入口 |
| [`apps/mobile/src/app/explore/notification-detail.tsx`](../../../apps/mobile/src/app/explore/notification-detail.tsx) | 移动端通知详情入口 |

## API、控制器与适配器

| 文件                                                                                                                                                                                                | 说明                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| [`packages/notification/src/api/routes.ts`](../../../packages/notification/src/api/routes.ts)                                                                                                       | 通知 HTTP routes（10 个端点） |
| [`packages/notification/src/server/transport/notification.controller.ts`](../../../packages/notification/src/server/transport/notification.controller.ts)                                           | 传输层处理器                  |
| [`packages/notification/src/api/module.ts`](../../../packages/notification/src/api/module.ts)                                                                                                       | 通知 API 模块定义             |
| [`packages/notification/src/server/transport/notification.controller.ts`](../../../packages/notification/src/server/transport/notification.controller.ts)                                           | 通知控制器                    |
| [`packages/notification/src/infrastructure-client/adapters/http/notification-http.adapter.ts`](../../../packages/notification/src/infrastructure-client/adapters/http/notification-http.adapter.ts) | 客户端 HTTP 适配器            |
| [`packages/notification/src/infrastructure-client/adapters/ipc/notification-ipc.adapter.ts`](../../../packages/notification/src/infrastructure-client/adapters/ipc/notification-ipc.adapter.ts)     | 客户端 IPC 适配器             |

## 领域、用例与仓储

| 文件                                                                                                                                                                                                                                    | 说明                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| [`packages/notification/src/server/domain/aggregates/notification.ts`](../../../packages/notification/src/server/domain/aggregates/notification.ts)                                                                                     | Notification 聚合根                              |
| [`packages/notification/src/server/domain/aggregates/notification-preference.ts`](../../../packages/notification/src/server/domain/aggregates/notification-preference.ts)                                                               | NotificationPreference 聚合根                    |
| [`packages/notification/src/server/domain/aggregates/notification-template.ts`](../../../packages/notification/src/server/domain/aggregates/notification-template.ts)                                                                   | NotificationTemplate 聚合根                      |
| [`packages/notification/src/server/domain/entities/notification-channel.ts`](../../../packages/notification/src/server/domain/entities/notification-channel.ts)                                                                         | NotificationChannel 实体                         |
| [`packages/notification/src/server/domain/entities/notification-history.ts`](../../../packages/notification/src/server/domain/entities/notification-history.ts)                                                                         | NotificationHistory 实体                         |
| [`packages/notification/src/server/domain/services/notification-policy.ts`](../../../packages/notification/src/server/domain/services/notification-policy.ts)                                                                           | 通知策略（偏好、免打扰、频率限制检查）           |
| [`packages/notification/src/server/domain/services/notification-workflow-catalog.ts`](../../../packages/notification/src/server/domain/services/notification-workflow-catalog.ts)                                                       | Notification workflow capability/default catalog |
| [`packages/notification/src/server/application/use-cases/commands/create-notification.use-case.ts`](../../../packages/notification/src/server/application/use-cases/commands/create-notification.use-case.ts)                           | 创建通知用例                                     |
| [`packages/notification/src/server/application/use-cases/commands/mark-notification-as-read.use-case.ts`](../../../packages/notification/src/server/application/use-cases/commands/mark-notification-as-read.use-case.ts)               | 标记已读用例                                     |
| [`packages/notification/src/server/application/use-cases/queries/get-unread-notifications.use-case.ts`](../../../packages/notification/src/server/application/use-cases/queries/get-unread-notifications.use-case.ts)                   | 获取未读通知查询                                 |
| [`packages/notification/src/server/application/use-cases/queries/get-user-notifications.use-case.ts`](../../../packages/notification/src/server/application/use-cases/queries/get-user-notifications.use-case.ts)                       | 获取用户通知查询                                 |
| [`packages/notification/src/server/infrastructure/notification.module.ts`](../../../packages/notification/src/server/infrastructure/notification.module.ts)                                                                             | 服务端通知模块组合根                             |
| [`packages/notification/src/server/application/notification-preference-portability.ts`](../../../packages/notification/src/server/application/notification-preference-portability.ts)                                                   | V3 stable delivery preference owner capability   |
| [`packages/notification/src/server/infrastructure/adapters/prisma/notification-prisma.repository.ts`](../../../packages/notification/src/server/infrastructure/adapters/prisma/notification-prisma.repository.ts)                       | Prisma 通知仓储                                  |
| [`packages/notification/src/server/infrastructure/adapters/prisma/notification-preference-prisma.repository.ts`](../../../packages/notification/src/server/infrastructure/adapters/prisma/notification-preference-prisma.repository.ts) | Prisma 偏好仓储                                  |

## Contracts 与数据结构

| 文件                                                                                                                                                                                            | 说明                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| [`packages/contracts/src/modules/notification/index.ts`](../../../packages/contracts/src/modules/notification/index.ts)                                                                         | 通知模块 contracts 入口                          |
| [`packages/contracts/src/modules/notification/portable-v3.ts`](../../../packages/contracts/src/modules/notification/portable-v3.ts)                                                             | V3 stable delivery preference portable schema    |
| [`packages/contracts/src/modules/notification/aggregates/notification-server.ts`](../../../packages/contracts/src/modules/notification/aggregates/notification-server.ts)                       | Notification 服务端 DTO                          |
| [`packages/contracts/src/modules/notification/aggregates/notification-client.ts`](../../../packages/contracts/src/modules/notification/aggregates/notification-client.ts)                       | Notification 客户端 DTO                          |
| [`packages/contracts/src/modules/notification/aggregates/notification-preference-server.ts`](../../../packages/contracts/src/modules/notification/aggregates/notification-preference-server.ts) | NotificationPreference 服务端 DTO                |
| [`packages/contracts/src/modules/notification/api/notification-crud.dto.ts`](../../../packages/contracts/src/modules/notification/api/notification-crud.dto.ts)                                 | 通知 CRUD DTO                                    |
| [`packages/contracts/src/modules/notification/api/notification-query.dto.ts`](../../../packages/contracts/src/modules/notification/api/notification-query.dto.ts)                               | 通知查询 DTO                                     |
| [`packages/contracts/src/modules/notification/protocol/notification-event-map.ts`](../../../packages/contracts/src/modules/notification/protocol/notification-event-map.ts)                     | 通知模块事件 map                                 |
| [`packages/contracts/src/modules/notification/protocol/notification-rpc-map.ts`](../../../packages/contracts/src/modules/notification/protocol/notification-rpc-map.ts)                         | 通知模块 RPC map                                 |
| [`packages/contracts/src/modules/notification/value-objects/notification-type.ts`](../../../packages/contracts/src/modules/notification/value-objects/notification-type.ts)                     | 通知类型枚举                                     |
| [`packages/contracts/src/modules/notification/value-objects/notification-category.ts`](../../../packages/contracts/src/modules/notification/value-objects/notification-category.ts)             | 通知分类枚举                                     |
| [`packages/contracts/src/modules/notification/value-objects/notification-workflow.ts`](../../../packages/contracts/src/modules/notification/value-objects/notification-workflow.ts)             | Workflow capability / preference contract        |
| [`packages/contracts/src/modules/notification/value-objects/delivery-plan.ts`](../../../packages/contracts/src/modules/notification/value-objects/delivery-plan.ts)                             | Per-channel DeliveryPlan outcome/reason contract |
| [`packages/database/prisma/schema/notification.prisma`](../../../packages/database/prisma/schema/notification.prisma)                                                                           | 通知模块 Prisma schema                           |

## 测试入口

| 文件                                                                                                                                                                                                                                  | 说明                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| [`packages/notification/src/server/domain/aggregates/__tests__/notification.spec.ts`](../../../packages/notification/src/server/domain/aggregates/__tests__/notification.spec.ts)                                                     | Notification 聚合测试           |
| [`packages/notification/src/server/domain/aggregates/__tests__/notification-preference.spec.ts`](../../../packages/notification/src/server/domain/aggregates/__tests__/notification-preference.spec.ts)                               | NotificationPreference 聚合测试 |
| [`packages/notification/src/server/domain/services/__tests__/notification-policy.spec.ts`](../../../packages/notification/src/server/domain/services/__tests__/notification-policy.spec.ts)                                           | 通知策略测试                    |
| [`packages/notification/src/server/application/use-cases/commands/__tests__/create-notification.test.ts`](../../../packages/notification/src/server/application/use-cases/commands/__tests__/create-notification.test.ts)             | 创建通知用例测试                |
| [`packages/notification/src/server/application/use-cases/commands/__tests__/mark-notification-as-read.test.ts`](../../../packages/notification/src/server/application/use-cases/commands/__tests__/mark-notification-as-read.test.ts) | 标记已读用例测试                |
| [`packages/notification/src/server/application/use-cases/queries/__tests__/get-unread-notifications.test.ts`](../../../packages/notification/src/server/application/use-cases/queries/__tests__/get-unread-notifications.test.ts)     | 未读通知查询测试                |
| [`packages/notification/src/api/routes.spec.ts`](../../../packages/notification/src/api/routes.spec.ts)                                                                                                                               | 通知 routes 测试                |
| [`packages/app-vue/src/modules/notification/stores/notificationStore.spec.ts`](../../../packages/app-vue/src/modules/notification/stores/notificationStore.spec.ts)                                                                   | 通知 store 测试                 |
| [`apps/web/e2e/notification/notification-center.spec.ts`](../../../apps/web/e2e/notification/notification-center.spec.ts)                                                                                                             | Web 通知中心 e2e                |

## 需要重点关注的改动风险

- 通知策略（偏好、免打扰、频率限制）对实际发送的影响。
- SSE 连接的稳定性和实时通知的可靠性。
- 通知模块是所有业务模块的触达出口，其稳定性影响面广。
- 通知模板渲染与业务事件之间的映射。
- HTTP、IPC、Prisma、PowerSync 多运行时适配器的一致性。
