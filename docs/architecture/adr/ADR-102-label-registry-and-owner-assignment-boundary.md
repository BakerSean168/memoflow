---
tags:
  - adr
  - label
  - ownership
  - goal
  - task
  - vnext
description: ADR-102 - Shared Label Registry 与 Goal/Task owner-owned assignment 的单向依赖边界
created: 2026-09-09T00:00:00+08:00
updated: 2026-09-09T00:00:00+08:00
---

# ADR-102: Label Registry 与 Owner Assignment Boundary

**状态：** 已采纳（待实施）
**日期：** 2026-09-09
**修订：** ADR-054 实现层 ownership

## 1. Decision

`@memoflow/label` 只拥有 identity-scoped Label Registry，不再拥有任何具体业务对象的 assignment persistence/query。

```text
Label Registry
├── create
├── update
├── delete
├── find
├── search/list
└── resolveNames
```

Goal/Task 分别拥有：

```text
GoalLabel assignment + filtering
TaskLabel assignment + filtering
```

依赖必须单向：

```text
Goal/Task -> Label Registry
Label !-> Goal/Task
```

## 2. Why

当前 `LabelRepository`/`LabelService` 已包含 Goal/Task-specific methods。若未来增加 Routine/Knowledge，会自然演化为 Label God module。

ADR-054 原始设计已规定 assignment 由 owner module 拥有，本 ADR 把实现重新对齐该设计。

## 3. Registry repository target

目标 repository 只含类似：

```text
create
update
delete
findById
list/search
findByNormalizedNames
```

不含：

```text
GoalId
TaskPlanId
replaceGoalLabels
replaceTaskLabels
findGoalIds...
findTaskPlanIds...
```

## 4. Owner assignment

### Goal

Goal application/domain/repository boundary负责：

```text
setGoalLabels(goalId, labelIds)
listGoalLabels(goalId)
labelIdsAll filter
```

在写入前通过 Label Registry 验证所有 label：

```text
belongs to same identity
exists
not deleted
```

### Task

Task 同样拥有 TaskLabel assignment/query。

## 5. Persistence

保留关系表：

```text
GoalLabel
TaskLabel
```

不迁移为 generic polymorphic assignment table。

Prisma FK/cascade 继续提供完整性。

PowerSync schema 仍可以包含这些关系表，但 mapper/repository ownership 随 owner module移动。

## 6. Contracts

从 `@memoflow/contracts/label` 迁出：

```text
GoalLabelAssignmentCommand
TaskLabelAssignmentCommand
```

分别进入 Goal/Task contract namespace。

Label client contract 只描述 Registry。

## 7. AI boundary

AI planner 可以：

```text
propose label names
-> LabelRegistry.resolveNames()
-> owner apply receives labelIds
```

AI 不直接写 GoalLabel/TaskLabel table，也不让 LabelService替 owner mutation。

## 8. System Views

继续保护：

```text
Today / Upcoming / Completed / Active / Overdue
!= Label
```

这些由 owner + Product Time 查询派生。

## 9. Delete semantics

删除 Label：

```text
Label Registry delete
-> FK cascade assignment rows
-> owner read models observe absence/invalidate
```

不需要 owner 维护第二份 label-exists truth。

如果未来加入审计/operation receipt，由 application operation layer处理，不让 Label 认识所有 owners。

## 10. Acceptance

生产代码中：

```text
packages/label
```

不得出现 Goal/Task-specific repository/command symbols。

同时 Goal/Task：

- assignment mutation继续工作；
- AND filter语义不变；
- foreign identity labels继续 fail closed；
- Prisma/PowerSync parity继续通过。
