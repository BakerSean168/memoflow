---
tags:
  - product
  - module-index
  - schedule
  - scheduler
description: Planner / Calendar 与 Scheduler / Temporal Engine 文件索引
created: 2026-06-02T00:00:00
updated: 2026-09-17T10:57:00+08:00
---

# 日程 / Scheduler 文件索引

本索引反映 system-vNext Phase 4 / ADR-080~083 收敛后的物理边界：

- `packages/schedule` = Planner / CalendarEntry 产品状态、派生 occupancy/conflict 读模型与 Calendar reliability；
- `packages/scheduler` = `ScheduledInvocation + InvocationAttempt` Temporal Engine；
- owner domain 仅通过 neutral `SchedulingPort` 提交 desired scheduling set；
- legacy `ScheduleTask / ScheduleExecution / ScheduleStatistic / SourceModule behavior routing` 已删除。

## Planner / Calendar 前端

| 文件 | 说明 |
| --- | --- |
| [`packages/app-vue/src/modules/schedule/views/ScheduleCalendarView.vue`](../../../packages/app-vue/src/modules/schedule/views/ScheduleCalendarView.vue) | 统一日/周/月 Calendar 主视图 |
| [`packages/app-vue/src/modules/schedule/router/index.ts`](../../../packages/app-vue/src/modules/schedule/router/index.ts) | 产品入口 `/schedule/calendar` |
| [`packages/app-vue/src/modules/schedule/composables/useScheduleCalendar.ts`](../../../packages/app-vue/src/modules/schedule/composables/useScheduleCalendar.ts) | CalendarEntry 产品操作 |
| [`packages/app-vue/src/modules/schedule/composables/useCalendarView.ts`](../../../packages/app-vue/src/modules/schedule/composables/useCalendarView.ts) | Planner 聚合读模型 |
| [`packages/app-vue/src/modules/schedule/planner/PlannerCalendar.vue`](../../../packages/app-vue/src/modules/schedule/planner/PlannerCalendar.vue) | FullCalendar Planner 渲染 |
| [`packages/app-vue/src/modules/schedule/planner/calendar-event-projection.ts`](../../../packages/app-vue/src/modules/schedule/planner/calendar-event-projection.ts) | Goal/Task/Routine/CalendarEntry projection + occupancy |
| [`packages/app-vue/src/modules/schedule/planner/planner-owner-command.router.ts`](../../../packages/app-vue/src/modules/schedule/planner/planner-owner-command.router.ts) | drag/resize 回写 owner command |

## Planner / Calendar 包 (`packages/schedule`)

| 文件 | 说明 |
| --- | --- |
| [`packages/schedule/src/server/domain/aggregates/calendar-entry.ts`](../../../packages/schedule/src/server/domain/aggregates/calendar-entry.ts) | CalendarEntry `Timed / AllDay` canonical range aggregate |
| [`packages/schedule/src/server/application/services/schedule-event-application-service.ts`](../../../packages/schedule/src/server/application/services/schedule-event-application-service.ts) | CalendarEntry 应用服务 |
| [`packages/schedule/src/server/application/services/schedule-conflict-detection-service.ts`](../../../packages/schedule/src/server/application/services/schedule-conflict-detection-service.ts) | derived conflict 查询 |
| [`packages/schedule/src/server/application/services/schedule-conflict-resolution-service.ts`](../../../packages/schedule/src/server/application/services/schedule-conflict-resolution-service.ts) | Calendar owner 冲突解决 |
| [`packages/schedule/src/server/application/services/schedule-rebuild-worker-service.ts`](../../../packages/schedule/src/server/application/services/schedule-rebuild-worker-service.ts) | Calendar rebuild/invalidation reliability |
| [`packages/schedule/src/server/application/services/schedule-domain-event-publisher.ts`](../../../packages/schedule/src/server/application/services/schedule-domain-event-publisher.ts) | durable Calendar domain-event publisher |
| [`packages/schedule/src/server/infrastructure/adapters/prisma/schedule-prisma.repository.ts`](../../../packages/schedule/src/server/infrastructure/adapters/prisma/schedule-prisma.repository.ts) | Prisma Calendar repository |
| [`packages/schedule/src/server/infrastructure/adapters/powersync/schedule-powersync.repository.ts`](../../../packages/schedule/src/server/infrastructure/adapters/powersync/schedule-powersync.repository.ts) | PowerSync Calendar repository |
| [`packages/schedule/src/api/schedule-event.routes.ts`](../../../packages/schedule/src/api/schedule-event.routes.ts) | Calendar HTTP routes |
| [`packages/schedule/src/api/routes.ts`](../../../packages/schedule/src/api/routes.ts) | rebuild timeline/replay/audit ops |
| [`packages/schedule/src/electron/index.ts`](../../../packages/schedule/src/electron/index.ts) | Calendar Electron transport |
| [`packages/schedule/src/client/index.ts`](../../../packages/schedule/src/client/index.ts) | `ScheduleClientPort` 产品 client seam |

## Scheduler / Temporal Engine 包 (`packages/scheduler`)

| 文件 | 说明 |
| --- | --- |
| [`packages/scheduler/src/server/domain/entities/scheduled-invocation.ts`](../../../packages/scheduler/src/server/domain/entities/scheduled-invocation.ts) | canonical `ScheduledInvocation` state machine |
| [`packages/scheduler/src/server/domain/entities/invocation-attempt.ts`](../../../packages/scheduler/src/server/domain/entities/invocation-attempt.ts) | immutable-ish execution attempt fact |
| [`packages/scheduler/src/server/application/scheduler/scheduled-invocation-queue.ts`](../../../packages/scheduler/src/server/application/scheduler/scheduled-invocation-queue.ts) | in-memory execution accelerator; DB remains truth |
| [`packages/scheduler/src/server/infrastructure/runtime/scheduled-invocation.runtime.ts`](../../../packages/scheduler/src/server/infrastructure/runtime/scheduled-invocation.runtime.ts) | lease/reload/reclaim/rescan runtime |
| [`packages/scheduler/src/server/infrastructure/lease/schedule-lease-coordinator.ts`](../../../packages/scheduler/src/server/infrastructure/lease/schedule-lease-coordinator.ts) | host lease coordinator |
| [`packages/scheduler/src/server/infrastructure/adapters/prisma/scheduled-invocation-prisma.repository.ts`](../../../packages/scheduler/src/server/infrastructure/adapters/prisma/scheduled-invocation-prisma.repository.ts) | Prisma ScheduledInvocation repository |
| [`packages/scheduler/src/server/infrastructure/adapters/prisma/invocation-attempt-prisma.repository.ts`](../../../packages/scheduler/src/server/infrastructure/adapters/prisma/invocation-attempt-prisma.repository.ts) | Prisma InvocationAttempt diagnostics repository |
| [`packages/scheduler/src/server/infrastructure/adapters/powersync/scheduled-invocation-powersync.repository.ts`](../../../packages/scheduler/src/server/infrastructure/adapters/powersync/scheduled-invocation-powersync.repository.ts) | PowerSync ScheduledInvocation repository |
| [`packages/scheduler/src/server/infrastructure/adapters/powersync/invocation-attempt-powersync.repository.ts`](../../../packages/scheduler/src/server/infrastructure/adapters/powersync/invocation-attempt-powersync.repository.ts) | PowerSync InvocationAttempt diagnostics repository |
| [`packages/scheduler/src/scheduling/handler-registry.ts`](../../../packages/scheduler/src/scheduling/handler-registry.ts) | `handlerKey -> ScheduledHandler` dispatch registry |
| [`packages/scheduler/src/server/infrastructure/scheduling/scheduled-invocation-scheduling.adapter.ts`](../../../packages/scheduler/src/server/infrastructure/scheduling/scheduled-invocation-scheduling.adapter.ts) | neutral SchedulingPort -> canonical invocation persistence |
| [`packages/scheduler/src/api/routes.ts`](../../../packages/scheduler/src/api/routes.ts) | read-only `/api/v1/scheduler/invocations*` diagnostics |
| [`packages/scheduler/src/electron/index.ts`](../../../packages/scheduler/src/electron/index.ts) | read-only `SchedulerChannels.INVOCATION_*` diagnostics |
| [`packages/scheduler/src/client/index.ts`](../../../packages/scheduler/src/client/index.ts) | `SchedulerClientPort` canonical diagnostics client seam |

## Shared integration seams

| 文件 | 说明 |
| --- | --- |
| [`packages/patterns/src/lease/index.ts`](../../../packages/patterns/src/lease/index.ts) | shared lease primitives |
| [`packages/schedule-orchestration/src/index.ts`](../../../packages/schedule-orchestration/src/index.ts) | owner projection + handler registration composition |
| [`apps/api/src/runtime/compose-schedule.ts`](../../../apps/api/src/runtime/compose-schedule.ts) | API Calendar/Scheduler sibling composition |
| [`apps/desktop/src/main/runtime/compose-schedule.ts`](../../../apps/desktop/src/main/runtime/compose-schedule.ts) | Desktop sibling composition + combined runtime controller |

## Contracts 与数据库

| 文件 | 说明 |
| --- | --- |
| [`packages/contracts/src/modules/schedule/index.ts`](../../../packages/contracts/src/modules/schedule/index.ts) | Calendar/Planner 产品 contracts + neutral SchedulingPort/ScheduledInvocation diagnostics seam |
| [`packages/contracts/src/modules/schedule/scheduling.ts`](../../../packages/contracts/src/modules/schedule/scheduling.ts) | SchedulingOwner/Intent/Port、handler、invocation/attempt diagnostics |
| [`packages/database/prisma/schema/schedule.prisma`](../../../packages/database/prisma/schema/schedule.prisma) | Calendar + canonical Temporal Engine persistence |
| [`packages/powersync-schema/src/index.ts`](../../../packages/powersync-schema/src/index.ts) | Desktop Calendar + ScheduledInvocation/Attempt schema |

旧 `ScheduleTask / ScheduleExecution / ScheduleStatistic` contracts、Prisma/PowerSync tables、API/IPC/export mappings 已由 S4-2302B destructive cutover 删除；不再是兼容层。

## 关键测试入口

| 文件 | 说明 |
| --- | --- |
| [`packages/schedule/src/server/domain/aggregates/__tests__/calendar-entry.spec.ts`](../../../packages/schedule/src/server/domain/aggregates/__tests__/calendar-entry.spec.ts) | CalendarEntry range aggregate |
| [`packages/schedule/src/server/infrastructure/adapters/prisma/schedule-w5-real-concurrency.integration.test.ts`](../../../packages/schedule/src/server/infrastructure/adapters/prisma/schedule-w5-real-concurrency.integration.test.ts) | Calendar PostgreSQL/PowerSync reliability |
| [`packages/scheduler/src/server/domain/entities/__tests__/scheduled-invocation.spec.ts`](../../../packages/scheduler/src/server/domain/entities/__tests__/scheduled-invocation.spec.ts) | ScheduledInvocation state machine |
| [`packages/scheduler/src/server/domain/entities/__tests__/invocation-attempt.spec.ts`](../../../packages/scheduler/src/server/domain/entities/__tests__/invocation-attempt.spec.ts) | InvocationAttempt state |
| [`packages/scheduler/src/server/infrastructure/adapters/prisma/mappers/prisma-scheduled-invocation.mapper.spec.ts`](../../../packages/scheduler/src/server/infrastructure/adapters/prisma/mappers/prisma-scheduled-invocation.mapper.spec.ts) | canonical persistence mapper |
| [`packages/app-vue/src/modules/schedule/planner/scheduler-boundary.surface.spec.ts`](../../../packages/app-vue/src/modules/schedule/planner/scheduler-boundary.surface.spec.ts) | Planner 不泄漏 Scheduler internals |

## 重点风险锁

- Calendar projection 与 Scheduler runtime truth 再次混合；
- owner domain 绕过 `SchedulingPort` 直接构造/写 `ScheduledInvocation`；
- 重新引入 `ScheduleTask / SourceModule behavior routing`；
- raw Scheduler diagnostics 进入普通 Planner 产品 UI；
- API/Desktop 在 lease、claim、retry、attempt diagnostics 上发生漂移；
- 为兼容旧 UI 恢复 raw worker mutation route。

## vNext 目标文档

当前代码已实施 ADR-080~083 的核心模型；后续 Phase 4 继续收口 Routine/Notification 并执行统一 `P4-CLOSE`。

| 文档 | 说明 |
| --- | --- |
| [`docs/product/schedule-planner-scheduler-vnext.md`](../schedule-planner-scheduler-vnext.md) | Planner/Calendar 与 Scheduler/Temporal Engine North Star |
| [`docs/architecture/adr/ADR-080-planner-calendar-range-occupancy-and-conflict-model.md`](../../architecture/adr/ADR-080-planner-calendar-range-occupancy-and-conflict-model.md) | Calendar Range / Occupancy / Conflict |
| [`docs/architecture/adr/ADR-081-scheduled-invocation-model-and-legacy-schedule-task-retirement.md`](../../architecture/adr/ADR-081-scheduled-invocation-model-and-legacy-schedule-task-retirement.md) | ScheduledInvocation / ScheduleTask retirement |
| [`docs/architecture/adr/ADR-082-scheduler-invocation-attempt-and-runtime-state-machine.md`](../../architecture/adr/ADR-082-scheduler-invocation-attempt-and-runtime-state-machine.md) | InvocationAttempt / runtime state machine |
| [`docs/architecture/adr/ADR-083-schedule-scheduler-contract-diagnostics-and-persistence-boundary.md`](../../architecture/adr/ADR-083-schedule-scheduler-contract-diagnostics-and-persistence-boundary.md) | contract / diagnostics / persistence boundary |
