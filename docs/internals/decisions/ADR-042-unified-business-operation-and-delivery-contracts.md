---
tags:
  - adr
  - reliable-messaging
  - contracts
  - fail-fast
  - lease
  - projection
description: ADR-042 - 统一业务操作、可靠交付与 Fail-Fast 能力契约
created: 2026-08-09T00:00:00+08:00
updated: 2026-08-09T00:00:00+08:00
---

# ADR-042: 统一业务操作、可靠交付与 Fail-Fast 能力契约

**状态：** 已采纳  
**日期：** 2026-08-09  
**影响范围：** contracts, reliable-messaging, reminder, notification, account, goal, task, schedule, repository, database

## 1. 背景

MemoFlow 包含 Reminder 扫描、Notification 投递、Account Closure 清理、Task 贡献、Schedule 冲突投影与 Knowledge 笔记同步等多条跨模块与派生写路径。盘点发现以下基础设施断点：

1. **状态语义不一致**：各模块在表示操作结果时混用 `pending/running/succeeded/failed` 或布尔标志，缺乏统一的跨模块 `BusinessOperationReceipt` 和状态词典。
2. **缺损默认成功 (Silent Success) 隐患**：例如 Notification Channel 或 Reminder 运行时缺损时，进程使用无动作的 fallback，把未经投递的操作标为成功。
3. **缺少互斥锁与分布式租约契约**：多实例或并发运行 worker 缺少统一的 `LeaseClaim` (`ownerToken`, `expiresAt`, `lastHeartbeatAt`) 抽象。
4. **派生投影缺乏统一可重放表达**：Schedule 派生冲突表重载与 Knowledge Git Commit 本地投影缺乏 `sourceRevision` 与 `replayable` 统一表达。
5. **缺少运维与 Replay 视角的隔离契约**：死信 (`dead_letter`) 无法按身份授权查询与集中重发。

为了在重构全过程中保护边界，必须在 W0 冻结统一的业务操作、可靠交付与 Fail-Fast 能力契约。

## 2. 决策

### 2.1 统一 `BusinessOperationReceipt` 与复合幂等键

在 `@memoflow/reliable-messaging-contracts` 中定义标准 `BusinessOperationReceipt` Zod Schema 与 TypeScript 类型：

- `schemaVersion`: 正整数契约版本号 (默认为 1)，用于版本演进与未知版本锁定
- `operationId`: 操作唯一标识符
- `identityId`: 租户/用户 ID
- `source`: 业务来源模块 (如 `reminder`, `notification`, `goal`, `task`, `schedule`, `repository`, `account`)
- `occurrenceKey`: 业务发生点唯一键 (如 `templateId:2026-08-09` 或 eventId)
- `idempotencyKey`: 无碰撞规范化长度前缀合成幂等键 (`v1:${len(identityId)}:${identityId}:${len(source)}:${source}:${len(occurrenceKey)}:${occurrenceKey}`)
- `status`: 统一状态语义 (见 2.2)
- `attempt`: 已尝试执行次数
- `lease`: `LeaseClaim | null`
- `lastError`: 最近一次错误描述 (成功状态必须为 null)
- `nextRetryAt`: 下次退避重试时间 (ISO timestamp)
- `deadLetterAt`: 进入死信队列时间 (ISO timestamp)
- `correlationId` / `causationId`: 因果追溯链
- `createdAt` / `updatedAt` / `finishedAt`: ISO timestamp 时间戳 (终态必须有 `finishedAt`；非终态 `finishedAt` 必须为 null)

### 2.2 统一状态词典与状态不变量 (Unified Status Semantics & Invariants)

规定所有异步/长周期业务操作统一收敛至以下 8 种状态，并由 Zod `superRefine` 强制约束状态不变量：

| 状态          | 语义说明                                         | 终态/暂态           | 必须约束                                                                   |
| ------------- | ------------------------------------------------ | ------------------- | -------------------------------------------------------------------------- |
| `pending`     | 已创建/入队，等待 worker 领用或到达可执行时间    | 暂态                | lease=null, finishedAt=null, nextRetryAt=null, deadLetterAt=null           |
| `running`     | 已由持有有效 lease 的 worker 领用并在执行中      | 暂态                | lease != null, finishedAt=null, nextRetryAt=null, deadLetterAt=null        |
| `succeeded`   | 业务操作成功完成                                 | 终态                | finishedAt != null, lastError=null, nextRetryAt=null, deadLetterAt=null    |
| `skipped`     | 满足幂等或前置条件判定跳过执行                   | 终态                | finishedAt != null, lastError=null, nextRetryAt=null, deadLetterAt=null    |
| `failed`      | 发生不可重试的业务或技术失败                     | 终态                | finishedAt != null, nextRetryAt=null, deadLetterAt=null                    |
| `retryable`   | 发生暂态异常，已记录退避与 `nextRetryAt`         | 暂态                | nextRetryAt != null, lastError != null, finishedAt=null, deadLetterAt=null |
| `dead_letter` | 达到最大重试次数或致命异常，等待人工/运维 Replay | 暂态（需重载/重放） | deadLetterAt != null, finishedAt=null, nextRetryAt=null                    |
| `cancelled`   | 用户主动撤销或账号关闭导致的取消                 | 终态                | finishedAt != null, nextRetryAt=null, deadLetterAt=null                    |

_注：R1 遗留 `OutboxMessageStatus` (`pending/dispatched/failed/dead`) 作为向下兼容接口保留，通过 `mapOutboxStatusToBusinessOperationStatus` 隐式与上述 8 状态对齐（`pending`->`pending`, `dispatched`->`succeeded`, `failed`->`failed`, `dead`->`dead_letter`）。_

### 2.3 领用租约 `LeaseClaim` 与 Fencing 代数

1. **`LeaseClaim` 契约**：包含 `schemaVersion`、`resourceKey` (受保护资源键)、`claimId` (唯一 Claim 实例 ID)、`fencingToken` (单调递增整数)、`ownerToken`、`expiresAt` (ISO timestamp)、`lastHeartbeatAt` 与 `heartbeatIntervalMs`。
2. **Stale-Owner Fencing 拒绝规则**：
   - 若 `incomingFencingToken < activeFencingToken`，直接判定为 Stale Claim 并抛出 `LeaseFencingException` 拒绝写入。
   - 若 `incomingFencingToken === activeFencingToken` 但 `ownerToken` 或 `claimId` 不匹配，判定为非法并发 claim 拒绝。
   - 租约超时后允许其他节点抢占并生成更高 `fencingToken`。
3. **`DeliveryAttempt` 契约**：包含 `schemaVersion`、`attempt` 序号、`attemptedAt` (ISO timestamp) 时间、`result` (`succeeded/failed/retryable/skipped`)、`error`、`durationMs` 与可选 `channel`。

### 2.4 派生投影 `ProjectionOperation` 闭环

派生只读模型（如 Schedule 冲突投影、Knowledge 笔记投影）统一实现 `ProjectionOperation` 契约，具备与 `BusinessOperationReceipt` 完全对齐的闭环语义：

- `schemaVersion`: 契约版本号 (1)
- `operationId`: 操作唯一 ID
- `identityId` / `source` / `occurrenceKey` / `idempotencyKey`: 规范化标识与幂等键
- `projector`: 投影器名称
- `sourceRevision`: 源聚合/版本 Revision (只允许非负整数或有效 Git commit SHA/UUID，禁止 NaN/负数)
- `status`: `BusinessOperationStatus`
- `replayable`: 表达该投影是否支持全量/增量重建 (默认 true)
- `attempt` / `lease` / `lastProcessedId` / `lastProcessedAt` / `lastError` / `nextRetryAt` / `deadLetterAt` / `createdAt` / `updatedAt` / `finishedAt`
- 提供 `projectionOperationToReceipt` 状态转换器，以及 `ProjectionReplayRequestSchema` / `ProjectionQueryFilterSchema` 重用与授权查询契约。

### 2.5 Fail-Fast 启动原则 (Strict Fail-Fast Principle)

1. **生产能力缺损必须启动失败**：生产环境 (`production`) 如果必要的渠道 Deliverer 或 Runtime Scheduler 缺失 (`status === 'missing'`) 且 `requiredInProduction === true`，必须抛出 `CapabilityMissingStartupException` 终止进程。可选能力 (`requiredInProduction === false`) 缺失允许正常启动。
2. **生产环境禁用 Test Double**：生产环境出现 `status === 'test_double'` 总是抛错拒绝。
3. **测试环境 Test Double 规则**：测试环境 (`test`) 中 `status === 'test_double'` 必须检查 `allowTestDoubleInTest`；若为 `false` 抛出 `CapabilityTestDoubleForbiddenException` 拒绝。

### 2.6 各模块 Application Port 契约交付与闭环约束

为后续 W1~W7 冻结各业务模块接入的 Application Port 接口（声明位于 `@memoflow/reliable-messaging-contracts`），并建立运行时闭环约束：

1. **Port 输入契约**：所有 Application Port 输入 Schema 的 `identityId` / `source` / `occurrenceKey` 幂等三元组与 `idempotencyKey` 均设为 REQUIRED 非空，且 `idempotencyKey` 必须能够被 `parseIdempotencyKeyString` 成功解析且与三元组完全匹配，禁止接收缺失或未验证格式的裸 Key。
2. **Port 输出契约与运行时闭环**：各 Application Port 输出必须返回 `BusinessOperationReceipt` 或 `ProjectionOperation`。实现与适配器在输出边界必须显式调用 `assertValidBusinessOperationReceipt` / `assertValidProjectionOperation`（即经 `BusinessOperationReceiptSchema.parse()` / `ProjectionOperationSchema.parse()` 校验），只有 Schema parse 成功的输出才可宣称执行成功。

**冻结的 Application Ports 清单**：

- **Reminder**: `ReminderReliableOperationPort` (occurrence claim, lease & delivery intent)
- **Notification**: `NotificationReliableOperationPort` (outbox dispatch, dead-letter query & replay)
- **Account**: `AccountClosureReliableOperationPort` (closure saga, session revocation & work cancellation)
- **Goal**: `GoalDependencyReadPort` (identity-scoped task binding check) & `GoalReliableOperationPort`
- **Task**: `TaskTransactionRunnerPort` (mandatory transaction execution) & `TaskReliableOperationPort`
- **Schedule**: `ScheduleReliableOperationPort` (conditional update version check) & `ScheduleConflictRebuildPort`
- **Knowledge/Repository**: `KnowledgeProjectionReliablePort` (commit to local projection operation & replay)
- **Cloud Auth**: `CloudAuthRevocationPort` (bulk session revocation)

### 2.7 隔离与运维 Replay 权限

1. **identity 隔离**：所有 operation receipt 的查询与 Replay 指令必须严格以 `identityId` 进行范围限定。
2. **死信 Replay 审计**：执行死信重发时，必须生成带新 `correlationId` 的新尝试记录，保留原 `operationId` 与最初的 `causationId`。

## 3. 与既有 ADR 的关系

- 延续与深化 [ADR-010](./ADR-010-standard-centralized-contracts.md)：所有操作与交付契约集中在 `旧聚合契约包（已退役）`。
- 延续与深化 [ADR-033](./ADR-033-cross-module-communication-patterns.md) 与 [ADR-038](./ADR-038-goal-consistency-and-reliable-task-contributions.md)：规范跨模块 Outbox/Inbox 和投递意图回执。
- 强化 [ADR-012](./ADR-012-standard-error-handling.md)：废除 no-op 假成功 fallback，实行 Fail-Fast 原则。

## 4. 不采用的方案

### 4.1 各模块自行定义私有 Status 枚举与字段

不采用。私有枚举会导致跨模块消息与运维 Tooling 无法建立通用 Metrics 和 Replay Dashboard。

### 4.2 在生产环境保留 no-op deliverer fallback 并在日志打 Warning

不采用。Warning 无法阻止生产静默丢失通知或提醒。Fail-Fast 才能确保配置缺失在部署阶段被捕获。

## 5. 影响与代价

正面影响：

- 跨模块消息、提醒、通知、账号关闭和投影具有相同的状态语义与回执结构。
- 生产环境能力缺失能够在启动时立即捕获。
- 为 W1~W7 提供了标准化的租约 (Lease) 与重试/死信 (Replay) 契约。

需要承担：

- 模块组合根在生产启动时需显式注册 Capability 校验。

## 6. 验收标准

- `@memoflow/reliable-messaging-contracts` 导出完整的 `BusinessOperationReceipt`、`DeliveryAttempt`、`LeaseClaim`、`ProjectionOperation` 和 Capability Zod Schemas。
- 契约单测正反向校验 100% 通过。
- 新建 ADR-042 并在 `docs/internals/decisions/README.md` 中备案。

### 验收治理（Phase 6）

- `tools/governance/architecture-surface-audit.mjs` 的 `RELIABLE_RECEIPT_CANONICAL` 规则：`BusinessOperationReceipt`/`ProjectionOperation` 契约 body 只存在于 contracts（manifest 列出 canonical files），manifest 中的 goal/reminder/notification adapters 在输出边界调用 `assertValidBusinessOperationReceipt`/`assertValidProjectionOperation`；本地重复 receipt shape 或移除 validator 调用都会使审计变红。行为由 `reliable-messaging-contracts.spec.ts` 与各 adapter behavior tests 覆盖。
