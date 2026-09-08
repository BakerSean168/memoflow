---
tags:
  - analysis
  - reminder
  - routine
  - current-state
  - migration
description: 2026-09-08 Reminder/Routine 当前代码真值、两代模型并存状态、领域残差与目标退役映射
created: 2026-09-08T20:20:00+08:00
updated: 2026-09-08T20:20:00+08:00
---

# Reminder / Routine Current System Map — 2026-09-08

> 本文是 **current-state evidence**，不是目标模型。目标设计见 ADR-076~079。
>
> 核查基线：`main@7dd5a9be54b6353b0fe029309b2f5717e209cc1a`。Task vNext docs/implementation branch 对 Reminder production code 为 0 diff，因此本图可作为本轮设计基线。

## 1. Executive Finding

Reminder package 当前不是一个单一模型，而是两代模型同时存在：

```text
Legacy Reminder generation
  ReminderTemplate
  ReminderGroup
  ReminderHistory
  ReminderResponse
  ReminderOccurrence
  ReminderInstance (mostly residual)
  UserReminderPreferences

Routine vNext generation
  RoutineDefinition
  RoutineProfile
  RoutineProfileMembership
  RoutineTrigger
  RoutineTemporaryOverride
  RoutineOccurrence
  RoutineProtocolDefinition
  RoutineProtocolSession
```

Core vNext 已经把 Scheduler、ProfileMembership、WallClock/ActiveUsage/Protocol runtime 等关键方向做出来，但 legacy Reminder API/domain/persistence 仍然是完整可写模型，并通过 adapter 投影 Routine。

所以当前最准确的状态是：

> **Routine vNext 已经成为目标语义，但 ReminderTemplate 仍是强兼容写入口；领域代际切换尚未完成。**

## 2. Legacy ReminderTemplate 当前状态

当前 aggregate 包含：

```text
id / identityId
name/title / description
type: OneTime | Recurring
trigger: FixedTime | Interval
activeTime.activatedAt
activeHours
notificationConfig
selfEnabled
status: Active | Paused
effectiveEnabled (cached legacy projection)
importanceLevel
tags[]
color / icon
nextTriggerAt
history[]
version / timestamps
```

### 2.1 明确残差

- `selfEnabled` + `status` 双表达局部 lifecycle；
- `effectiveEnabled` 已在代码注释中标为 legacy cached projection；
- `history[]` 仍作为 aggregate child；
- `getGroup()` 仍是返回 `null` 的 legacy surface；
- tags 仍是独立 string array；
- `notificationConfig` 复制 Notification channel/surface ownership。

## 3. Trigger 当前双轨

### Legacy

```text
ReminderType: OneTime | Recurring
TriggerType:  FixedTime | Interval
```

组合不是严格 algebra；`TriggerConfigSchema` 同时保存：

```text
type
fixedTime | null
interval | null
```

`fromDTO()` 不保证只有匹配分支有值。

### Routine vNext

已经存在：

```text
WallClockTrigger
ElapsedTrigger
ActiveUsageTrigger
```

且 owner 明确：

```text
WallClock -> scheduler
Elapsed / ActiveUsage -> local-runtime
```

`legacy-reminder-adapter.ts` 已经证明迁移语义：

- FixedTime -> WallClock；
- Recurring Interval -> 默认 Elapsed；
- 只有显式 evidence 才迁 ActiveUsage；
- OneTime Interval 不发明不存在的旧行为。

## 4. 时间残差

### 4.1 activatedAt

旧 Reminder enable 时会重置 `activeTime.activatedAt`，同时它又被 recurrence calculator 当计算基准。

长期定义与 runtime anchor 混合。

### 4.2 activeHours

Create request 曾包含 timezone，但 canonical `ActiveHoursConfigSchema` 只保存：

```text
enabled
startHour
endHour
```

旧 aggregate `isActiveAtTime()` 使用 host `Date.getHours()`。

这与 ADR-037 的显式 Product Time/Timezone 原则不一致。

## 5. Scheduling 当前正确资产

ADR-062 已实施：

- Scheduler 是 durable wall-clock 唯一 wake-up authority；
- 独立 Reminder cron scanner 已退休；
- Reminder/Routine domain 仍拥有 next occurrence 业务解释；
- `ScheduledIntent + SchedulingPort.reconcile + handler registry` 为接入 seam。

Legacy Reminder path 当前按 `nextTriggerAt` 投影 one-shot intent。

Routine wall-clock path已经有独立的：

```text
routine.wallclock.fire
RoutineOccurrenceStore
occurrenceKey
fencing / lease
NotificationRequested
```

这些可靠执行资产需要保护，不因领域改名重写。

## 6. Occurrence/History/Response 当前多轨

数据库同时存在：

| Model              | 当前角色                                     |
| ------------------ | -------------------------------------------- |
| ReminderInstance   | 旧触发实例表，生产领域 usage 极少            |
| ReminderHistory    | legacy trigger history                       |
| ReminderResponse   | 用户 response analytics，仅关联 template     |
| ReminderOccurrence | legacy reliable occurrence/lease/fencing     |
| RoutineOccurrence  | Routine vNext reliable wall-clock occurrence |
| ReminderStatistic  | 可重建统计                                   |

问题：

- 同一次业务发生可以在多个表留下不同事实；
- Response 不精确关联 occurrence；
- History 仍被 hydrate 回 Template aggregate；
- reliability receipt 与 business occurrence 尚未完全分层。

目标见 ADR-077。

## 7. Profile 当前双轨

旧：

```text
ReminderGroup
```

新：

```text
RoutineProfile
RoutineProfileMembership M:N
```

Legacy cutover service 仍会把 Group 投影为 Profile。

新的 membership ownership 已正确，不再依赖 single groupId。

但 `RoutineProfile` 目前同时保存：

```text
enabled
active
```

`active` 仍可能混合长期定义与当前 runtime context，目标见 ADR-078。

## 8. Global preference 当前状态

`UserReminderPreferences` 保存：

```text
globalReminderEnabled
bestTimeSlots[]
worstTimeSlots[]
```

Smart Frequency 的自动后台状态已被删掉，但 frequency analysis / explicit adjustment API 仍存在。

`best/worst time slot` 属于 analytics/recommendation 数据，长期不必作为核心 Routine aggregate。

## 9. Notification boundary 当前状态

Legacy `ReminderNotificationConfig` 仍直接保存：

```text
channels
title/body
sound
vibration
actions
```

而 ADR-063 已经把 Notification Fact / per-channel Delivery Policy / Device Surface 分开。

Routine vNext 应继续完成 ownership 收敛，见 ADR-079。

## 10. Current -> Target map

```text
ReminderTemplate -----------------> RoutineDefinition
ReminderGroup --------------------> RoutineProfile
single-group semantics -----------> RoutineProfileMembership M:N
ReminderType + TriggerConfig -----> RoutineTrigger ADT
activatedAt config ---------------> Runtime state / migration anchor
activeHours ----------------------> Intervention presentation window
selfEnabled + status -------------> RoutineDefinition.enabled
cached effectiveEnabled ----------> derived Eligibility
profile.active -------------------> RoutineRuntimeContext (target)
ReminderHistory ------------------> RoutineOccurrence/read model
ReminderResponse -----------------> RoutineInteraction
ReminderInstance -----------------> retire
ReminderOccurrence ---------------\
                                  +-> canonical RoutineOccurrence
RoutineOccurrence ----------------/
notificationConfig ---------------> Intervention intent + Notification policy + Device Surface
ReminderStatistic ----------------> rebuildable analytics/read model
```

## 11. Protected assets

未来迁移不得破坏：

- WallClock DST/timezone correctness；
- ActiveUsage + idle/natural break semantics；
- ProtocolSession deterministic state machine；
- ProfileMembership M:N；
- TemporaryOverride；
- Scheduler single authority；
- occurrence idempotency/fencing/crash recovery；
- NotificationRequested durable outbox；
- Prisma/PowerSync parity；
- API/Desktop behavior parity。

## 12. Design package

本轮新增：

- ADR-076 — Routine Definition / Trigger / legacy retirement；
- ADR-077 — RoutineOccurrence / Interaction / reliability boundary；
- ADR-078 — Profile / Eligibility / RuntimeContext / TemporaryOverride；
- ADR-079 — Intervention / Notification / Device Surface。

本轮只冻结文档，不创建 Reminder active implementation plan，不改生产代码。
