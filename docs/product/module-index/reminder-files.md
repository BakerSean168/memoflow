---
tags:
  - product
  - module-index
  - routine
description: Routine vNext 运行时、调度与持久化文件索引
created: 2026-06-02T00:00:00
updated: 2026-09-17T20:10:00+08:00
---

# Routine vNext 文件索引

`@memoflow/reminder` 保留历史包名，但 R4-2201C 后其生产权威只包含 **Routine vNext**。旧 Reminder CRUD、HTTP/IPC client、模板/分组/实例/响应模型与 UI 路由已经破坏式退休；ADR-111 明确不保留旧产品数据和兼容读写路径。

## 宿主组合入口

| 文件 | 说明 |
| --- | --- |
| [`apps/api/src/runtime/compose-routine.ts`](../../../apps/api/src/runtime/compose-routine.ts) | API host 的 Routine command composition |
| [`apps/desktop/src/main/runtime/compose-routine.ts`](../../../apps/desktop/src/main/runtime/compose-routine.ts) | Desktop profile runtime 的 Activity / Elapsed / ActiveUsage / Intervention composition |
| [`packages/reminder/src/index.ts`](../../../packages/reminder/src/index.ts) | 历史包名下的 canonical Routine root surface |
| [`packages/reminder/src/server/index.ts`](../../../packages/reminder/src/server/index.ts) | Routine server seam |

## 领域与应用层

| 文件 | 说明 |
| --- | --- |
| [`packages/reminder/src/server/domain/routine/trigger.ts`](../../../packages/reminder/src/server/domain/routine/trigger.ts) | WallClock / Elapsed / ActiveUsage 等 canonical trigger 语义 |
| [`packages/reminder/src/server/domain/routine/model.ts`](../../../packages/reminder/src/server/domain/routine/model.ts) | RoutineDefinition / RoutineProfile owner aggregates 与 membership 语义 |
| [`packages/reminder/src/server/domain/routine/protocol.ts`](../../../packages/reminder/src/server/domain/routine/protocol.ts) | ProtocolDefinition / ProtocolSession 语义 |
| [`packages/reminder/src/server/domain/ports/routine-profile-store.port.ts`](../../../packages/reminder/src/server/domain/ports/routine-profile-store.port.ts) | Routine/Profile/M:N membership persistence port |
| [`packages/reminder/src/server/domain/ports/routine-occurrence-truth-store.port.ts`](../../../packages/reminder/src/server/domain/ports/routine-occurrence-truth-store.port.ts) | RoutineOccurrence + Interaction durable truth port |
| [`packages/reminder/src/server/domain/ports/routine-temporary-override-store.port.ts`](../../../packages/reminder/src/server/domain/ports/routine-temporary-override-store.port.ts) | Snooze / temporary override persistence port |
| [`packages/reminder/src/server/application/services/routine-coach-command.service.ts`](../../../packages/reminder/src/server/application/services/routine-coach-command.service.ts) | Routine owner-domain command seam |
| [`packages/reminder/src/server/application/services/routine-notification-owner-command.adapter.ts`](../../../packages/reminder/src/server/application/services/routine-notification-owner-command.adapter.ts) | Notification typed owner-command → Routine command adapter |

## 持久化与调度

| 文件 | 说明 |
| --- | --- |
| [`packages/reminder/src/server/infrastructure/prisma.ts`](../../../packages/reminder/src/server/infrastructure/prisma.ts) | Prisma-backed canonical Routine repository set |
| [`packages/reminder/src/server/infrastructure/powersync.ts`](../../../packages/reminder/src/server/infrastructure/powersync.ts) | PowerSync-backed canonical Routine repository set |
| [`packages/reminder/src/server/infrastructure/routine-vnext/routine-profile-store.prisma.ts`](../../../packages/reminder/src/server/infrastructure/routine-vnext/routine-profile-store.prisma.ts) | Prisma Routine/Profile store |
| [`packages/reminder/src/server/infrastructure/routine-vnext/routine-profile-store.powersync.ts`](../../../packages/reminder/src/server/infrastructure/routine-vnext/routine-profile-store.powersync.ts) | PowerSync Routine/Profile store |
| [`packages/reminder/src/server/infrastructure/routine-vnext/routine-occurrence-truth-store.prisma.ts`](../../../packages/reminder/src/server/infrastructure/routine-vnext/routine-occurrence-truth-store.prisma.ts) | Prisma occurrence/interaction truth store |
| [`packages/reminder/src/server/infrastructure/routine-vnext/routine-occurrence-truth-store.powersync.ts`](../../../packages/reminder/src/server/infrastructure/routine-vnext/routine-occurrence-truth-store.powersync.ts) | PowerSync occurrence/interaction truth store |
| [`packages/reminder/src/server/infrastructure/routine-schedule/routine-schedule-projection-source.ts`](../../../packages/reminder/src/server/infrastructure/routine-schedule/routine-schedule-projection-source.ts) | WallClock Routine → SchedulingPort desired projection |
| [`packages/reminder/src/server/infrastructure/routine-schedule/routine-schedule-execution-source.ts`](../../../packages/reminder/src/server/infrastructure/routine-schedule/routine-schedule-execution-source.ts) | ScheduledInvocation → Routine occurrence commit execution |
| [`packages/reminder/src/server/infrastructure/routine-schedule/routine-wall-clock-scheduled-handler.ts`](../../../packages/reminder/src/server/infrastructure/routine-schedule/routine-wall-clock-scheduled-handler.ts) | Scannerless Routine wall-clock handler |
| [`packages/schedule-orchestration/src/index.ts`](../../../packages/schedule-orchestration/src/index.ts) | Task / Goal / Routine canonical scheduling public seam |
| [`packages/database/prisma/schema/reminder.prisma`](../../../packages/database/prisma/schema/reminder.prisma) | 历史文件名下仅保留 Routine vNext Prisma models |
| [`packages/database/prisma/migrations/retire-legacy-reminder-model.sql`](../../../packages/database/prisma/migrations/retire-legacy-reminder-model.sql) | ADR-111 破坏式删除 legacy Reminder tables |

## 本地运行时与桌面交互

| 文件 | 说明 |
| --- | --- |
| [`packages/reminder/src/routine-runtime/index.ts`](../../../packages/reminder/src/routine-runtime/index.ts) | Routine runtime public seam |
| [`packages/reminder/src/server/runtime/routine-activity/routine-activity-sensor.runtime.ts`](../../../packages/reminder/src/server/runtime/routine-activity/routine-activity-sensor.runtime.ts) | Activity truth runtime |
| [`packages/reminder/src/server/runtime/elapsed/elapsed.runtime.ts`](../../../packages/reminder/src/server/runtime/elapsed/elapsed.runtime.ts) | Elapsed trigger runtime |
| [`packages/reminder/src/server/runtime/active-usage/active-usage.runtime.ts`](../../../packages/reminder/src/server/runtime/active-usage/active-usage.runtime.ts) | ActiveUsage accumulation/runtime |
| [`packages/reminder/src/server/runtime/intervention/intervention.runtime.ts`](../../../packages/reminder/src/server/runtime/intervention/intervention.runtime.ts) | Intervention state/runtime |
| [`apps/desktop/src/main/modules/routine/intervention-window-controller.ts`](../../../apps/desktop/src/main/modules/routine/intervention-window-controller.ts) | Desktop InterventionWindow controller |

## 关键测试

| 文件 | 说明 |
| --- | --- |
| [`packages/reminder/src/server/infrastructure/routine-schedule/__tests__/routine-schedule-execution-source.spec.ts`](../../../packages/reminder/src/server/infrastructure/routine-schedule/__tests__/routine-schedule-execution-source.spec.ts) | Revision drift、lease/fencing、幂等与 retry 语义 |
| [`packages/reminder/src/server/infrastructure/routine-schedule/__tests__/routine-wall-clock-scheduled-handler.spec.ts`](../../../packages/reminder/src/server/infrastructure/routine-schedule/__tests__/routine-wall-clock-scheduled-handler.spec.ts) | Scheduler handler result mapping |
| [`packages/reminder/src/server/infrastructure/routine-schedule/__tests__/routine-prisma-adapters.integration.test.ts`](../../../packages/reminder/src/server/infrastructure/routine-schedule/__tests__/routine-prisma-adapters.integration.test.ts) | Occurrence + NotificationRequested 事务一致性 |
| [`packages/reminder/src/server/infrastructure/routine-vnext/routine-profile-store.prisma.integration.test.ts`](../../../packages/reminder/src/server/infrastructure/routine-vnext/routine-profile-store.prisma.integration.test.ts) | Routine/Profile Prisma integration |
| [`packages/reminder/src/__tests__/package-root-owner-surface.spec.ts`](../../../packages/reminder/src/__tests__/package-root-owner-surface.spec.ts) | 防止 legacy Reminder owner authority 重新进入 public surface |

## 当前边界

- Routine 是唯一 owner truth；不得重新引入旧 Reminder 模型、旧 `/reminders` 产品入口或旧 Reminder IPC channels。
- WallClock 统一走 Scheduler `ScheduledInvocation`；Elapsed / ActiveUsage / Protocol 由 Routine runtime 自有状态机负责。
- Notification 只持有 Fact/Interaction/Delivery truth；Routine 动作通过 typed owner-command 回到 Routine application port。
- Home / Planner 对 Routine 的新读模型在 Phase 5 接入；R4-2201C 不以保留旧 Reminder read model 的方式过渡。
