---
tags:
  - product
  - module
  - label
  - foundation
description: Shared Label Registry 当前能力与 Label vNext ownership 收敛边界
created: 2026-09-09T00:00:00+08:00
updated: 2026-09-09T00:00:00+08:00
---

# Label Foundation 模块说明

## 1. 定位

`@memoflow/label` 是 identity-scoped Shared Label Registry：用户创建一次 `#工作 / #AI / #健康`，Goal/Task 等需要分类的业务对象引用同一个 Label identity。

它不是 generic tag string helper，也不应该成为认识所有业务模块的 assignment God service。

## 2. 当前已实施

- ADR-054 Shared Labels；
- identity-scoped Label registry；
- normalized uniqueness；
- GoalLabel / TaskLabel persistence；
- Goal/Task `labels[]` projection 与 `labelIds` mutation；
- AND filtering；
- System Views 与 Labels 分离；
- AI `resolveNames()`；
- Prisma/PowerSync adapters/tests。

## 3. 2026-09-09 vNext convergence

ADR-102/103 进一步冻结：

```text
Label Registry
= Label identity/name/color only

Goal
= GoalLabel assignment owner

Task
= TaskLabel assignment owner
```

因此会逐步从 Label package 移走：

```text
GoalLabelAssignmentCommand
TaskLabelAssignmentCommand
replace/list/findGoal...
replace/list/findTask...
```

Registry 继续保留 AI-friendly `resolveNames()`，并优化为 batch normalized lookup。

## 4. Shared vs owner semantics

共享：

```text
Label identity
name
normalized uniqueness
color
```

不共享：

```text
GoalLabel assignment
TaskLabel assignment
owner filtering/query
```

未来 Routine/Knowledge 只有在出现真实用户分类需求时才接入，不因为存在 Label foundation 就自动加标签。

## 5. System Views

```text
Today
Upcoming
Active
Completed
Overdue
```

仍然是 owner/time-derived query，不创建 synthetic Label。

## 6. Related docs

- [ADR-054](../../architecture/adr/ADR-054-shared-labels-and-system-views.md)
- [ADR-102](../../architecture/adr/ADR-102-label-registry-and-owner-assignment-boundary.md)
- [ADR-103](../../architecture/adr/ADR-103-label-identity-normalization-time-and-color-contract.md)
- [Label vNext current-system map](../../analysis/2026-09-09-label-vnext-current-system-map.md)
- [Time + Label vNext foundations](../../architecture/time-label-vnext-foundations.md)
- [Time/Label reuse ledger](../../analysis/2026-09-09-time-label-reference-and-reuse-ledger.md)
- [Shared foundations active plan](../../plan/active/2026-09-09-time-label-vnext-model-convergence.md)
