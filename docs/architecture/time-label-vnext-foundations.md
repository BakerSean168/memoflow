---
tags:
  - architecture
  - time
  - label
  - vnext
  - foundations
description: MemoFlow Time + Label vNext Foundations 北极星架构
created: 2026-09-09T00:00:00+08:00
updated: 2026-09-09T00:00:00+08:00
---

# Time + Label vNext Foundations

## 1. North Star

MemoFlow 保留两个独立共享能力：

```text
Product Time
= universal semantic foundation

Shared Label Registry
= persistent user taxonomy foundation
```

两者不合并成 generic `shared-utils`，也不形成知道所有业务模块的 God package。

## 2. Target topology

```text
@memoflow/contracts primitives
│
├── Instant / Ymd / Hm / TimeZoneId
│        │
│        ▼
│   @memoflow/time
│   ├── Clock
│   ├── Codec
│   ├── TimeContext
│   ├── PresentationStyle
│   ├── Calendar
│   ├── Format/Input
│   └── RecurrenceEnginePort
│
└──────────────────────────────┐
                               │
                               ▼
                        @memoflow/label
                        ├── Label Registry
                        ├── normalization
                        ├── typed color
                        └── resolveNames
                               │
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
          Goal               Task              future owner
      GoalLabel owned    TaskLabel owned     only if real need
```

## 3. Time constitution

### Time owns

- product primitive behavior；
- Clock；
- calendar math；
- timezone conversion；
- presentation formatting primitives；
- input codec；
- recurrence engine abstraction；
- DST wall-clock resolution policy。

### Time does not own

- Goal target meaning；
- Task schedule lifecycle；
- Routine trigger lifecycle；
- Planner occupancy；
- Scheduler invocation state；
- Notification QuietHours policy；
- user preference persistence。

## 4. Time target model

```text
TimeContext
├── timeZone: TimeZoneId
└── weekStartsOn

TimePresentationStyle
├── locale
├── dateStyle
├── timeStyle
├── empty
├── relative
└── duration

TimeFacade
├── Clock
├── Codec
├── Calendar(TimeContext)
├── Format(TimeContext + PresentationStyle)
├── Input(TimeContext)
└── RecurrenceEnginePort
```

`UserPreferenceProfile.regional` 提供用户选择；Time package 只消费注入值，不依赖 Setting package。

## 5. Label constitution

### Label Registry owns

```text
Label identity
Label name
normalizedName
color
registry lifecycle
```

### Owner domain owns

```text
Goal -> GoalLabel assignments + Goal label query
Task -> TaskLabel assignments + Task label query
```

Label module 不知道 Goal/Task/Routine 的类型。

## 6. Shared semantics

### User taxonomy

```text
#工作
#AI
#健康
```

是 user-owned label。

### System view

```text
Today
Upcoming
Completed
Active
Overdue
```

是 owner/time-derived read model，不是 label。

### AI proposal

AI 可以提出 label names，通过 Registry `resolveNames()` 解析 canonical ids；AI 不直接创造 owner assignment truth。

## 7. Dependency rules

允许：

```text
Goal -> Time
Task -> Time
Routine -> Time
Label -> Time primitives/Clock
Goal -> Label client/registry seam
Task -> Label client/registry seam
```

禁止：

```text
Time -> Goal/Task/Setting
Label -> Goal/Task repository
Label -> Scheduler
Goal/Task -> date-fns/rrule private types
```

## 8. Final success condition

```text
same Instant + same TimeContext
=> same calendar/day/week interpretation across hosts

same identity + normalized label name
=> same Label identity across Goal/Task

owner-specific assignment
=> no Label God module
```
