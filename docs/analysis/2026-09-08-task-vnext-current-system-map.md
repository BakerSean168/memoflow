---
tags:
  - analysis
  - task
  - vnext
description: Task vNext 重构前真实代码地图、已正确语义与待删除残差
created: 2026-09-08T19:25:00+08:00
updated: 2026-09-08T19:25:00+08:00
---

# Task vNext Current System Map

## 已正确并保留

- Task Plan / Occurrence 概念已经存在（代码名 `TaskTemplate` / `TaskInstance`）；
- occurrence status = Pending/InProgress/Completed/Missed/Skipped；
- Overdue 是派生事实；
- Plan lifecycle 与 outcome 分离；
- completion policy 与 Goal settlement 分离；
- Shared Labels 已替代 Task tags/color；
- TaskFolder / hierarchy / dependency DAG / CriticalPath / dynamic priority 已退休；
- recurrence 已通过 MemoFlow-owned recurrence engine adapter；
- Planner/Scheduler authority 已分层。

## 明确残差

### 1. TaskTemplate state 中无可靠 persistence 的旧 OneTime 字段

```text
startDate
dueDate
completedAt
estimatedMinutes
actualMinutes
note
```

Prisma/PowerSync mapper load 时全部硬编码 `null`，因此不是可靠 domain truth。

### 2. `taskType + timeConfig + recurrenceRule` 可表达无效组合

需要运行时 guard 保证 Recurring 必须有 recurrence rule 与 start date。

### 3. Aggregate boundary 重叠

`TaskTemplate` 自己持有 `_instances: TaskInstance[]`，而 `TaskInstance` 同时又是独立 Aggregate Root + repository。

### 4. Client DTO 混入 read projection

`instanceCount/completionRate/singleInstanceStatus/...` 与 Plan write model 混合。

### 5. Reminder persistence 丢数据

Domain 支持多个 trigger；DB adapter 只保存第一条 relative trigger。

### 6. Checklist 只有 definition，没有 occurrence completion state

且 definition 无稳定 item ID。

### 7. Missed detail 不完整

Completed/Skipped 有 record，Missed 只有 status + note。

### 8. Goal link 过严

`keyResultId` 当前 required，导致无法表达“服务于整个 Goal 但不属于某个 KR”的 Task。

### 9. 旧 query validator 残差

仍包含 `status:blocked/status:cancelled/status:completed` 等已经不存在的旧 Task 状态；当前无有效调用，应删除而不是继续兼容。

## 基线证据

重构前 `task:vitest:test -- --run`：

```text
71 test files passed
717 tests passed
```
