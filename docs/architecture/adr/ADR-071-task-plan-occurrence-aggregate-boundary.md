---
tags:
  - adr
  - task
  - ddd
  - aggregate
description: Task Plan 与 Task Occurrence 作为两个独立聚合根，收敛 TaskTemplate/TaskInstance 技术语义与读模型边界
created: 2026-09-08T19:00:00+08:00
updated: 2026-09-08T19:00:00+08:00
---

# ADR-071: Task Plan / Task Occurrence 聚合边界

**状态：** 已采纳（实施中）
**日期：** 2026-09-08
**修订：** ADR-053、ADR-057
**关联：** ADR-037、ADR-056、ADR-069、ADR-072～075

## 1. 决策摘要

Task 继续负责 **Action + Execution**，但领域真值明确拆成两个独立 Aggregate Root：

```text
TaskPlan        = Action Definition + Scheduling Intent + Plan Lifecycle
TaskOccurrence  = One concrete execution opportunity + Reality Fact
```

两者通过 `planId` 关联，但互不作为对方的 owned child collection。

当前 `TaskTemplate`/`TaskInstance` 是历史技术命名；本轮代码迁移以 `TaskPlan`/`TaskOccurrence` 为 canonical ubiquitous language。旧命名不得作为长期 alias 保留。

## 2. 为什么必须是两个聚合

重复任务“每天跑 5km”存在两个不同一致性边界：

1. Plan 负责未来规则：每天、几点、什么时候开始/结束、重要性、Goal link；
2. Occurrence 负责某一天真实发生的事实：开始、完成、Missed、Skipped、耗时、备注。

历史 occurrence 不应因为 Plan 后续改时间、重要性或 recurrence 而被回写篡改；Plan 也不应为了计算统计而 hydrate 所有 occurrence。

## 3. TaskPlan canonical state

```text
TaskPlan
├── id
├── identityId
├── title
├── description?
├── importance
├── schedule                // ADR-072 discriminated union
├── reminderPolicy?         // ADR-074
├── checklistDefinition[]?  // ADR-073
├── goalLink?               // ADR-069/075
├── lifecycle
│   ├── status: Active | Paused | Closed
│   ├── outcome: Open | Succeeded | Failed | Abandoned
│   ├── completionPolicy
│   ├── closedAt?
│   └── abandonedReason?
├── archivedAt?
├── version
├── createdAt
├── updatedAt
└── deletedAt?
```

### 3.1 从 Plan 删除的旧状态

以下旧 OneTime 字段退出 TaskPlan canonical state：

```text
startDate
 dueDate
 completedAt
 actualMinutes
 note
```

原因：

- 日期/时间由 `schedule` 表达；
- due 是 occurrence 的 completion-window 派生事实；
- completion/actual duration/note 是 occurrence execution fact。

`estimatedMinutes` 不继续以历史字段保留；若产品需要预计耗时，使用 schedule timing/window 或未来独立 `estimatedDurationMinutes` 决策，不以无持久化旧字段苟活。

### 3.2 从公开 Plan DTO 隐藏的运行时元数据

```text
lastGeneratedDate
generateAheadDays
```

它们属于 occurrence materialization/runtime concern，不属于用户的 Task Plan 业务模型。迁移完成后由 application/runtime generation cursor 管理，不出现在产品 contract。

## 4. TaskOccurrence canonical state

```text
TaskOccurrence
├── id
├── planId
├── identityId
├── occurrenceKey
├── scheduleSnapshot
│   ├── date
│   └── timing
├── importanceSnapshot
├── status
│   ├── Pending
│   ├── InProgress
│   ├── Completed
│   ├── Missed
│   └── Skipped
├── actualStartAt?
├── result?                 // ADR-073
├── checklistState[]?       // ADR-073
├── version
├── createdAt
├── updatedAt
└── deletedAt?
```

`dueAt` 与 `isOverdue` 均为派生属性，不作为独立可写状态。

## 5. lifecycle 与 outcome 保持双轴

保留 ADR-057 已验证语义：

```text
status:  Active | Paused | Closed
outcome: Open | Succeeded | Failed | Abandoned
```

约束：

```text
Active/Paused => Open
Closed => Succeeded | Failed | Abandoned
```

Archive/Delete 继续是正交元数据，不成为 outcome。

## 6. Aggregate 不互相包含

禁止：

```ts
TaskPlan {
  occurrences: TaskOccurrence[]
}
```

TaskPlan command 只修改 Plan 自身。需要修改未来 occurrence projection 时，由 application service：

```text
load TaskPlan
load affected future Pending occurrences
apply projection policy
persist independently in transaction
```

Plan 统计使用 read model，不把 occurrence 集合重新塞回 Aggregate。

## 7. Read model

```text
TaskPlanWorkspace
=
TaskPlan
+ Shared Labels
+ Goal/KR context
+ Occurrence summary
+ recent occurrences
+ Related Notes
```

统计字段如 `completionRate / completedCount / pendingCount / missedCount` 是 query projection，不属于 Aggregate state。

## 8. 迁移原则

1. 先建立新 contract/domain；
2. adapter 在一次迁移中读取旧持久化并写新结构；
3. 所有调用者切换后删除旧字段/旧符号；
4. 不保留长期 `TaskTemplate = TaskPlan` / `TaskInstance = TaskOccurrence` alias；
5. architecture lock 阻止旧命名和 Plan-owned occurrence collection 回流。
