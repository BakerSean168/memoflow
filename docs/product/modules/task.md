---
tags:
  - product
  - module
  - task
description: Task 模块当前事实与 Task vNext Plan/Occurrence/Workspace 目标模型
created: 2026-06-02T00:00:00
updated: 2026-09-12T14:00:00+08:00
---

# Task 模块说明

## 1. 功能定位

Task 负责 **Action + Execution**。

当前已实现版本仍以 `TaskTemplate` / `TaskInstance` 作为代码名，但产品语义已经是 Task Plan / Task Occurrence。2026-09-08 起，ADR-071～075 已冻结下一轮 canonical model：正式把 domain/public language 收敛为 `TaskPlan` / `TaskOccurrence`，并删除历史 OneTime 双轨字段。

## 2. 当前已实现能力

- Plan/Occurrence 分层；
- Pending/InProgress/Completed/Missed/Skipped occurrence facts；
- Overdue 派生，不自动将未操作判 Missed；
- Plan lifecycle `Active/Paused/Closed` 与 outcome `Open/Succeeded/Failed/Abandoned` 分离；
- finite plan completion policy；
- Daily/Weekly/Monthly/Yearly recurrence；
- Shared Label；
- Goal-only / Goal+KR link + optional KR-scoped EachCompletion/PlanCompletion contribution；
- Planner projection 与 Scheduler single authority；
- Today / Upcoming / Plans；
- Prisma / PowerSync 双端 persistence。

已退休且不得恢复：TaskFolder、parent/subtask hierarchy、TaskDependency、DAG、CriticalPath、dynamic priority、Task string tags、自定义 Task color、Expired 持久状态。

## 3. 下一版 accepted target design

详见：

- [Task vNext Plan / Occurrence / Workspace](../task-vnext-plan-occurrence-workspace.md)
- [Task vNext active plan](../../plan/active/2026-09-08-task-vnext-model-convergence.md)
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
- lifecycle/outcome/completion policy；
- Shared Labels / Notes 保持外部 relation/projection。

### 3.2 Occurrence

- schedule snapshot；
- Pending/InProgress/Completed/Missed/Skipped；
- explicit Result union；
- per-occurrence checklist state；
- actual execution timing；
- dueAt/isOverdue derived。

## 4. 当前待删除残差

当前代码仍有一批不是可靠 persistence truth 的 `TaskTemplate` OneTime 字段：

```text
startDate
dueDate
completedAt
estimatedMinutes
actualMinutes
note
```

Prisma/PowerSync load path 会把它们置 null；本轮 vNext 会删除，而不是继续修补第二条时间/完成轨道。

当前 reminder domain 支持多个 trigger，但 persistence 只保存第一条 relative trigger；本轮改为完整 policy round-trip。

## 5. Goal / Note Context

Task Goal link 当前 canonical 语义已经允许：

```text
Task -> Goal
Task -> Goal + KR
Task -> Goal + KR + Contribution
```

`keyResultId` 对普通 Goal context 是可空的；Contribution 仍必须绑定 KR，goal-only / link-only completion 不会生成 Goal progress outbox。公开 Task list 可按 Goal 或 Goal+KR 查询，其中 KR filter 必须同时携带 owning Goal。

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
