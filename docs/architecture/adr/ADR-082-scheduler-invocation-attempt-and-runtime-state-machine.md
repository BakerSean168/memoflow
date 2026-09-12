---
tags:
  - adr
  - scheduler
  - execution
  - retry
  - state-machine
  - reliability
description: 将 ScheduledInvocation 当前 durable state 与 InvocationAttempt 历史事实分离，明确 runAt/nextAttemptAt、retry/dead-letter、claim/lease/fencing 和 terminal outcome 语义
created: 2026-09-08T20:45:00+08:00
updated: 2026-09-08T20:45:00+08:00
---

# ADR-082: Scheduler Invocation Attempt 与 Runtime State Machine

**状态：** 已采纳（待实施）  
**日期：** 2026-09-08  
**影响范围：** scheduler runtime、contracts、database、PowerSync、diagnostics、operations  
**修订：** ADR-081 ScheduledInvocation 的执行状态与历史事实细化  
**关联：** ADR-042、ADR-043、ADR-044、ADR-060、ADR-061、ADR-064、ADR-081、ADR-083

## 1. 决策摘要

Scheduler 将“当前 durable invocation state”和“每一次执行尝试历史”分成两个模型：

```text
ScheduledInvocation
= 当前这条 invocation 的 durable execution state

InvocationAttempt
= 一次真实 worker 执行尝试的不可混淆事实
```

`InvocationAttempt[]` 不再作为 `ScheduledInvocation` aggregate child collection hydrate。

最重要的时间语义：

```text
runAt
= 业务希望最初在什么时候唤醒

nextAttemptAt
= 技术重试下一次什么时候运行
```

两者绝不能共用一个 `nextRunAt` 字段。

## 2. 当前问题

旧 `ScheduleTask` 同时拥有：

```text
nextRunAt
lastRunAt
executionCount
lastExecutionStatus
lastExecutionDuration
consecutiveFailures
ScheduleExecution[]
```

而 `ScheduleExecution` 又有独立 table/repository。

这形成两个问题：

1. 当前状态与历史事实混在一个 aggregate；
2. `nextRunAt` 容易同时承担下一次 business schedule 与技术 retry cursor。

新 Scheduler 使用 one-shot ScheduledIntent 后，必须把这两层彻底分开。

## 3. ScheduledInvocation Runtime State

建议 canonical status：

```ts
type ScheduledInvocationStatus =
  | 'pending'
  | 'running'
  | 'retry_wait'
  | 'succeeded'
  | 'skipped'
  | 'failed'
  | 'dead_letter'
  | 'superseded';
```

语义：

| Status        | 含义                                                   |
| ------------- | ------------------------------------------------------ |
| `pending`     | desired invocation 等待首次到期/claim                  |
| `running`     | 已成功 claim，某个 worker 正在执行                     |
| `retry_wait`  | 上一次 attempt 失败且允许重试，等待 `nextAttemptAt`    |
| `succeeded`   | handler 成功完成，terminal                             |
| `skipped`     | handler 明确判定当前业务状态无需执行，terminal         |
| `failed`      | 非重试型永久失败，terminal                             |
| `dead_letter` | 重试耗尽或故障政策要求进入 dead letter，terminal       |
| `superseded`  | owner reconcile 已声明该旧 desired invocation 不再有效 |

`superseded` 是否物理保留为 row 或只写 operation/audit receipt 可在实施阶段决定，但对 diagnostics/历史语义必须可解释。

## 4. State Machine

```text
                 ┌───────────────┐
                 │    pending    │
                 └──────┬────────┘
                        │ due + claim
                        ▼
                 ┌───────────────┐
                 │    running    │
                 └──┬───┬───┬───┘
                    │   │   │
            success │   │   │ permanent failure
                    │   │   ▼
                    │   │  failed
                    │   │
                    │   └──── retryable
                    │          ▼
                    │     retry_wait
                    │          │ nextAttemptAt
                    │          └──────> running
                    │
                    ├────> skipped
                    └────> succeeded

retry_wait exhaustion / policy
        ↓
   dead_letter

owner reconcile removes stale desired key
        ↓
   superseded
```

Invalid transitions 必须 fail closed。

## 5. `runAt` 与 `nextAttemptAt`

例：

```text
runAt = 09:00:00
attempt 1 = 09:00:00, failed
retry delay = 5s
```

正确：

```text
runAt          = 09:00:00   // 不变
nextAttemptAt  = 09:00:05
status         = retry_wait
```

第二次又失败：

```text
runAt          = 09:00:00   // 仍不变
nextAttemptAt  = 09:00:15
```

这样 diagnostics 才能区分：

```text
business lateness
vs
technical retry delay
```

## 6. InvocationAttempt

目标历史模型：

```text
InvocationAttempt
│
├── id
├── identityId
├── invocationId
├── attemptNumber
│
├── timing
│   ├── startedAt
│   └── finishedAt?
│
├── outcome
│   ├── succeeded
│   ├── skipped
│   ├── retryable_failure
│   ├── permanent_failure
│   └── timeout
│
├── result?
├── failure?
│   ├── code
│   ├── message
│   └── retryable
│
├── worker/lease diagnostic metadata?
└── createdAt
```

每一次真实 handler invocation 对应一个 attempt fact。

## 7. Attempt 不是 Aggregate Child Collection

禁止：

```text
load ScheduledInvocation
+ hydrate hundreds/thousands of attempts
```

原因：

- attempt history 会增长；
- diagnostics 常按时间、状态、failure code 查询；
- runtime 执行只需要当前 invocation state；
- retention 可能与 invocation current row 不同。

因此：

```text
ScheduledInvocationRepository
InvocationAttemptRepository
```

独立。

需要展示最近历史时使用 diagnostics/read model query，而不是 aggregate child ownership。

## 8. Retry Policy

Scheduler-owned retry policy：

```text
enabled
maxRetries
initialDelayMs
maxDelayMs
backoffMultiplier
```

attempt numbering 建议：

```text
attemptNumber = 1   // first execution
retry count = attemptNumber - 1
```

避免“maxRetries=3 到底总共执行 3 次还是 4 次”歧义。

规则必须在 contract/tests 中明确：

```text
maxRetries = 3
=> 最多 1 initial + 3 retry attempts
```

若最终决定其它定义，必须全栈单一真值；不能 mapper/runtime 各自解释。

## 9. Handler Result Mapping

现有：

```text
succeeded
skipped
retryable
failed
dead_letter
```

继续作为 canonical handler boundary。

映射：

```text
handler succeeded
  -> attempt succeeded
  -> invocation succeeded

handler skipped
  -> attempt skipped
  -> invocation skipped

handler retryable
  -> attempt retryable_failure
  -> retry_wait OR dead_letter

handler failed
  -> attempt permanent_failure
  -> invocation failed

handler dead_letter
  -> attempt permanent_failure
  -> invocation dead_letter
```

## 10. Timeout

Timeout 是 technical attempt outcome，不代表 owner domain “失败”。

```text
InvocationAttempt.outcome = timeout
```

后续是否：

```text
retry_wait / dead_letter
```

由 retry policy 决定。

Scheduler 不向 Task/Goal/Routine 自动写业务 Failed 状态。

## 11. Claim / Lease / Fencing

以下可靠性资产继续保护：

### Scheduler Host Lease

决定共享 DB 下哪个 host 运行 active queue/runtime。

### Invocation Claim

在执行前对具体 invocation 做 CAS/claim，防止重复 worker 执行。

### Fencing / Claim Token

若实现存在 token/lease generation，应确保旧 worker 在 lease 丢失后不能提交新的 state transition。

重构 entity 命名不得删除这些能力。

## 12. Crash Semantics

必须显式处理：

```text
claimed -> process crash
running -> host crash
handler succeeded -> receipt write crash
retry_wait -> restart
```

目标原则：

- state transition durable；
- attempt 写入可审计；
- handler 尽可能 idempotent；
- restart 能重新发现 due/retry_wait invocation；
- duplicate execution 风险必须通过 claim + handler idempotency + business re-read 降低。

## 13. Missed-run Semantics

系统休眠/停机后发现：

```text
runAt < now
status = pending
```

Scheduler 可以立即执行该 one-shot invocation，但不得擅自解释业务“错过了所以不要做”。

是否仍然有效由 handler/owner current state 决定：

```text
Scheduler wakes handler
handler re-reads owner
owner no longer relevant -> skipped
```

## 14. Observability

Diagnostics 最少要能回答：

```text
who owns this invocation?
what schedulingKey?
what handler?
original runAt?
current status?
nextAttemptAt?
how many attempts?
last failure?
source revision?
```

而不是暴露 legacy product-like “ScheduleTask completed/paused”。

## 15. Retention

长期可采用不同 retention：

```text
ScheduledInvocation current/terminal rows
InvocationAttempt history
ReconcileOperation history
```

但 retention 不能破坏：

- active invocation correctness；
- dead-letter diagnosis；
- minimum audit evidence；
- idempotency/stable scheduling key semantics。

详细 retention policy 可后续独立 ADR。

## 16. Protected Contracts

实施必须保护：

- `ScheduledHandlerRegistration` payload validation/versioning；
- `SchedulingPort.reconcile`；
- owner-level atomicity；
- host lease；
- per-invocation claim/CAS；
- retry/backoff/timeout；
- restart/missed-run recovery；
- diagnostics read-only policy；
- operation audit/fault-injection evidence。

## 17. 删除映射

```text
ExecutionInfo.nextRunAt
  -> ScheduledInvocation.runAt / nextAttemptAt（按语义拆分）

ExecutionInfo.lastRunAt
  -> latest InvocationAttempt.startedAt

executionCount
  -> attemptCount / aggregate query

lastExecutionStatus
  -> latest attempt outcome projection

lastExecutionDuration
  -> latest attempt duration projection

consecutiveFailures
  -> runtime retry state / derived diagnostics

ScheduleExecution
  -> InvocationAttempt
```

## 18. Acceptance Model

未来实现完成后必须能证明：

1. `runAt` 在 retry 中保持不变；
2. retry 使用独立 `nextAttemptAt`；
3. 每次 handler execution 有独立 InvocationAttempt；
4. invocation load 不 hydrate attempt history；
5. terminal/retry/dead-letter transition 有确定测试；
6. host crash 后 pending/retry_wait invocation 可恢复；
7. duplicate worker 不能同时成功 claim 同一 invocation；
8. Scheduler technical failure 不自动污染 owner domain lifecycle。
