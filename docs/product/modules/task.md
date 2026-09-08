---
tags:
  - product
  - module
  - task
description: Task vNext 当前功能、Occurrence/Plan 语义与 Goal/Planner 边界
created: 2026-06-02T00:00:00
updated: 2026-09-08T09:00:00+08:00
---

# Task 模块说明

## 1. 功能定位

Task 负责 **Action + Execution**。长期配置是 Task Plan（当前代码仍使用 `TaskTemplate` 名称），每次实际执行是 Task Occurrence（当前代码使用 `TaskInstance`）。产品默认从 Today / Upcoming 的 occurrence 出发，而不是从文件夹、依赖图或项目管理 DAG 出发。

## 2. 当前产品能力

- Task Plan 创建、编辑、暂停、恢复、关闭与放弃；
- 一次性与周期性 recurrence，支持 Daily / Weekly / Monthly / Yearly 等当前 recurrence contract；
- Today / Upcoming / Plans 三类主视图；
- Occurrence 启动、完成、撤销完成、标记 Missed、Skip；
- `isOverdue` 派生展示，过期后仍允许补录真实结果；
- Shared Label：Task 分类只使用 first-class Label，创建/更新提交 `labelIds`，列表 AND 过滤使用 `labelIdsAll`；
- Goal Link：Plan 可链接 Goal/KR；自动 contribution 是独立、可选的规则；
- Planner projection：Task 时间事实进入 Planner，但拖拽/修改最终回到 Task owner command；
- Scheduler integration：Task 通过 `SchedulingPort` / handler registry 接入 Temporal Engine，不向产品 UI 或 AI 暴露 raw ScheduleTask mutation；
- AI Task draft：Mastra workflow 使用当前 recurrence / labels / Goal link / optional contribution contract。

已退休且不得恢复：`TaskFolder`、parent/subtask hierarchy、TaskDependency、DAG、CriticalPath、dynamic priority score、Task string tags、自定义 Task color。

## 3. Occurrence 与 Plan 生命周期

Occurrence 持久状态：

```text
Pending -> InProgress -> Completed
                       -> Missed
                       -> Skipped
```

`Overdue` 只是 `未完成 + 时间已过去` 的派生事实，不再使用 `Expired` 持久终态。

Task Plan outcome：

```text
Open
Succeeded
Failed
Abandoned
```

有限计划是否成功由 completion policy 与 occurrence facts 判定；历史修正可以撤回此前的 PlanCompletion settlement。

## 4. Goal Link / Contribution

Task 与 Goal 的关系分两层：

```text
Link        = goalId + keyResultId
Contribution = optional { value, trigger }
```

没有 contribution 的 Task 只是“这个行动服务于该 Goal”，不会猜测 KR 进度。自动 contribution 支持当前明确建模的 `EachCompletion` 与 `PlanCompletion`；settlement 使用持久 source correlation 保证重放幂等，并支持撤销。

## 5. 跨端与数据一致性

- Prisma / PowerSync 使用同一 Task contract；
- Task 分类关系由 `TaskLabel` 持有；旧 `task_templates.tags/color` 已通过有边界、可重放的迁移收敛到 Shared Label；
- Web/Desktop 与 React/Mobile 都消费同一 `labels[]` projection；
- Mobile parity 已确认没有 Folder/Dependency/ValueType 等退役产品字段。

## 6. 相关资产

- [Goal / Task vNext](../goal-task-vnext.md)
- [ADR-053](../../architecture/adr/ADR-053-goal-task-personal-product-boundary.md)
- [ADR-054 Shared Labels](../../architecture/adr/ADR-054-shared-labels-and-system-views.md)
- [ADR-056 Goal Link / Contribution](../../architecture/adr/ADR-056-task-plan-goal-link-contribution-settlement.md)
- [ADR-057 Occurrence / Plan lifecycle](../../architecture/adr/ADR-057-task-occurrence-outcome-and-plan-lifecycle.md)
- [Task 模块文件索引](../module-index/task-files.md)
