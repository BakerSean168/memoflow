---
tags:
  - product
  - module
  - task
description: Task 模块当前事实与 canonical TaskPlan/TaskOccurrence/TaskWorkspace 模型
created: 2026-06-02T00:00:00
updated: 2026-09-29T11:38:00+08:00
---

# Task 模块说明

## 1. 功能定位

Task 负责 **Action + Execution**。

当前实现的 canonical truth 是 `TaskPlan` / `TaskOccurrence` / `TaskWorkspace`。ADR-071～075 已实现，domain/public language、persistence 与 workspace composition 均以该模型为准。

## 2. 当前已实现能力

- Plan/Occurrence 分层；
- Pending/InProgress/Completed/Missed/Skipped occurrence facts；
- Overdue 派生，不自动将未操作判 Missed；
- Plan lifecycle `Active/Paused/Closed` 与 outcome `Open/Succeeded/Failed/Abandoned` 分离；
- 当前仍持久化 `TaskPlanCompletionPolicy`；
- Daily/Weekly/Monthly/Yearly recurrence；
- Shared Label；
- Goal-only / Goal+KR link + optional KR-scoped fixed EachCompletion/PlanCompletion contribution；
- durable Task→Goal outbox + Goal-owned source correlation；
- Planner projection 与 Scheduler single authority；
- 当前 UI 仍是 Today / Upcoming / Plans；
- Prisma / PowerSync 双端 persistence。

## 2.1 2026-09-29 Product vNext target

当前实现之上的收敛目标：

```text
Task Home        Today | Plans
Future browsing  Schedule / Calendar
Quick Task       title -> today/all-day -> create
Occurrence       inline actions + compact Inspect Dialog/Sheet
Plan end         Abandon, not Archive
```

Outcome：

```text
Overdue -> unresolved
Completed / Missed / Skipped -> user facts
finite scope resolved + Missed -> Failed
finite scope resolved + no Missed -> Succeeded
infinite recurring -> Open until Abandoned
```

不向用户暴露 completion-policy 配置。现有 `completionPolicy` 先作为 compatibility contract round-trip，再做 versioned retirement。

Task→KR product rule 收敛为：

```text
仅关联
自动记录固定值
完成时记录
```

其中“完成时记录”由用户在 Complete 时输入 measurement，可适配 Sum/Average/Max/Min/Last；Goal 继续拥有 GoalRecord aggregation/currentValue 真值。

已退休且不得恢复：TaskFolder、parent/subtask hierarchy、TaskDependency、DAG、CriticalPath、dynamic priority、Task string tags、自定义 Task color、Expired 持久状态。

## 3. Current canonical design

详见：

- [Task vNext Plan / Occurrence / Workspace](../task-vnext-plan-occurrence-workspace.md)
- [Task vNext archived plan](../../plan/archive/2026-09-08-task-vnext-model-convergence.md)
- ADR-071～075

核心目标：

```text
TaskPlan       = Action Definition + Scheduling Intent + Plan Lifecycle
TaskOccurrence = Execution + Reality Fact
TaskWorkspace  = Plan + Occurrences + Context
```

### 3.1 Plan

- `title + description + importance`；
- OneTime/Recurring schedule discriminated union；
- reminder policy；
- checklist definition；
- optional Goal-level/KR link；
- lifecycle/outcome；
- `completionPolicy` 当前存在于 contract/persistence，但 target product 不再暴露配置；
- Shared Labels / Notes 保持外部 relation/projection。

### 3.2 Occurrence

- schedule snapshot；
- Pending/InProgress/Completed/Missed/Skipped；
- explicit Result union；
- per-occurrence checklist state；
- actual execution timing；
- dueAt/isOverdue derived。

## 4. Retired legacy surfaces

旧 `TaskTemplate` OneTime 字段（`startDate`、`dueDate`、`completedAt`、`estimatedMinutes`、`actualMinutes`、`note`）与 first-trigger-only reminder persistence 已由 TASK-7309 及更早的 parity work 移除，均已退出 Prisma/PowerSync 与 domain/public truth。历史计划、迁移记录与 anti-resurrection tests 中仍可能保留旧名称作为历史证据；canonical reminder policy 现在保持完整 multi-trigger round-trip。

## 5. Goal / Note Context

Task Goal link 当前 canonical 语义已经允许：

```text
Task -> Goal
Task -> Goal + KR
Task -> Goal + KR + fixed Contribution（当前）
Task -> Goal + KR + completion-time measurement（target）
```

`keyResultId` 对普通 Goal context 是可空的；任何 GoalRecord 写入都必须绑定 KR，goal-only / link-only completion 不会生成 Goal progress outbox。当前 fixed Contribution 走 `EachCompletion / PlanCompletion`；target 增加 completion-time measurement intent，并继续通过 durable Task→Goal outbox 交给 Goal owner。公开 Task list 可按 Goal 或 Goal+KR 查询，其中 KR filter 必须同时携带 owning Goal。

Task 同时拥有 `TaskGoalContextReadPort`，通过 `listTasksByGoal`、`listTasksByKeyResult`、`getTaskGoalContextSummary` 提供 identity-scoped、soft-delete-aware 的 bounded read projection；Goal/Goal Workspace 不直接读取 Task 表或 Task repository。

Related Notes 通过 shared Relation 查询，不存 `noteIds[]`。

## 6. 相关资产

- [ADR-053](../../architecture/adr/ADR-053-goal-task-personal-product-boundary.md)
- [ADR-056](../../architecture/adr/ADR-056-task-plan-goal-link-contribution-settlement.md)
- [ADR-057](../../architecture/adr/ADR-057-task-occurrence-outcome-and-plan-lifecycle.md)
- [ADR-071](../../architecture/adr/ADR-071-task-plan-occurrence-aggregate-boundary.md)
- [ADR-072](../../architecture/adr/ADR-072-task-plan-schedule-algebra.md)
- [ADR-073](../../architecture/adr/ADR-073-task-occurrence-result-and-checklist.md)
- [ADR-074](../../architecture/adr/ADR-074-task-reminder-policy-persistence.md)
- [ADR-075](../../architecture/adr/ADR-075-task-workspace-context-and-goal-link.md)
