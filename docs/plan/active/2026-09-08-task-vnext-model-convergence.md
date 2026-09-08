---
tags:
  - plan
  - active
  - task
  - refactor
description: Task Plan / Occurrence 聚合边界、Schedule ADT、Result/Checklist、Reminder parity、Goal/Workspace 一次性收敛实施计划
created: 2026-09-08T19:35:00+08:00
updated: 2026-09-08T19:35:00+08:00
---

# Task vNext Model Convergence

**状态：ACTIVE / implementation started**
**分支：** `feat/task-vnext-model-convergence`
**上游设计依赖：** Goal vNext ADR-069（Goal-level Task link / context）
**基线：** Task Vitest 71 files / 717 tests PASS

## 1. Objective

一次性把 Task 从“历史 TaskTemplate + TaskInstance + 多轮兼容字段”收敛为：

```text
TaskPlan       = Action Definition + Scheduling Intent + Plan Lifecycle
TaskOccurrence = Execution + Reality Fact
TaskWorkspace  = Plan + Occurrences + Cross-module Context
```

完成后不保留长期旧字段/旧双轨。

## 2. Accepted ADR

- ADR-071 Task Plan / Occurrence Aggregate Boundary
- ADR-072 Task Plan Schedule Algebra
- ADR-073 Occurrence Result / Checklist
- ADR-074 Reminder Policy Persistence Parity
- ADR-075 Task Workspace / Context / Goal Link

## 3. Non-goals

- 不恢复 TaskFolder / hierarchy / dependency DAG / CriticalPath；
- 不增加通用 completion-policy DSL；
- 不让 Task 自己拥有 Scheduler runtime；
- 不把 Related Notes 存成 `noteIds[]`；
- 不把 Overdue/Missed 混为一谈。

## 4. Work items

### TASK-7301 — Contract freeze + architecture locks

- 新 TaskPlanSchedule discriminated union；
- TaskGoalLink `keyResultId?`，contribution invariant；
- TaskOccurrenceResult union；
- Checklist definition/state schema；
- Reminder policy multi-trigger round-trip schema；
- 新 surface locks 禁止 legacy fields/old status filters。

### TASK-7302 — TaskPlan aggregate convergence

- canonical domain symbol `TaskPlan`；
- 移除 Plan `startDate/dueDate/completedAt/actualMinutes/note/estimatedMinutes`；
- 以 `schedule` 替代 `taskType + timeConfig + recurrenceRule`；
- lifecycle/outcome/completion policy 保持；
- Goal-level link；
- Plan 不再持有 occurrence collection。

### TASK-7303 — TaskOccurrence aggregate convergence

- canonical `TaskOccurrence`；
- `planId`；
- schedule snapshot；
- Result union；
- checklist state；
- dueAt/isOverdue derived；
- correction semantics + Goal settlement regression。

### TASK-7304 — Occurrence materialization service

- 从 Aggregate 移除 generation methods；
- application/domain service 根据 Plan schedule + existing occurrence keys 生成；
- generation cursor/runtime state 不进入产品 DTO；
- finite plan outcome 不依赖 public `lastGeneratedDate`。

### TASK-7305 — Persistence single-track migration

- Prisma / PowerSync 同步新 Plan/Occurrence shape；
- reminder full JSON；
- checklist state JSON；
- schedule canonical persistence；
- 删除旧 reminder/time/recurrence 展开列；
- migration fixture + round-trip parity。

### TASK-7306 — Application / HTTP / IPC / AI migration

- Create/Update/Query 迁移到 Plan/Occurrence contract；
- Planner projection / SchedulingPort / handler registry 更新；
- AI Task draft 使用同一 schedule/goal link contract；
- 删除 legacy QueryValidator status/dueDate surface。

### TASK-7307 — UI convergence

- Product wording Template/Instance -> Plan/Occurrence/Task；
- create/edit 改 property-chip first；
- Goal-only link 可用；
- checklist definition + occurrence checklist interaction；
- reminder multi-trigger 与 persistence parity；
- Task Detail 改 TaskPlanWorkspace。

### TASK-7308 — Context read model

- TaskPlanWorkspace：labels + Goal/KR + occurrence summary + recent occurrences + linked notes；
- 不把 context 塞回 Aggregate；
- 与 ADR-069 shared Relation 实施保持单一 ownership。

### TASK-7309 — Legacy deletion

必须为 0：

```text
TaskTemplate (canonical domain/public symbol)
TaskInstance (canonical domain/public symbol)
TaskPlan.startDate
TaskPlan.dueDate
TaskPlan.completedAt
TaskPlan.actualMinutes
TaskPlan.note
TaskPlan._occurrences / _instances
status:blocked
status:cancelled
old first-trigger reminder persistence
```

允许 migration 文件/历史 ADR 提及旧名。

### TASK-7310 — Review / acceptance / archive

五层审查：

1. contract correctness；
2. aggregate boundary；
3. behavioral completeness；
4. persistence/transport parity；
5. plan/docs truth。

最终 gates：

```text
Task unit/integration
contracts tests/typecheck
Task + contracts + database + app-vue typecheck
lint
Prisma validate/generate checks
PowerSync parity
focused Planner/Scheduler/Goal settlement tests
full CI exact-head
```

## 5. Dependency order

```text
7301
 ├─> 7302 ─> 7304
 ├─> 7303 ─> 7304
 └─> 7305 contract prep

7302/7303/7304
 └─> 7305
     └─> 7306
         ├─> 7307
         └─> 7308
             └─> 7309
                 └─> 7310
```

## 6. Current progress

- [x] Baseline inventory
- [x] Baseline Task tests 71/717 PASS
- [x] ADR-071～075 frozen
- [ ] TASK-7301
- [ ] TASK-7302
- [ ] TASK-7303
- [ ] TASK-7304
- [ ] TASK-7305
- [ ] TASK-7306
- [ ] TASK-7307
- [ ] TASK-7308
- [ ] TASK-7309
- [ ] TASK-7310
