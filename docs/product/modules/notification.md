---
tags:
  - product
  - module
  - notification
description: Notification Fact、Workflow、DeliveryPolicy、可靠投递与 Notification Center 当前实现及 vNext 收敛边界
created: 2026-06-02T00:00:00
updated: 2026-09-08T22:00:00+08:00
---

# Notification 模块说明

## 1. 功能定位

Notification 把“**用户应该能追溯的一条消息事实**”与“**各渠道是否、何时、如何投递**”分离。

当前已经真实落地的 canonical producer path：

```text
Task / Goal / Routine / other producer
          ↓
 durable NotificationRequested
          ↓
 Notification runtime
          ↓
 Notification Fact
          ↓
 per-channel NotificationPolicy
          ↓
 DeliveryDecision + DispatchOutbox
          ↓
 reliable delivery receipt / retry / dead-letter
```

业务模块不得重新引入历史 `notification.dispatch` bypass，也不得直接 new Email/Push/Desktop deliverer。

## 2. 当前真实能力

- Notification Fact 创建、查询、未读计数、已读/全部已读、删除；
- Notification Center、Bell、Drawer 与 realtime surface；
- durable `NotificationRequested` 跨模块信封；
- `(identityId,idempotencyKey)` Fact 幂等 fence；
- WorkflowCatalog、global/workflow channel preference；
- per-channel DND / rate-limit / capability policy；
- `NotificationDeliveryDecisionRecord`；
- `NotificationDispatchOutbox`；
- lease / claim / fencing / retry / dead-letter / replay；
- Desktop native delivery ack 与 capability fail-fast；
- SSE cursor/reconnect/catch-up；
- Prisma / PowerSync 两条可靠持久化 lane；
- operations receipt/timeline/audit。

## 3. 2026-09-08 vNext Model Convergence

ADR-084~088 已冻结下一阶段 North Star，但尚未实施。

目标：

```text
NotificationFact
+ InboxLifecycle

NotificationWorkflowDefinition

NotificationDeliveryPlan
+ DeliveryProjection
+ Reliable Delivery Runtime

NotificationInteraction
+ typed ActionIntent

NotificationPreference
+ QuietHours
+ SystemDeliveryGuard

InboxRealtime
vs
DeliveryRealtime / Device Surface
```

完整设计见 [Notification vNext](../notification-vnext.md)。

## 4. 当前仍存在的模型残差

当前代码仍有：

```text
Notification.notificationChannels[]
NotificationChannel entity
NotificationHistory generic entity/table
NotificationTemplate aggregate/repository/service/table
NotificationType tone+semantics 混合
NotificationCategory central enum
RelatedEntityType central enum
isRead + readAt dual truth
user delete = deletedAt
DND host-local Date time
Preference rateLimit user/system mixed semantics
Product + Ops one ApplicationPort
```

这些不能因为 ADR 已冻结就当作已经删除。详见 [Notification Current System Map](../../analysis/2026-09-08-notification-current-system-map.md)。

## 5. North Star ownership

```text
NotificationFact
= 用户可追溯的消息事实 + Inbox lifecycle

WorkflowDefinition
= 为什么产生 + 默认展示 + channel capability

DeliveryPolicy
= 某个 channel 是否/何时可以呈现

Reliable Delivery Runtime
= 如何可靠投递

NotificationInteraction
= 用户通过 notification surface 发起了什么

Owner Domain
= Task/Goal/Routine 最终业务 state transition

Device Surface
= sound/vibration/OS permission/local DND/native window
```

## 6. Product rules

- Fact existence 不由某个 channel delivery success 决定；
- Notification Center = Fact read model，不等于 `InApp` channel；
- DND 可以 suppress/defer delivery，但不默认删除 Fact；
- read/unread 与 delivery state 独立；
- 用户普通删除长期收敛为 archive；
- Fact 创建后业务内容原则上 immutable snapshot；
- Notification action 不绕过 owner application port；
- 未注册 workflow 不应自动获得 external channel capability；
- sound/vibration 不属于 cloud Fact。

## 7. 可靠性保护资产

后续重构必须保护：

```text
NotificationRequested
Fact idempotency
Fact + DeliveryDecision + dispatch transactional materialization
per-channel policy
lease/claim/fencing
retry/dead-letter/replay
receipt/ack
PowerSync parity
SSE reconnect/cursor
correlation/causation
operations audit
```

## 8. 相关文档

- [Notification vNext](../notification-vnext.md)
- [Notification Current System Map](../../analysis/2026-09-08-notification-current-system-map.md)
- [ADR-063](../../architecture/adr/ADR-063-notification-fact-delivery-policy-and-device-surfaces.md)
- [ADR-084](../../architecture/adr/ADR-084-notification-fact-and-inbox-lifecycle.md)
- [ADR-085](../../architecture/adr/ADR-085-notification-workflow-semantics-and-template-retirement.md)
- [ADR-086](../../architecture/adr/ADR-086-notification-delivery-plan-projection-and-channel-retirement.md)
- [ADR-087](../../architecture/adr/ADR-087-notification-interaction-and-typed-action-intents.md)
- [ADR-088](../../architecture/adr/ADR-088-notification-preference-quiet-hours-realtime-and-operations-boundary.md)
- [Notification 模块文件索引](../module-index/notification-files.md)
