---
tags:
  - product
  - module-index
  - schedule
  - scheduler
description: Planner / Calendar 与 Scheduler / Temporal Engine 文件索引
created: 2026-06-02T00:00:00
updated: 2026-09-07T15:20:00+08:00
---

# 日程 / Scheduler 文件索引

本索引反映 CLEAN-6304 之后的真实物理边界：`packages/schedule` = Planner/Calendar，`packages/scheduler` = Temporal Engine。

## Planner / Calendar 前端

| 文件 | 说明 |
| --- | --- |
| [`packages/app-vue/src/modules/schedule/views/ScheduleCalendarView.vue`](../../../packages/app-vue/src/modules/schedule/views/ScheduleCalendarView.vue) | 统一日/周/月 Calendar 主视图 |
| [`packages/app-vue/src/modules/schedule/composables/useScheduleCalendar.ts`](../../../packages/app-vue/src/modules/schedule/composables/useScheduleCalendar.ts) | CalendarEntry 产品操作 |
| [`packages/app-vue/src/modules/schedule/composables/useCalendarView.ts`](../../../packages/app-vue/src/modules/schedule/composables/useCalendarView.ts) | Planner 聚合读模型 |
| [`packages/app-vue/src/modules/schedule/planner/PlannerCalendar.vue`](../../../packages/app-vue/src/modules/schedule/planner/PlannerCalendar.vue) | FullCalendar Planner 渲染引擎 |
| [`packages/app-vue/src/modules/schedule/planner/calendar-event-projection.ts`](../../../packages/app-vue/src/modules/schedule/planner/calendar-event-projection.ts) | Goal/Task/Routine/CalendarEntry 统一事件 projection |
| [`packages/app-vue/src/modules/schedule/planner/planner-owner-command.router.ts`](../../../packages/app-vue/src/modules/schedule/planner/planner-owner-command.router.ts) | Planner drag/resize 到 owner command 的路由 |

## Planner / Calendar 包 (`packages/schedule`)

| 文件 | 说明 |
| --- | --- |
| [`packages/schedule/src/server/domain/aggregates/calendar-entry.ts`](../../../packages/schedule/src/server/domain/aggregates/calendar-entry.ts) | CalendarEntry 聚合 |
| [`packages/schedule/src/server/application/services/schedule-event-application-service.ts`](../../../packages/schedule/src/server/application/services/schedule-event-application-service.ts) | CalendarEntry 应用服务 |
| [`packages/schedule/src/server/application/services/schedule-conflict-detection-service.ts`](../../../packages/schedule/src/server/application/services/schedule-conflict-detection-service.ts) | 冲突检测 |
| [`packages/schedule/src/server/application/services/schedule-conflict-resolution-service.ts`](../../../packages/schedule/src/server/application/services/schedule-conflict-resolution-service.ts) | 冲突解决 |
| [`packages/schedule/src/server/application/services/schedule-rebuild-worker-service.ts`](../../../packages/schedule/src/server/application/services/schedule-rebuild-worker-service.ts) | Calendar conflict rebuild reliability worker |
| [`packages/schedule/src/server/application/services/schedule-domain-event-publisher.ts`](../../../packages/schedule/src/server/application/services/schedule-domain-event-publisher.ts) | Calendar durable domain-event publisher |
| [`packages/schedule/src/server/infrastructure/adapters/prisma/schedule-prisma.repository.ts`](../../../packages/schedule/src/server/infrastructure/adapters/prisma/schedule-prisma.repository.ts) | Prisma Calendar repository |
| [`packages/schedule/src/server/infrastructure/adapters/powersync/schedule-powersync.repository.ts`](../../../packages/schedule/src/server/infrastructure/adapters/powersync/schedule-powersync.repository.ts) | PowerSync Calendar repository |
| [`packages/schedule/src/api/schedule-event.routes.ts`](../../../packages/schedule/src/api/schedule-event.routes.ts) | Calendar HTTP routes |
| [`packages/schedule/src/api/routes.ts`](../../../packages/schedule/src/api/routes.ts) | Calendar rebuild timeline/replay/audit ops routes |
| [`packages/schedule/src/electron/index.ts`](../../../packages/schedule/src/electron/index.ts) | Calendar Electron transport |
| [`packages/schedule/src/client/index.ts`](../../../packages/schedule/src/client/index.ts) | `ScheduleClientPort` 产品 client seam |

## Scheduler / Temporal Engine 包 (`packages/scheduler`)

| 文件 | 说明 |
| --- | --- |
| [`packages/scheduler/src/server/domain/aggregates/schedule-task.ts`](../../../packages/scheduler/src/server/domain/aggregates/schedule-task.ts) | ScheduleTask 内部 invocation aggregate |
| [`packages/scheduler/src/server/domain/entities/schedule-execution.ts`](../../../packages/scheduler/src/server/domain/entities/schedule-execution.ts) | ScheduleExecution |
| [`packages/scheduler/src/server/application/scheduler/schedule-task-queue.ts`](../../../packages/scheduler/src/server/application/scheduler/schedule-task-queue.ts) | Temporal queue |
| [`packages/scheduler/src/server/infrastructure/runtime/schedule.runtime.ts`](../../../packages/scheduler/src/server/infrastructure/runtime/schedule.runtime.ts) | Scheduler runtime / dequeue / source execution |
| [`packages/scheduler/src/server/infrastructure/lease/schedule-lease-coordinator.ts`](../../../packages/scheduler/src/server/infrastructure/lease/schedule-lease-coordinator.ts) | ScheduleLease coordinator |
| [`packages/scheduler/src/server/infrastructure/adapters/prisma/schedule-task-prisma.repository.ts`](../../../packages/scheduler/src/server/infrastructure/adapters/prisma/schedule-task-prisma.repository.ts) | Prisma ScheduleTask repository |
| [`packages/scheduler/src/server/infrastructure/adapters/prisma/schedule-execution-prisma.repository.ts`](../../../packages/scheduler/src/server/infrastructure/adapters/prisma/schedule-execution-prisma.repository.ts) | Prisma ScheduleExecution repository |
| [`packages/scheduler/src/server/infrastructure/adapters/powersync/schedule-task-powersync.repository.ts`](../../../packages/scheduler/src/server/infrastructure/adapters/powersync/schedule-task-powersync.repository.ts) | PowerSync ScheduleTask repository |
| [`packages/scheduler/src/scheduling/handler-registry.ts`](../../../packages/scheduler/src/scheduling/handler-registry.ts) | Scheduled handler registry |
| [`packages/scheduler/src/server/infrastructure/scheduling/legacy-schedule-task-scheduling.adapter.ts`](../../../packages/scheduler/src/server/infrastructure/scheduling/legacy-schedule-task-scheduling.adapter.ts) | Internal SchedulingPort → ScheduleTask persistence adapter |
| [`packages/scheduler/src/api/routes.ts`](../../../packages/scheduler/src/api/routes.ts) | Read-only worker diagnostics HTTP routes |
| [`packages/scheduler/src/electron/index.ts`](../../../packages/scheduler/src/electron/index.ts) | Read-only worker diagnostics Electron transport |
| [`packages/scheduler/src/client/index.ts`](../../../packages/scheduler/src/client/index.ts) | `SchedulerClientPort` diagnostics client seam |

## Shared integration seams

| 文件 | 说明 |
| --- | --- |
| [`packages/patterns/src/lease/index.ts`](../../../packages/patterns/src/lease/index.ts) | `LeaseCoordinatorPort` / `LeaseGuard` / `LeaseLostError` shared contract |
| [`packages/schedule-orchestration/src/infrastructure-server/schedule-orchestration.module.ts`](../../../packages/schedule-orchestration/src/infrastructure-server/schedule-orchestration.module.ts) | owner-domain projection + Scheduler source executor integration |
| [`apps/api/src/runtime/compose-schedule.ts`](../../../apps/api/src/runtime/compose-schedule.ts) | API sibling Calendar/Scheduler composition |
| [`apps/desktop/src/main/runtime/compose-schedule.ts`](../../../apps/desktop/src/main/runtime/compose-schedule.ts) | Desktop sibling Calendar/Scheduler composition + combined runtime controller |
| [`packages/app-react/src/hooks/useScheduleTasks.ts`](../../../packages/app-react/src/hooks/useScheduleTasks.ts) | React worker diagnostics，使用 `SchedulerClientPort` |

## Contracts 与数据库

ScheduleTask / ScheduleExecution 的 DTO、事件与数据库表仍位于历史 `schedule` contract/schema namespace；这是受保护的兼容层，不代表 package ownership 仍混合。

| 文件 | 说明 |
| --- | --- |
| [`packages/contracts/src/modules/schedule/index.ts`](../../../packages/contracts/src/modules/schedule/index.ts) | Calendar + Scheduler 共享兼容 contracts |
| [`packages/database/prisma/schema/schedule.prisma`](../../../packages/database/prisma/schema/schedule.prisma) | Calendar / Scheduler persistence schema |

## 关键测试入口

| 文件 | 说明 |
| --- | --- |
| [`packages/schedule/src/server/domain/aggregates/__tests__/calendar-entry.spec.ts`](../../../packages/schedule/src/server/domain/aggregates/__tests__/calendar-entry.spec.ts) | CalendarEntry aggregate |
| [`packages/schedule/src/server/infrastructure/adapters/prisma/schedule-w5-real-concurrency.integration.test.ts`](../../../packages/schedule/src/server/infrastructure/adapters/prisma/schedule-w5-real-concurrency.integration.test.ts) | PostgreSQL/PowerSync Calendar reliability + Scheduler lease interop |
| [`packages/scheduler/src/server/domain/aggregates/__tests__/schedule-task.spec.ts`](../../../packages/scheduler/src/server/domain/aggregates/__tests__/schedule-task.spec.ts) | ScheduleTask aggregate |
| [`packages/scheduler/src/server/infrastructure/adapters/prisma/schedule-task-prisma.repository.integration.test.ts`](../../../packages/scheduler/src/server/infrastructure/adapters/prisma/schedule-task-prisma.repository.integration.test.ts) | Scheduler Prisma repository real DB integration |
| [`packages/scheduler/src/server/infrastructure/runtime/schedule.runtime.spec.ts`](../../../packages/scheduler/src/server/infrastructure/runtime/schedule.runtime.spec.ts) | Scheduler runtime semantics |
| [`packages/app-vue/src/modules/schedule/planner/scheduler-boundary.surface.spec.ts`](../../../packages/app-vue/src/modules/schedule/planner/scheduler-boundary.surface.spec.ts) | Planner 不泄漏 Scheduler internals 的 surface gate |

## 重点风险

- Calendar projection 与 Scheduler invocation 的 truth 再次混合；
- owner domain 绕过 `SchedulingPort` 直接写 raw ScheduleTask；
- API / Desktop 只装配其中一个 sibling module 导致 host parity 漂移；
- PostgreSQL / PowerSync lease、claim、outbox、retry 行为发生差异；
- 为兼容旧 UI 恢复 raw worker mutation product route。
