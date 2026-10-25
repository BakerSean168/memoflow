---
tags:
  - ops
  - runbook
  - operation-timeline
  - replay
  - audit
  - metrics
description: W7 运维手册 - 统一 operation timeline、replay 与审计的日常运维操作（server lane）
created: 2026-08-12T00:00:00+08:00
updated: 2026-08-12T00:00:00+08:00
---

# 运行手册：Operation Timeline / Replay / Audit（W7）

> 与 ADR-043 及 ADR-044-w0-w6-fault-matrix 配套。所有查询与 replay 均按 identity
> 最小权限隔离；replay 必须与审计同事务（Prisma lane）或审计先行（Knowledge）；
> timeline 查询每次请求记录 `timeline_query` 审计；审计失败一律 fail-closed。
>
> **W7 运维入口只属于 server lane**：Desktop/PowerSync lane 不提供 timeline/replay/
> audit，调用即 fail-closed（P2-1）。

## 1. 统一操作时间线

| 模块                 | Timeline 端点                                       | 说明                                                 |
| -------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| Reminder             | `GET /api/v1/reminders/operations/timeline`         | reminder occurrence 状态、失败原因、下次重试、可重放 |
| Notification         | `GET /api/v1/notifications/operations/timeline`     | notification dispatch outbox 状态                    |
| Schedule rebuild     | `GET /api/v1/schedules/operations/rebuild/timeline` | 冲突重算 outbox 状态                                 |
| Account closure      | `GET /api/v1/accounts/operations/closure/timeline`  | 账户关闭 saga 状态                                   |
| Knowledge projection | `GET /api/v1/repositories/operations/timeline`      | knowledge write-request 投影状态                     |

统一返回 `OperationTimelineEntry[]`：

```json
{
  "source": "reminder",
  "operationId": "…",
  "status": "dead_letter",
  "failureReason": "sink unavailable",
  "attempts": 3,
  "nextRetryAt": null,
  "replayable": true,
  "updatedAt": "2026-08-12T00:00:00.000Z"
}
```

状态词典：`pending / running / succeeded / skipped / failed / retryable / dead_letter / cancelled`。

**查询审计（P1-3）**：每次 timeline 查询都会写一条 `timeline_query` 审计，记录
`source`、过滤条件与结果计数；`operationId` 固定为 `*timeline-query*`（不伪造操作访问）。
**审计失败即查询失败（fail-closed）**——没有审计就不返回 timeline。

## 2. 重放（Replay）

### 2.1 何时需要重放

- 一条 operation 进入 `dead_letter` 或 `failed`，且根因已被修复（如渠道恢复、GitHub App token 刷新、外部服务恢复）。
- 参考 W0-W6 故障矩阵（`docs/architecture/adr/ADR-044-w0-w6-fault-matrix.md`）确定故障与恢复动作。

### 2.2 操作步骤

| 模块                 | Replay 端点                                                                 |
| -------------------- | --------------------------------------------------------------------------- |
| Reminder             | `POST /api/v1/reminders/operations/:id/replay`                              |
| Notification         | `POST /api/v1/notifications/dead-letters/:id/replay`                        |
| Schedule rebuild     | `POST /api/v1/schedules/operations/rebuild/:id/replay`                      |
| Account closure      | `POST /api/v1/accounts/operations/closure/:id/replay`                       |
| Knowledge projection | `POST /api/v1/repositories/knowledge-write-requests/:writeRequestId/replay` |

前置条件：

1. 调用者身份与 operation 的 `identityId` 一致（数据层强制）。
2. 重放后状态推进：Reminder/Notification → `retryable`；Schedule rebuild → `pending`；Account closure → `running`；Knowledge → `Succeeded`。
3. **原子性（P1-4）**：Reminder/Notification/Schedule/Account 的 replay 与审计在**同一事务**内完成；审计写失败整个事务回滚。Knowledge 依赖外部投影，采用审计先行：必须注入 `auditRepository`，缺依赖即 `FAIL_CLOSED`；成功或失败的 replay 结果都会写入审计。

### 2.3 故障排查

- **404/操作不存在**：检查 identity 是否匹配、operation 是否已进入终态（`succeeded` 不可 replay）。
- **不是可重放状态**：`succeeded`/`pending`/`running` 不能重放；只有 `dead_letter`/`failed` 可重放。
- **audit 缺失 / replay 返回错误**：审计写入失败，replay 整体失败——绝不允许无审计重放，也不会留下“已重放但无审计”的部分成功。
- **FAIL_CLOSED**：某依赖（`auditRepository`/`reliablePort`）缺失，或 adapter 不支持原子 replay——运维入口在 desktop lane 下即为此类。

## 3. 审计查询

`GET <module>/operations/audit`（actor-scoped，只能看到自己的审计记录）：

```json
[
  {
    "actorIdentityId": "…",
    "source": "notification",
    "operationId": "…",
    "action": "replay",
    "details": "status -> retryable",
    "createdAt": "…"
  }
]
```

共享事实表：`reliable_operation_audit_logs`（跨模块单一来源）。`action` 含 `replay` 与 `timeline_query`。

## 4. 指标与告警

统一命名（dashboard 按 `memoflow.*` 前缀聚合；`GET /metrics` 以
`memoflow_operation_metrics{metric="memoflow.<module>.outbox.<state>"} N` 暴露，
`GET /metrics/json` 返回 `operationMetrics`）：

- `memoflow.<module>.outbox.{persisted,claimed,succeeded,retried,failed,dead_letter}`
- `memoflow.<module>.worker.{completed,failed,retried,skipped}`

模块枚举：`reminder`、`notification`、`knowledge`、`schedule-rebuild`、`account-closure`。

五模块在真实 persistence/claim/retry/failure/dead-letter/worker outcome 路径发射
到共享 recorder（`patterns/operations#globalUnifiedOperationMetrics`）。告警信号
见 ADR-044-w0-w6-fault-matrix「告警信号」小节。

## 5. 变更与发布

- 新增模块必须：定义 ledger→`OperationTimelineEntry` 映射、暴露 timeline/replay/audit 端点、通过 `OperationTimelineEntrySchema.parse` 校验输出、replay 与审计同事务（或审计先行 + fail-closed）、在真实 worker 路径发射统一指标。
- 发布门禁：contracts/patterns build + ESM smoke import、governance-check 0、五模块单测/集成全绿、受影响包 typecheck + lint 0 errors、`git diff --check` 无输出。
- 禁止新增 silent success / no-op fallback。
