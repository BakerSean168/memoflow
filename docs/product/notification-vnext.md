---
tags:
  - product
  - notification
  - vnext
  - inbox
  - delivery
description: Notification vNext North Star：用户可见 Fact、Workflow 语义、Delivery Policy、可靠投递、Interaction 与 Inbox/Operations 边界
created: 2026-09-08T22:00:00+08:00
updated: 2026-09-08T22:00:00+08:00
---

# Notification vNext

## 1. 一句话定义

> **Notification = User-visible Fact + Inbox State。**  
> **Workflow = 这条 Notification 的业务语义与 channel capability。**  
> **Delivery Policy = 是否、何时、通过什么渠道呈现。**  
> **Delivery Runtime = 如何可靠地送达。**  
> **Interaction = 用户通过这条 Notification 做了什么。**

## 2. 为什么还需要继续收敛

ADR-063 已经把 MemoFlow 从“业务模块直接发通知”推进到：

```text
NotificationRequested
  -> Fact
  -> per-channel policy
  -> durable delivery
```

这条大方向已经正确并真实实施。

当前还需要解决的是第一代模型残差：

```text
Fact 聚合仍拥有 NotificationChannel[]
Template Aggregate 与主链脱节
History generic entity 基本失去真值角色
Type/Category/RelatedEntity 多套分类重叠
read/delete 仍偏 CRUD
DND 缺 timezone
product API 与 delivery ops 混合
realtime 更靠近 delivery receipt 而不是 Fact lifecycle
```

所以本轮不是重写 Notification，而是让已经正确的新架构真正成为单轨。

## 3. Product Constitution

### 3.1 Fact existence 与 Delivery success 分离

```text
Notification exists
```

不取决于：

```text
Desktop popup 是否成功
Email 是否发出
Push 是否被 DND suppress
```

### 3.2 Inbox 不是 Channel

```text
Notification Center
= Fact Read Model
```

`InApp` 只是一个实时 surface/channel，不是 Fact existence。

### 3.3 Producer 不拥有 Delivery

```text
Task / Goal / Routine
  -> NotificationRequested
```

它们不 new Desktop/Email/Push adapter。

### 3.4 Notification 不拥有 owner-domain mutation

通知里的“完成任务”“稍后提醒”最终必须回到 Task/Routine application command。

### 3.5 Device Surface 不是 cloud Fact

sound/vibration/OS permission/local DND 属于设备。

## 4. North Star Architecture

```text
Task / Goal / Routine / Account / System
                 │
                 │ durable request
                 ▼
         NotificationRequested
                 │
                 ▼
          NotificationFact
           │           │
           │           └──────────────┐
           ▼                          ▼
   Notification Inbox        NotificationWorkflowDefinition
                                      │
                                      ▼
                               DeliveryPolicy
                                      │
                  ┌───────────────────┼───────────────────┐
                  ▼                   ▼                   ▼
              Desktop               Email                Push
                  │                   │                   │
                  └──────── durable dispatch ─────────────┘
                                      │
                                      ▼
                         Receipt / Retry / DeadLetter

User action on Fact
        │
        ▼
NotificationInteraction
        │
        ▼
Typed Owner Command Router
        │
        ▼
Task / Goal / Routine Application Port
```

## 5. NotificationFact

目标：

```text
NotificationFact
├── id / identityId / idempotencyKey
├── workflowKey / topicKey?
├── content snapshot
├── tone / importance / urgency
├── subjectRef?
├── navigationIntent?
├── actionIntents[]?
├── correlationId / causationId
├── readAt?
├── archivedAt?
├── relevanceExpiresAt?
└── version / timestamps
```

不包含：

```text
channel status
worker attempts
lease
retry count
dead-letter
sound
OS permission
owner-domain business state
```

## 6. Inbox lifecycle

```text
Unread
  ↓ mark read
Read
  ↓ mark unread
Unread

Any visible state
  ↓ archive
Archived
  ↓ restore
Visible
```

Retention/Delete 是另一个维护生命周期。

`isRead` 从 `readAt` 派生。

## 7. Workflow semantics

Canonical key：

```text
task.reminder
task.missed
goal.reminder
goal.completed
routine.intervention
account.security
```

WorkflowDefinition 提供：

```text
presentation defaults
channel capabilities
preference control
DND behavior
optional render/action schemas
```

Unknown workflow 默认不能自动获得 external channel capability。

## 8. Semantic taxonomy

长期只保留清楚的层次：

```text
workflowKey
  = 为什么产生

topicKey?
  = workflow family/grouping/digest

tone
  = Neutral/Info/Success/Warning/Error
```

不继续扩展中央：

```text
NotificationCategory
RelatedEntityType
```

跨模块引用统一 `EntityRef {type,id}`。

## 9. Workflow vs Template

不把 NotificationTemplate 作为用户 Aggregate 演进。

```text
WorkflowDefinition
  owns semantic defaults/capabilities

Renderer Registry
  owns optional content/channel rendering
```

Email HTML / Push payload 是 renderer concern，不需要独立 Template CRUD product。

## 10. DeliveryPolicy

输入：

```text
WorkflowDefinition
User Preference
QuietHours
System Guard
Runtime Context
Device Capability
```

输出 per-channel Decision：

```text
enqueued
deferred
suppressed
rate_limited
disabled
unsupported
```

每个 decision 都有 reason。

## 11. Delivery Runtime

继续保护当前：

```text
NotificationDispatchOutbox
lease
claim
fencing
retry
backoff
dead-letter
replay
receipt
operation audit
```

它不再通过修改 NotificationFact child 来保存 delivery status。

## 12. DeliveryProjection

如果 UI/diagnostics 需要渠道摘要：

```text
Desktop
  decision = enqueued
  execution = delivered

Email
  decision = deferred
  retryAt = 23:00

Push
  decision = disabled_by_user
```

由 Decision + Receipt 组合，不是第三份可写真值。

## 13. NotificationInteraction

记录：

> 用户通过哪个 Notification surface 做了什么。

```text
Navigate
OwnerCommand
Archive
```

不再支持 unrestricted：

```text
ApiCall
Custom payload
```

Routine/Task/Goal 的真实 mutation 由各自 application port 执行。

## 14. Example: Task reminder

```text
TaskOccurrence 15:00
Reminder policy -30m
        ↓
Scheduler wakes 14:30
        ↓
Task handler re-reads occurrence
        ↓
NotificationRequested
  workflow = task.reminder
  subject = task-occurrence:123
        ↓
Fact created
        ↓
DeliveryPolicy
  Desktop = enqueued
  Push = disabled
        ↓
Desktop popup
```

用户点：

```text
[完成任务]
```

流程：

```text
NotificationInteraction
        ↓
Task complete command
        ↓
TaskOccurrence Completed
```

Notification 不直接改 Task DB。

## 15. Example: Routine intervention

```text
RoutineOccurrence
  active-usage threshold satisfied
        ↓
NotificationRequested / local intervention intent
        ↓
Fact (if workflow says durable inbox)
        ↓
Desktop delivery
```

操作：

```text
[已完成] [10 分钟后]
```

最终进入 Routine command，产生 RoutineInteraction/TemporaryOverride。

## 16. Example: DND

用户：

```text
Quiet Hours
23:00 - 07:00
Asia/Tokyo
```

00:30：

```text
Fact created                  YES
Inbox visible                 YES
Desktop popup                 suppressed/deferred by workflow policy
Email                         deferred if allowed
```

07:00 后是否补发由 workflow/channel policy 决定。

## 17. QuietHours

统一 Product Time：

```text
TimeZoneId
Hm
Weekday
```

禁止再用 server local `Date.getHours()` 理解用户 wall clock。

## 18. Preference vs System Guard

用户设置：

```text
Desktop on/off
Push on/off
workflow override
QuietHours
```

系统约束：

```text
anti-spam
provider quota
burst guard
retry budget
```

二者不可混成同一 RateLimit preference。

## 19. Device Surface

Desktop/Mobile 拥有：

```text
OS permission
sound
vibration
foreground/background
local DND
Focus mode
native notification
InterventionWindow
```

Notification cloud model 只表达 eligibility/presentation intent。

## 20. Product vs Operations

### Product

```text
NotificationInboxPort
list/get
read/unread
archive/restore
unread-count
preferences
```

### Operations

```text
NotificationOperationsPort
dead-letter
replay
receipt timeline
audit
worker diagnostics
```

普通产品 UI 不接触 fencing/lease/dead-letter internals。

## 21. Realtime

拆成：

```text
InboxRealtime
  Fact lifecycle

DeliveryRealtime
  device/presentation/delivery events
```

Notification Center 的实时新增不能依赖某个 channel delivered。

现有 SSE cursor/reconnect/catch-up 必须保护。

## 22. Legacy retirement map

| Legacy                               | Target                                       |
| ------------------------------------ | -------------------------------------------- |
| `Notification`                       | `NotificationFact` ubiquitous language       |
| `notificationChannels[]`             | remove from Fact                             |
| `NotificationChannel`                | DeliveryProjection compatibility then retire |
| `NotificationHistory`                | typed Interaction or delete                  |
| `NotificationTemplate`               | WorkflowDefinition + Renderer Registry       |
| `NotificationType`                   | NotificationTone                             |
| `NotificationCategory`               | workflow presentation/group metadata         |
| `RelatedEntityType`                  | EntityRef                                    |
| `isRead` persisted truth             | derive from readAt                           |
| user delete                          | archive                                      |
| `metadata.sound`                     | Device Surface                               |
| `metadata.data: unknown`             | workflow-schema data                         |
| ApiCall/Custom action                | typed OwnerCommand                           |
| DND host-local time                  | QuietHours(TimeZoneId,Hm)                    |
| Preference rateLimit mixed semantics | User Preference + System Guard               |
| one Product/Ops port                 | InboxPort + OperationsPort                   |

## 23. Protected assets

绝对保护：

```text
NotificationRequested
Fact idempotency
per-channel policy
DeliveryDecisionRecord
Fact + decision + outbox transaction
NotificationDispatchOutbox
lease/claim/fencing
retry/dead-letter/replay
receipt/ack
operations audit
PowerSync parity
Desktop capability fail-fast
SSE reconnect/cursor
correlation/causation
```

## 24. Non-goals

本轮设计不要求：

- 引入 Novu 等第二 source of truth；
- 做营销消息平台；
- 做复杂 campaign/template editor；
- 立即实现所有 external provider；
- 把 Routine/Task/Goal time semantics 搬进 Notification；
- 重写 reliable-messaging 基础设施。

## 25. 文档真值

详细决策：

- [ADR-084 — Notification Fact 与 Inbox Lifecycle](../architecture/adr/ADR-084-notification-fact-and-inbox-lifecycle.md)
- [ADR-085 — Workflow Semantics 与 Template 退役](../architecture/adr/ADR-085-notification-workflow-semantics-and-template-retirement.md)
- [ADR-086 — DeliveryPlan、Projection 与 Channel 退役](../architecture/adr/ADR-086-notification-delivery-plan-projection-and-channel-retirement.md)
- [ADR-087 — Interaction 与 Typed Actions](../architecture/adr/ADR-087-notification-interaction-and-typed-action-intents.md)
- [ADR-088 — Preference、QuietHours、Realtime 与 Operations](../architecture/adr/ADR-088-notification-preference-quiet-hours-realtime-and-operations-boundary.md)
- [Current System Map](../analysis/2026-09-08-notification-current-system-map.md)
