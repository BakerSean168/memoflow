---
tags:
  - adr
  - scheduler
  - temporal-engine
  - scheduled-invocation
  - migration
description: 将 ScheduledIntent/SchedulingPort 已确立的新语义推进到 Scheduler persistence/runtime，使用 ScheduledInvocation 替代 Legacy ScheduleTask，并删除 cron/sourceModule/enabled 等旧通用 Job 模型残差
created: 2026-09-08T20:45:00+08:00
updated: 2026-09-08T20:45:00+08:00
---

# ADR-081: ScheduledInvocation Model 与 Legacy ScheduleTask 退役

**状态：** 已采纳（待实施）  
**日期：** 2026-09-08  
**影响范围：** scheduler、contracts、database、PowerSync、schedule-orchestration、API/Desktop diagnostics  
**修订：** ADR-061 的 neutral `ScheduledIntent + SchedulingPort.reconcile` contract 保持，本文负责让 Scheduler 内部模型与该 contract 收敛  
**关联：** ADR-037、ADR-042、ADR-058、ADR-060、ADR-061、ADR-062、ADR-064、ADR-080、ADR-082、ADR-083

## 1. 决策摘要

Scheduler 的长期 canonical persistence/runtime entity 不再是 `ScheduleTask`，而是：

```text
ScheduledInvocation
= 一个由业务 owner 声明、在确定 Instant 唤醒指定 handler 的 durable invocation
```

业务模块只提供：

```text
ScheduledIntent
```

Scheduler 通过：

```text
SchedulingPort.reconcile(owner, desired[])
```

将 owner 的 desired state 收敛为 durable `ScheduledInvocation`。

旧 `ScheduleTask` 仅保留为迁移实现壳，最终退役下列旧概念：

```text
sourceModule
sourceEntityId
cronExpression
timezone
startDate
endDate
maxExecutions
enabled
Active/Paused/Completed/Cancelled/Failed product-like lifecycle
name/description as business content
TaskMetadata payload envelope
```

Scheduler 保留真正属于 Temporal Engine 的能力：

```text
runAt
owner + schedulingKey
handlerKey + payloadVersion + payload
sourceRevision
retry/backoff
timeout
scheduling priority
claim / lease / fencing
execution attempts
restart recovery / missed-run handling
dead letter
observability
```

## 2. 当前系统事实

当前新 contract 已经存在并投入主路径：

```ts
interface ScheduledIntent<TPayload = unknown> {
  schedulingKey: string;
  handlerKey: string;
  runAt: Instant;
  payloadVersion: number;
  payload: TPayload;
  sourceRevision?: number | string;
  retryPolicy?: SchedulingRetryPolicy;
  priority?: SchedulingPriority;
  timeoutMs?: number | null;
  observability?: ...;
}
```

同时数据库 `ScheduleTask` 已经新增 first-class columns：

```text
schedulingKey
ownerType
ownerId
handlerKey
payloadVersion
sourceRevision
```

但 legacy aggregate 本身仍使用：

```text
ScheduleTask
├── SourceModule/sourceEntityId
├── ScheduleConfig(cron/timezone/start/end/maxExecutions)
├── ExecutionInfo(nextRunAt/...)
├── RetryPolicy
├── TaskMetadata(payload/tags/priority/timeout)
└── ScheduleExecution[]
```

为了桥接二者，当前 adapter 还需要将新的 owner/handler identity 塞进：

```text
payload.__memoflowScheduling
```

再由 mapper 从 payload 反解 first-class columns。

这证明 `ScheduleTask` 已经成为 migration shell，而不是长期正确模型。

## 3. North Star

```text
Owner Domain
    │
    │ ScheduledIntent[]
    ▼
SchedulingPort.reconcile
    │
    ▼
ScheduledInvocation Repository
    │
    ├── durable desired invocation state
    │
    ▼
Scheduler Runtime
    │ claim / lease / retry
    ▼
HandlerRegistry
    │
    ▼
Domain Handler
```

Scheduler 不理解：

```text
Goal target
Task due
Routine recurrence
Reminder lead time
```

它只理解：

```text
runAt
handler
payload
execution policy
```

## 4. Canonical ScheduledInvocation

目标模型：

```text
ScheduledInvocation
│
├── identity
│   ├── id
│   └── identityId
│
├── ownership
│   ├── ownerType
│   ├── ownerId
│   └── schedulingKey
│
├── dispatch
│   ├── handlerKey
│   ├── payloadVersion
│   └── payload
│
├── timing
│   └── runAt: Instant
│
├── provenance
│   └── sourceRevision?
│
├── executionPolicy
│   ├── retryPolicy
│   ├── priority
│   └── timeoutMs?
│
├── runtime
│   ├── status
│   ├── attemptCount
│   └── nextAttemptAt?
│
├── observability
│   ├── name?
│   └── tags[]
│
└── system
    ├── createdAt
    └── updatedAt
```

### 4.1 Stable Identity

数据库必须继续保护：

```text
UNIQUE(identityId, ownerType, ownerId, schedulingKey)
```

同一个 business intent reconcile 多次：

```text
same owner + same schedulingKey
```

必须更新同一个 invocation identity，而不是创建重复 job。

## 5. `runAt` 是唯一业务调度时间

Scheduler canonical invocation 不保存 cron/recurrence business rules。

业务模块负责把自己的时间语义解释成：

```text
runAt: Instant
```

例如：

```text
Routine: 每天 09:00
        ↓ RecurrenceEnginePort
next occurrence = Sep 9 09:00
        ↓
ScheduledIntent(runAt = Sep 9 09:00)
```

执行后 Routine 再计算下一次并 reconcile。

这保护：

```text
业务 recurrence truth belongs to owner domain
Scheduler owns reliable one-shot wake-up
```

## 6. 删除 Legacy ScheduleConfig

旧：

```text
ScheduleConfig
├── cronExpression
├── timezone
├── startDate
├── endDate
└── maxExecutions
```

长期全部退出 canonical Scheduler invocation。

原因：

- cron/timezone 是 recurrence business representation；
- start/end/maxExecutions 是 owner lifecycle constraints；
- Scheduler 只需要本次 invocation 的 `runAt`；
- retry attempt 不是新的 business recurrence。

任何未来“平台级 recurring job”也应由一个明确的 system owner 生成连续 ScheduledIntent，而不是恢复通用 cron God Object。

## 7. 删除 SourceModule 行为语义

旧：

```text
SourceModule.Goal
SourceModule.Task
SourceModule.Reminder
...
```

已经由 ADR-061 的：

```text
ownerType / ownerId
handlerKey
```

替代。

语义：

```text
owner = 谁拥有这条 scheduling intent
handler = 到点后谁执行
```

例如：

```text
ownerType = task.occurrence
ownerId   = TaskOccurrenceId_xxx
handlerKey = task.reminder.fire
```

Scheduler 不允许重新用中央 enum/switch 进行 dispatch。

`SourceModule` 可以在迁移阶段作为 legacy diagnostics metadata 存在，但不能成为 canonical contract 或行为 authority。

## 8. 删除 `enabled + product-like status`

旧 `ScheduleTask`：

```text
enabled
status = Active | Paused | Completed | Cancelled | Failed
```

这把 product task lifecycle 带入了基础设施层。

Scheduler 应只描述 invocation execution state，具体状态机由 ADR-082 定义。

owner 想暂停业务能力时：

```text
owner state changes
    ↓
project desired intents
    ↓
reconcile(owner, []) or new desired set
```

Scheduler 不需要知道：

```text
"Task was paused"
"Goal was abandoned"
```

它只需要知道 invocation 是否仍然 desired。

## 9. Payload 与 Version

`payload` 必须满足：

- JSON-only；
- schema 由 handler registration 负责验证；
- `payloadVersion` 显式存在；
- handler 不允许猜测旧 payload shape；
- unsupported version 必须形成明确 failure code。

当前 `ScheduledHandlerRegistration` 已具备：

```text
handlerKey
payloadVersion
validatePayload
handler
```

继续保护。

## 10. Source Revision

`sourceRevision` 继续保留。

它用于：

- diagnostics；
- stale invocation 判断；
- owner revision traceability；
- rebuild/reconcile evidence。

但是 handler 执行时仍应在需要时重新读取 owner current state，不以 payload snapshot 替代业务真值。

## 11. Execution Policy

以下属于 Scheduler：

```text
retryPolicy
priority
timeoutMs
```

其中：

```text
priority = SchedulingPriority
```

只表示 worker execution priority，不等价于：

```text
Task.importance
CalendarEntry.priority
Goal priority
```

observability tags 也只服务日志/metrics/tracing，不与 Shared Labels 混用。

## 12. 删除 Metadata God Object

旧：

```text
TaskMetadata
├── payload
├── tags
├── priority
└── timeout
```

目标变成 first-class fields：

```text
payload
executionPolicy.priority
executionPolicy.timeoutMs
observability.tags
```

不再为 Scheduler 自己维护一个含糊的 `TaskMetadata` value object。

## 13. Payload Envelope 退役

当前：

```text
payload.__memoflowScheduling = {
  ownerType,
  ownerId,
  schedulingKey,
  handlerKey,
  originalRunAt,
  payloadVersion,
  sourceRevision,
  fingerprint
}
```

该 envelope 是为了让新 SchedulingPort 适配旧 ScheduleTask aggregate。

ScheduledInvocation first-class 后：

```diff
- payload.__memoflowScheduling
+ invocation.ownerType
+ invocation.ownerId
+ invocation.schedulingKey
+ invocation.handlerKey
+ invocation.runAt
+ invocation.payloadVersion
+ invocation.sourceRevision
```

payload 只保存真正 handler payload。

## 14. Reconcile 继续是唯一写入入口

产品/业务模块禁止：

```text
createInvocation()
updateInvocation()
pauseInvocation()
```

作为常规 owner API。

Owner-facing 写入 contract 继续是：

```ts
interface SchedulingPort {
  reconcile(owner, desired): Promise<SchedulingReconcileReceipt>;
  removeOwner(owner): Promise<SchedulingReconcileReceipt>;
}
```

这确保 owner 表达 desired state，而 Scheduler 负责：

```text
upsert stable keys
remove stale intents
atomic commit
receipt
```

## 15. SchedulingReconcileOperation 保留

当前 durable：

```text
SchedulingReconcileOperation
├── operationId
├── owner
├── desiredCount
├── createdCount
├── updatedCount
├── deletedCount
├── unchangedCount
├── failure
└── timestamps
```

是正确的 control-plane fact，应保留。

它不是业务 activity，也不属于 Planner。

## 16. Data Migration Direction

未来持久层建议从：

```text
schedule_tasks
```

迁移到语义明确的：

```text
scheduled_invocations
```

但物理 rename 与行为切换可分阶段进行。

先完成：

```text
1. first-class ScheduledInvocation mapper/repository
2. SchedulingPort adapter 写新模型
3. runtime 从新模型读取
4. diagnostics 从新模型读取
5. legacy rows migration
6. 删除 payload envelope
7. 删除 legacy ScheduleTask aggregate/contracts
8. 最后决定是否物理 rename table
```

不应把大规模 schema rename 与 runtime state-machine 重构绑在同一个不可回滚步骤里。

## 17. Prisma / PowerSync Parity

目标模型必须在两条 persistence lane 一致表达：

- owner identity；
- stable scheduling key；
- runAt；
- handler/payload version；
- source revision；
- retry policy；
- status/attempt cursor；
- optimistic/atomic reconcile capability。

PowerSync 不允许只保留 legacy ScheduleTask semantic 而云端使用新 ScheduledInvocation。

## 18. Protected Reliability Assets

本重构不得删除或弱化：

- stable schedulingKey；
- owner-level atomic reconcile；
- reconcile receipts；
- Scheduler host lease；
- per-invocation claim / CAS；
- retry/backoff；
- timeout；
- restart recovery / missed-run behavior；
- handler registry + payload validation；
- bounded diagnostics；
- API/Desktop runtime parity。

## 19. 明确非目标

本文不决定：

- 是否最终采用 pg-boss；
- cloud/local 是否使用同一个 queue implementation；
- Planner UI；
- Routine recurrence semantics；
- Notification delivery semantics；
- AI scheduling product features。

pg-boss 仍按 ADR-058/现有 PoC 规则比较，任何替换都必须实现相同 `SchedulingPort` contract。

## 20. Acceptance Model

未来实现完成后必须能证明：

1. owner domain 只提交 `ScheduledIntent`；
2. durable invocation first-class 保存 owner/schedulingKey/handler/runAt；
3. payload 不再包含 scheduling envelope；
4. canonical Scheduler 不保存 cron/timezone/recurrence truth；
5. `SourceModule` 不参与 dispatch；
6. raw product-like pause/complete/cancel job semantics 不再是 canonical Scheduler model；
7. Prisma/PowerSync 均能完成 owner-level reconcile；
8. legacy ScheduleTask 可完全删除而不影响 Scheduler reliability。
