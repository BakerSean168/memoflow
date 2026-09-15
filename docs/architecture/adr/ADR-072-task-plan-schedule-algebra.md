---
tags:
  - adr
  - task
  - time
  - recurrence
description: Task Plan 使用 OneTime/Recurring discriminated union 表达计划时间，消除 taskType + timeConfig + recurrenceRule 的可无效组合
created: 2026-09-08T19:05:00+08:00
updated: 2026-09-08T19:05:00+08:00
---

# ADR-072: Task Plan Schedule Algebra

**状态：** 已采纳（实施中）
**日期：** 2026-09-08
**关联：** ADR-037、ADR-058、ADR-060、ADR-071

## 1. 问题

当前 Task 时间由三个可独立变化的字段组合：

```text
taskType: OneTime | Recurring
timeConfig: { timeType, startDate, timePoint, timeRange }
recurrenceRule?: {...}
```

于是业务层必须不断检查：Recurring 是否缺 recurrence；OneTime 是否误带 recurrence；`startDate` 对 OneTime 到底是发生日期还是 Plan 起始日期。

## 2. 决策

使用一个可判别联合 `TaskPlanSchedule`：

```ts
type TaskPlanSchedule = OneTimeTaskSchedule | RecurringTaskSchedule;
```

### 2.1 OneTime

```text
OneTimeTaskSchedule
├── kind: OneTime
├── date: Ymd
└── timing
    ├── AllDay
    ├── At { time: Hm }
    └── Window { start: Hm, end: Hm }
```

这里叫 `date`，不再误称 `startDate`。

### 2.2 Recurring

```text
RecurringTaskSchedule
├── kind: Recurring
├── startDate: Ymd
├── timing
└── recurrence
    ├── frequency: Daily | Weekly | Monthly | Yearly
    ├── interval
    ├── byWeekday[]
    └── end
        ├── Never
        ├── Until { date: Ymd }
        └── Count { count }
```

## 3. 时间原语

- calendar date 使用 `Ymd`；
- local time 使用 `Hm`；
- 实际执行时间使用 `Instant`；
- recurrence expansion 继续复用 MemoFlow-owned `RecurrenceEnginePort`，第三方 `rrule` 只在 adapter 内。

不再把“本地日历日”用 midnight epoch 作为公开业务语义。

## 4. Completion window / dueAt

Occurrence 的 due/completion window 从 schedule snapshot 派生：

```text
AllDay      => local end-of-day
At 15:00    => 15:00
Window 14-16 => 16:00
```

因此：

```text
TaskPlan 不持有 dueDate
TaskOccurrence.dueAt = derived
isOverdue = unresolved && now > dueAt
```

## 5. Schedule snapshot

生成 occurrence 时复制本次需要的 schedule semantics：

```text
date + timing
```

Plan 后续修改 schedule：

- 已开始/已解决 occurrence 不改；
- future Pending occurrence 由 application policy 重新 materialize 或投影；
- 历史事实保持不可变。

## 6. Persistence

TaskPlan 目标持久结构使用明确字段或单一 JSON schedule column，但只能有一个 canonical representation。旧 `timeConfig* + recurrenceRule*` 展开列迁移完成后删除，避免双写。

TaskOccurrence 保存 `date + timing snapshot`，不再把整个旧 `TaskTimeConfigDTO` 当作 opaque JSON。

## 7. UI

Task 创建表单不先询问“模板类型”。用户直接选择：

```text
[日期] [时间/全天] [重复]
```

打开“重复”即从 OneTime schedule 转为 Recurring schedule；关闭则回到 OneTime。模型内部仍是严格 union。
