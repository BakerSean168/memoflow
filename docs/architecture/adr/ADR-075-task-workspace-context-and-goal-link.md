---
tags:
  - adr
  - task
  - goal
  - relation
  - workspace
description: Task Workspace 聚合 Labels/Goal/Occurrences/Notes 的 read model，并允许 Goal-level Task link，Contribution 仍要求 KR
created: 2026-09-08T19:20:00+08:00
updated: 2026-09-29T11:38:00+08:00
---

> **2026-09-29 Product vNext 收敛修订（target-design，待实施）：** Task Home 收敛为 `Today | Plans`，未来浏览交给 Schedule / Calendar；Occurrence 深入信息使用 compact Dialog/Sheet，不新增详情 route。TaskGoalLink 的 read projection 需要补充 KR measurement context，以支持“完成时记录”而不把 aggregation ownership 搬进 Task。

# ADR-075: Task Workspace、Context 与 Goal Link

**状态：** 已采纳并实施（TASK-7305～7310，2026-09-19）；2026-09-29 Workspace/Product 修订待实施
**日期：** 2026-09-08
**修订：** ADR-056
**关联：** ADR-069、ADR-071

## 1. Goal link

Task Plan 继续拥有它“为什么做”的 Goal link：

```text
TaskGoalLink
├── goalId
├── keyResultId?
└── contribution?
```

约束：

```text
contribution != null => keyResultId != null
```

因此允许：

```text
Task -> Goal
Task -> Goal + KR
Task -> Goal + KR + progress rule
```

产品层 progress rule 收敛为：

```text
仅关联
自动记录固定值
完成时记录
```

但禁止任何 KR record/update 直接作用于 Goal 而无 KR。

当前持久 contract 仍是 `contribution?`；2026-09-29 target-design 允许 implementation ticket 把它迁移为 discriminated progress rule，但必须保留 Goal-only / Goal+KR link 的兼容语义。

## 2. Shared Labels

Labels 仍由 Shared Label domain owning relation；`labels[]` 是 read projection，不回退到 Task string tags/color。

## 3. Related Notes

Task 不保存 `noteIds[]`。知识上下文通过 Shared Relation 建立：

```text
TaskPlan <-> Relation <-> Note
```

一篇 Note 可以服务多个 Task/Goal。

## 4. TaskPlanWorkspace read model

```text
TaskPlanWorkspace
├── plan
├── labels[]
├── goalContext?
│   ├── goal
│   └── keyResult?
│       ├── calculationMethod
│       ├── unit
│       ├── currentValue
│       ├── targetValue
│       └── boundedRecordPreviewContext?
├── occurrenceSummary
│   ├── total
│   ├── completed
│   ├── missed
│   ├── skipped
│   ├── pending
│   └── completionRate
├── recentOccurrences[]
└── linkedNotes[]
```

Workspace 是 query composition，不进入 TaskPlan Aggregate。

KR measurement context 也是 cross-owner read projection，只允许 Task 用于：

- 正确解释“本次变化”还是“本次记录值”；
- 展示单位；
- 计算 completion-time preview；
- 决定 fixed automatic rule 是否兼容。

它不让 Task 拥有 GoalRecord history、KR aggregation 或 currentValue mutation。

## 5. 产品视图

### 5.1 Task Home

2026-09-29 目标 IA：

```text
Today | Plans
```

`Upcoming` 从 Task Home 退休。未来安排浏览统一交给 Schedule / Calendar，避免 Task 再维护第二套部分日历。

Today：

```text
Overdue unresolved
Today occurrences
```

只回答“现在该做什么 / 哪些逾期仍未处理”。

Plans：

```text
Plan lifecycle/outcome/configuration
```

不复用 occurrence status filter。

### 5.2 Occurrence inspect

Today 行高频动作保持 inline：

```text
Complete
Checklist
Missed
Skipped
```

需要更多信息时：

```text
click occurrence
-> compact Dialog / Sheet
-> explicit View plan
-> /tasks/:planId
```

不新增 `TaskOccurrenceDetailView` route。

### 5.3 Task Plan Workspace

Task Detail 应从“模板设置页”转成 Plan Workspace：

```text
任务标题
[Active] [时间] [重复] [重要性] [标签] [Goal/KR]

执行概览
最近执行
Checklist
相关知识
提醒
计划设置
```

`/tasks/:id` 继续保留，因为 TaskPlan 本身是独立 owner，而不是 Goal 内部的子实体。
