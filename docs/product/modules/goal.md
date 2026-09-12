---
tags:
  - product
  - module
  - goal
description: Goal vNext 当前功能、产品语义与模块边界
created: 2026-06-02T00:00:00
updated: 2026-09-12T17:55:00+08:00
---

# Goal 模块说明

> **当前收敛状态（2026-09-12）：** GOAL-7202~7206 已落地：除 Goal identity/lifecycle、planning time 与 KR Measurement V3 外，Task context 已支持 Goal-only / Goal+KR link / KR contribution 三态，Knowledge context 已切到 Shared Relation + ADR-090 stable `KnowledgeDocumentId`。Goal Workspace、AI Plan V2 与完整 Target property picker 仍按 [active plan](../../plan/active/2026-09-08-goal-vnext-model-convergence.md) 后续票实施，不应提前写成当前能力。

## 1. 功能定位

Goal 负责个人目标的 **Direction + Measurement**：用户定义想达到什么结果，用 Key Result Measurement V3 的 `Initial / Current / Target` 表达可验证的衡量方式，并通过 Record / Review 跟踪事实与复盘。Goal 不再承担任务编排、专注计时、目录层级或动态优先级等其他产品职责。

## 2. 当前产品能力

- Goal 创建、编辑、回到规划、开始、完成、放弃、归档与删除；
- Goal identity：`name + summary`；新 Goal 默认 `Planned`；
- Planning time：`startDate?: Ymd` + `target?: GoalTimeframe`，Target 支持 Day / Month / Quarter / Half-year / Year 精度；目标周期过去只产生 `Past Target` 展示信号，不产生 Task-style overdue，也不自动改变状态；
- Key Result Measurement V3：普通产品面只暴露 `initialValue / currentValue / targetValue / unit / optional target timeframe`；统一 calculator 使用 `(current - initial) / (target - initial)`，系统聚合 seed `trackingBaseValue` 仅存在于服务端/可移植备份协议，不进入普通 UI；
- Goal Record：记录 KR 的真实测量事实；
- Goal Review：记录阶段性复盘；
- Shared Label：Goal 与 Task 共用 identity-scoped Label registry，创建/更新提交 `labelIds`，多标签筛选使用 `labelIdsAll` AND 语义；
- Task Link：Task 可以链接 Goal/KR，但 Goal 不反向拥有 Task；
- Knowledge Link：通过 Shared Relation 的 typed GoalKnowledge facade 链接 reusable KnowledgeDocument；持久化端点只使用 stable `KnowledgeDocumentId`，rename/move 不改变关系身份；
- AI Goal draft：Mastra durable workflow 生成当前 Goal/KR/Label 语义的可审阅草稿，确认后由 Goal application port 写入。

已退休且不得恢复为产品真值：`GoalFolder`、Goal category/string tags、Parent Goal、Importance/Priority、Goal Focus Session、MultiGoalComparison、Standalone ProgressBreakdown。

## 3. 状态与完成语义

Goal 业务状态只有：

```text
Planned
InProgress
Completed
Abandoned
```

状态只能通过显式 `plan / activate / complete / abandon` 业务动作改变。`archivedAt` 是独立的历史/显示属性，不是业务状态；start/target/KR/Task/Reminder 都不会自动切换 Goal status。进入 Completed 设置 `completedAt`，重新进入 InProgress 会清除它。

## 4. Planning time 边界

- `startDate` 是 Product Time 的 date-only `Ymd`，不是 epoch instant；
- `target` 是 `GoalTimeframe`：Day / Month / Quarter / Half-year / Year，展示必须保留用户选择的精度；
- 持久化使用 `target_kind + target_end_date` 的规范化可逆 pair，应用层仍只暴露 `GoalTimeframe`；
- Reminder/Schedule 可以从 target 派生 period end boundary，但这个 boundary 不是新的 Goal deadline truth；
- Task `dueDate/isOverdue` 属于 Task owner，不能因为 Goal 去除 due 语义而删除或复用。

完整 Target property picker 属于 GOAL-7209；当前基础编辑器会保留未触碰的 Month/Quarter/Half-year/Year target，只有用户选择具体日期时才显式替换为 Day target。

## 5. 写入与一致性边界

- Goal aggregate 是 Goal/KR/Record/Review 的一致性边界；
- 修改既有 aggregate 使用 `expectedVersion`，冲突显式返回而不是静默覆盖；
- mutation 返回权威 `GoalMutationReceipt`，客户端按 ID 原子合并；
- Task contribution 通过自包含、幂等的跨模块事件/settlement 进入 Goal，不共享 repository 或数据库事务；
- generic Relation 不属于 Goal；Goal 删除只依赖窄 `GoalRelationCleanupPort`，由 host 注入 transaction-scoped Shared Relation adapter，使 Goal 删除与 edge unlink 在同一 Prisma/PowerSync 数据库事务中原子提交/回滚，且永不删除 KnowledgeDocument；
- AI 只生成草稿并调用 Goal/Task owner application port，不直接写数据库。

## 6. 用户视图

当前列表仍使用 `Active / Completed / All` 这组 **System View** 展示标签，其中 `Active` 视图是 UI/read-model 聚合，包含 `Planned + InProgress`，不是第五种 Goal status。归档与放弃属于历史入口；System View 都是状态/时间派生视图，不是 Label。用户可叠加 Shared Label 过滤。

Web/Desktop 与 React/Mobile 均使用同一公开 contracts；移动端不存在 Folder/Comparison/Focus 等已退休 UI。

## 7. 相关资产

- 当前 Goal model/lifecycle/timeframe：[ADR-067](../../architecture/adr/ADR-067-goal-vnext-product-model-and-lifecycle.md)
- 设计总览：[Goal / Task vNext](../goal-task-vnext.md)
- 产品边界：[ADR-053](../../architecture/adr/ADR-053-goal-task-personal-product-boundary.md)
- Shared Label：[ADR-054](../../architecture/adr/ADR-054-shared-labels-and-system-views.md)
- Goal Workspace / Shared Relation：[ADR-069](../../architecture/adr/ADR-069-goal-workspace-cross-module-context.md)
- Stable Knowledge identity：[ADR-090](../../architecture/adr/ADR-090-stable-knowledge-document-identity.md)
- KR Measurement V3：[ADR-068](../../architecture/adr/ADR-068-key-result-measurement-v3.md)（ADR-055 保留为已被修订的 V2 历史决策）
- Task settlement：[ADR-056](../../architecture/adr/ADR-056-task-plan-goal-link-contribution-settlement.md)
- 文件索引：[Goal 模块文件索引](../module-index/goal-files.md)
