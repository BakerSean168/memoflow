---
tags:
  - adr
  - task
  - occurrence
  - checklist
description: Task Occurrence 使用显式 Result union 保存 Completed/Missed/Skipped 事实，并将 Plan checklist definition 投影为逐 occurrence 状态
created: 2026-09-08T19:10:00+08:00
updated: 2026-09-08T19:10:00+08:00
---

# ADR-073: Task Occurrence Result 与 Checklist

**状态：** 已采纳（实施中）
**日期：** 2026-09-08

## 1. Result union

当前 Completed 有 `CompletionRecord`、Skipped 有 `SkipRecord`、Missed 只有 status + note，不对称。本轮统一成：

```text
TaskOccurrenceResult
├── Completed
│   ├── recordedAt
│   ├── actualDurationMinutes?
│   ├── note?
│   └── rating?
├── Missed
│   ├── recordedAt
│   └── reason?
└── Skipped
    ├── recordedAt
    └── reason?
```

Pending/InProgress 的 `result = null`。

Status 仍保留用于高频查询；Result 是终态事实详情。二者必须满足不变量。

## 2. Correction semantics

允许现实事实纠正：

```text
Missed  -> Completed
Skipped -> Completed
Completed -> Pending (uncomplete)
```

纠正时：

1. 原 Result 被替换/清除；
2. Plan outcome 重新评估；
3. Goal contribution settlement 按 durable source correlation 撤销/重放。

## 3. Checklist definition

Plan 保存定义，不保存完成状态：

```text
ChecklistDefinitionItem
├── id
├── title
└── order
```

ID 必须稳定；不能再只靠 `title + order` 作为身份。

## 4. Occurrence checklist state

每次 occurrence materialize 时 snapshot：

```text
OccurrenceChecklistItem
├── definitionId
├── titleSnapshot
├── orderSnapshot
├── completed
└── completedAt?
```

这样后续 Plan 改 checklist 不会重写历史。

## 5. Checklist 与完成关系

v1 不强制“所有 checklist 完成才能完成 Task”。Checklist 是执行辅助事实；未来若出现真实需求，再增加 completion gate policy，不能默认偷偷绑定。

## 6. Duration

实际耗时只存在于 Completed result，不再存在 Plan `actualMinutes`。

如果 occurrence 调用 `start()`，完成时可由 `actualStartAt -> recordedAt` 推导默认耗时；用户可覆盖。
