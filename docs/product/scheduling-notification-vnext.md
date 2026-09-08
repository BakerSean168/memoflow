---
tags:
  - product
  - schedule
  - planner
  - scheduler
  - reminder
  - routine
  - notification
  - vnext
description: MemoFlow Scheduling / Planner / Routine / Notification vNext 的统一产品语义、端到端用户场景与 North Star 架构
created: 2026-08-25T17:49:00+08:00
updated: 2026-09-08T20:45:00+08:00
---

# Scheduling / Planner / Routine / Notification vNext

## 2026-09-08 Schedule / Scheduler Model Convergence Freeze

ADR-060/061 的 bounded-context、SchedulingPort 与 Handler Registry 方向继续保持；本轮进一步冻结 ADR-080~083：

```text
Planner / Calendar
  CalendarEntryRange = Timed | AllDay
  PlannerEventProjection + occupancy
  cross-source PlannerConflictProjection

Scheduler / Temporal Engine
  ScheduledIntent -> SchedulingPort.reconcile
  ScheduledInvocation
  InvocationAttempt
  host lease / claim / retry / recovery
```

当前代码仍存在 legacy `ScheduleTask / ScheduleExecution / ScheduleConfig` 实现壳以及 CalendarEntry 的 `duration/conflict/priority` 残差。它们属于**待实施迁移**，不能因为本文已冻结 North Star 就当作代码已完成。详细模型见 [Schedule / Planner + Scheduler / Temporal Engine vNext](./schedule-planner-scheduler-vnext.md) 和 [Current System Map](../analysis/2026-09-08-schedule-scheduler-current-system-map.md)。

## 2026-09-08 Notification Model Convergence Freeze

ADR-063 已落地的 Notification 主干继续保护：

```text
NotificationRequested
  -> Notification Fact
  -> per-channel policy
  -> durable dispatch / receipt
```

本轮进一步冻结 ADR-084~088：

```text
NotificationFact + InboxLifecycle
NotificationWorkflowDefinition
DeliveryPlan + DeliveryProjection
NotificationInteraction + typed OwnerCommand
QuietHours(TimeZoneId,Hm)
InboxPort / OperationsPort
InboxRealtime / DeliveryRealtime
```

当前代码仍保留 `NotificationChannel[] / NotificationHistory / NotificationTemplate / NotificationCategory / RelatedEntityType / host-local DND` 等第一代或过渡模型；这些属于**待实施迁移**。详细见 [Notification vNext](./notification-vnext.md) 与 [Notification Current System Map](../analysis/2026-09-08-notification-current-system-map.md)。

## 1. 为什么需要这一份统一设计

MemoFlow 早期把“时间相关能力”自然聚集到 Schedule 和 Reminder 附近：

- Goal / Task 需要在未来某时提醒；
- Reminder 需要周期触发；
- Notification 需要把触发结果送给用户；
- 用户又希望拥有日历/月计划/日计划/timeboxing；
- Desktop 需要原生通知、声音和弹窗；
- 未来 AI / Wallet / Knowledge 也会需要后台定时动作。

这些能力彼此相关，但不能继续用一个“大 Schedule 模块”或“大 Reminder 模块”统一解释。

vNext 的目标不是减少模块数量，而是让每个模块拥有一个清晰问题：

```text
Goal / Task / Routine
  我为什么要在某个时间点做某件事？

Planner
  用户如何看、安排、调整自己的时间？

Scheduler
  系统如何在某个时间点可靠地唤醒一个 handler？

Notification
  一条对用户有意义的消息如何成为 Inbox 事实并通过合适渠道送达？
```

## 2. 四句产品宪法

> **Planner 管用户时间安排。**

> **Scheduler 管机器执行时间。**

> **业务模块拥有自己的时间语义。**

> **Notification 管消息事实和送达，不反过来拥有业务触发。**

## 3. 用户场景推演

### 3.1 Goal：毕业论文提前 7 天提醒

用户配置：

```text
Goal: 完成毕业论文
Target: 2026-09-30
Reminder: 提前 7 天
```

正确模型：

```text
Goal Domain
  understands RemainingDays(7)
        ↓
Goal Scheduling Projector
  computes Sep 23 Instant
        ↓
ScheduledIntent
  schedulingKey = goal:{id}:remaining-days:7
  handlerKey = goal.reminder.fire
        ↓
Scheduler
        ↓ Sep 23
Goal Reminder Handler
  re-read Goal
  if completed -> skipped
  else -> NotificationRequested
        ↓
Notification
```

不正确：Scheduler 自己知道“Goal Deadline”和“提前 7 天”。

### 3.2 Task：14:00 答辩，提前 30 分钟

```text
Task Domain
  start = 14:00
  reminder = Relative(start, -30m)
        ↓
Task Projector
  runAt = 13:30
        ↓
Scheduler
```

如果 Task 在 12:00 被改到 16:00：

```text
Task updated
  ↓
reconcile same schedulingKey
  ↓
runAt becomes 15:30
```

不产生两个 reminder。

### 3.3 Repeating Task

```text
Task Plan: 每周一 09:00 周报
        ↓
Task Domain generates concrete occurrence
        ↓
TaskInstance Monday 09:00
        ↓
Reminder projection for that occurrence
```

Task recurrence 不应被 Scheduler cron 取代，因为 skipped/missed/paused/exception 都属于 Task。

### 3.4 Routine：每天 23:30 准备睡觉

```text
Routine Domain
  FixedTime 23:30
  current nextTriggerAt
        ↓
ScheduledIntent(one-shot)
        ↓
Scheduler
        ↓
Routine Occurrence Handler
  record occurrence
  advance nextTriggerAt
  emit presentation intent
        ↓
project next one-shot invocation
```

### 3.5 Routine：电脑使用 40 分钟后起身

这是 ADR-059 的 ActiveUsage：

```text
Desktop Local Activity Runtime
  active usage clock
        ↓ 40m
Routine Occurrence
        ↓
InterventionWindow / native notification
```

它不需要每几秒同步到 cloud Scheduler。

### 3.6 Pomodoro / 50-10 / Flowtime

这是 Protocol Session，不是多个 Reminder 拼起来：

```text
Focus Session State Machine
  Work -> Break -> Work
```

持续 FocusWindow 可以展示 timer；阶段结束时进入同一 Routine/Notification presentation seam。

### 3.7 Planner：拖动 Task 时间块

Planner 显示：

```text
CalendarEntry
Task occurrence
Goal milestone
Routine fixed-time occurrence
```

用户把 Task 14:00 拖到 16:00：

```text
Planner
  owner = task
        ↓
Task update command
        ↓
Task Domain
        ↓
calendar projection refreshed
scheduling projection reconciled
```

Planner 不直接修改内部 Scheduler row。

### 3.8 AI Daily Review

未来 AI 想每天晚上生成复盘：

```text
handlerKey = ai.daily-review.generate
runAt = user-configured time
```

Scheduler 不需要新增 `SourceModule.AI` switch。

## 4. 用户可见信息架构

### 4.1 Schedule / Planner 页面

定位：

> 个人的时间安排中心，而不是后台 job 管理器。

包含：

- Day；
- Week；
- Month；
- Agenda；
- time blocks；
- Task occurrences；
- Goal milestones/review points；
- Routine fixed-time occurrences（可配置显示）；
- external calendar future integration；
- conflict / overlap indication。

不默认展示：

- retry count；
- worker lease；
- dead letter；
- handlerKey；
- raw cron；
- source module internals。

这些属于 developer/operations diagnostics。

### 4.2 Routine Coach 页面

定位见 ADR-059：

- Routine Definitions；
- Profiles；
- Ambient interventions；
- Focus Protocols；
- history/insights；
- AI setup/suggestion。

### 4.3 Notification Center

定位：

> 用户可追溯的消息事实。

它展示：

- unread/read；
- category/workflow；
- related entity；
- navigation；
- actions；
- meaningful history。

不把“Desktop popup suppressed by DND”解释成消息从未存在。

## 5. 系统内部信息架构

### 5.1 Scheduler Console（如果未来需要）

只作为 internal/dev/ops surface：

- invocation status；
- handlerKey；
- runAt；
- retries；
- dead letter；
- execution duration；
- replay；
- source owner。

它不属于普通用户 Schedule 页面。

## 6. 核心 Contract

### ScheduledIntent

```ts
interface ScheduledIntent {
  schedulingKey: string;
  handlerKey: string;
  runAt: Instant;
  payload: unknown;
  sourceRevision?: number | string;
}
```

### SchedulingOwner

```ts
interface SchedulingOwner {
  identityId: string;
  type: string;
  id: string;
}
```

### SchedulingPort

```ts
interface SchedulingPort {
  reconcile(owner, desired): Promise<Receipt>;
  removeOwner(owner): Promise<Receipt>;
}
```

### ScheduledHandler

```ts
interface ScheduledHandler {
  execute(invocation): Promise<HandlerResult>;
}
```

### NotificationRequested

业务层只描述：

```text
workflowKey
content
relatedEntity
importance/urgency
suggested channels
idempotency/correlation
```

Notification Runtime 再做 channel planning。

## 7. 业务状态与派生状态

### Authoritative

```text
Goal          -> Goal package
Task          -> Task package
Routine       -> Reminder/Routine package
CalendarEntry -> Schedule/Planner package
Notification  -> Notification package
```

### Derived

```text
Calendar Projection
Scheduled Invocation
Notification Delivery Plan
Delivery Attempt
```

派生状态必须：

- 可重建；
- 可对账；
- 具备 sourceRevision/owner identity；
- 不反向成为业务真相。

## 8. 可靠性模型

### Projection

```text
Event fast path
+
Durable outbox/receipt
+
Startup reconcile
+
Idempotent stable keys
```

### Scheduler

```text
claim
lease/fencing
retry/backoff
timeout
execution receipt
DLQ/replay
```

### Business Handler

```text
re-read authoritative state
business idempotency
transaction
outbox side effects
```

### Notification

```text
Notification Fact
per-channel decision
per-channel outbox
lease/retry/dead-letter
```

## 9. Failure Semantics

### Stale Invocation

不是错误：

```text
Task completed before reminder
Goal archived before reminder
Routine paused before due
```

结果：`skipped` + reason。

### Handler Technical Failure

Scheduler retry。

### Business Side Effect Commit 后 Notification Failure

业务 occurrence 不回滚；Notification outbox retry。

### Event Projection Failure

durable repair/reconcile。

### Device Offline

Cloud Notification/Planner truth 不依赖某台设备在线；Desktop local-only activity runtime 有自己的 local durable state/restore 策略。

## 10. Timezone 与时间模型

- `Instant` 是执行真相；
- `Ymd/Hm` 是用户日历输入；
- recurrence/wall-clock 需要 IANA timezone；
- UI display 走 Product Time System；
- 禁止 hardcoded Shanghai；
- DST 由成熟 engine 处理；
- one-shot 已解析成 Instant 后 Scheduler 不再二次解释 timezone。

## 11. 与 OSS 的组合学习

```text
Vikunja
  -> Task date/reminder/repeat domain semantics

Super Productivity
  -> Planner / Calendar / Desktop focus/reminder UX

Trigger.dev
  -> Scheduled handler identity / dedupe / timezone

pg-boss
  -> PostgreSQL worker queue / retry / DLQ

Novu
  -> Notification workflow / preference / Inbox / activity
```

详细研究：`docs/analysis/2026-08-25-scheduling-notification-oss-study.md`。

## 12. 明确不做

- 不把 Goal/Task/Routine recurrence 全塞进 Scheduler；
- 不把 CalendarEntry 和 ScheduledInvocation 合并；
- 不让 Schedule 页面成为后台 job console；
- 不保留 Reminder 两套 wall-clock scheduler；
- 不让 Scheduler 直接调用 Email/Push/Desktop deliverer；
- 不因为 pg-boss 成熟就立即删除当前 scheduler；
- 不引入第二套 OSS Task/Notification source of truth；
- 不复制 GPL/AGPL 应用源码；遵循 ADR-058 的 license gate。

## 13. 决策文件

- [ADR-060 Schedule / Planner 与 Scheduler 分离](../architecture/adr/ADR-060-schedule-planner-and-scheduler-boundary.md)
- [ADR-061 Scheduling Port 与 Handler Registry](../architecture/adr/ADR-061-business-module-scheduling-port-and-handler-registry.md)
- [ADR-062 Reminder / Routine 单一调度权](../architecture/adr/ADR-062-reminder-routine-single-scheduling-authority.md)
- [ADR-063 Notification Fact / Delivery Policy](../architecture/adr/ADR-063-notification-fact-delivery-policy-and-device-surfaces.md)
- [ADR-059 Routine Coach](../architecture/adr/ADR-059-routine-coach-domain-runtime-and-surfaces.md)

## 14. 实施计划

见：

[2026-08-25 Scheduling / Notification vNext Refactor](../plan/archive/2026-08-25-scheduling-notification-vnext-refactor.md)
