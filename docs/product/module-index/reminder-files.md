---
tags:
  - product
  - module-index
  - reminder
description: 提醒模块相关文件索引
created: 2026-06-02T00:00:00
updated: 2026-09-07T00:00:00
---

# 提醒模块文件索引

本索引用于连接提醒模块的业务说明和真实代码。它不是代码注释替代品；做优化前仍需以当前代码、配置和测试为准。

## 前端页面与路由

| 文件 | 说明 |
| --- | --- |
| [`packages/app-vue/src/modules/reminder/router/index.ts`](../../../packages/app-vue/src/modules/reminder/router/index.ts) | Vue 提醒模块路由，定义提醒列表入口 |
| [`packages/app-vue/src/modules/reminder/views/ReminderLinearView.vue`](../../../packages/app-vue/src/modules/reminder/views/ReminderLinearView.vue) | 提醒列表主视图 |

## 前端状态、组合函数与组件

| 文件 | 说明 |
| --- | --- |
| [`packages/app-vue/src/modules/reminder/stores/reminder-store.ts`](../../../packages/app-vue/src/modules/reminder/stores/reminder-store.ts) | 提醒模块 Pinia store |
| [`packages/app-vue/src/modules/reminder/composables/useReminder.ts`](../../../packages/app-vue/src/modules/reminder/composables/useReminder.ts) | 提醒编排组合函数 |
| [`packages/app-vue/src/modules/reminder/composables/useReminderTemplates.ts`](../../../packages/app-vue/src/modules/reminder/composables/useReminderTemplates.ts) | 提醒模板 CRUD 组合函数 |
| [`packages/app-vue/src/modules/reminder/composables/useReminderGroups.ts`](../../../packages/app-vue/src/modules/reminder/composables/useReminderGroups.ts) | 提醒分组 CRUD 组合函数 |
| [`packages/app-vue/src/modules/reminder/composables/useReminderPreferences.ts`](../../../packages/app-vue/src/modules/reminder/composables/useReminderPreferences.ts) | 提醒偏好组合函数 |
| [`packages/app-vue/src/modules/reminder/components/ReminderTemplateCard.vue`](../../../packages/app-vue/src/modules/reminder/components/ReminderTemplateCard.vue) | 提醒模板卡片 |
| [`packages/app-vue/src/modules/reminder/components/TemplateDialog.vue`](../../../packages/app-vue/src/modules/reminder/components/TemplateDialog.vue) | 模板创建/编辑弹窗 |
| [`packages/app-vue/src/modules/reminder/components/TemplateMoveDialog.vue`](../../../packages/app-vue/src/modules/reminder/components/TemplateMoveDialog.vue) | 模板移动弹窗 |
| [`packages/app-vue/src/modules/reminder/components/GroupDialog.vue`](../../../packages/app-vue/src/modules/reminder/components/GroupDialog.vue) | 提醒分组卡片 |
| [`packages/app-vue/src/modules/reminder/components/GroupDialog.vue`](../../../packages/app-vue/src/modules/reminder/components/GroupDialog.vue) | 分组创建/编辑弹窗 |
| [`packages/app-vue/src/modules/reminder/views/ReminderLinearView.vue`](../../../packages/app-vue/src/modules/reminder/views/ReminderLinearView.vue) | 提醒实例侧边栏 |
| [`packages/app-vue/src/modules/reminder/components/widgets/UpcomingRemindersWidget.vue`](../../../packages/app-vue/src/modules/reminder/components/widgets/UpcomingRemindersWidget.vue) | 调度状态卡片 |
| [`packages/app-vue/src/modules/reminder/components/widgets/UpcomingRemindersWidget.vue`](../../../packages/app-vue/src/modules/reminder/components/widgets/UpcomingRemindersWidget.vue) | Dashboard 即将提醒小组件 |
| [`packages/app-vue/src/modules/reminder/presentation/lifecycle-presentation.ts`](../../../packages/app-vue/src/modules/reminder/presentation/lifecycle-presentation.ts) | 生命周期展示辅助函数 |

## 移动端入口

| 文件 | 说明 |
| --- | --- |
| [`apps/mobile/src/app/explore/reminders.tsx`](../../../apps/mobile/src/app/explore/reminders.tsx) | 移动端提醒列表入口 |
| [`apps/mobile/src/app/explore/reminder-detail.tsx`](../../../apps/mobile/src/app/explore/reminder-detail.tsx) | 移动端提醒详情入口 |
| [`apps/mobile/src/app/explore/reminder-editor.tsx`](../../../apps/mobile/src/app/explore/reminder-editor.tsx) | 移动端提醒编辑入口 |

## API、控制器与适配器

| 文件 | 说明 |
| --- | --- |
| [`packages/reminder/src/api/routes/reminder-template.routes.ts`](../../../packages/reminder/src/api/routes/reminder-template.routes.ts) | 提醒模板 HTTP routes |
| [`packages/reminder/src/api/routes/reminder-group.routes.ts`](../../../packages/reminder/src/api/routes/reminder-group.routes.ts) | 提醒分组 HTTP routes |
| [`packages/reminder/src/api/routes/reminder-preferences.routes.ts`](../../../packages/reminder/src/api/routes/reminder-preferences.routes.ts) | 提醒偏好 HTTP routes |
| [`packages/reminder/src/server/transport/reminder.controller.ts`](../../../packages/reminder/src/server/transport/reminder.controller.ts) | 传输层处理器 |
| [`packages/reminder/src/server/infrastructure/schedule-execution-source.ts`](../../../packages/reminder/src/server/infrastructure/schedule-execution-source.ts) | 提醒 → 日程运行时贡献 |
| [`packages/reminder/src/server/transport/reminder.controller.ts`](../../../packages/reminder/src/server/transport/reminder.controller.ts) | 提醒控制器 |
| [`packages/reminder/src/infrastructure-client/adapters/http/reminder-http.adapter.ts`](../../../packages/reminder/src/infrastructure-client/adapters/http/reminder-http.adapter.ts) | 客户端 HTTP 适配器 |
| [`packages/reminder/src/infrastructure-client/adapters/ipc/reminder-ipc.adapter.ts`](../../../packages/reminder/src/infrastructure-client/adapters/ipc/reminder-ipc.adapter.ts) | 客户端 IPC 适配器 |

## 领域、用例与仓储

| 文件 | 说明 |
| --- | --- |
| [`packages/reminder/src/server/domain/aggregates/reminder-template.ts`](../../../packages/reminder/src/server/domain/aggregates/reminder-template.ts) | ReminderTemplate 聚合根 |
| [`packages/reminder/src/server/domain/aggregates/reminder-group.ts`](../../../packages/reminder/src/server/domain/aggregates/reminder-group.ts) | ReminderGroup 聚合根 |
| [`packages/reminder/src/server/domain/aggregates/user-reminder-preferences.ts`](../../../packages/reminder/src/server/domain/aggregates/user-reminder-preferences.ts) | UserReminderPreferences 聚合根 |
| [`packages/reminder/src/server/domain/entities/reminder-response.ts`](../../../packages/reminder/src/server/domain/entities/reminder-response.ts) | ReminderResponse 实体 |
| [`packages/reminder/src/server/domain/entities/reminder-history.ts`](../../../packages/reminder/src/server/domain/entities/reminder-history.ts) | ReminderHistory 实体 |
| [`packages/reminder/src/server/domain/services/reminder-domain-service.ts`](../../../packages/reminder/src/server/domain/services/reminder-domain-service.ts) | 提醒领域服务 |
| [`packages/reminder/src/server/domain/ports/routine-profile-store.port.ts`](../../../packages/reminder/src/server/domain/ports/routine-profile-store.port.ts) | RoutineDefinition / RoutineProfile / ProfileMembership 规范化持久化端口 |
| [`packages/reminder/src/server/domain/services/legacy-routine-cutover-service.ts`](../../../packages/reminder/src/server/domain/services/legacy-routine-cutover-service.ts) | legacy Reminder → Routine vNext 临时切换桥，避免普通编辑压缩 M:N membership |
| [`packages/reminder/src/server/domain/services/reminder-template-control-service.ts`](../../../packages/reminder/src/server/domain/services/reminder-template-control-service.ts) | 模板控制服务（有效启用状态计算） |
| [`packages/reminder/src/server/domain/services/reminder-trigger-service.ts`](../../../packages/reminder/src/server/domain/services/reminder-trigger-service.ts) | 触发执行服务 |
| [`packages/reminder/src/server/domain/services/reminder-scheduler-service.ts`](../../../packages/reminder/src/server/domain/services/reminder-scheduler-service.ts) | 调度扫描服务 |
| [`packages/reminder/src/server/application/use-cases/commands/create-reminder-template.use-case.ts`](../../../packages/reminder/src/server/application/use-cases/commands/create-reminder-template.use-case.ts) | 创建模板用例 |
| [`packages/reminder/src/server/application/use-cases/commands/record-reminder-response.use-case.ts`](../../../packages/reminder/src/server/application/use-cases/commands/record-reminder-response.use-case.ts) | 记录响应用例 |
| [`packages/reminder/src/server/application/use-cases/commands/adjust-reminder-frequency.use-case.ts`](../../../packages/reminder/src/server/application/use-cases/commands/adjust-reminder-frequency.use-case.ts) | 频率调整用例 |
| [`packages/reminder/src/server/application/use-cases/queries/analyze-reminder-frequency.use-case.ts`](../../../packages/reminder/src/server/application/use-cases/queries/analyze-reminder-frequency.use-case.ts) | 频率分析查询 |
| [`packages/reminder/src/server/infrastructure/reminder.module.ts`](../../../packages/reminder/src/server/infrastructure/reminder.module.ts) | 服务端提醒模块组合根 |
| [`packages/reminder/src/server/infrastructure/adapters/prisma/reminder-template-prisma.repository.ts`](../../../packages/reminder/src/server/infrastructure/adapters/prisma/reminder-template-prisma.repository.ts) | Prisma 模板仓储 |
| [`packages/reminder/src/server/infrastructure/routine-vnext/routine-profile-store.prisma.ts`](../../../packages/reminder/src/server/infrastructure/routine-vnext/routine-profile-store.prisma.ts) | Prisma Routine/Profile/M:N Membership store |
| [`packages/reminder/src/server/infrastructure/routine-vnext/routine-profile-store.powersync.ts`](../../../packages/reminder/src/server/infrastructure/routine-vnext/routine-profile-store.powersync.ts) | PowerSync Routine/Profile/M:N Membership store |

## Contracts 与数据结构

| 文件 | 说明 |
| --- | --- |
| [`packages/contracts/src/modules/reminder/aggregates/reminder-template-server.ts`](../../../packages/contracts/src/modules/reminder/aggregates/reminder-template-server.ts) | ReminderTemplate 服务端 DTO |
| [`packages/contracts/src/modules/reminder/aggregates/reminder-template-client.ts`](../../../packages/contracts/src/modules/reminder/aggregates/reminder-template-client.ts) | ReminderTemplate 客户端 DTO |
| [`packages/contracts/src/modules/reminder/aggregates/reminder-group-server.ts`](../../../packages/contracts/src/modules/reminder/aggregates/reminder-group-server.ts) | ReminderGroup 服务端 DTO |
| [`packages/contracts/src/modules/reminder/aggregates/reminder-group-client.ts`](../../../packages/contracts/src/modules/reminder/aggregates/reminder-group-client.ts) | ReminderGroup 客户端 DTO |
| [`packages/contracts/src/modules/reminder/api/reminder-template.dto.ts`](../../../packages/contracts/src/modules/reminder/api/reminder-template.dto.ts) | 模板 API DTO |
| [`packages/contracts/src/modules/reminder/api/reminder-group.dto.ts`](../../../packages/contracts/src/modules/reminder/api/reminder-group.dto.ts) | 分组 API DTO |
| [`packages/contracts/src/modules/reminder/protocol/reminder-rpc-map.ts`](../../../packages/contracts/src/modules/reminder/protocol/reminder-rpc-map.ts) | 提醒模块 RPC map |
| [`packages/contracts/src/modules/reminder/protocol/reminder-event-map.ts`](../../../packages/contracts/src/modules/reminder/protocol/reminder-event-map.ts) | 提醒模块事件 map |
| [`packages/contracts/src/modules/reminder/value-objects/reminder-status.ts`](../../../packages/contracts/src/modules/reminder/value-objects/reminder-status.ts) | 提醒状态枚举 |
| [`packages/contracts/src/modules/reminder/value-objects/trigger-type.ts`](../../../packages/contracts/src/modules/reminder/value-objects/trigger-type.ts) | 触发类型枚举 |
| [`packages/database/prisma/schema/reminder.prisma`](../../../packages/database/prisma/schema/reminder.prisma) | 提醒模块 Prisma schema |

## 测试入口

| 文件 | 说明 |
| --- | --- |
| [`packages/reminder/src/server/domain/aggregates/__tests__/reminder-template.spec.ts`](../../../packages/reminder/src/server/domain/aggregates/__tests__/reminder-template.spec.ts) | ReminderTemplate 聚合测试 |
| [`packages/reminder/src/server/domain/aggregates/__tests__/reminder-group.spec.ts`](../../../packages/reminder/src/server/domain/aggregates/__tests__/reminder-group.spec.ts) | ReminderGroup 聚合测试 |
| [`packages/reminder/src/server/domain/services/__tests__/reminder-template-control.service.spec.ts`](../../../packages/reminder/src/server/domain/services/__tests__/reminder-template-control.service.spec.ts) | 模板控制服务测试 |
| [`packages/reminder/src/server/domain/services/__tests__/reminder-trigger.service.spec.ts`](../../../packages/reminder/src/server/domain/services/__tests__/reminder-trigger.service.spec.ts) | 触发服务测试 |
| [`packages/reminder/src/server/domain/services/__tests__/legacy-routine-cutover-service.spec.ts`](../../../packages/reminder/src/server/domain/services/__tests__/legacy-routine-cutover-service.spec.ts) | legacy cutover 自愈与 M:N 防塌缩测试 |
| [`packages/reminder/src/server/infrastructure/routine-vnext/routine-profile-store.powersync.spec.ts`](../../../packages/reminder/src/server/infrastructure/routine-vnext/routine-profile-store.powersync.spec.ts) | PowerSync M:N store 真实 SQLite 测试 |
| [`packages/reminder/src/server/infrastructure/routine-vnext/routine-profile-store.prisma.integration.test.ts`](../../../packages/reminder/src/server/infrastructure/routine-vnext/routine-profile-store.prisma.integration.test.ts) | Prisma M:N store PostgreSQL 集成测试 |
| [`packages/reminder/src/server/application/use-cases/commands/reminder-use-cases.test.ts`](../../../packages/reminder/src/server/application/use-cases/commands/reminder-use-cases.test.ts) | 命令用例测试 |
| [`packages/reminder/src/server/application/use-cases/queries/analyze-reminder-frequency.spec.ts`](../../../packages/reminder/src/server/application/use-cases/queries/analyze-reminder-frequency.spec.ts) | 频率分析测试 |
| [`packages/reminder/src/api/routes/reminder-template.routes.spec.ts`](../../../packages/reminder/src/api/routes/reminder-template.routes.spec.ts) | 模板 routes 测试 |
| [`packages/app-vue/src/modules/reminder/stores/reminderStore.spec.ts`](../../../packages/app-vue/src/modules/reminder/stores/reminderStore.spec.ts) | 提醒 store 测试 |
| [`apps/web/e2e/reminder/reminder-template-crud.spec.ts`](../../../apps/web/e2e/reminder/reminder-template-crud.spec.ts) | Web 提醒模板 CRUD e2e |

## 需要重点关注的改动风险

- 提醒有效启用状态的三层控制逻辑（模板、分组、全局偏好）。
- 提醒与 Schedule 模块的跨模块依赖：提醒事件变更会影响调度侧。
- 智能频率调整依赖历史响应数据的准确性。
- HTTP、IPC、Prisma、PowerSync 多运行时适配器的一致性。
