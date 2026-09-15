---
tags:
  - adr
  - schedule
  - scheduler
  - contracts
  - diagnostics
  - persistence
description: 将 Planner/Calendar 与 Scheduler/Temporal Engine 的 contract namespace、diagnostics surface、persistence naming 和 legacy statistics 完成语义收敛，并保护既有 reliability assets
created: 2026-09-08T20:45:00+08:00
updated: 2026-09-08T20:45:00+08:00
---

# ADR-083: Schedule / Scheduler Contract、Diagnostics 与 Persistence Boundary

**状态：** 已采纳（待实施）  
**日期：** 2026-09-08  
**影响范围：** contracts、schedule、scheduler、database、PowerSync、API、Desktop、app-react diagnostics、governance  
**修订：** ADR-060 的物理 package 分离进一步推进到 contract/diagnostics/persistence language  
**关联：** ADR-037、ADR-040~~048、ADR-058、ADR-060、ADR-061、ADR-080~~082

## 1. 决策摘要

当前 package ownership 已经正确：

```text
@memoflow/schedule   = Planner / Calendar
@memoflow/scheduler  = Temporal Engine
```

但 contracts、routes、Prisma naming 仍残留历史“大 Schedule module”语言。

本 ADR 决定长期收敛为：

```text
contracts/schedule
  CalendarEntry
  PlannerEventProjection
  PlannerConflictProjection

contracts/scheduler
  SchedulingOwner
  ScheduledIntent
  SchedulingPort
  ScheduledInvocationDiagnostic
  InvocationAttemptDiagnostic
  ScheduledHandler contracts
```

raw Scheduler surface 只用于 internal/dev/ops diagnostics，不成为普通用户产品 API。

旧：

```text
ScheduleTaskClientDTO
ScheduleTaskServerDTO
ScheduleExecutionDTO
/api/v1/schedules/tasks
ScheduleStatistic
SourceModule behavior routing
```

全部进入退役路线。

## 2. 当前事实

当前：

```text
packages/schedule
packages/scheduler
```

已经分包。

但是：

```text
packages/contracts/src/modules/schedule
```

仍同时包含：

```text
CalendarEntry
Planner
ScheduleTask
ScheduleExecution
SchedulingPort
```

数据库也继续集中在：

```text
schedule.prisma
```

并存在：

```text
Schedule
ScheduleTask
ScheduleExecution
ScheduleStatistic
ScheduleLease
SchedulingReconcileOperation
...
```

这不代表 ownership 仍错误，但会持续制造 ubiquitous-language 混淆。

## 3. Contract Namespace

长期目标：

```text
@memoflow/contracts/schedule
  = product Planner/Calendar contract only

@memoflow/contracts/scheduler
  = Temporal Engine contract only
```

### Schedule contract owns

```text
CalendarEntryRange
CalendarEntry DTO/request
PlannerEventProjection
PlannerOccupancy
PlannerConflictProjection
Planner owner-command metadata
```

### Scheduler contract owns

```text
SchedulingOwner
ScheduledIntent
SchedulingRetryPolicy
SchedulingReconcileReceipt
SchedulingPort
ScheduledInvocationStatus
ScheduledHandlerResult
ScheduledHandlerRegistration
Diagnostics DTOs
```

业务模块需要 scheduling seam 时 import scheduler contract，而不是 import product schedule namespace。

## 4. Migration Compatibility

contract namespace migration 可以分阶段：

```text
Phase A: add scheduler canonical exports
Phase B: migrate internal consumers
Phase C: deprecate schedule re-exports
Phase D: remove legacy ScheduleTask DTO/events
```

禁止长期双真值：

```text
contracts/schedule.ScheduledIntent
and
contracts/scheduler.ScheduledIntent
```

只能有一个 canonical definition；短期 re-export 不得复制 schema/type body。

## 5. Diagnostics Surface

Scheduler 的 HTTP/IPC/client surface 只回答内部运行状态。

目标命名：

```text
/api/v1/scheduler/invocations
/api/v1/scheduler/invocations/:id
/api/v1/scheduler/invocations/due
```

或者等价的 internal-only namespace。

不再使用：

```text
/api/v1/schedules/tasks
```

因为它把 product Schedule 和 raw worker job 再次混淆。

## 6. Diagnostics DTO

长期 DTO：

```text
ScheduledInvocationDiagnostic
├── id
├── owner
├── schedulingKey
├── handlerKey
├── runAt
├── status
├── nextAttemptAt?
├── attemptCount
├── sourceRevision?
├── executionPolicy summary
├── lastAttempt?
└── timestamps
```

以及：

```text
InvocationAttemptDiagnostic
```

默认 diagnostics 不回传完整敏感 payload；必要时只提供：

```text
payloadVersion
payloadSize/hash
redacted preview
```

避免 internal diagnostics 变成 secret/data exfiltration surface。

## 7. Diagnostics 权限

Raw Scheduler diagnostics 不属于普通 Planner 用户路径。

未来 transport 应明确：

- internal/dev/ops only；
- 最小权限；
- account identity scope；
- replay/dead-letter 若开放必须独立 privileged operation + audit；
- product UI 不出现 pause/complete/delete raw invocation 控件。

## 8. Raw Mutation 继续禁止

当前 public controller 已是 read-only，这一点必须保护。

禁止恢复：

```text
POST /scheduler/invocations
PATCH /scheduler/invocations/:id
pause/resume/complete/cancel
```

作为产品 owner mutation。

Owner mutation 始终通过：

```text
Goal/Task/Routine command
        ↓
owner domain
        ↓
SchedulingPort.reconcile
```

只有 internal recovery/admin operation 可以在明确审计下作用于 dead-letter/replay。

## 9. `ScheduleStatistic` 退役

当前 `ScheduleStatistic` 保存：

```text
totalTasks
activeTasks
pausedTasks
completedTasks
cancelledTasks
failedTasks
execution counts/durations
moduleStatistics
```

它来自旧“ScheduleTask 管理系统 dashboard”心智。

新的 Scheduler 应从：

```text
ScheduledInvocation
InvocationAttempt
metrics pipeline
```

生成 diagnostics/metrics。

因此 `ScheduleStatistic` 标记为 high-confidence legacy deletion candidate。

删除前必须证明：

- 无活跃生产消费者；
- metrics/ops 不依赖该 row；
- PowerSync schema 可同步清理；
- Data portability 不把它当用户业务数据。

## 10. Persistence Naming

长期推荐：

```text
schedules                 -> calendar_entries（可选物理 rename）
schedule_tasks            -> scheduled_invocations
schedule_executions       -> invocation_attempts
schedule_statistics       -> remove
scheduling_reconcile_operations -> keep
schedule_leases           -> keep or scheduler_host_leases
```

但物理 table rename 不是第一步。

原则：

> 先切语义 owner 和 runtime，再做 storage naming cleanup。

避免把：

```text
schema churn
+
runtime state-machine rewrite
+
transport rename
```

绑成一次不可审查变更。

## 11. Schedule Lease Ownership

`ScheduleLease` 属于 Scheduler/Temporal Engine reliability。

即使 Calendar rebuild worker 复用 shared lease abstraction，也不意味着 product Schedule 拥有 Scheduler lease table。

长期优先：

```text
patterns/lease = abstraction
scheduler = concrete durable host lease capability
```

Calendar-specific worker 若需要独立 lease key，只消费 abstraction。

## 12. Outbox / Receipt Ownership

以下事实继续各归其主：

```text
Calendar rebuild/domain-event outbox
  -> Schedule product reliability

SchedulingReconcileOperation
  -> Scheduler control plane

InvocationAttempt
  -> Scheduler execution history

Notification dispatch outbox
  -> Notification
```

禁止因为都叫“可靠消息”就再次收进一个 shared giant schedule persistence model。

## 13. SourceModule 退役门禁

`SourceModule` 只允许在 legacy migration/diagnostics 中暂时存在。

governance 最终应阻止：

```text
switch(sourceModule)
if (sourceModule === Goal)...
```

重新成为 execution dispatch。

canonical dispatch only：

```text
handlerKey -> HandlerRegistry
```

attribution only：

```text
ownerType + ownerId
```

## 14. Scheduler Public DTO 不再叫 Task

最终命名：

```diff
- ScheduleTaskClientDTO
+ ScheduledInvocationDiagnostic

- ScheduleExecutionClientDTO
+ InvocationAttemptDiagnostic
```

这是语义收敛，不是产品 Task rename。

必须避免新的：

```text
TaskPlan
TaskOccurrence
ScheduleTask
```

三个不同概念继续共用 Task 一词。

## 15. Operations / Replay

如果未来支持：

```text
retry dead letter
replay invocation
force reconcile owner
```

必须遵循 ADR-043：

- explicit operation；
- identity/role authorization；
- audit record；
- idempotency；
- operation timeline；
- no silent mutation。

普通 diagnostics route 不自动获得写权限。

## 16. Protected Contracts

实施时必须保护：

- HTTP/IPC parity；
- Scheduler diagnostics read-only default；
- owner-domain mutation authority；
- SchedulingPort single write seam；
- Prisma/PowerSync parity；
- stable key + atomic reconcile；
- host lease/claim/retry；
- operation audit；
- no raw worker object in Planner UI。

## 17. Governance Locks

未来应添加/更新 surface tests，确保：

```text
Planner cannot import scheduler persistence/domain aggregate
Owner domains cannot instantiate ScheduledInvocation directly
Scheduler cannot switch on SourceModule for behavior
Product routes cannot expose raw scheduler mutation
contracts/schedule cannot regain ScheduleTask canonical body
```

## 18. Acceptance Model

未来实现完成后必须能证明：

1. Schedule/Scheduler contracts 语义分区；
2. owner domain import scheduler-neutral seam，而不是 legacy ScheduleTask；
3. raw diagnostics route 使用 invocation 语言；
4. ScheduleStatistic 已有明确删除/替代证据；
5. SourceModule 不参与执行行为；
6. API/Desktop diagnostics parity；
7. Planner product surface 不包含 worker internals；
8. schema rename 即便延期，也不存在 contract/domain 双轨。
