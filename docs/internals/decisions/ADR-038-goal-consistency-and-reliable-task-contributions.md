---
tags:
  - adr
  - goal
  - task
  - transaction
  - concurrency
  - outbox
  - read-model
description: ADR-038 - Goal 聚合一致性、乐观并发与 Task 贡献可靠交付
created: 2026-08-01T00:00:00+08:00
updated: 2026-08-01T22:05:00+08:00
---

# ADR-038: Goal 聚合一致性与可靠 Task 贡献

**状态：** 已采纳
**日期：** 2026-08-01
**影响范围：** Goal、Task、contracts、database、PowerSync、API、Desktop、app-vue、app-react、AI Executor

> **2026-08-25 修订说明：** 本 ADR 的事务、乐观并发、outbox、幂等来源相关性继续有效；`TaskGoalBinding` 的产品/领域语义由 [ADR-056](./ADR-056-task-plan-goal-link-contribution-settlement.md) 修订为 optional Goal/KR link + optional contribution，并将 `AllInstancesCompleted` 提升为 `PlanCompletion` settlement 语义。

## 1. 背景

“目标 → KR → 任务 → 进度”旅程目前由多个浅 **Module** 共同编排：

- 前端先创建 Goal，再逐个创建初始 KR；任何中途失败都会留下半成品。
- GoalRecord 先保存记录，再单独保存更新后的 Goal/KR，两个写入没有共同事务。
- Task 完成后只依赖提交后进程内事件；进程在 Task commit 与 Goal handler 之间退出时，贡献可能丢失。
- Goal、KR、摘要和 Task binding view model 保存同一事实的多个对象/标题快照，局部刷新会产生矛盾版本。
- `version` 字段存在，但 Prisma update 没有 compare-and-swap，不构成乐观并发控制。
- Task 的 Goal binding 已在 contracts 中表达为 ID，却在数据库中保存为 JSON，数据库无法建立外键和查询约束。

这些问题不能通过增加刷新、补偿删除或 snapshot fallback 解决。调用方需要一个更深的 Goal 写入 **Module**：小 **Interface** 隐藏事务、并发、事件和投影更新的 **Implementation**，从而提高调用方 **Leverage** 和维护 **Locality**。

## 2. 决策

### 2.1 Goal 是 Goal/KR/Record 写入的一致性中心

Goal、其 KeyResult 以及改变 KR 当前值的 GoalRecord 写入属于同一个业务一致性范围。

应用层公开业务命令，而不是公开需要调用方排序的持久化步骤：

- 创建 Goal 及初始 KR；
- 添加或修改 KR；
- 记录 KR 进度；
- 批量修改 KR 权重。

每个命令必须在一个本地数据库事务中全部成功或全部失败。前端、controller、事件 handler 和 AI Executor 不得自行串联 repository 写入。

### 2.2 Transaction Runner 是真实 Seam

Goal application 拥有 `GoalWriteTransactionRunner` **Interface**。Prisma 和 PowerSync 分别提供 **Adapter**，因此这是两个实际变化实现共同使用的真实 **Seam**。

transaction runner 向命令提供绑定到同一事务上下文的 repository 集合和事件缓冲区：

```ts
interface GoalWriteTransactionRunner {
  run<T>(work: (context: GoalWriteContext) => Promise<T>): Promise<T>;
}
```

固定规则：

1. repository 不得在已绑定事务的情况下再次创建嵌套事务。
2. domain events 在事务中缓冲；只有 commit 成功后才能发布。
3. rollback 后不发布成功事件。
4. transaction runner 是 application command 的依赖，不从全局容器或 ambient context 定位。

### 2.3 使用 expectedVersion 实施乐观并发

改变现有 Goal 聚合（包括 KR、Record、Review）的命令必须携带调用方最后观察到的 Goal root `expectedVersion`。

Prisma **Adapter** 使用带 `id + identityId + version` 条件的 update/updateMany；受影响行数为零时返回 typed conflict，不回退到 last-write-wins。成功更新时 version 原子递增。

PowerSync **Adapter** 必须保留相同 **Interface** 语义：旧版本不能覆盖新版本，冲突进入产品可恢复流程。

Goal 是唯一并发与软删除边界。KeyResult、GoalRecord、GoalReview 不保存独立 `version` 或 `deletedAt`；删除子实体是在同一 Goal CAS 事务内从拥有关系中物理移除。数据库使用包含 `identityId` 的复合外键约束 Goal→KR→Record/快照和 Goal→Review 所有权，避免仅凭全局 ID 形成跨租户关系。

客户端收到冲突后加载权威 read model，并允许用户比较/重新应用；不得静默覆盖或无限自动重试非交换命令。

### 2.4 Command 返回权威 Mutation Receipt

Goal mutation 成功后返回统一 receipt，至少包含：

- `goalId` 与新 `goalVersion`；
- 受影响实体 ID；
- materialize 后的 Goal detail read model；
- 已提交事件/来源相关性信息（若适用）。

客户端通过单一 `applyGoalMutationReceipt` 合并状态，不再了解“先刷新 KR，再刷新记录，再刷新 Goal 摘要”的顺序。

### 2.5 领域实体与 Read Model 分离

- Goal 聚合及其 KR/Record/Review 子实体是写入真值；并发序列只由 Goal root version 表达。
- list/detail/dashboard/AI 展示使用明确命名、只读、可重建的 projection。
- 客户端实体按 ID 归一化，只保存 `selectedGoalId`，不保存 `currentGoal` 对象副本。
- `overallProgress`、KR count 等派生值只能由一个 projector/selector 产生。
- Task binding 只保存 `goalId`、`keyResultId` 和贡献参数；标题按 ID 从 read **Interface** 批量解析。
- 缺失引用显示明确状态，不回退到陈旧标题快照。

### 2.6 Task binding 使用关系字段

删除 `TaskTemplate.goalBinding` JSON，展开为可查询、可约束的列：

- `goalId`；
- `keyResultId`；
- `goalRecordValue`；
- `goalProgressTrigger`。

数据库建立 Goal/KR 外键。application 在写入时验证 KR 属于 Goal 且二者属于同一 identity。Task domain 中只保留一个 `TaskGoalBinding` 值对象，持久化 mapper 负责列展开。

项目处于活跃开发期，本变更直接 reset 开发数据库；不增加双读、双写、旧 JSON 解析或标题快照迁移。

### 2.7 Task→Goal 使用 Outbox + 幂等 Inbox

本决策细化 ADR-033 的通知式事件范式，不改变跨模块依赖方向：Task 不访问 Goal repository，Goal handler 不回查 Task repository。

可靠交付流程：

1. Task 完成状态与 outbox row 在同一 Task 事务提交。
2. dispatcher 对事件执行至少一次投递。
3. 事件 payload 自包含：eventId、identityId、Task template/instance ID、Goal/KR ID、贡献值、trigger、业务发生时间。
4. Goal handler 在一个 Goal 事务中登记 eventId/source correlation、创建 GoalRecord、更新 KR/Goal version。
5. 重复 eventId 返回已处理结果，不重复贡献。
6. Goal commit 后才发布 `GoalProgressChanged`。
7. API 与 Desktop 组合根装配同一 dispatcher 和 handler。

Outbox/Inbox 首先只服务真实的 Task→Goal 链路。第二个生产用例出现前，不建设通用 broker 或插件框架。

### 2.8 来源相关性支持正向与撤销语义

Task completion/uncompletion 需要同一业务来源的稳定相关性。来源键必须明确区分 event identity 与业务 entity identity：

- event ID 用于投递幂等；
- Task instance/template source 用于找到并撤销既有贡献。

唯一索引必须与软删除语义一致。撤销后重新完成的合法行为需要由测试固定，不依赖数据库 NULL/unique 的偶然行为。

## 3. 与既有 ADR 的关系

- 延续 ADR-002：Goal 仍是 Goal/KR 聚合根。
- 细化 ADR-003：内存事件不再承担需要崩溃恢复的交付保证。
- 延续 ADR-015：直接删除旧 schema 和兼容路径。
- 延续 ADR-023/025：transaction runner 和 handler 在组合根显式注入。
- 延续 ADR-026：HTTP/IPC **Adapter** 暴露同形 command/receipt。
- 细化 ADR-033：事件仍是 Task→Goal 的机制，但 durable delivery 使用 outbox/inbox。

若本 ADR 与历史计划中“batch 不引入 transaction”或“只在 commit 后内存发布”冲突，以本 ADR 为准。

## 4. 不采用的方案

### 4.1 前端串联写入并在失败时补偿删除

不采用。补偿也可能失败，且调用方必须理解内部写入顺序，**Interface** 与 **Implementation** 同样复杂，缺乏 **Depth**。

### 4.2 保留 snapshot 并在每次 mutation 后刷新所有列表

不采用。刷新是时序，不是不变量；并发响应仍可能以旧数据覆盖新数据。

### 4.3 Task 与 Goal 共享一个跨模块数据库事务

不采用。它破坏模块独立所有权，并无法自然扩展到离线 Desktop/PowerSync。采用两个本地事务和可靠事件。

### 4.4 只在事件总线 commit 后 publish

不采用为最终方案。它避免回滚事件，却无法覆盖 commit 后、consumer 前的进程退出窗口。

### 4.5 为所有模块先建设通用消息平台

不采用。当前只有 Task→Goal 需要 durable delivery，过早通用化会扩大 **Interface** 而没有真实 **Leverage**。

## 5. 影响与代价

正面影响：

- 调用方只提交业务命令并应用 receipt。
- 事务、并发和幂等知识集中，获得更高 **Locality**。
- Prisma/PowerSync 共享行为 **Interface**，测试可以在同一 test surface 验证两个 **Adapter**。
- Task 完成贡献可重试、可审计、可恢复。
- 删除客户端矛盾快照与分散刷新编排。

需要承担：

- 增加 outbox/inbox 表、dispatcher、重放与清理机制。
- 冲突从隐形覆盖变成显式产品状态，需要相应交互。
- schema、contracts、两个宿主和两个持久化 **Adapter** 必须同切片更新。

## 6. 验收标准

- 创建 Goal + N 个初始 KR 任一步失败时零部分数据。
- GoalRecord 与 KR current value 永远同事务成功或失败。
- 旧 expectedVersion 写入得到 typed conflict，不能覆盖新版本。
- 同一 Task completion event 重放或并发两次，只产生一次贡献。
- Task commit 后进程退出，重启 dispatcher 后贡献最终完成。
- Web 与 Desktop 对同一事件具有相同行为。
- Task binding 数据库没有 JSON、标题快照或兼容解析。
- mutation 后所有已打开 Goal 投影在应用 receipt 后一致。

## 7. 实施计划

本决策已于 2026-08-01 完整实施并通过本地 Docker 产品复审。实现与证据见 [Reka UI、Goal 一致性与桌面工作区长期重构计划](https://github.com/BakerSean168/memoflow/blob/7a45112e1840950ead1ba98b748fc70fa1b38344/docs/plan/archive/2026-08-01-reka-goal-consistency-and-workspace-refactor.md) 和 [最终复审报告](https://github.com/BakerSean168/memoflow/blob/7a45112e1840950ead1ba98b748fc70fa1b38344/docs/audit/2026-08-01-goal-consistency-workspace-remediation-review.md)。
