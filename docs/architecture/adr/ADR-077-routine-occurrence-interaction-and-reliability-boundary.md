---
tags:
  - adr
  - routine
  - occurrence
  - interaction
  - scheduler
  - reliability
description: 将 RoutineOccurrence 定义为业务 occurrence receipt，将用户交互、Scheduler 执行和 Notification 投递拆开，并规划 ReminderHistory/Response/Instance/Occurrence 的单轨收敛
created: 2026-09-08T20:20:00+08:00
updated: 2026-09-08T20:20:00+08:00
---

# ADR-077: Routine Occurrence、Interaction 与 Reliability Boundary

**状态：** 已采纳（待实施）  
**日期：** 2026-09-08  
**影响范围：** reminder/routine、scheduler、notification、database、PowerSync、analytics  
**修订：** ADR-059 §10、ADR-062 §5~~8  
**关联：** ADR-042、ADR-043、ADR-059、ADR-061~~063、ADR-076

## 1. 决策摘要

Routine 的一次真实业务发生必须拥有稳定的：

```text
RoutineOccurrence
```

它表示：

> “某条 Routine 的某一次 requirement 已经成为一个可追踪的业务 occurrence，并最终得到满足、跳过或过期。”

它**不是**：

- Scheduler worker execution；
- Notification delivery attempt；
- Template history child；
- 用户点击行为本身。

用户行为另建：

```text
RoutineInteraction
```

最终边界：

```text
RoutineDefinition
      │
      ▼
RoutineOccurrence        = 发生了什么
      │
      ├── RoutineInteraction = 用户如何回应
      │
      └── Notification Fact  = 系统如何向用户呈现

SchedulerExecution       = 后台基础设施如何唤醒/重试
```

## 2. 当前多轨问题

当前 schema 同时存在：

```text
ReminderInstance
ReminderHistory
ReminderResponse
ReminderOccurrence
RoutineOccurrence
```

它们从不同历史阶段重复记录：

- 某次 trigger；
- 某次 worker claim；
- 某次 notification；
- 某次 user response；
- 某次 routine wall-clock occurrence。

其中 `ReminderInstance` 已几乎没有生产领域消费者；`ReminderHistory` 仍作为 `ReminderTemplate.history[]` 子实体；`ReminderResponse` 只引用 template 而不引用具体 occurrence；旧/new occurrence 又并存。

长期必须收敛。

## 3. RoutineOccurrence canonical shape

建议的业务语义：

```text
RoutineOccurrence
│
├── identity
│   ├── id
│   ├── identityId
│   ├── routineId
│   └── occurrenceKey
│
├── cause
│   ├── triggerKind
│   ├── scheduledFor?       // WallClock only
│   ├── becameDueAt
│   └── sourceRevision
│
├── resolution
│   ├── state
│   │   ├── Open
│   │   ├── Satisfied
│   │   ├── Skipped
│   │   └── Expired
│   ├── resolvedAt?
│   ├── resolutionKind?
│   └── reason?
│
└── system
    ├── createdAt
    └── updatedAt
```

### 3.1 为什么不用 Presented 作为主状态

“是否已经弹给用户看”不是 occurrence 生命周期的最终业务结论。

同一个 occurrence 可以：

```text
Open
 -> presented
 -> snoozed
 -> presented again
 -> satisfied
```

因此 presentation 应记录为 Notification/Interaction/Activity 事实，而不是把 occurrence 状态机变成 UI surface 状态机。

## 4. Stable occurrence identity

必须保持稳定 business key，例如：

```text
routine:{routineId}:wallclock:{plannedInstant}
routine:{routineId}:active-usage:{sequence}
routine:{routineId}:elapsed:{anchorRevision}
```

同一业务 occurrence 即使经历：

- Scheduler retry；
- worker crash；
- outbox replay；
- Desktop reconnect；
- Notification channel retry；

都不得生成第二个业务 occurrence。

该 key 同时用于：

- Scheduler schedulingKey / payload correlation；
- Routine occurrence idempotency；
- NotificationRequested idempotency；
- audit correlation/causation；
- replay diagnostics。

## 5. Resolution semantics

### 5.1 Satisfied

表示这次 Routine requirement 已经被满足。

可能来源：

```text
User completed
Natural break credit
Protocol break credit
External deterministic sensor evidence
```

必须记录 `resolutionKind`，不要只写一个模糊 `Completed`。

### 5.2 Skipped

表示用户/策略明确跳过本次 requirement，但不意味着 Routine Definition 被禁用。

### 5.3 Expired

表示本次 occurrence 已经失去呈现/执行价值，例如短时健康提示过期，不应无限补发。

### 5.4 Open

尚未被满足/跳过/过期。Snooze 后仍可保持 Open。

## 6. RoutineInteraction

用户对某次 occurrence 的行为独立记录：

```text
RoutineInteraction
├── id
├── identityId
├── routineId
├── occurrenceKey
├── action
│   ├── Acknowledged
│   ├── Completed
│   ├── Snoozed
│   └── Dismissed
├── actedAt
├── responseLatencyMs?
├── snoozeDurationMs?
└── metadata?
```

规则：

- `Completed` command 可以同时把 occurrence resolve 为 Satisfied；
- `Snoozed` 记录 interaction，并写 `RoutineTemporaryOverride`；
- `Dismissed` 不必自动等价于 Skipped，具体由 intervention policy 决定；
- analytics 读取 interaction facts，不把响应权重塞回 Definition aggregate。

## 7. ReminderResponse 的修正

旧 `ReminderResponse` 只包含：

```text
reminderTemplateId
```

无法回答：

> “用户点的是哪一次 15:00 occurrence？”

最终 Response/Interaction 必须基于：

```text
occurrenceKey / occurrenceId
```

Template/Routine ID 只作为关联元数据。

## 8. History 不再是 Aggregate child

禁止：

```text
RoutineDefinition
└── history[]
```

原因：

- 历史无界增长；
- 每次加载 Definition 不应 hydrate 所有历史；
- History 是事实/read model，不是维护 Definition invariant 所需子实体。

历史 UI 应通过：

```text
RoutineHistoryReadModel
= Occurrences + Interactions + relevant Notification facts
```

查询。

## 9. 与 Scheduler reliability 的边界

Scheduler 拥有：

```text
worker claim
lease
fencing
timeout
retry/backoff
dead-letter
execution receipt
```

RoutineOccurrence 拥有：

```text
business occurrence identity
business finalization/idempotency
business resolution
```

### 9.1 迁移期保护

现有 `RoutineOccurrence` / `ReminderOccurrence` 已实现成熟的 lease/fencing/retry 资产。

本 ADR **不要求立即删除这些字段**。

迁移步骤必须先证明 Scheduler 的可靠执行已完整覆盖，再把重复的 infrastructure 字段从 Routine business record 中移走。

原则：

> 先保证不重复副作用，再做数据模型瘦身。

## 10. Notification boundary

一个 occurrence becoming due 不等于：

```text
Desktop push successfully delivered
```

目标链路：

```text
RoutineOccurrence due
    ↓
Intervention decision
    ↓ optional
NotificationRequested(occurrenceKey)
    ↓
Notification Fact
    ↓
per-channel Delivery
```

Notification 的 suppress/defer/failure 不能重写 RoutineDefinition，也不能制造第二个 occurrence。

## 11. Legacy retirement map

| Legacy table/model   | Target                                                |
| -------------------- | ----------------------------------------------------- |
| `ReminderInstance`   | 删除；若有必要事实先迁入 RoutineOccurrence            |
| `ReminderHistory`    | RoutineOccurrence / audit read model                  |
| `ReminderResponse`   | RoutineInteraction                                    |
| `ReminderOccurrence` | 与 RoutineOccurrence 合并；保留可靠性字段直到安全退役 |
| `RoutineOccurrence`  | canonical business occurrence                         |
| `ReminderStatistic`  | 可重建 analytics/read model，不作为业务 aggregate     |

## 12. Read model

建议：

```text
RoutineHistoryReadModel
├── routine
├── occurrenceSummary
│   ├── total
│   ├── satisfied
│   ├── skipped
│   ├── expired
│   └── adherenceRate
├── recentOccurrences[]
└── recentInteractions[]
```

统计均为派生事实，不回写 Definition。

## 13. Acceptance（未来实施）

最终应满足：

```text
ReminderInstance production ownership      = 0
ReminderTemplate.history[]                 = 0
ReminderResponse without occurrence link   = 0
new Routine workflow writing old History   = 0
business occurrence duplicated on retry    = 0
```

并通过 crash/replay/concurrency/idempotency fault tests 证明迁移没有削弱可靠性。
