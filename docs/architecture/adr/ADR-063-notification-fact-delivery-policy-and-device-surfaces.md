---
tags:
  - adr
  - notification
  - delivery
  - preference
  - dnd
  - desktop
  - outbox
description: 区分 Notification 用户可见事实与各渠道 Delivery Attempt，统一 per-channel preference/DND/rate-limit policy 和桌面设备级覆盖
created: 2026-08-25T17:49:00+08:00
updated: 2026-09-08T20:20:00+08:00
---

# ADR-063: Notification Fact、Delivery Policy 与 Device Surface 分离

**状态：** 已采纳并实施
**日期：** 2026-08-25  
**影响范围：** notification、reminder/routine、schedule-orchestration、desktop、app-vue、contracts、database  
**关联：** ADR-004、ADR-006、ADR-042、ADR-059、ADR-060~062

## 2026-09-08 实现状态

跨模块 producer 现在提交 durable `NotificationRequested`，Notification runtime materialize Fact 后由 NotificationPolicy 决定 per-channel DeliveryPlan/attempt；DND、preference、rate limit、device capability 与 delivery receipt 均在 Notification ownership 内。历史 `notification.dispatch` bypass 被 governance 禁止。

### 2026-09-08 Routine ownership refinement

ADR-079 进一步明确：legacy `ReminderNotificationConfig` 不应继续成为 RoutineDefinition 的长期字段。Routine 只拥有 intervention/presentation intent；Notification 继续拥有 channels、DND、rate limit、delivery；Desktop/Device Surface 拥有 sound/vibration/OS permission/实际 surface。该 Routine 侧退役尚未实施，不改变本 ADR 已落地的 Notification ownership。

### 2026-09-08 Notification model convergence follow-up

ADR-084~088 继续沿用本 ADR 已实施的 `NotificationRequested -> Fact -> per-channel policy -> durable delivery` 主干，但进一步收敛内部模型：Notification 变成更纯的 `NotificationFact + Inbox lifecycle`；`NotificationChannel` 从 Fact aggregate truth 退出；`NotificationTemplate/History` 退役；workflow registry 成为 canonical semantic catalog；DND 收敛为带 `TimeZoneId/Hm` 的 QuietHours；Product Inbox 与 Delivery Operations/realtime 分离。以上均为**已采纳、待实施**，不得把本文“已实施”误解成第二次模型收敛已经完成。

## 1. 背景

MemoFlow Notification 当前已经有较完整的可靠交付结构：

- `Notification`；
- `NotificationChannel`；
- `NotificationHistory`；
- `NotificationPreference`；
- `NotificationTemplate`；
- `NotificationDispatchOutbox`；
- shared `OutboxMessage`；
- channel claim / lease / fencing / retry / dead-letter；
- SSE / InApp；
- Electron native/custom notification window 与 sound/action/navigation。

整体方向正确，但审查发现几个语义/实现断点。

### 1.1 当前 policy 只检查第一个 channel

`CreateNotificationUseCase` 当前大意为：

```ts
const channels = params.channels ?? [InApp];
policy.shouldSend({ channel: channels[0], ... });

for (const channel of channels) {
  create NotificationChannel / outbox;
}
```

因此如果：

```text
InApp = allowed
Email = disabled
```

只要第一个 `InApp` 通过，后面的 Email 仍可能被 enqueue。

### 1.2 DND / RateLimit 定义了但主路径没有完整接入

`NotificationPolicy` 已经支持 preference、DoNotDisturbConfig、RateLimit、usage counts，但当前 create path 没有把这些上下文完整传进去。

因此文档说“NotificationPolicy 会检查 DND/频率限制”并不能代表主路径真实行为。

### 1.3 Notification 事实与 Delivery 成败混在一起

一个业务事件可能应该出现在用户通知中心，但不一定应该：

- 弹桌面窗；
- Push；
- Email；
- 在 DND 时立即播放声音。

如果“某个 channel 被抑制”直接等价于“不创建 Notification”，通知中心就会丢失用户可追溯事实。

## 2. 决策

正式拆成三层：

```text
Business Event / NotificationRequested
          ↓
Notification Fact
  用户通知中心中的可见事实
          ↓
Delivery Planner / Policy
  为每个 channel 独立决定
          ↓
Delivery Attempt / Outbox
     ├─ InApp
     ├─ Desktop
     ├─ Push
     └─ Email
          ↓
Device Surface Override
  OS permission / local DND / current foreground context
```

原则：

> **Notification 是否存在，与某一个 channel 是否立即送达，是两个不同问题。**

## 3. Notification Fact

Notification 表示：

> “系统有一条对用户有意义、可在 Inbox/Notification Center 中追溯的消息事实。”

它拥有：

- identityId；
- workflow/topic/category；
- title/content or render data；
- related entity；
- navigation intent；
- importance/urgency；
- created/read/archived/expired；
- correlation / causation；
- notification idempotency key。

它不应该以 `Email sent = true` 来决定自己是否存在。

部分完全静默的内部 operation 可以选择不创建 Notification；这是业务 workflow 决策，而不是 channel policy 的副作用。

## 4. Delivery Plan

每条 Notification 根据 workflow default + user preference + runtime policy 产生：

```ts
interface NotificationDeliveryPlan {
  notificationId: string;
  channels: readonly ChannelDeliveryDecision[];
}

interface ChannelDeliveryDecision {
  channel: NotificationChannelType;
  outcome:
    | 'deliver_now'
    | 'defer'
    | 'suppressed_dnd'
    | 'disabled_by_workflow'
    | 'disabled_by_user'
    | 'rate_limited'
    | 'unavailable';
  retryAt?: Instant;
  reason?: string;
}
```

每个 channel **独立评估**。

禁止再出现：

```text
check channels[0]
then enqueue all channels
```

## 5. Preference 层次

参考 Novu 的 workflow/global/per-workflow channel preference 思路，MemoFlow 采用类似但保留自己的产品语言：

```text
1. Workflow capability/default
2. User global channel preference
3. User workflow/topic-specific preference
4. Runtime policy (DND / rate limit / context)
5. Device local capability/override
```

### 5.1 Workflow 层

例如：

```text
security.account-login
  InApp = enabled + readOnly
  Email = enabled + readOnly

routine.eye-break
  InApp = enabled
  Desktop = enabled
  Email = unavailable
```

业务 workflow 决定哪些 channel 合理，不让用户配置根本不存在的渠道。

### 5.2 User Global

例如：

```text
Push globally off
Email globally on
```

### 5.3 Workflow-specific User Preference

例如：

```text
Goal deadline -> InApp + Push
Routine drink-water -> Desktop only
```

### 5.4 Critical / Read-only

安全、账号、数据风险等少数关键 workflow 可以声明不可完全关闭。

这类能力必须非常克制，不用于普通 productivity 提醒。

## 6. DND 语义

DND 不等于“删除消息”。

根据 workflow policy，DND 可以产生不同结果：

```text
InApp fact:     仍创建
Desktop popup:  suppressed
Push:           suppressed or defer
Critical:       bypass if workflow explicitly allows
```

DND 结束后是否补发由 workflow/channel policy 决定：

- ephemeral reminder：通常不补一个过期弹窗；
- durable important notification：可以 defer；
- notification center fact：一直可见到 expiry/archive。

## 7. Rate Limit 语义

Rate limit 也必须是 per workflow/channel，而不是全局粗暴丢弃。

至少区分：

- same workflow burst；
- same entity burst；
- same channel capacity；
- global anti-spam guard。

结果应记录为 `rate_limited / deferred`，并可观测。

后续可增加 digest/coalescing，但不在本 ADR 强制实现复杂通知编排器。

## 8. NotificationRequested Contract

业务模块不应直接选择所有底层 deliverer。

目标输入：

```ts
interface NotificationRequested {
  idempotencyKey: string;
  identityId: string;
  workflowKey: string;
  relatedEntity?: {
    type: string;
    id: string;
  };
  content: NotificationContentInput;
  suggestedChannels?: readonly NotificationChannelType[];
  importance?: NotificationImportance;
  urgency?: NotificationUrgency;
  navigationIntent?: NavigationIntent;
  correlationId?: string;
  causationId?: string;
}
```

`suggestedChannels` 只是业务偏好/默认输入，最终 channel plan 仍由 Notification Policy 决定。

Task/Goal/Routine handler 不需要 new Email/Push adapter。

## 9. Delivery 状态

建议将 channel 结果明确到：

```text
planned
queued
delivering
delivered
suppressed
deferred
failed
dead_letter
```

并在 `suppressed` / `deferred` 上记录 reason code。

用户级 Notification read/unread 与 channel delivery status 独立。

## 10. Desktop Device Surface

Electron Desktop 还有额外本地条件：

- OS notification permission；
- app foreground/background；
- local DND；
- Focus Session / Routine Protocol；
- custom `InterventionWindow`；
- `FocusWindow`；
- sound availability。

层次必须是：

```text
Server/Product Delivery Policy
        ↓ says Desktop channel eligible
Desktop Delivery Adapter
        ↓
Device Capability + Local Override
        ↓
Native Notification / InterventionWindow / silent Inbox
```

Desktop local DND 不应该修改服务器端业务 Notification truth。

它只改变这一设备的 presentation outcome，并回传可选 delivery receipt。

## 11. 与 Routine Coach 的关系

Routine Coach 产生的是：

```text
Routine Occurrence
       ↓
Intervention Decision
       ↓ optional
NotificationRequested / Local Presentation Intent
```

不是所有 routine occurrence 都必须创建普通 Notification：

- 小型实时 break intervention 可以只形成短生命周期 Intervention Surface；
- 需要历史追踪或跨设备提示时可形成 Notification；
- 用户响应仍回到 Routine occurrence/interaction，而不是把 Notification 当成习惯完成真相。

## 12. 与 Scheduler 的关系

Scheduler 不负责 Notification Policy。

目标链：

```text
Scheduler
  ↓ wakes domain handler
Domain Handler
  ↓ writes NotificationRequested outbox
Notification Runtime
  ↓ owns fact + delivery planning
```

删除 `ScheduleExecutionRouter.finalizeExecution(... notificationPort ...)` 这一中央耦合是 ADR-061/062 迁移的一部分。

## 13. 可靠投递

现有 `NotificationDispatchOutbox` 的以下能力必须保留：

- per-channel idempotency；
- lease/fencing；
- retry；
- dead-letter；
- attempt/history；
- replay observability。

本 ADR 不要求把成熟 outbox 换成第三方系统。

## 14. OSS 借鉴

### Novu

重点学习：

- Workflow 是通知 delivery blueprint；
- workflow channel preference；
- subscriber global preference；
- subscriber per-workflow preference；
- critical/read-only workflow；
- Inbox 与 Activity Feed；
- channel-specific steps。

MemoFlow 不直接引入 Novu 作为第二 Notification source of truth；优先借业务语义和 workflow/preference 分层。

### Vikunja

学习其简单的 Notification abstraction：业务 notification 可独立渲染到 mail/database，并允许测试 Fake/AssertSent；说明“业务通知意图”与实际 channel adapter 可以保持很薄。

## 15. 不采用的方案

### 15.1 Notification 创建前只做一次综合 allow/deny

不采用。多渠道必须逐 channel 决策。

### 15.2 DND 时完全不创建任何通知记录

不采用为默认规则。会让通知中心丢失事实；只有 workflow 明确声明 ephemeral 才可不落 Inbox。

### 15.3 Desktop DND 成为云端统一业务配置的替代品

不采用。设备 override 和账号级 policy 是不同层。

### 15.4 Scheduler 直接调用 channel deliverer

不采用。Scheduler 与 Notification policy 必须解耦。

## 16. 迁移优先级

P0：

- 修复 per-channel policy bug；
- 把 DND/rate-limit 接入真实 create/delivery path；
- 增加 suppressed/deferred observability。

P1：

- 引入 workflow/topic key；
- 明确 Notification Fact 与 DeliveryPlan；
- 将 Scheduler execution 产生 Notification 的逻辑改为 durable `NotificationRequested`。

P2：

- Preferences UI 按 global/workflow/channel 分层；
- Desktop device receipt；
- digest/coalescing 按真实需求再做。

## 17. 验收标准

- 每个 channel 独立经过 policy；
- DND/rate-limit 在生产主路径真实生效；
- Notification read/unread 与 channel delivery state 分离；
- suppressed/deferred 有 reason 和可观测记录；
- Desktop local override 不修改 cloud Notification truth；
- Scheduler 不再直接知道 NotificationPort；
- existing outbox retry/lease/dead-letter 行为不退化。
