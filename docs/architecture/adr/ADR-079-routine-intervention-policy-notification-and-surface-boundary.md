---
tags:
  - adr
  - routine
  - intervention
  - notification
  - desktop
  - surface
description: Routine 只拥有为什么/以何种干预强度呈现的 Intervention Policy，不拥有 Notification channel/sound/vibration；Notification 与 Device Surface 分别负责 delivery 与设备呈现
created: 2026-09-08T20:20:00+08:00
updated: 2026-09-08T20:20:00+08:00
---

# ADR-079: Routine Intervention Policy、Notification 与 Device Surface 边界

**状态：** 已采纳（待实施）  
**日期：** 2026-09-08  
**影响范围：** reminder/routine、notification、desktop、contracts、AI tools  
**修订：** ADR-059 Intervention Surface；ADR-063 Notification delivery boundary  
**关联：** ADR-042、ADR-059、ADR-062、ADR-063、ADR-076~078

## 1. 决策摘要

旧 `ReminderNotificationConfig` 不再属于 Routine 长期领域模型。

Routine 拥有：

> **为什么要干预、什么时候 escalation、干预强度/行为语义是什么。**

Notification 拥有：

> **是否形成 Notification Fact、通过哪些 channel、DND/rate-limit/preference 如何处理。**

Device Surface 拥有：

> **当前设备最终用 OS Notification、InterventionWindow、FocusWindow、声音或其他 surface 怎么呈现。**

目标：

```text
Routine Occurrence
      ↓
Intervention Policy
      ↓
Presentation Intent
      ↓
NotificationRequested / Local Surface Intent
      ↓
Notification Policy + Device Capability
      ↓
Actual Delivery / Surface
```

## 2. 为什么 `notificationConfig` 不应继续在 RoutineDefinition

当前旧 Reminder 保存：

```text
channels[]
title
body
sound
vibration
actions[]
```

这些字段属于不同层：

- channels：Notification delivery policy；
- sound/vibration：device capability/presentation；
- actions：interaction surface；
- title/body：presentation content；
- Routine 领域真正需要的是 intervention intent。

继续把它们放在 Routine 会让：

- Routine 知道 Email/Push/Desktop 实现；
- Notification preference/DND 被绕过；
- Desktop OS capability 泄漏到业务聚合；
- 同一个 Routine 在不同设备无法自然适配。

## 3. InterventionPolicy

建议长期业务模型：

```text
InterventionPolicy
├── defaultLevel
│   ├── Gentle
│   ├── Guided
│   └── Strict
├── gracePeriodMs?
├── escalation?
├── presentationWindow?
├── expiryPolicy?
└── interactionOptions?
```

### 3.1 Gentle

低干扰提示，例如：

- 喝水；
- 轻微起身提醒；
- 远眺提示。

### 3.2 Guided

需要更明显引导，例如：

- 引导 2 分钟活动；
- 强调休息动作；
- InterventionWindow。

### 3.3 Strict

只用于用户明确选择的少数方法，例如强制 break protocol。

Strict 不能成为 AI 自动提高强度的默认行为。

## 4. Presentation Window

如果用户配置：

> 09:00~21:00 才允许普通健康干预

它属于 presentation policy，而不是 trigger。

Canonical representation：

```text
start: Hm
end: Hm
timeZone: TimeZoneId
```

应支持跨夜窗口并通过 Product Time 解释 DST/时区。

## 5. Expiry Policy

Routine 需要决定“错过后还有没有价值”，而不是把所有 due 无限补发。

例如：

```text
喝水             -> 可在一段 grace 内继续提示
12:00 午饭       -> 过很久后可能 Expired
20-20-20 远眺    -> 被 Natural Break 满足后直接 Satisfied
```

因此允许：

```text
expiryPolicy:
  ephemeral | grace-period | durable
```

具体枚举可在实施时收敛，但 ownership 属于 Routine intervention semantics。

## 6. Notification Requested

Routine 只提交业务请求，例如：

```text
workflowKey = routine.intervention
relatedEntity = RoutineOccurrence
content intent\	importance / urgency
suggested surface/channel hints (optional)
occurrenceKey
```

`suggestedChannels` 只是 hint，不能绕过 ADR-063 的 per-channel policy。

## 7. Notification Domain 继续拥有

- Notification Fact；
- global/workflow channel preference；
- DND；
- rate limit；
- per-channel plan；
- Push/Email/Desktop/InApp delivery；
- channel retry/dead-letter；
- read/unread/archive/expiry 的 Notification 事实。

Routine 不复制这些配置。

## 8. Desktop Device Surface

当 Notification/Presentation intent 到达设备后，由 Desktop adapter 结合：

```text
OS permission
foreground/background
local DND
fullscreen context
current Protocol Session
surface capability
```

决定实际：

```text
OS Notification
InterventionWindow
Guided Break Window
FocusWindow
optional Strict Overlay
```

### 8.1 Ambient vs Protocol

Ambient Routine 通常是短生命周期 surface。

Protocol Session 自己拥有持续状态，所以主要使用 `FocusWindow`，不能把每个 phase 都建成普通 Reminder notification。

## 9. Interaction action ownership

UI action：

```text
Complete
Snooze
Dismiss
Start break
```

最终调用 Routine command，产生 ADR-077 `RoutineInteraction` / `RoutineTemporaryOverride` / occurrence resolution。

Notification action 只是 transport/navigation surface，不拥有 Routine state transition。

禁止：

```text
Notification row.action = completed
=> 直接修改 Routine database
```

必须走 owner-domain command。

## 10. Task / Goal reminder 边界

本 ADR 再次明确：

```text
Task reminder
Goal reminder
```

不因为名称里有“提醒”就创建 RoutineDefinition。

正确链路：

```text
Task Domain owns task-relative reminder semantics
Goal Domain owns goal target reminder semantics
Routine owns behavior/rhythm intervention semantics

all -> SchedulingPort / NotificationRequested
```

因此退役 Legacy ReminderTemplate 不会破坏 Task/Goal 的提醒能力。

## 11. Smart Frequency

现有 frequency analytics 可以保留为 insight，但不能直接成为不可见的 autonomous mutation。

目标：

```text
behavior facts
  -> analysis
  -> AI/system suggestion
  -> user-confirmed structured command
  -> change Routine trigger/intervention policy
```

尤其健康/睡眠等重要节律禁止根据短期 click/ignore score 静默自动调频。

## 12. Legacy retirement map

| Legacy Reminder config         | Target owner                                |
| ------------------------------ | ------------------------------------------- |
| `notificationConfig.channels`  | Notification policy / workflow defaults     |
| `notificationConfig.sound`     | Device Surface                              |
| `notificationConfig.vibration` | Device Surface                              |
| `notificationConfig.actions`   | Interaction Surface + owner-domain commands |
| custom title/body              | Presentation content intent / template      |
| `activeHours`                  | InterventionPolicy.presentationWindow       |
| frequency effectiveness        | analytics/read model + suggestion           |

## 13. Acceptance（未来实施）

最终：

```text
RoutineDefinition.notificationConfig          = 0
Routine code selecting concrete Email/Push    = 0
Routine code owning Notification DND           = 0
Device permission inside Routine aggregate     = 0
Notification action bypassing Routine command  = 0
```

同时 InterventionWindow/FocusWindow 与 Notification Center 的用户体验保持可用。
