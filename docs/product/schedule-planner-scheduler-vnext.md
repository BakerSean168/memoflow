---
tags:
  - product
  - schedule
  - planner
  - scheduler
  - vnext
description: Schedule/Planner 与 Scheduler/Temporal Engine 的 vNext 产品模型、跨模块时间语义、Planner occupancy/conflict 和内部 invocation North Star
created: 2026-09-08T20:45:00+08:00
updated: 2026-09-08T20:45:00+08:00
---

# Schedule / Planner + Scheduler / Temporal Engine vNext

> **ADR-111 cutover policy (2026-09-09):** 当前没有需要保留的 MemoFlow 旧业务数据，也不要求兼容旧客户端/旧备份。本文历史推演中仅为旧数据保存设计的 migration/backfill/compatibility window 不再执行；目标模型和真实行为不变量继续有效。实施采用 direct canonical cutover + old-surface deletion + reset/reseed。

## 1. 一句话模型

```text
Planner
= 用户如何看、安排和调整自己的时间

Scheduler
= 系统如何在一个确定 Instant 可靠唤醒 handler
```

两者共享时间基础设施，但不共享业务 ownership。

## 2. 产品 North Star

```text
                         MemoFlow Time Workspace
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                 Planner                    Scheduler
              user-facing                 infrastructure
                    │                           │
        ┌───────────┼───────────┐               │
        ▼           ▼           ▼               ▼
 CalendarEntry  TaskOccurrence  Goal/Routine  ScheduledInvocation
        │           │           │               │
        └───────────┴───────────┘               ▼
                    │                       HandlerRegistry
                    ▼                           │
           PlannerEventProjection              ▼
                    │                     Domain Handler
                    ▼
             Day/Week/Month
```

## 3. 五类时间语义

MemoFlow 不再使用一个模糊的“schedule”概念解释所有时间。

| 模型                | 问题                       | 核心时间                      |
| ------------------- | -------------------------- | ----------------------------- |
| Goal Target         | 我希望什么时候达成？       | Target Timeframe              |
| Task Schedule       | 这件行动什么时候应该发生？ | Ymd/Hm/Range/Recurrence       |
| CalendarEntry       | 我明确占用了哪段时间？     | CalendarRange                 |
| Routine Trigger     | 什么条件下产生行为干预？   | WallClock/Elapsed/ActiveUsage |
| ScheduledInvocation | 机器什么时候唤醒 handler？ | `runAt: Instant`              |

## 4. Planner 用户模型

Planner 聚合多个 owner domain 的时间事实，但自己只拥有用户直接创建的 CalendarEntry。

```text
Planner
├── Calendar Entries
├── Task Occurrences
├── Goal Start / Target markers
├── Routine WallClock occurrences
└── future External Calendar events
```

用户不需要知道 projection 或 handler。

### 4.1 CalendarEntry

```text
CalendarEntry
├── title
├── description?
├── range
│   ├── timed: start/end
│   └── all-day: start/end day
├── location?
└── participants?
```

不再把这些作为核心字段：

```text
duration persisted
hasConflict
conflictingEntries
priority 1..5
```

### 4.2 Occupancy

Planner 每个事件明确：

```text
blocking
non-blocking
marker
```

典型映射：

```text
Calendar timed appointment  -> blocking
Task TimeRange              -> blocking
Task all-day                -> non-blocking
Goal target                 -> marker
Routine reminder            -> marker
```

这让 Calendar 不再把“展示”误认为“占用”。

## 5. Planner Conflict

用户真正关心的是：

> 我安排的不同事情是否抢占了同一段真实时间？

因此 conflict 不能只检查手工 CalendarEntry。

目标：

```text
all Planner projections
       ↓
blocking occupancy only
       ↓
time overlap analysis
       ↓
PlannerConflictProjection
```

未来可以发现：

```text
医院预约 14:00-15:00
↕ conflict
Task 深度工作 14:30-16:00
```

而 Goal target marker 不会制造假冲突。

## 6. Planner Mutation

用户拖动一个事件：

```text
Planner
  ↓ ownerCommandTarget
真实 Owner
  ↓
Domain mutation
  ↓
new projection
```

例如：

```text
拖 Task -> TaskOccurrence.reschedule
拖 Goal Target -> Goal.updateTarget
拖 CalendarEntry -> CalendarEntry.reschedule
```

绝不：

```text
Planner -> Scheduler row
```

## 7. Goal vNext Integration

Goal temporal projection：

```text
start?
target?
```

其中 Target 可以是：

```text
day
month
quarter
half-year
year
```

Planner 表达目标：

```text
goal-start
goal-target
```

不是：

```text
goal-deadline
```

宽粒度 Target 作为 context marker/range，不伪造 deadline day。

## 8. Task vNext Integration

Task Plan 定义行动时间；TaskOccurrence 才是 Planner 中的具体执行事实。

```text
TaskPlan
    ↓ materialize
TaskOccurrence
    ↓
Planner projection
```

Planner mutation 指向：

```text
task.occurrence
```

而不是旧 `task.instance`。

## 9. Routine vNext Integration

Routine：

```text
WallClock
Elapsed
ActiveUsage
```

只有适合显示的 temporal occurrence 进入 Planner。

普通 reminder point：

```text
occupancy = marker
```

Protocol Session 若明确建立 Focus block，才可能成为 blocking range。

## 10. Scheduler 用户不可见模型

Scheduler 内部不再使用“另一个 Task 系统”的心智。

```text
ScheduledInvocation
├── owner
├── schedulingKey
├── handlerKey
├── runAt
├── payloadVersion / payload
├── sourceRevision?
├── retry / priority / timeout
└── runtime state
```

它不是 Todo，也不是 Calendar Event。

## 11. Desired-state Scheduling

业务 owner 不创建/暂停/完成 raw worker job。

它只声明：

```text
当前正确状态下，我希望 Scheduler 存在哪些 future invocations？
```

例如 Task reminder：

```text
Task occurrence moves 14:00 -> 16:00
      ↓
same schedulingKey
runAt 13:30 -> 15:30
      ↓
reconcile
```

不会创建重复 reminder。

## 12. Invocation 与 Attempt

```text
ScheduledInvocation
= 这条 future invocation 当前是什么状态

InvocationAttempt
= worker 实际执行了一次什么结果
```

重要区分：

```text
runAt          = business intended wake-up
nextAttemptAt  = technical retry wake-up
```

不能共用 `nextRunAt`。

## 13. Scheduler State

目标技术状态：

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

不再暴露：

```text
Active
Paused
Completed
Cancelled
```

这些是 product-like lifecycle，不属于 Temporal Engine。

## 14. Reliability

本轮模型收敛不能削弱已经建立的：

```text
stable schedulingKey
atomic owner reconcile
reconcile receipt
host lease
claim/CAS
retry/backoff
timeout
missed-run recovery
handler registry
payload schema versioning
Prisma/PowerSync parity
```

目标是换掉旧语言，不是重写可靠性基础设施。

## 15. Scheduler Diagnostics

如需要 internal console，应显示：

```text
owner
schedulingKey
handler
runAt
status
nextAttemptAt
attempt count
last failure
source revision
```

普通 Schedule 页面绝不显示：

```text
lease token
raw handler payload
retry internals
worker job mutation
```

## 16. Legacy Retirement Map

```text
ScheduleTask            -> ScheduledInvocation
ScheduleExecution       -> InvocationAttempt
ScheduleConfig          -> retire from Scheduler
ExecutionInfo           -> split runtime fields + attempts
SourceModule            -> owner + handler
TaskMetadata            -> first-class invocation fields
enabled/product status  -> invocation state
ScheduleStatistic       -> retire candidate
```

Planner：

```text
start/end/duration      -> CalendarRange + derived duration
conflict fields         -> PlannerConflictProjection
priority 1..5           -> retire
```

## 17. UX 方向

Planner 页面最终应围绕：

```text
Day / Week / Month / Agenda
```

每个 item 都来自统一 projection，并具备：

```text
source identity
range
occupancy
owner actions
display semantics
```

这让以后接入 external calendar 不需要重新改变 Scheduler。

## 18. 非目标

本设计不直接定义：

- Google Calendar sync；
- AI 自动排程；
- 多人共享 calendar；
- meeting RSVP；
- 选择 pg-boss；
- Notification channel policy。

这些能力可以以后接到稳定边界上。

## 19. 相关文档

- [ADR-060 Schedule / Planner 与 Scheduler / Temporal Engine 分离](../architecture/adr/ADR-060-schedule-planner-and-scheduler-boundary.md)
- [ADR-061 Scheduling Port 与 Handler Registry](../architecture/adr/ADR-061-business-module-scheduling-port-and-handler-registry.md)
- [ADR-080 Planner Calendar Range、Occupancy 与 Conflict Model](../architecture/adr/ADR-080-planner-calendar-range-occupancy-and-conflict-model.md)
- [ADR-081 ScheduledInvocation Model 与 Legacy ScheduleTask 退役](../architecture/adr/ADR-081-scheduled-invocation-model-and-legacy-schedule-task-retirement.md)
- [ADR-082 Scheduler Invocation Attempt 与 Runtime State Machine](../architecture/adr/ADR-082-scheduler-invocation-attempt-and-runtime-state-machine.md)
- [ADR-083 Schedule / Scheduler Contract、Diagnostics 与 Persistence Boundary](../architecture/adr/ADR-083-schedule-scheduler-contract-diagnostics-and-persistence-boundary.md)
- [Current System Map](../analysis/2026-09-08-schedule-scheduler-current-system-map.md)
