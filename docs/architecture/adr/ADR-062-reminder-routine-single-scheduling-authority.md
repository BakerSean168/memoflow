---
tags:
  - adr
  - reminder
  - routine
  - scheduler
  - occurrence
  - outbox
  - idempotency
description: Reminder/Routine 的 wall-clock 触发统一由 Scheduler 唤醒，Reminder Domain 保留 occurrence/next-trigger 业务真相，退役并行 cron 调度权
created: 2026-08-25T17:49:00+08:00
updated: 2026-09-08T09:00:00+08:00
---

# ADR-062: Reminder / Routine 单一调度权与可靠 Occurrence 执行

**状态：** 已采纳并实施
**日期：** 2026-08-25  
**影响范围：** reminder、schedule/scheduler、schedule-orchestration、notification、database、apps/api、apps/desktop  
**关联：** ADR-042、ADR-059、ADR-060、ADR-061、ADR-063

## 2026-09-08 实现状态

Scheduler 已是 Routine/Reminder wall-clock 的唯一 durable wake-up authority；Reminder/Routine domain 保留 trigger/occurrence/next-trigger 真值。旧 ReminderSchedulerService/cron scanner 已删除，scheduled handler + occurrence fencing/idempotency/retry 路径为唯一执行主线。

## 1. 背景

当前 Reminder 已经同时接入两套真实可执行的调度路径。

### 路径 A：Schedule Projection / Queue

```text
ReminderTemplate
   ↓ domain event
ReminderScheduleProjectionSource
   ↓
ScheduleTask
   ↓
ScheduleTaskQueue
   ↓
ReminderScheduleExecutionSource
   ↓
reminder.recordTrigger()
   ↓
ReminderRepository.save()
   ↓
NotificationPort.createNotification()
```

### 路径 B：Reminder 自身 Cron Runtime

`apps/api/src/runtime/compose-reminder.ts` 当前仍创建：

```text
createReminderTriggerCronRuntime(...)
```

其运行链为：

```text
cron scanner
   ↓ scan nextTriggerAt
ReminderSchedulerService
   ↓ claim ReminderOccurrence
PrismaReminderWriteTransactionRunner
   ↓ same transaction
record ReminderHistory
advance ReminderTemplate.nextTriggerAt
write notification.dispatch OutboxMessage
mark occurrence terminal
```

Notification runtime 又会真实消费 `notification.dispatch` outbox 并创建/投递 Notification。

因此这不是“一个主路径 + 一个只读兜底监控”，而是**两个都能推进 Reminder 业务状态和产生通知副作用的 scheduler authority**。

即使存在幂等键和 claim，也会带来：

- 架构责任不清；
- 双方同时到点时的竞态复杂度；
- 测试需要证明两条执行链互不重复；
- 将来 Routine Coach 继续发展后，不知道 next occurrence 到底由哪套 runtime 推进；
- Schedule 的平台化目标被削弱。

## 2. 决策

对于 **durable wall-clock trigger**：

> **Scheduler 是唯一的“什么时候唤醒执行” authority；Reminder / Routine Domain 是唯一的“这次 occurrence 是否有效、下一次 occurrence 是什么时候” authority。**

目标链路：

```text
Reminder / Routine Domain
  owns trigger / recurrence / pause / snooze / active window
        ↓ projection
ScheduledIntent (one-shot next occurrence)
        ↓
Scheduler
  owns wake-up / lease / retry / timeout / crash recovery
        ↓
ReminderOccurrenceHandler
  owns business idempotency + re-validation
        ↓ transaction
  record occurrence/history
  advance nextTriggerAt
  write NotificationRequested outbox (if presentation required)
        ↓ post-commit event / durable projection repair
Reminder Projector reconciles next ScheduledIntent
```

原有 `ReminderTriggerCron` 退役，不再是第二 scheduler。

## 3. 单一真相拆分

### 3.1 Scheduler 拥有

- “2026-08-26T01:00Z 时唤醒 handler”；
- invocation claim；
- worker lease；
- retries/backoff；
- timeout；
- infrastructure execution record；
- restart / sleep recovery；
- dead-letter / replay。

### 3.2 Reminder / Routine Domain 拥有

- trigger 的业务类型；
- FixedTime / Interval / ActiveUsage 等领域配置；
- active window；
- Profile Gate / membership；
- pause / enable / snooze；
- `nextTriggerAt` / next occurrence calculation；
- occurrence business identity；
- user response/history；
- occurrence 是否已经 satisfied；
- Protocol Session 与 Ambient Routine 的协调（ADR-059）。

### 3.3 Notification 拥有

- 是否形成用户可见 Notification；
- channel plan；
- preference / DND / rate limit；
- InApp / Desktop / Push / Email delivery；
- channel retry/dead-letter。

## 4. 为什么采用 One-shot Next Occurrence Projection

Reminder 的 recurrence 不是纯 cron 技术问题。

它未来需要理解：

- 用户暂停；
- Profile 关闭；
- snooze；
- active window；
- 自然休息已经满足；
- Routine Profile；
- Protocol Session 对 Ambient Routine 的 suppression/satisfaction；
- AI 建议后用户确认的 frequency change。

因此推荐始终把“当前下一次 occurrence”投影成 one-shot invocation：

```text
ReminderTemplate.nextTriggerAt
        ↓
ScheduledIntent(runAt = nextTriggerAt)
```

触发后 Reminder Domain 推进 `nextTriggerAt`，再投影下一条。

优势：

- Scheduler 不复制 Reminder recurrence state machine；
- pause/snooze/exception 只需修改 Reminder Domain；
- 每次 occurrence 都有明确 business key；
- 对账时只需保证“当前正确的 next invocation”。

对纯系统内部 cron job（如 knowledge cleanup）仍可使用 Scheduler 自己的 cron/declarative recurrence；这与 Reminder Domain recurrence 是两种语义。

## 5. ReminderOccurrence 的去留

现有 Reminder 已投入大量可靠性工程：

- occurrence idempotency key；
- claim owner；
- lease；
- fencing token；
- heartbeat；
- attempt history；
- retryable / dead-letter；
- crash recovery；
- dual-instance mutual exclusion tests。

这些资产**不得因为统一 Scheduler 就直接删除**。

迁移后 `ReminderOccurrence` 的角色改为：

> **业务 occurrence receipt / idempotency fence**，而不是第二套 scheduler queue。

也就是说：

```text
Scheduler claim
  = infrastructure 层保证一条 invocation 不被多个 worker 同时消费

ReminderOccurrence idempotency
  = domain 层保证同一个 reminder occurrence 不会重复产生业务副作用
```

两层在迁移期同时存在是合理的 defense in depth。

长期如果实证表明部分 lease/fencing 字段完全重复，可以在单独 ADR 中简化；本次不先删除成熟可靠性资产。

## 6. Occurrence Key

必须建立稳定 business occurrence identity，例如：

```text
reminder:{templateId}:occurrence:{plannedAtInstant}
```

或由 Reminder recurrence engine 产生的 canonical occurrence id。

它用于：

- `schedulingKey`；
- ReminderOccurrence idempotency；
- NotificationRequested idempotency；
- correlation / causation；
- replay/audit。

同一次 occurrence 即使 Scheduler retry、worker crash、outbox replay，也不得形成两次业务提醒事实。

## 7. Handler Transaction

目标 handler 不应简单：

```ts
reminder.recordTrigger();
await repository.save(reminder);
await notification.create(...);
```

而应复用现有 transaction runner 的可靠写入能力：

```text
BEGIN
  lock / validate occurrence fence
  re-read / validate Reminder current state
  persist ReminderHistory / occurrence outcome
  advance nextTriggerAt
  insert NotificationRequested outbox
COMMIT
```

外部 Notification deliverer 的失败不能回滚 Reminder occurrence；通过 durable outbox 解耦。

## 8. 执行时重新验证

Scheduler 唤醒并不意味着必发。

Handler 至少重验：

- template 仍存在；
- not deleted；
- effectively enabled；
- expected occurrence 仍然是当前合法 occurrence；
- Profile/runtime gate 允许该类 wall-clock presentation；
- 没有已经处理过的 occurrence receipt。

合法 skip 必须形成可观测 receipt，而不是静默 return。

## 9. 与 Routine Coach ADR-059 的关系

ADR-059 已明确两类 runtime：

### Durable wall-clock

例如：

```text
12:00 午饭
23:30 准备睡觉
每天 09:00 喝药/固定习惯
```

走本 ADR 的 Scheduler。

### Desktop Local Activity Runtime

例如：

```text
ActiveUsage 40m -> 起身
Idle / Natural Break
Pomodoro / Flowtime phase timer
```

不强塞到云端 Scheduler。

Desktop Runtime 可以在本地形成 Routine Occurrence，再进入同一 Notification / Interaction Surface 契约。

因此“单一 Scheduler authority”是指同一类 **durable wall-clock scheduling** 不再由两套 worker 同时负责，不意味着所有 activity timer 都必须上云。

## 10. 迁移策略

### Phase 0 — Characterization

冻结两条当前路径：

- Schedule path；
- Reminder Cron path。

补端到端测试证明当前副作用和 idempotency 行为。

### Phase 1 — Scheduler Handler 使用可靠 Transaction Runner

先让 Schedule path 不再直接 `repository.save + notificationPort`，改为调用可靠 occurrence transaction。

此阶段 cron 仍在，但通过共享 occurrence key 防重复。

### Phase 2 — Durable Projection Repair

Reminder projection 增加：

- startup full reconcile；
- durable outbox / projection receipt；
- stable schedulingKey。

证明 Schedule path 在 event 丢失/重启后可自愈。

### Phase 3 — Cutover Authority

增加 capability/config gate：

```text
ReminderWallClockScheduler = schedule
```

生产只启动一个 authority。

Cron runtime 先保留代码但禁止产生业务 side effect，用 shadow/audit 模式比对 due set；验证期完成后删除。

### Phase 4 — Delete Legacy Cron Scheduler

删除：

- `createReminderTriggerCronRuntime` 作为生产调度入口；
- scanner-owned nextTriggerAt execution；
- 相关双轨配置。

保留：

- occurrence transaction；
- idempotency / receipts；
- history；
- dead-letter/replay 中仍有价值的通用能力。

## 11. 验证矩阵

必须覆盖：

| 场景                                          | 期望                                         |
| --------------------------------------------- | -------------------------------------------- |
| 两个 Scheduler worker 同时看到 due invocation | 只一个 claim 成功                            |
| 同一 occurrence 被重复 enqueue                | 业务副作用仍只一次                           |
| handler 在 DB commit 前 crash                 | transaction rollback，可 retry               |
| DB commit 后 Notification worker crash        | occurrence 不回滚，outbox 后续送达           |
| Reminder 在到点前暂停                         | handler skipped，不通知                      |
| Reminder 到点前被 snooze                      | 旧 invocation stale skip，新 invocation 存在 |
| event bus 丢失                                | startup/repair reconcile 恢复 invocation     |
| API/Desktop restart                           | next occurrence 不丢                         |
| legacy cron 与新 Scheduler cutover 窗口       | occurrence key 防重复                        |

## 12. 不采用的方案

### 12.1 保留两套 scheduler，靠幂等兜底

不采用。幂等是安全网，不是 owner 模型。

### 12.2 删除 ReminderOccurrence，完全信任 Scheduler exactly-once

不采用。Infrastructure claim 不能代替业务幂等，而且 retry/replay 仍可能重复进入业务 handler。

### 12.3 把所有 Reminder recurrence 转为 Scheduler cron

不采用。会复制 Routine Domain 的 pause/snooze/profile/active-window 等语义。

## 13. 验收标准

- production durable wall-clock reminder 只有一个 scheduler authority；
- Reminder Cron 不再推进 nextTriggerAt 或产生 notification side effect；
- Scheduler handler 使用可靠 occurrence transaction；
- same occurrence 的重复执行不会重复创建业务通知；
- Reminder projection 支持 startup/durable repair；
- next occurrence 仍由 Reminder / Routine Domain 计算；
- ADR-059 的 local activity runtime 不受错误云端化影响。
