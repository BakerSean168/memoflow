---
tags:
  - adr
  - scheduler
  - projection
  - ports-and-adapters
  - handler-registry
  - idempotency
  - reliable-messaging
description: 业务模块通过 ScheduledIntent + SchedulingPort.reconcile 接入 Scheduler，并以稳定 schedulingKey 与 handlerKey registry 替代 SourceModule 中央路由
created: 2026-08-25T17:49:00+08:00
updated: 2026-09-08T20:45:00+08:00
---

# ADR-061: 业务模块通过 Scheduling Port 与 Handler Registry 接入 Scheduler

**状态：** 已采纳并实施
**日期：** 2026-08-25  
**影响范围：** schedule-orchestration、scheduler/schedule、task、goal、reminder、contracts、database、apps/api、apps/desktop  
**关联：** ADR-025、ADR-033、ADR-037、ADR-042、ADR-058、ADR-060、ADR-062

## 2026-09-08 实现状态

Goal/Task/Reminder 通过 neutral ScheduledIntent + `SchedulingPort.reconcile` 接入 Scheduler；稳定 `schedulingKey` 与 handler key registry 已替代 `SourceModule` 中央执行 switch。`SourceModule` 只允许作为 metadata/diagnostics，HARD-7102 governance lock 防止行为路由复活。

### 2026-09-08 vNext Model Convergence Follow-up

本 ADR 的 neutral seam 已成为正确 canonical ingress，但当前 `LegacyScheduleTaskSchedulingAdapter` 仍需要把新 owner/handler identity 桥接进旧 `ScheduleTask` aggregate。ADR-081~083 继续完成内部收敛：

```text
ScheduledIntent / SchedulingPort        已是新真值
ScheduleTask aggregate                  迁移壳
ScheduledInvocation persistence/runtime 目标模型
```

后续不得为了删除 legacy aggregate 而改变 `SchedulingPort.reconcile`、稳定 `schedulingKey`、handler registry 或 owner-level atomic reconcile 语义。

## 1. 背景

2026-07 的 Core Seam Reconvergence R03~R06 已经完成了一次重要收敛：

- Task / Goal / Reminder 保留各自的 schedule projection rules；
- `schedule-orchestration` 成为 projection runtime 的系统 owner；
- API/Desktop host 只选择 Prisma / PowerSync adapter 并装配模块；
- execution router 也从 host 收进 `schedule-orchestration`。

这一步是正确的，应保留。

但当前 seam 仍有两层耦合：

1. 业务模块的 projection source 直接 import `ScheduleTask` 并构造 Scheduler domain aggregate；
2. execution router 通过 `SourceModule.Reminder / Goal / Task` 中央 switch 分发。

当前形态：

```text
Goal / Task / Reminder
    │ build plan
    v
ScheduleTask.create(... sourceModule ...)
    │
    v
ScheduleTaskRepository
    │
    v
ScheduleExecutionRouter
    │ switch SourceModule
    ├─ GoalScheduleExecutionSource
    ├─ TaskScheduleExecutionSource
    └─ ReminderScheduleExecutionSource
```

这使 Scheduler 处于 closed world：新增 Habit / Wallet / AI / Knowledge 等模块都必须修改中央 enum、router、module options 和 tests。

## 2. 保留的正确设计

本 ADR **不是推翻 Projection**。以下资产被明确保护：

1. 时间业务语义由业务模块解释；
2. 业务变化通过 domain event 驱动增量 projection；
3. projection 重新读取源聚合当前状态，而不是信任旧 event payload；
4. projection 表达 desired state，而非命令式 create/update/delete 脚本；
5. 执行到点后 handler 再次读取业务实体，验证是否仍有效；
6. host 只负责 composition，不拥有跨域逻辑。

目标是把 Projection 的输出从 Scheduler 内部 Aggregate 改成中立 contract，并让 execution dispatch 开放化。

## 3. 决策

采用：

```text
Domain Event
   ↓
Module-owned Scheduling Projector
   ↓
ScheduledIntent[]
   ↓
SchedulingPort.reconcile(owner, desired)
   ↓
Scheduler Adapter
   ↓
Durable ScheduledInvocation
   ↓
HandlerRegistry[handlerKey]
   ↓
Domain Handler
```

### 3.1 Canonical Contract

建议的产品无关 contract：

```ts
export interface SchedulingOwner {
  identityId: string;
  type: string;
  id: string;
}

export interface ScheduledIntent<TPayload = unknown> {
  schedulingKey: string;
  handlerKey: string;
  runAt: Instant;
  payload: TPayload;
  sourceRevision?: number | string;
  retryPolicy?: SchedulingRetryPolicy;
  observability?: {
    name?: string;
    tags?: readonly string[];
  };
}

export interface SchedulingPort {
  reconcile(
    owner: SchedulingOwner,
    desired: readonly ScheduledIntent[],
  ): Promise<SchedulingReconcileReceipt>;

  removeOwner(owner: SchedulingOwner): Promise<SchedulingReconcileReceipt>;
}
```

关键不是字段最终名称，而是四个语义必须稳定：

- **owner**：谁拥有这组 scheduling intent；
- **schedulingKey**：这一条业务调度意图是谁；
- **handlerKey**：到点后执行谁；
- **runAt**：什么时候唤醒。

## 4. 为什么使用 reconcile 而不是 create/update/delete

业务模块不应该维护 Scheduler 的内部 mutation history。

Goal 只需要表达：

```text
Goal 123 当前正确状态下
应该存在：
  - remaining-days:7
  - time-progress:80
```

Scheduler Adapter 负责：

```text
existing(owner=goal:123)
        vs
expected intents
        ↓
upsert stable keys
remove stale keys
atomic commit
```

这保留了当前 `replaceSelection()` 的优秀思想，但把实现升级为真正 desired-state reconciliation。

## 5. schedulingKey：稳定业务身份

当前 `ScheduleTask.create()` 使用随机生成的 `ScheduleTaskId`。

因此即使同一业务提醒没有改变，每次 projection rebuild 仍可能产生：

```text
old random id A
new random id B
```

`replaceSelection()` 会表现为“新建 B + 删除 A”，而不是稳定 upsert。

长期规则：

```text
同一个 business scheduling intent
必须拥有同一个 schedulingKey
```

示例：

```text
goal:123:reminder:remaining-days:7

goal:123:reminder:time-progress:80

task-instance:456:reminder:relative:start:30m

routine:789:next-wall-clock-occurrence
```

持久层应建立类似：

```text
UNIQUE(identity_id, owner_type, owner_id, scheduling_key)
```

或者等价的全局规范化幂等键。

### 5.1 与 Trigger.dev 的对应学习

Trigger.dev 的 dynamic schedule 强制 `deduplicationKey`，相同 key 再创建时更新 schedule，而不是重复创建。该设计直接解决“应用启动或 reconcile 时重复注册 schedule”的工程问题。

MemoFlow 不复制 Trigger.dev API，但吸收其不变量：

> 动态 schedule 必须有稳定、可重入的业务 identity。

## 6. 原子 reconcile

当前 `replaceSelection()` 注释称为“原子交换”，但实现是：

```text
saveBatch(nextTasks)
then
deleteBatch(staleTasks)
```

而 Prisma `saveBatch` 又逐条 `save()`；虽然 repository 暴露 `withTransaction()`，当前 shared projection 没有用它包住整个 replace。

因此目标实现必须是一个 transaction boundary：

```text
BEGIN
  UPSERT desired by stable schedulingKey
  DELETE stale for owner
  record ProjectionOperation / receipt
COMMIT
```

任何 crash 不得留下半份 desired state。

PowerSync 路径也必须提供同等的本地原子性或明确的 compensation/reconcile 行为。

## 7. handlerKey：开放式运行时分发

当前：

```ts
if (task.sourceModule === Goal) ...
if (task.sourceModule === Task) ...
if (task.sourceModule === Reminder) ...
```

目标：

```ts
interface ScheduledHandler<TPayload = unknown> {
  execute(context: ScheduledInvocationContext<TPayload>): Promise<ScheduledHandlerResult>;
}

interface ScheduledHandlerRegistry {
  register<TPayload>(handlerKey: string, handler: ScheduledHandler<TPayload>): void;
  resolve(handlerKey: string): ScheduledHandler;
}
```

模块注册：

```text
goal.reminder.fire

task.reminder.fire

routine.wall-clock.fire

ai.daily-review.generate

wallet.monthly-summary.generate

knowledge.reindex
```

Scheduler 核心代码无需知道 Goal/Task/Reminder。

## 8. ownerType 与 SourceModule 的去向

`SourceModule` 不再用于控制执行。

在迁移期可以保留为：

- observability metadata；
- query/filter compatibility；
- old API compatibility。

最终收敛为开放字符串或 typed owner descriptor：

```text
ownerType = "goal"
handlerKey = "goal.reminder.fire"
```

二者职责不同：

- ownerType：谁拥有这条 intent；
- handlerKey：谁处理执行。

## 9. Domain Event 与 Durable Projection

当前 projection 依赖进程内 typed event bus。

Task 已有 startup reconcile：

```text
register listeners
then
listTemplateRefs()
rebuild current desired state
```

但 Goal / Reminder 没有等价全量 reconcile；同时 Goal/Task 的 post-commit event flush 失败时会记录日志但不会 durable retry。

因此目标必须同时具备：

```text
fast path:
post-commit event -> incremental reconcile

repair path:
durable outbox / projection receipt -> retry

startup path:
full owner enumeration -> idempotent reconcile

optional maintenance path:
periodic consistency sweep
```

原则：

> 事件用于低延迟，reconcile 用于正确性；系统不假设事件永不丢失。

## 10. Event Payload 规则

ADR-033 曾要求跨模块 Event Payload 自包含，以避免订阅方回查发布方 repository。

Schedule projection 是一个需要细化的特殊场景：

- event payload 只需要携带 owner identity / revision / change type；
- projector **应该重新读取自身模块的 authoritative aggregate** 来生成完整 desired state；
- `schedule-orchestration` 不应跨模块读取源 repo；
- source adapter 位于对应业务模块内。

因此这里并不是违背 ADR-033，而是：

```text
Publisher -> minimal invalidation event
Module-owned Projector -> reads own authoritative state
Scheduler -> accepts neutral desired state
```

## 11. 到点执行必须重新验证业务真相

Scheduler 的语义是：

> “到了可以尝试执行 handler 的时间。”

不是：

> “几天前算出的业务动作现在必然有效。”

例如 Goal handler 必须重新判断：

- Goal 是否存在；
- 是否 Active；
- 是否完成/归档/删除；
- reminder config 是否仍有效；
- sourceRevision 是否过旧（如果该 handler 需要 revision fence）。

Task / Routine 同理。

合法结果包括：

```text
succeeded
skipped_stale
skipped_disabled
skipped_missing
retryable
failed
```

并映射到 ADR-042 的统一业务操作语义。

## 12. Projection 与执行的业务示例

### 12.1 Goal 提前 7 天

```text
Goal Domain
  targetDate = Sep 30
  reminder = RemainingDays(7)
        ↓
Goal projector
        ↓
ScheduledIntent
  schedulingKey = goal:123:remaining-days:7
  handlerKey    = goal.reminder.fire
  runAt          = Sep 23 resolved Instant
        ↓
Scheduler
        ↓ Sep 23
GoalReminderHandler
        ↓ re-read Goal
NotificationRequested
```

### 12.2 Task 相对提醒

```text
TaskInstance start = 14:00
Reminder = 30m before start
        ↓
Task projector interprets relative semantics
        ↓
runAt = 13:30 Instant
        ↓
Scheduler does not know Relative/Absolute/Minutes
```

### 12.3 新增 AI Daily Review

```text
AI module
  scheduling intent:
  handlerKey = ai.daily-review.generate
        ↓
Scheduler
```

不修改 Scheduler enum/router/module options。

## 13. 与 OSS 的对应学习

### Trigger.dev

学习：

- task definition 与 schedule attachment 分离；
- task id 是 execution identity；
- dynamic schedule 使用 externalId / deduplicationKey；
- timezone 是 IANA；
- schedule 可 declarative sync 也可 imperative create。

### pg-boss

学习：

- PostgreSQL `SKIP LOCKED` / atomic claim；
- retry / backoff / dead-letter；
- queue policy 与 singleton key；
- 在已有 transaction 中可靠 enqueue 的思路。

MemoFlow 是否直接采用 pg-boss 由后续 Build-vs-Adopt ticket 决定；本 ADR 先固定上层 contract，使底层可替换。

## 14. 不采用的方案

### 14.1 每个业务模块直接调用 ScheduleTaskRepository

不采用。会让 Scheduler persistence/domain model 泄漏到所有 feature。

### 14.2 继续扩大 SourceModule enum

不采用。closed-world central router 与平台级 extensibility 冲突。

### 14.3 Scheduler 自己计算业务触发时间

不采用。会把 Goal/Task/Routine domain language 汇聚到一个巨型 Scheduler。

### 14.4 只依赖 in-memory event bus，不做 reconcile

不采用。进程重启、handler failure、事件丢失都会留下永久 stale projection。

## 15. 迁移顺序

1. 建立 neutral `ScheduledIntent` / `SchedulingPort` contract；
2. 为现有 ScheduleTask adapter 实现 `reconcile()`，暂时仍落到旧表；
3. 引入 deterministic `schedulingKey`；
4. 让 Task 先迁为第一条 vertical slice；
5. Goal 迁移；
6. Reminder/Routine 迁移；
7. 引入 handler registry，并同时支持旧 SourceModule router 一段迁移期；
8. 所有 handler 迁完后删除中央 switch；
9. 最后再评估是否把 ScheduleTask 物理重命名/迁入 `packages/scheduler`。

## 16. 验收标准

- feature projection 不 import `ScheduleTask` aggregate；
- 新增业务 handler 不修改 Scheduler central enum/switch；
- 同一 scheduling intent 重复 reconcile 不产生重复 invocation；
- owner desired-state replacement 是单事务；
- Task/Goal/Reminder 都具备 startup reconcile 或等价 durable repair；
- 到点 handler 重新读取 authoritative state；
- API/Desktop 使用同一 contract 和 handler registry 语义；
- Scheduler 底层未来可用 custom engine 或 pg-boss 替换而不影响业务模块。
