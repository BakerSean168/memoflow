---
tags:
  - adr
  - routine
  - reminder
  - domain-model
  - trigger
  - migration
description: 将 RoutineDefinition 固定为长期行为意图唯一真值，以判别联合表达 WallClock/Elapsed/ActiveUsage，并将 ReminderTemplate/ReminderType/TriggerConfig 等旧模型降为迁移壳
created: 2026-09-08T20:20:00+08:00
updated: 2026-09-08T20:20:00+08:00
---

# ADR-076: Routine Definition、Trigger Algebra 与 Legacy Reminder 退役

**状态：** 已采纳（待实施）  
**日期：** 2026-09-08  
**影响范围：** reminder/routine、contracts、database、PowerSync、app-vue、app-react、AI tools、data portability  
**修订：** ADR-059 的 Routine 领域模型细化；ADR-062 的 wall-clock ownership 保持不变  
**关联：** ADR-037、ADR-042、ADR-058、ADR-059、ADR-060~063

## 1. 决策摘要

MemoFlow 不再把 `ReminderTemplate` 作为长期产品领域模型继续演化。

最终唯一长期定义模型是：

```text
RoutineDefinition
= 用户长期希望形成/维持的一条行为节律定义
```

旧的：

```text
ReminderTemplate
ReminderType.OneTime | Recurring
TriggerConfig.FixedTime | Interval
ActiveTimeConfig
ReminderGroup
```

只允许作为迁移/兼容输入存在，不再增加新能力。

Canonical trigger 使用判别联合：

```ts
type RoutineTrigger = WallClockTrigger | ElapsedTrigger | ActiveUsageTrigger;
```

并明确时间执行 owner：

```text
WallClock    -> durable Scheduler
Elapsed      -> deterministic local runtime
ActiveUsage  -> deterministic local runtime
```

## 2. 为什么旧 ReminderTemplate 不再适合作为聚合根

当前 `ReminderTemplate` 同时保存：

- identity/title/description；
- `ReminderType`；
- `TriggerConfig`；
- `activeTime.activatedAt`；
- `activeHours`；
- `notificationConfig`；
- `selfEnabled`；
- `status`；
- cached `effectiveEnabled`；
- importance/tags/color/icon；
- `nextTriggerAt`；
- `history[]`。

这把五种不同事实混在一个聚合中：

```text
Long-lived definition truth
Runtime cursor/state
Eligibility projection
Occurrence/history facts
Notification delivery preference
```

因此旧模型会不断产生双轨：

- `selfEnabled` 与 `status=Active/Paused` 重复；
- `effectiveEnabled` 既缓存又需要根据 Profile/Global/Override 重新计算；
- `nextTriggerAt` 既被聚合计算又被 Scheduler projection 消费；
- `history[]` 随运行历史无限增长；
- `notificationConfig` 复制 Notification domain 的渠道、声音、震动和 action ownership。

## 3. Canonical RoutineDefinition

长期模型收敛为：

```text
RoutineDefinition
│
├── identity
│   ├── id
│   ├── identityId
│   ├── name
│   └── description?
│
├── lifecycle
│   └── enabled
│
├── timing
│   └── trigger?
│       ├── WallClock
│       ├── Elapsed
│       └── ActiveUsage
│
├── intervention
│   └── interventionPolicy?
│
├── classification
│   ├── importance?
│   └── Shared Labels              // external projection
│
└── system
    ├── version
    ├── createdAt
    └── updatedAt
```

### 3.1 Definition 明确不拥有

以下内容禁止重新进入 `RoutineDefinition`：

```text
nextTriggerAt
lastSatisfiedAt
runtime accumulator
active profile state
cached effectiveEnabled
occurrence/history collection
Scheduler lease/retry/fencing
Notification channel delivery state
sound/vibration/device permission
```

这些分别属于 Runtime、Occurrence、Scheduler 或 Notification。

## 4. Trigger Algebra

### 4.1 WallClock

表示现实世界 wall-clock 节律：

```ts
interface WallClockTrigger {
  type: 'WallClock';
  timingOwner: 'scheduler';
  localTime: Hm;
  timeZone: TimeZoneId;
  recurrence: {
    startDate: Ymd;
    frequency: RecurrenceFrequency;
    interval: number;
    byWeekday: readonly RecurrenceWeekday[];
    count: number | null;
    until: Instant | null;
  };
}
```

规则：

- wall-clock 必须有显式 IANA timezone；
- recurrence 通过 `@memoflow/time` / `RecurrenceEnginePort`；
- `count=1` 可以表达一次性的 wall-clock routine；
- 不额外维护 `ReminderType.OneTime/Recurring`。

### 4.2 Elapsed

表示“从业务锚点开始经过了多久”：

```ts
interface ElapsedTrigger {
  type: 'Elapsed';
  timingOwner: 'local-runtime';
  durationMs: number;
  anchor: 'routine-activation' | 'profile-activation' | 'last-satisfied';
}
```

它不等价于 wall-clock cron，也不由云端 Scheduler 每隔 N 分钟模拟。

### 4.3 ActiveUsage

表示实际活跃使用累计：

```ts
interface ActiveUsageTrigger {
  type: 'ActiveUsage';
  timingOwner: 'local-runtime';
  requiredActiveMs: number;
  anchor: 'profile-activation' | 'last-satisfied';
  naturalBreakCredit: ...;
  protocolBreakCredit: ...;
}
```

ActiveUsage 的语义必须消费 activity/idle 事实，不允许降级为普通 elapsed timer。

## 5. 删除 ReminderType + TriggerType 组合状态空间

旧模型：

```text
ReminderType = OneTime | Recurring
TriggerType  = FixedTime | Interval
```

允许出现没有真实产品语义的组合，例如：

```text
OneTime + Interval
```

当前 legacy adapter 已明确承认该组合没有可执行旧路径。

新模型使用 Trigger 自己表达时间语义，不再维护正交 enum：

```text
WallClock recurrence count=1    = one-shot wall-clock
WallClock recurrence count=null = recurring wall-clock
Elapsed                         = elapsed routine
ActiveUsage                     = active-usage routine
```

无效状态在类型层面不可表示。

## 6. `activatedAt` 从长期配置中移出

旧 `ActiveTimeConfig.activatedAt` 同时承担：

- 模板启用时间；
- recurrence anchor；
- interval runtime base。

并且 `enable()` 会重写它。

这会把长期定义与运行状态耦合。

目标：

```text
RoutineDefinition.trigger
  = 长期规则

RoutineRuntimeState / TemporaryOverride / Occurrence
  = 当前运行锚点与临时状态
```

重新 enable Routine 不得偷偷重写长期 recurrence definition。

## 7. Active Hours 的归位

旧 `activeHours` 不再属于 trigger truth。

“什么时候可以打扰用户”与“什么时候业务条件达到 due”是两件事：

```text
Trigger
  -> 决定 requirement 何时 due

Intervention / Presentation Policy
  -> 决定当前是否适合呈现
```

长期若需要 presentation window，必须使用 canonical：

```text
Hm + TimeZoneId
```

禁止继续用：

```ts
new Date(timestamp).getHours();
```

读取宿主机器隐式本地时区。

## 8. Lifecycle 单轨

`RoutineDefinition` 只保留：

```ts
enabled: boolean;
```

不同时保存：

```text
selfEnabled
status: Active | Paused
```

因为二者表达同一长期局部开关。

“当前是否真正可执行”由 ADR-078 的 Eligibility function 派生，不进入 Definition state。

## 9. 分类与展示字段

### 9.1 Labels

旧：

```text
tags: string[]
```

最终改为 Shared Label projection，与 Goal/Task 一致。

Routine 不重新拥有一套 tags vocabulary。

### 9.2 color / icon

允许作为 UI presentation metadata 保留，但不影响领域行为。

若后续 Routine Profile/Method Library 已能提供展示默认值，可以进一步弱化或移到 read model；本 ADR 不强制删除用户自定义 icon/color。

## 10. 简单“一次提醒我”如何表达

不为了：

> “今天 17:00 提醒我拿快递”

保留一个通用 `ReminderTemplate` God Object。

可选产品路径：

1. 作为 `WallClock(count=1)` 的轻量 Routine；或
2. 未来由 Planner/Automation one-shot action 表达。

最终由产品体验决定，但两种方案都不得复活旧 `ReminderType + TriggerConfig + NotificationConfig` 模型。

## 11. Legacy retirement map

| Legacy                         | Target                                             |
| ------------------------------ | -------------------------------------------------- |
| `ReminderTemplate`             | `RoutineDefinition`                                |
| `ReminderGroup`                | `RoutineProfile`                                   |
| group ownership                | `RoutineProfileMembership` M:N                     |
| `ReminderType`                 | 由 `RoutineTrigger` 自身表达                       |
| `TriggerType.FixedTime`        | `WallClockTrigger`                                 |
| `TriggerType.Interval`         | `ElapsedTrigger`，仅有明确证据时迁为 `ActiveUsage` |
| `ActiveTimeConfig.activatedAt` | runtime state / migration anchor                   |
| `activeHours`                  | Intervention/Presentation policy                   |
| `selfEnabled + status`         | `RoutineDefinition.enabled`                        |
| cached `effectiveEnabled`      | Eligibility read model                             |
| `tags[]`                       | Shared Labels                                      |
| `notificationConfig`           | ADR-079 / Notification domain                      |
| `history[]`                    | ADR-077 RoutineOccurrence/Interaction              |

## 12. Migration rule

在真正实施前：

- legacy API 可以继续作为 compatibility input；
- legacy adapter 可以继续把 Reminder 写入投影到 Routine；
- **禁止在 legacy Reminder 模型上增加新 feature**；
- 新业务功能只进入 Routine target model；
- 数据迁移完成并验证后删除 legacy storage/API/domain symbols，而不是长期双写。

## 13. Acceptance（未来实施）

最终代码库除 migration/history 文档外应满足：

```text
canonical ReminderTemplate aggregate     = 0
ReminderType in new Routine contract      = 0
TriggerConfig as canonical trigger truth  = 0
cached effectiveEnabled in definition     = 0
history[] inside Routine aggregate        = 0
notification channels inside Routine      = 0
```

同时 WallClock / Elapsed / ActiveUsage 的现有行为和 Scheduler/Local Runtime ownership 必须保持。
