---
tags:
  - audit
  - w0
  - infrastructure
  - reliability
  - contracts
  - database
description: W0 基础契约、Prisma 数据模型、事务与 Outbox 现状盘点与缺口分析
created: 2026-08-09T00:00:00Z
updated: 2026-08-09T00:00:00Z
---

# W0 基础设施、数据模型与迁移边界盘点报告

## 1. 概述与真值依据

本盘点报告为 [`docs/plan/active/2026-08-09-business-p0-elegant-fix-plan.md`](../plan/archive/2026-08-09-business-p0-elegant-fix-plan.md) **W0 阶段** 的证据驱动产物。盘点覆盖：

- 数据库 Schema (`packages/database/prisma/schema/*.prisma`)
- 事务 Runner 与 Seam 抽象
- Outbox Dispatcher 与事件投递机制
- Telemetry 指标与可观测性现状
- 运维 Replay 权限与死信管理

---

## 2. Prisma 数据模型盘点与缺口分析

### 2.1 共享 Reliable Messaging 机制

- **当前代码位置**：[`packages/database/prisma/schema/reliable-messaging.prisma`](../../packages/database/prisma/schema/reliable-messaging.prisma)
- **已具备**：
  - `OutboxMessage`: 具备 `id`, `identityId`, `messageType`, `schemaVersion`, `correlationId`, `causationId`, `payloadJson`, `status`, `attempts`, `availableAt`, `lastError`, `dispatchedAt`, `createdAt`。
  - `InboxReceipt`: 具备 `[id, consumer]` 联合主键与 `outcome`，满足 R1 级幂等消费。
  - `ProjectionCursor`: 具备 `[projector, sourceName]` 联合主键与 `version`。
- **缺口 (Gaps)**：
  - 缺乏统一 `BusinessOperationReceipt` 表或通用 operation status mapping（目前仅 Task 独立维持 `TaskGoalOutbox`，Notification 与 Reminder 无持久化回执表）。
  - `OutboxMessage.status` 仅支持 `pending/dispatched/failed/dead`，缺少 W0 要求的统一状态词典（`pending/running/succeeded/skipped/failed/retryable/dead_letter/cancelled`）。
  - 缺少 `deadLetterAt`、`nextRetryAt` 以及显式 `occurrenceKey` 复合唯一索引。

### 2.2 Reminder 模块

- **当前代码位置**：[`packages/database/prisma/schema/reminder.prisma`](../../packages/database/prisma/schema/reminder.prisma)
- **已具备**：
  - `ReminderTemplate`, `ReminderGroup`, `ReminderInstance`, `ReminderHistory`, `ReminderStatistic`, `ReminderResponse`, `UserReminderPreference`。
- **缺口 (Gaps)**：
  - 缺少数据库级 `ReminderLease` 表或 claim 字段。现有多实例并发扫描时缺乏互斥锁与 owner 租约保护。
  - `ReminderInstance` 依赖 `triggerAt` 索引，但扫描/写历史与更新模板未在同一事务内完成，崩溃时可能重复触发或丢失意图。

### 2.3 Notification 模块

- **当前代码位置**：[`packages/database/prisma/schema/notification.prisma`](../../packages/database/prisma/schema/notification.prisma)
- **已具备**：
  - `Notification`, `NotificationChannel`, `NotificationHistory`, `NotificationPreference`, `NotificationTemplate`。
- **缺口 (Gaps)**：
  - `NotificationChannel` 具备 `status`, `maxRetries`, `attempts`, `error`, `sentAt`, `failedAt` 等列，但通知创建与渠道 dispatch 未落入 durable outbox，进程中途退出会导致通知丢失。
  - 无 Fail-Fast deliverer capability 注册机制，缺失渠道时默认 no-op 成功。

### 2.4 Account & Cloud Auth 模块

- **当前代码位置**：
  - [`packages/database/prisma/schema/account.prisma`](../../packages/database/prisma/schema/account.prisma)
  - [`packages/database/prisma/schema/auth.prisma`](../../packages/database/prisma/schema/auth.prisma)
- **已具备**：
  - `Account` (`status`: `ACTIVE/INACTIVE/SUSPENDED/DELETED`)
  - `CloudAuthUser`, `CloudAuthSession` (`token`, `expiresAt`, `userId`), `CloudAuthProviderAccount`
- **缺口 (Gaps)**：
  - 账号关闭 (`close-account.use-case.ts`) 仅标记业务 `Account` 状态，未在服务端原子编排撤销该身份下全部 `CloudAuthSession` 与 Session 令牌，且缺乏事务/Saga 回执。

### 2.5 Goal & Task 模块

- **当前代码位置**：
  - [`packages/database/prisma/schema/goal.prisma`](../../packages/database/prisma/schema/goal.prisma)
  - [`packages/database/prisma/schema/task.prisma`](../../packages/database/prisma/schema/task.prisma)
- **已具备**：
  - Goal CAS 乐观并发控制 (`version` 列)
  - `TaskTemplate` 展平列 `goalId`, `keyResultId`, `goalRecordValue`, `goalProgressTrigger`
  - `TaskInstance` 具备 `@@unique([templateId, occurrenceKey])`
  - `TaskGoalOutbox` 单向支持 Task Completion -> Goal Progress
- **缺口 (Gaps)**：
  - Goal 删除前依赖检查写死固定返回 `false`，未通过 identity-scoped read port 实时查询绑定关系。
  - Task 模板、初始实例与 Outbox 写入缺乏强制事务 Runner。

### 2.6 Schedule 模块

- **当前代码位置**：[`packages/database/prisma/schema/schedule.prisma`](../../packages/database/prisma/schema/schedule.prisma)
- **已具备**：
  - `Schedule` (`hasConflict`, `conflictingSchedules`)
  - `ScheduleTask`, `ScheduleExecution`
  - `ScheduleLease` (`leaseKey`, `ownerToken`, `expiresAt`)
- **缺口 (Gaps)**：
  - `Schedule` (CalendarEntry) 缺乏 CAS `version` 字段，多客户端更新会发生静默覆盖。
  - 冲突重算逻辑直接在主写入路径同步执行，删除后冲突计算失败会导致只读投影残留过时数据。

### 2.7 Repository & Knowledge 模块

- **当前代码位置**：[`packages/database/prisma/schema/repository.prisma`](../../packages/database/prisma/schema/repository.prisma)
- **已具备**：
  - `KnowledgeRepositoryConnection`, `GithubWebhookDelivery`, `KnowledgeNoteProjection`, `KnowledgeWriteRequest`, `KnowledgeRepositoryLease`
- **缺口 (Gaps)**：
  - `KnowledgeWriteRequest` 状态控制仅有 `PENDING/COMPLETED`，缺少统一的 operation status（如 `retryable/dead_letter`）和可重放 (replayable) 回执表达。

---

## 3. Transaction Runner 现状与缺口

| 模块             | 当前 Transaction Runner 实现                                                                                                                                                                                                                                              | 缺口 / 重构方向                                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goal**         | [`PrismaGoalWriteTransactionRunner`](../../packages/goal/src/server/infrastructure/adapters/prisma/prisma-goal-write-transaction-runner.ts) (已规范)                                                                                                                      | 符合 ADR-038 标准，可作为示范                                                                                                                                                                                                           |
| **Task**         | 已存在 [`TaskWriteTransactionRunner`](../../packages/task/src/server/application/use-cases/commands/task-write-support.ts) 与 [`PrismaTaskWriteTransactionRunner`](../../packages/task/src/server/infrastructure/adapters/prisma/prisma-task-write-transaction-runner.ts) | 真实缺口在于应用层目前允许可选注入与 [`createInlineTaskWriteTransactionRunner`](../../packages/task/src/server/application/use-cases/commands/task-write-support.ts) inline 降级；W4 需重构为在组合根进行强制注入并彻底剔除 inline 降级 |
| **Schedule**     | 仅部分 Adapter 提供可选 `withTransaction`                                                                                                                                                                                                                                 | 缺少 expected version 校验与更新/删除 + 冲突重算 outbox 同一提交保证                                                                                                                                                                    |
| **Reminder**     | 无                                                                                                                                                                                                                                                                        | template nextTriggerAt 更新、instance 状态与 notification intent 写入跨步提交                                                                                                                                                           |
| **Notification** | 无                                                                                                                                                                                                                                                                        | aggregate 保存与 channel outbox 写入未原子化                                                                                                                                                                                            |
| **Account**      | 无                                                                                                                                                                                                                                                                        | closure saga 步骤未绑定可恢复事务回执                                                                                                                                                                                                   |

---

## 4. Outbox Dispatcher 与 Fail-Fast 运行能力

| 模块                 | Outbox 状态                                       | Capability 策略                 | 缺口 / 重构方向                                                |
| -------------------- | ------------------------------------------------- | ------------------------------- | -------------------------------------------------------------- |
| **Reminder**         | 无 outbox；API 组合根注入空 `reminder.runtime.ts` | 未启用 fail-fast                | 生产环境缺少可用 scheduler 时启动静默无动作，应判定为启动失败  |
| **Notification**     | 依赖进程内 Dispatcher；未落库 outbox              | deliverer 缺失时 no-op 标记成功 | 生产环境未注册渠道时应 fail-fast 拒绝启动；引入 durable outbox |
| **Task -> Goal**     | 具备 `TaskGoalOutbox` 与运行中 worker             | 正常                            | 运行良好，作为 W1/W2 outbox 演进参考                           |
| **Schedule Rebuild** | 无 outbox，同步重算                               | 无 lease/rebuild 队列           | 抽取为 conflict-rebuild outbox + lease worker                  |
| **Knowledge**        | 依赖 webhook / write request                      | 依赖 GitHub connection status   | 统一使用 operation receipt & projection replayable 契约        |

---

## 5. 指标与运维 Replay 权限现状

### 5.1 指标 (Telemetry)

- **现状**：Reminder 仅在领域层定义了 `ReminderMetricsVO` (`packages/contracts/src/modules/reminder/value-objects/`)，Schedule 与 Task 各有独立的统计表 (`ScheduleStatistic`, `TaskStatistic`)。
- **缺口**：缺少 Prometheus/OpenTelemetry 统一命名的跨模块操作指标。缺乏针对 due latency、claimed total、delivery attempts、dead-letter total 和 replay total 的标准 Counter/Gauge 定义。

### 5.2 运维 Replay 权限

- **现状**：各模块控制台与 API 接口分散，死信（dead-letter）无法跨模块统一查询与重放。
- **缺口**：缺少按 `identityId` 严格隔离授权的死信/操作历史查询与一键 Replay 接口契约（已在 W0 契约中定义 `BusinessOperationReceipt` 作为基础数据结构）。

---

## 6. W0 解决方案与后续工作安排

1. **契约冻结**：已在 `@memoflow/contracts/reliable-messaging` 中冻结 `BusinessOperationReceipt`、`DeliveryAttempt`、`LeaseClaim`、`ProjectionOperation` 和 Fail-Fast `CapabilityRequirementContract`。
2. **ADR 落地**：新建 `ADR-042: 统一业务操作、可靠交付与 Fail-Fast 能力契约`。
3. **W1~W7 实施**：后续各模块重构必须严格遵循本盘点出的缺口与规范，零隐式 fallback，零非授权重写。
