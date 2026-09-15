---
tags:
  - adr
  - task
  - goal
  - relation
  - workspace
description: Task Workspace 聚合 Labels/Goal/Occurrences/Notes 的 read model，并允许 Goal-level Task link，Contribution 仍要求 KR
created: 2026-09-08T19:20:00+08:00
updated: 2026-09-08T19:20:00+08:00
---

# ADR-075: Task Workspace、Context 与 Goal Link

**状态：** 已采纳（实施中）
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
Task -> Goal + KR + contribution
```

但禁止 contribution 直接作用于 Goal 而无 KR。

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

## 5. 产品视图

Task Detail 应从“模板设置页”转成 Plan Workspace：

```text
任务标题
[Active] [时间] [重复] [重要性] [标签] [Goal/KR]

执行概览
最近 Occurrences
Checklist
相关知识
提醒
计划设置
```

Today/Upcoming 继续以 Occurrence 为主，不把 Plan 设置干扰日常执行。
