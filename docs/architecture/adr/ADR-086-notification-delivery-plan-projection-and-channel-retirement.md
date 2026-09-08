---
tags:
  - adr
  - notification
  - delivery
  - outbox
  - projection
description: 将 NotificationChannel 从 Fact 聚合子实体降为 delivery projection，以 DeliveryDecision + durable outbox/receipt 作为唯一政策与执行事实
created: 2026-09-08T22:00:00+08:00
updated: 2026-09-08T22:00:00+08:00
---

# ADR-086: Notification DeliveryPlan、Projection 与 Legacy Channel 退役

**状态：** 已采纳（待实施）  
**日期：** 2026-09-08  
**影响范围：** notification、reliable-messaging、contracts、database、PowerSync、desktop、api  
**关联：** ADR-063、ADR-084、ADR-085、ADR-087~088

## 1. 决策摘要

Notification delivery 的长期真值分成两层：

```text
Policy Truth
= NotificationDeliveryDecision / DeliveryPlan

Execution Truth
= NotificationDispatchOutbox + durable receipt / attempt history
```

当前 `NotificationChannel` 不再作为 NotificationFact 聚合子实体或第三份 delivery truth；它应降为 compatibility/read projection，并在完成 parity 后退役。

## 2. 当前三套 delivery truth

当前系统同时有：

```text
NotificationDeliveryDecisionRecord
NotificationChannel
NotificationDispatchOutbox + BusinessOperationReceipt
```

它们分别在回答：

```text
Decision Record
  为什么这个 channel 被允许/抑制/延迟？

NotificationChannel
  Pending/Sent/Delivered/Failed？

Outbox/Receipt
  worker 到底执行了几次、是否 retry/dead-letter、ack 是什么？
```

第一与第三层具有清晰不同职责；中间 `NotificationChannel` 与两者高度重叠。

## 3. 当前 `NotificationChannel` 的模型问题

它拥有：

```text
channelType
status
recipient
sendAttempts
maxRetries
error
response
sentAt
failedAt
```

但 runtime 的可靠执行事实实际上已经由 outbox/receipt 拥有。

同时 mapper 对 channel 的部分时间字段不能完整恢复，DTO 中又存在序列化时临时生成 createdAt/updatedAt 的历史残差，证明它并不是稳定业务真值。

## 4. DeliveryPlan

DeliveryPlan 表示：

> 在 Notification Fact 已成立以后，依据 workflow capability、用户 preference、QuietHours、rate/system policy 和 runtime context，对每个 channel 得出的政策决策。

目标：

```ts
interface NotificationDeliveryPlan {
  notificationId: NotificationId;
  identityId: IdentityId;
  workflowKey: string;
  evaluatedAt: Instant;
  decisions: readonly NotificationDeliveryDecision[];
}

interface NotificationDeliveryDecision {
  channel: NotificationChannelType;
  outcome: 'enqueued' | 'suppressed' | 'deferred' | 'rate_limited' | 'disabled' | 'unsupported';
  reason: string;
  preferenceSource?: string;
  retryAt?: Instant | null;
}
```

DeliveryPlan 不记录 worker attempt。

## 5. Reliable delivery execution

执行事实继续由成熟可靠性资产负责：

```text
NotificationDispatchOutbox
├── operationId
├── notificationId
├── channel
├── idempotencyKey
├── status
├── claim/lease/fencing
├── nextRetryAt
├── deadLetterAt
└── payload snapshot

BusinessOperationReceipt / attempt history
├── attempts
├── outcome
├── error
├── delivery ack
└── finishedAt
```

这些能力必须保护：

- per-channel idempotency；
- lease/claim；
- fencing；
- retry/backoff；
- dead-letter；
- replay；
- durable ack；
- operation audit。

本 ADR 不重写 reliable messaging runtime。

## 6. DeliveryProjection

产品或 diagnostics 如果需要“这个渠道现在怎么样”，由 read projection 组合：

```ts
interface NotificationDeliveryProjection {
  notificationId: string;
  channel: NotificationChannelType;

  decision: NotificationDeliveryDecisionDTO;

  execution?: {
    status:
      | 'not_enqueued'
      | 'queued'
      | 'delivering'
      | 'delivered'
      | 'retry_wait'
      | 'failed'
      | 'dead_letter';
    attemptCount: number;
    lastAttemptAt?: Instant;
    deliveredAt?: Instant;
    lastError?: string;
  };
}
```

Projection 可以随可靠执行变化，而不修改 NotificationFact revision。

## 7. Notification Aggregate 不再拥有 channels

目标：

```diff
NotificationFact
- notificationChannels[]
```

Repository 不再需要：

```text
includeChildren
findChannelsByStatus
save aggregate + delete/upsert nested channel entities
```

channel worker 不通过修改 NotificationFact 来记录执行状态。

## 8. Worker 写入边界

当前 runtime 在 delivery 成功/失败后，还会 hydrate Notification aggregate，查找 channel child，再 `repository.save(notification)`。

目标：

```text
worker claim dispatch
    ↓
channel deliverer
    ↓
durable receipt update
    ↓
projection/diagnostic update（若需要）
```

不再：

```text
worker
  -> mutate Notification aggregate child
  -> save Notification again
```

Fact 与 worker lifecycle 完全解耦。

## 9. `recipient`

Recipient 不应该成为所有 channel 通用的一个模糊 string。

长期由 channel dispatch payload 明确表达：

```text
Email -> address
Push -> device/subscription target
Desktop -> identity/device context
Webhook -> endpoint key
```

Notification Fact 只拥有 identity/subject，不拥有 channel recipient。

## 10. Deferred delivery

`Deferred` 属于 policy decision：

```text
DND active
→ decision = deferred
→ retryAt = quiet-hours end
```

durable runtime 把该 dispatch 初始化为可在 retryAt 后领取的状态。

注意：

```text
policy deferred
≠
worker failed retry
```

两者必须区分 reason/metrics。

## 11. Suppressed / Disabled / Unsupported

这些 decision 不应创建伪失败 attempt：

```text
suppressed
  policy intentionally did not deliver

disabled
  user/workflow intentionally disabled

unsupported
  workflow/channel capability 不存在
```

因此它们只需要 DeliveryDecisionRecord，不需要 dispatch outbox。

## 12. Delivery status naming

产品 projection 与可靠 operation receipt 可以有不同粒度，但不得互相冒充。

建议：

```text
Policy:
enqueued / deferred / suppressed / disabled / unsupported / rate_limited

Execution:
pending / claimed / retryable / succeeded / dead_letter

Product projection:
queued / delivering / retry_wait / delivered / dead_letter
```

## 13. InApp/Realtime surface

Notification Center 本身不等于 channel。

当前 `InApp` channel 长期应明确为实时 surface，例如：

```text
AppRealtime
或 InAppToast
```

是否改名可单独迁移，但语义必须先固定：

```text
Inbox Fact existence
!=
AppRealtime delivery success
```

## 14. PowerSync / Offline

Desktop lane 必须保持和 Prisma 同样的边界：

- Fact durable；
- DeliveryDecision durable；
- dispatch outbox durable；
- receipt/retry durable；
- 不额外创造 SQLite-only NotificationChannel truth。

迁移时必须提供旧 channel row 到 projection 的兼容读取窗口，直到所有 consumer 已切换。

## 15. Rate-limit usage counting

当前 usage 通过 `NotificationChannel.count` 估算同 workflow/channel 的发送量。

当 Channel 退役后应改为基于：

```text
DeliveryDecision(outcome enqueued/deferred)
或
Dispatch/Receipt
```

具体统计口径必须固定：

- 计划量？
- 实际 attempt？
- delivered 成功量？

推荐系统 anti-spam 以“计划进入 delivery pipeline 的量”为主要 guard，避免 delivery provider 故障导致无限重试不受控；retry 另有 runtime retry budget。

## 16. Protected contracts

- ADR-063 per-channel independent policy；
- existing NotificationDispatchOutbox；
- shared reliable operation port；
- replay/audit/dead-letter；
- native Desktop ack；
- Prisma/PowerSync parity；
- Fact idempotency；
- same transaction: Fact + DeliveryDecision + dispatch intent。

## 17. Migration outline（未来实施）

1. characterization：Decision/Channel/Outbox 三层当前行为；
2. 定义 DeliveryProjection contract；
3. 查询/UI 从 nested channel DTO 切 projection；
4. worker 只写 receipt，不 mutate Fact aggregate child；
5. repository 移除 nested channel save；
6. rate-limit usage 切新事实源；
7. Prisma/PowerSync 删除 NotificationChannel runtime truth；
8. 删除 NotificationChannel domain/entity/contracts；
9. anti-resurrection governance：禁止 Fact 再出现 delivery child state。

## 18. 验收标准（未来实施）

- NotificationFact state 不包含 channel execution state；
- 每个 delivery outcome 可以由 Decision + Receipt 唯一解释；
- worker delivery success/failure 不 bump Fact version；
- DND suppress 不产生 failed attempt；
- retry/dead-letter/replay 行为无退化；
- Prisma 与 PowerSync 无第三份 channel truth；
- NotificationChannel 删除后所有诊断仍可回答渠道投递状态。
