---
tags:
  - product
  - module
  - goal
description: Goal vNext 当前功能、产品语义与模块边界
created: 2026-06-02T00:00:00
updated: 2026-09-08T17:55:00+08:00
---

# Goal 模块说明

> **下一版目标设计（2026-09-08，待实施）：** 当前本文仍描述已实现的 Goal vNext。新的 Goal Model Convergence 已由 [ADR-067](../../architecture/adr/ADR-067-goal-vnext-product-model-and-lifecycle.md)～[ADR-070](../../architecture/adr/ADR-070-ai-goal-plan-orchestration.md) 与 [Goal vNext Workspace UI](../goal-vnext-workspace-and-create-ui.md) 冻结，实施计划见 [active plan](../../plan/active/2026-09-08-goal-vnext-model-convergence.md)。在代码迁移完成前不要把 target design 误写成当前事实。

## 1. 功能定位

Goal 负责个人目标的 **Direction + Measurement**：用户定义想达到什么结果，用 Key Result Measurement V2 表达可验证的衡量方式，并通过 Record / Review 跟踪事实与复盘。Goal 不再承担任务编排、专注计时、目录层级或动态优先级等其他产品职责。

## 2. 当前产品能力

- Goal 创建、编辑、激活、完成、放弃、归档与删除；
- Key Result Measurement V2：`baseline / current / target / unit / direction` 等测量语义由统一 calculator 解释；
- Goal Record：记录 KR 的真实测量事实；
- Goal Review：记录阶段性复盘；
- Shared Label：Goal 与 Task 共用 identity-scoped Label registry，创建/更新提交 `labelIds`，多标签筛选使用 `labelIdsAll` AND 语义；
- Task Link：Task 可以链接 Goal/KR，但 Goal 不反向拥有 Task；
- AI Goal draft：Mastra durable workflow 生成当前 Goal/KR/Label 语义的可审阅草稿，确认后由 Goal application port 写入。

已退休且不得恢复为产品真值：`GoalFolder`、Goal category/string tags、Parent Goal、Importance/Priority、Goal Focus Session、MultiGoalComparison、Standalone ProgressBreakdown。

## 3. 状态与完成语义

Goal 业务状态只有：

```text
Active
Completed
Abandoned
```

`archivedAt` 是独立的历史/显示属性，不是第四种业务状态。完成判定由 Goal/KR 领域语义决定；weighted progress 是展示用进度，不是自动完成开关。

## 4. 写入与一致性边界

- Goal aggregate 是 Goal/KR/Record/Review 的一致性边界；
- 修改既有 aggregate 使用 `expectedVersion`，冲突显式返回而不是静默覆盖；
- mutation 返回权威 `GoalMutationReceipt`，客户端按 ID 原子合并；
- Task contribution 通过自包含、幂等的跨模块事件/settlement 进入 Goal，不共享 repository 或数据库事务；
- AI 只生成草稿并调用 Goal/Task owner application port，不直接写数据库。

## 5. 用户视图

主要视图是 `Active / Completed / All`，归档与放弃属于历史入口；它们都是状态/日期派生的 **System View**，不是 Label。用户可叠加 Shared Label 过滤，例如 `Active AND #工作 AND #AI`。

Web/Desktop 与 React/Mobile 均使用同一公开 contracts；移动端不存在 Folder/Comparison/Focus 等已退休 UI。

## 6. 相关资产

- 设计总览：[Goal / Task vNext](../goal-task-vnext.md)
- 产品边界：[ADR-053](../../architecture/adr/ADR-053-goal-task-personal-product-boundary.md)
- Shared Label：[ADR-054](../../architecture/adr/ADR-054-shared-labels-and-system-views.md)
- KR Measurement V2：[ADR-055](../../architecture/adr/ADR-055-key-result-measurement-progress-v2.md)
- Task settlement：[ADR-056](../../architecture/adr/ADR-056-task-plan-goal-link-contribution-settlement.md)
- 文件索引：[Goal 模块文件索引](../module-index/goal-files.md)
