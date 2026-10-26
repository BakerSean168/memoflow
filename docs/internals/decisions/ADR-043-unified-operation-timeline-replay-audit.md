---
tags:
  - adr
  - operations
  - timeline
  - replay
  - audit
  - metrics
description: ADR-043 - 统一 operation timeline、最小权限 replay 与审计、统一指标命名、W0-W6 故障矩阵
created: 2026-08-12T00:00:00+08:00
updated: 2026-08-12T00:00:00+08:00
---

# ADR-043: 统一 Operation Timeline、最小权限 Replay 与审计、统一指标命名、W0-W6 故障矩阵

**状态：** 已采纳  
**日期：** 2026-08-12  
**影响范围：** contracts/operations, patterns/operations, reminder, notification, schedule-rebuild, account-closure, knowledge-projection, database（`reliable_operation_audit_logs` 表）

## 1. 背景

W0-W6 将 Reminder、Notification、Account Closure、Schedule rebuild、Knowledge projection 的异步写路径收敛到 `BusinessOperationReceipt` / `ProjectionOperation` / `LeaseClaim` 契约，但跨模块仍缺少：

1. **统一状态投影**：各模块有自己的 ledger（`ReminderOccurrence`、`NotificationDispatchOutbox`、`ScheduleRebuildOutbox`、`AccountClosureOperation`、`KnowledgeWriteRequest`），查询形状互不相同，运维与用户无法用同一视角追踪失败原因、下次重试与可重放性。
2. **缺失的运维入口**：Reminder replay 只存在于 adapter 层，Schedule rebuild 与 Account closure 完全没有 timeline/replay 入口。
3. **审计缺失**：没有任何模块记录“谁在何时对哪个 operation 做了什么”（query / replay），最小权限无从谈起。
4. **指标命名发散**：各模块使用进程内 collector，无 `memoflow.` 统一前缀，dashboard 无法跨模块聚合。
5. **W7 第一轮审查（2026-08-12）发现**：contracts 的旧 operations 子路径 声明 export 无 JS 产物；governance 未登记 `./operations`；`timeline_query` 审计未实现；replay 与审计不原子；Knowledge 缺审计依赖仍可成功；统一指标只接两模块；跨模块门禁缺 Knowledge。

## 2. 决策

### 2.1 统一 `OperationTimelineEntry` 契约

在 `@memoflow/operations-contracts` 定义：

- `OperationTimelineEntrySchema`：`source`（reminder/notification/schedule-rebuild/account-closure/knowledge-projection）、`operationId`、`status`（8 态统一词典）、`failureReason`、`attempts`、`nextRetryAt`、`replayable`、`updatedAt`。
- `OperationTimelineQuerySchema`：identity-scoped 查询（`source?`、`status?`、`limit ≤ 200`）。
- `OperationReplayRequestSchema`：`source + operationId + identityId`。
- `OperationAuditRecordSchema`：`actorIdentityId`、`source`、`operationId`、`action`（`replay`/`timeline_query`）、`details`、`createdAt`。

每个模块通过共享映射器（`@memoflow/patterns/operations`）把自己的 ledger 映射为该契约，并在输出边界执行 `OperationTimelineEntrySchema.parse` —— 未过契约的输出不得宣称成功（禁止 silent success / no-op fallback）。

**构建产物门禁**：`@memoflow/operations-contracts` 与 `@memoflow/patterns/operations` 均为真实 JS/DTS 构建入口（tsup entry），surface 测试断言 dist 产物存在；发布前必须通过 `node -e "import('@memoflow/operations-contracts')"` smoke import。

### 2.2 最小权限的 timeline 查询与 replay 入口

每个模块暴露：

- `GET <module>/operations/timeline`：identity-scoped 查询（数据层强制 `identityId` 过滤，identity 只能看到自己的操作）。
- `POST <module>/operations/<id>/replay`：replay 前必须能取到该 identity 名下的操作；replay 推进状态（dead_letter/failed → retryable/pending/running）并由 worker 继续处理。
- `GET <module>/operations/audit`：actor-scoped 审计查询。

缺失依赖（如 `auditRepository`、`reliablePort`）时返回 `FAIL_CLOSED`，绝不静默降级。

### 2.3 跨模块共享审计事实表与原子 replay

新增 Prisma 模型 `OperationAuditLog`（`reliable_operation_audit_logs` 表），由 `PrismaOperationAuditRepository` 实现。

**审计粒度**（P1-3 明确）：

- `replay`：记录 `actorIdentityId + source + operationId + action=replay + details(状态推进)`。
- `timeline_query`：每次请求记录 `source`、过滤条件与结果计数；`operationId` 固定为 `*timeline-query*` 标记，**不把任意 operationId 伪造成被访问事实**。
- 审计失败时一律 **fail-closed**：查询/replay 必须能写入审计才可宣称成功。

**原子性**（P1-4）：

- Reminder / Notification / Schedule rebuild / Account closure 的 replay 通过 adapter 的 `replayDeadLetterWithAudit` / `replayRebuildOutboxWithAudit` / `resetForReplayWithAudit` 在**同一 `prisma.$transaction`** 内推进状态并写入审计；审计写失败整个事务回滚，绝不留下“已重放但无审计”的部分成功。
- Knowledge projection 依赖外部 GitHub 调用，无法共享事务：以**审计先行**语义保证——replay 必须携带 `auditRepository`，缺依赖时 `FAIL_CLOSED`；replay 在发起任何外部投影之前先落 `replay intent` 审计事实（审计写失败即 fail-closed，外部投影绝不执行），随后执行投影并追加 outcome 审计事实（成功/失败都会写入）。
- 禁止“先执行、后写日志、失败返回错误”的模式。

### 2.4 统一指标命名与共享 recorder

- `memoflow.<module>.outbox.<state>`：`persisted` / `claimed` / `succeeded` / `retried` / `failed` / `dead_letter`。
- `memoflow.<module>.worker.<outcome>`：`completed` / `failed` / `retried` / `skipped`。

五个模块（reminder/notification/schedule-rebuild/account-closure/knowledge）在真实 persistence/claim/retry/failure/dead-letter/worker outcome 路径发射统一名；共享 recorder 为 `patterns/operations` 的 `globalUnifiedOperationMetrics`，metrics controller（`GET /metrics`、`GET /metrics/json`）以 `memoflow_operation_metrics{metric=...}` 暴露快照供 Prometheus/dashboard 消费。不得只记终态。

### 2.5 回归门禁：五模块 + W0-W6 故障矩阵

- 跨模块集成测试（真实 PostgreSQL）：**五个**模块（reminder/notification/schedule-rebuild/account-closure/knowledge-projection）的 timeline 输出全部满足 `OperationTimelineEntrySchema`，故障注入（dead_letter / failed）后 replay 恢复状态，审计落到同一张共享表，无权限 identity 全被拒绝。
- W0-W6 故障矩阵（`docs/internals/decisions/ADR-044-w0-w6-fault-matrix.md`）枚举关键故障、注入层、预期 durable fact、恢复动作、禁止状态与测试文件；覆盖事务提交/发布边界、lease fencing、渠道 capability/silent success、account closure 分阶段恢复、schedule expectedVersion/冲突与 rebuild 幂等、knowledge webhook/reconcile/乱序 replay。

### 2.6 Desktop/PowerSync 运维入口（P2-1）

W7 运维入口（timeline/replay/audit）**只属于 server lane**。已删除 `ElectronOperationAuditRepository`，Notification/Schedule 的 PowerSync 组合根不再注入 audit 依赖；桌面 lane 调用 W7 运维入口时 fail-closed。本 ADR 不再宣称桌面/PowerSync 具备审计表闭环。

## 3. 约束与铁律

- **禁止新增 silent success / no-op fallback**：replay/timeline 依赖缺失必须 fail-closed。
- **最小权限**：identity 只能查询/重放自己的操作；审计只能查自己的。
- **审计先行 + 原子性**：没有审计记录就没有宣称成功的 replay；Prisma lane 的 replay 状态推进与审计事实同事务。
- **五模块统一**：任何新增模块必须纳入同一 timeline/replay/audit/metrics 契约与跨模块门禁。

## 4. 后果

- 优点：跨模块同一状态投影视角、可审计且原子的运维 replay、可聚合的指标命名、发布门禁完整。
- 成本：每模块需要 ledger→timeline 映射、原子 audit 写入与指标发射；新增模块需遵循同一契约。
- 成本：W0-W6 故障矩阵需要随状态机演进持续更新，文档与代码必须一致。

## 5. 相关 ADR

- ADR-042：统一 `BusinessOperationReceipt` / `ProjectionOperation` / `LeaseClaim` 契约（本 ADR 的上游状态词典）。
- ADR-043 附属：`ADR-044-w0-w6-fault-matrix.md`（W0-W6 可枚举故障矩阵）。

## 6. 验收治理（Phase 6）

- `tools/governance/architecture-surface-audit.mjs` 的 `RELIABLE_RECEIPT_CANONICAL` 规则锁定 `BusinessOperationReceipt`/`ProjectionOperation` 唯一 canonical body（contracts），并强制 goal/reminder/notification adapters 在输出边界调用 `assertValidBusinessOperationReceipt`/`assertValidProjectionOperation`；8-state 不变量与幂等性由 `reliable-messaging-contracts.spec.ts` 及各 adapter 行为测试覆盖，不复制到 surface test。
