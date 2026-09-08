---
tags:
  - product
  - module
  - notification
description: Notification Fact、DeliveryPlan、可靠投递与跨端通知中心当前实现
created: 2026-06-02T00:00:00
updated: 2026-09-08T09:00:00+08:00
---

# Notification 模块说明

## 1. 功能定位

Notification 把“**用户应该能追溯的一条消息事实**”与“**各渠道是否、何时、如何投递**”分离。业务模块只提交 durable `NotificationRequested`；Notification 模块创建 Fact、执行 policy、生成 per-channel DeliveryPlan/attempt，并持久记录 delivery receipt。

## 2. 当前产品能力

- Notification Fact 创建、查询、未读计数、已读/全部已读、删除；
- Notification Center 与实时 In-App surface；
- 用户 channel preference、DND、rate limit 与 device capability policy；
- per-channel DeliveryPlan / DeliveryAttempt、重试与失败记录；
- Desktop native notification delivery ack；
- SSE 只广播已进入 Notification delivery 边界的实时事件；
- React/Mobile Notification list/detail/preferences 复用同一 Fact contract；
- AI 只读 `notification_unread_summary`，只读取 Notification Fact，不读取/修改 delivery worker 内部状态。

## 3. Canonical 流程

```text
Task / Goal / Routine / other producer
          |
          v
 durable NotificationRequested
          |
          v
 Notification runtime
          |
          +--> materialize Notification Fact
          |
          +--> NotificationPolicy
                 preferences / DND / rate limit / capability
          |
          +--> DeliveryPlan / channel attempt
          |
          +--> receipt / retry / failure
```

跨模块不得重新引入历史 `notification.dispatch` bypass。

## 4. SSE 与 delivery event

`notification:dispatch_in_app` 与 `notification:dispatch_desktop` 仍是合法的 **Notification-owned delivery events**，用于实时 surface / deliverer 边界；它们不代表业务模块可以绕过 `NotificationRequested -> Fact -> DeliveryPlan` 链路直接发送通知。

## 5. 可靠性规则

- Notification Fact 的 read state 与 delivery state 分离；
- 每个 channel 独立决策、独立重试；
- delivery 只有获得可验证 ack 才算成功；
- DND 可以抑制某个 delivery，但不抹掉应被用户追溯的 Fact；
- Scheduler 只负责时间触发，不拥有 Notification delivery。

## 6. 相关资产

- [Scheduling / Notification vNext](../scheduling-notification-vnext.md)
- [ADR-063](../../architecture/adr/ADR-063-notification-fact-delivery-policy-and-device-surfaces.md)
- [Notification 模块文件索引](../module-index/notification-files.md)
