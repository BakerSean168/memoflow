---
tags:
  - analysis
  - schedule
  - scheduler
  - planner
  - temporal-engine
  - current-system
description: 2026-09-08 Schedule/Planner 与 Scheduler/Temporal Engine 的真实代码模型、已完成边界、残余旧壳和 vNext 迁移映射
created: 2026-09-08T20:45:00+08:00
updated: 2026-09-08T20:45:00+08:00
---

# Schedule / Scheduler Current System Map — 2026-09-08

## 1. 目的

本文件记录当前代码事实，不把 ADR 中的目标设计误写成已经实现。

当前最重要的结论：

```text
Package boundary            已完成
SchedulingPort seam         已完成主体
Planner projection seam     已存在
Canonical internal model    尚未完成收敛
```

也就是说：

```text
@memoflow/schedule   与 @memoflow/scheduler 已经分包
```

但 Scheduler persistence/runtime 仍以 legacy `ScheduleTask` 作为实现壳，Planner 的 CalendarEntry 也仍带有 derived conflict/cache 字段。

## 2. 当前物理边界

### Schedule / Planner

```text
packages/schedule
```

当前主要职责：

- CalendarEntry aggregate；
- Calendar HTTP/IPC/client；
- conflict detection/resolution；
- conflict rebuild outbox；
- domain event outbox/publisher；
- Prisma / PowerSync Calendar persistence。

### Scheduler / Temporal Engine

```text
packages/scheduler
```

当前主要职责：

- ScheduleTask legacy aggregate；
- ScheduleExecution；
- queue/runtime；
- host lease；
- claim/retry/backoff；
- SchedulingPort adapter；
- Handler Registry；
- raw worker read-only diagnostics；
- Prisma / PowerSync persistence。

### Cross-module orchestration

```text
packages/schedule-orchestration
```

拥有：

- Goal projector/runtime；
- Task projector/runtime；
- Reminder/Routine projector/runtime；
- handler registration/composite runtime；
- projection repair/reconcile orchestration。

## 3. 当前 Planner 模型

### 3.1 CalendarEntry

当前真实 state：

```text
CalendarEntryState
├── id
├── identityId
├── title
├── description?
├── startTime
├── endTime
├── duration
├── hasConflict
├── conflictingEntries[]?
├── priority?
├── location?
├── attendees[]?
├── version
├── createdAt
└── updatedAt
```

当前 aggregate 行为包括：

- create/load；
- update/reschedule；
- delete event；
- detectConflicts；
- markAsConflicting / clearConflicts；
- conflict suggestion generation。

### 3.2 Current gap

| Current fact                                      | Gap                               | Target                                |
| ------------------------------------------------- | --------------------------------- | ------------------------------------- |
| start/end/duration 都持久化                       | duration 是冗余真值               | range 为唯一真值，duration 派生       |
| hasConflict/conflictingEntries 在 aggregate state | 依赖其它 event，实际是 projection | PlannerConflictProjection             |
| CalendarEntry 只支持 timed range                  | Planner contract 已支持 all-day   | CalendarEntryRange = Timed/AllDay     |
| conflict 主要查询 schedules table                 | Task/Goal/Routine 已进入 Planner  | occupancy-based cross-source conflict |
| priority 1~5                                      | UI 曾出现 0~10，且无明确行为      | retire Calendar priority              |

## 4. 当前 Planner Projection

`packages/contracts/src/modules/schedule/planner.ts` 当前已经定义：

```text
PlannerSourceType
= schedule | task | goal | routine

PlannerEventRange
= Timed(Instant)
| AllDay(Ymd)

CalendarEventProjection
├── identityId
├── sourceType/sourceId
├── title
├── displayMetadata
├── editableCapabilities
├── ownerCommandTarget
└── revision
```

这是正确基础。

当前 residual：

```text
semantic = goal-deadline
ownerType = task.instance
```

需要随 Goal/Task vNext 收敛到：

```text
goal-target
task.occurrence
```

当前 projection 尚无显式：

```text
occupancy
```

因此“显示在 Planner”与“占用时间”还没有类型级区分。

## 5. 当前 Planner source wiring

`useCalendarView.ts` 当前 live feed 实际主要装配：

```text
CalendarEntry
TaskOccurrence
```

Goal / Routine projection contract 已存在，但 live source 尚未完整进入该 computed read model。

这意味着：

```text
projection capability > current live product wiring
```

后续不能把 contract fixture 当成完整用户 journey 已实现。

## 6. 当前 Owner Command Router

Planner drag/resize 当前正确执行：

```text
projection.ownerCommandTarget
      ↓
ScheduleClientPort / TaskClientPort / GoalClientPort / Routine port
```

这一点属于 protected architecture。

禁止后续为了简化 UI 改成：

```text
Planner -> direct persistence
Planner -> Scheduler nextRunAt
```

## 7. 当前 Scheduler 新 Contract

新的 neutral contract 已经存在：

```text
SchedulingOwner
ScheduledIntent
SchedulingRetryPolicy
SchedulingPort
SchedulingReconcileReceipt
ScheduledInvocationContext
ScheduledHandlerRegistration
ScheduledHandlerResult
```

`ScheduledIntent` 当前具备：

```text
schedulingKey
handlerKey
runAt
payloadVersion
payload
sourceRevision?
retryPolicy?
priority?
timeoutMs?
observability?
```

这是长期正确方向。

## 8. 当前 Scheduler Legacy Aggregate

真实内部模型仍是：

```text
ScheduleTask
├── id / identityId
├── name / description
├── sourceModule / sourceEntityId
├── status
├── enabled
├── ScheduleConfig
│   ├── cronExpression
│   ├── timezone
│   ├── startDate
│   ├── endDate
│   └── maxExecutions
├── ExecutionInfo
│   ├── nextRunAt
│   ├── lastRunAt
│   ├── executionCount
│   ├── lastExecutionStatus
│   ├── lastExecutionDuration
│   └── consecutiveFailures
├── RetryPolicy
├── TaskMetadata
│   ├── payload
│   ├── tags
│   ├── priority
│   └── timeout
└── ScheduleExecution[]
```

这仍是早期“通用 Cron Job 管理系统”模型。

## 9. 当前新旧桥接方式

`LegacyScheduleTaskSchedulingAdapter` 当前流程：

```text
ScheduledIntent
      ↓
create/update legacy ScheduleTask
      ↓
store scheduling identity in payload.__memoflowScheduling
      ↓
mapper extracts metadata
      ↓
write first-class DB columns
```

数据库已经有：

```text
schedulingKey
ownerType
ownerId
handlerKey
payloadVersion
sourceRevision
```

因此出现：

```text
Contract      = new model
Database      = partially new model
Aggregate     = old model
Adapter       = compatibility bridge
```

这正是 ADR-081 要收敛的核心。

## 10. Current Persistence Models

`packages/database/prisma/schema/schedule.prisma` 当前包含：

```text
Schedule
ScheduleTask
SchedulingReconcileOperation
ScheduleExecution
ScheduleStatistic
ScheduleLease
ScheduleRebuildOutbox
ScheduleDomainEventOutbox
ScheduleEventConsumerReceipt
ScheduleEventDeliveryLog
```

语义映射：

| Current table/model          | Current owner                 | Target                          |
| ---------------------------- | ----------------------------- | ------------------------------- |
| Schedule                     | Planner/Calendar              | CalendarEntry persistence       |
| ScheduleTask                 | Scheduler                     | ScheduledInvocation             |
| ScheduleExecution            | Scheduler                     | InvocationAttempt               |
| SchedulingReconcileOperation | Scheduler                     | keep                            |
| ScheduleStatistic            | legacy Scheduler dashboard    | retire candidate                |
| ScheduleLease                | Scheduler reliability         | keep                            |
| ScheduleRebuildOutbox        | Calendar conflict reliability | migrate with new conflict model |
| ScheduleDomainEventOutbox    | Calendar event reliability    | keep/migrate                    |

## 11. Current Scheduler Status

Legacy status：

```text
Active
Paused
Completed
Cancelled
Failed
```

并额外有：

```text
enabled
```

这仍然是 product-like lifecycle。

目标由 ADR-082 定义为 invocation runtime state：

```text
pending
running
retry_wait
succeeded
skipped
failed
dead_letter
superseded
```

## 12. Current Execution History

`ScheduleExecution` 当前：

```text
id
taskId
executionTime
status
duration
result
error
retryCount
createdAt
```

同时又被 ScheduleTask hydrate 成 `_executions[]`。

目标：

```text
InvocationAttempt
```

独立 repository/read history，不再是 invocation aggregate child。

## 13. Current Runtime Reliability Assets

必须保护的已实现资产：

- MinHeap + single next timer queue；
- startup reload；
- missed-task recovery；
- ScheduleLease host mutual exclusion；
- per-task/invocation claim；
- retry/backoff；
- timeout；
- Handler Registry；
- owner-level reconcile；
- deterministic stable task ID for scheduling key bridge；
- `SchedulingReconcileOperation` durable receipt；
- Prisma / PowerSync adapter lanes；
- read-only raw worker diagnostics。

新模型不是重写这些能力，而是让它们使用正确语言和 state ownership。

## 14. Current Diagnostics Surface

当前 route：

```text
GET /api/v1/schedules/tasks
GET /api/v1/schedules/tasks/:id
GET /api/v1/schedules/tasks/due
```

已是 read-only，这是正确资产。

Residual：

```text
URL namespace = schedules/tasks
DTO = ScheduleTask*
```

长期由 ADR-083 收敛为 Scheduler invocation diagnostics language。

## 15. Current ScheduleStatistic

当前数据库存在 `ScheduleStatistic`，但源码搜索未发现明确活跃产品 consumer。

因此当前分类：

```text
high-confidence legacy deletion candidate
```

但删除前仍需实际 usage/integration/data-portability inventory，不能仅凭名称删除。

## 16. Current Contract Namespace

当前所有 contract 仍集中：

```text
packages/contracts/src/modules/schedule
```

同时服务产品 Planner 和 Temporal Engine。

这与已经拆开的 package ownership 不完全一致。

目标：

```text
contracts/schedule
contracts/scheduler
```

单一 canonical definitions + transitional re-export。

## 17. Current → Target Mapping

```text
CalendarEntry.startTime/endTime
  -> CalendarEntryRange

CalendarEntry.duration
  -> derived

CalendarEntry.hasConflict/conflictingEntries
  -> PlannerConflictProjection

CalendarEntry.priority
  -> retire

CalendarEventProjection
  -> add occupancy

ScheduleTask
  -> ScheduledInvocation

ScheduleConfig
  -> retire from Scheduler canonical model

SourceModule/sourceEntityId
  -> ownerType/ownerId + handlerKey

enabled + ScheduleTaskStatus
  -> invocation runtime state machine

ExecutionInfo.nextRunAt
  -> runAt OR nextAttemptAt (separate semantics)

ScheduleExecution
  -> InvocationAttempt

TaskMetadata
  -> first-class payload/executionPolicy/observability

payload.__memoflowScheduling
  -> retire after first-class invocation persistence

ScheduleStatistic
  -> retire after consumer proof
```

## 18. Protected Cross-domain Time Semantics

```text
Goal Target
= planning target

Task Schedule
= action occurrence timing

CalendarEntry
= user-owned planner occupancy

Routine Trigger
= behavioral trigger semantics

ScheduledInvocation.runAt
= infrastructure wake-up Instant
```

后续不得重新将它们压成一个通用 schedule/cron model。

## 19. 文档状态

截至本文件日期：

```text
ADR-060/061 boundary                implemented foundation
ADR-080 Planner model convergence   adopted, not implemented
ADR-081 Invocation model            adopted, not implemented
ADR-082 Runtime/Attempt model       adopted, not implemented
ADR-083 Contract/diagnostics        adopted, not implemented
```

因此任何后续 status/review 必须区分“已冻结目标模型”和“当前代码真值”。
