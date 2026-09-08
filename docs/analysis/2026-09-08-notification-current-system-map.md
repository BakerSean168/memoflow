---
tags:
  - analysis
  - notification
  - current-system
  - vnext
description: Notification 当前 Fact/Workflow/Channel/Outbox/Preference/Template/Realtime 真值地图及向 ADR-084~088 目标模型的迁移基线
created: 2026-09-08T22:00:00+08:00
updated: 2026-09-08T22:00:00+08:00
---

# Notification Current System Map — 2026-09-08

## 1. 目的

本文只记录 **2026-09-08 当前代码真值** 与已经冻结的目标差异。

它解决两个问题：

1. 防止把 ADR-063 已经实现的成熟可靠性能力误判为“全部需要重写”；
2. 防止把 ADR-084~088 的 North Star 误写成“当前代码已经完成”。

文档冲突时仍以当前代码、schema、tests 为事实来源。

## 2. Executive snapshot

当前 Notification 已经真实具备：

```text
Business producer
  -> durable NotificationRequested
  -> Notification runtime
  -> Notification Fact
  -> per-channel NotificationPolicy
  -> DeliveryDecisionRecord
  -> NotificationDispatchOutbox
  -> lease/claim/fencing/retry/dead-letter
  -> delivery receipt/ack
```

这条主干是 **成熟资产，应保护**。

仍存在的第一代/过渡模型：

```text
Notification Aggregate owns NotificationChannel[]
NotificationHistory generic entity/table
NotificationTemplate Aggregate + repository/service/table
NotificationType mixes tone + semantics
NotificationCategory central enum
RelatedEntityType central enum
isRead + readAt dual truth
user delete = deletedAt
DND uses host-local Date clock
Preference mixes user choice + rate guard
Product + Ops share one ApplicationPort
SSE primarily follows delivery success
```

## 3. Current package map

```text
packages/contracts/src/modules/notification
packages/notification
packages/database/prisma/schema/notification.prisma
packages/app-vue/src/modules/notification
apps/mobile notification screens
apps/api notification composition
apps/desktop notification composition/surface
reliable-messaging / operations integration
```

## 4. Current `Notification` Aggregate

Source:

```text
packages/notification/src/server/domain/aggregates/notification.ts
```

Current state：

```text
Notification
├── id
├── identityId
├── workflowKey
├── topic
├── idempotencyKey
├── title
├── content
├── type
├── category
├── importance
├── urgency
├── relatedEntityType?
├── relatedEntityId?
├── navigationIntent?
├── correlationId?
├── causationId?
├── isRead
├── readAt?
├── actions?
├── metadata?
├── expiresAt?
├── version
├── deletedAt?
├── timestamps
└── notificationChannels[]
```

Already-correct semantics：

- durable user-visible Fact；
- Fact-level `(identityId,idempotencyKey)` unique fence；
- read state 与 delivery status 在注释/ADR 上已明确分离；
- causality fields 已存在；
- navigation intent 已显式建模。

Residuals：

- `notificationChannels[]` 仍是 aggregate child；
- `isRead + readAt` 双真值；
- Fact 可通过 update use case 修改业务内容；
- `deletedAt` 同时承担产品删除/维护删除语义。

## 5. Current create path

Source：

```text
packages/notification/src/server/application/use-cases/commands/create-notification.use-case.ts
```

Current flow：

```text
resolve workflow
    ↓
load NotificationPreference
    ↓
Notification.create Fact
    ↓
for each requested channel
  NotificationPolicy.evaluate
    ↓
  persist DeliveryDecision
    ↓
  if eligible:
    create NotificationChannel child
    create NotificationDispatchOutbox
    ↓
repository.save(Fact + child + decisions + outbox)
```

Important current fact：

ADR-063 最初记录的 “only evaluate channels[0]” 已经不再是当前主路径；当前 use case 已经逐 channel evaluation。

## 6. `NotificationRequested` integration seam

Source：

```text
packages/contracts/src/modules/notification/integration/notification-requested.ts
```

Current durable envelope：

```text
identityId
source
occurrenceKey
idempotencyKey
workflowKey
topic?
relatedEntity { type:string,id:string }?
content { title,content,type?,category? }
suggestedChannels?
importance?
urgency?
navigationIntent?
correlationId?
causationId?
expiresAt?
```

Strengths：

- durable shared outbox；
- producer 不触达 deliverer；
- idempotency rule 与 reliable messaging 对齐；
- Prisma + PowerSync writer 都存在；
- Task/Goal/Routine/Scheduler handler 已通过该 seam 集成。

Residual mismatch：

`relatedEntity.type` 已是 open string，但 materialization 进入旧 aggregate 时仍 cast 到 closed `RelatedEntityType`。

## 7. Current WorkflowCatalog

Source：

```text
packages/notification/src/server/domain/services/notification-workflow-catalog.ts
```

Current capability：

```text
workflowKey
topic
channel supported
enabledByDefault
preferenceControl
dndBehavior
```

Strengths：

- per-workflow capability；
- read-only workflow allowlist；
- DND behavior per channel；
- user preference layer already decoupled from workflow default。

Residual：

未知 workflow fallback 会给 generic channels：

```text
InApp / Desktop / Email / Push / Sms / Webhook
```

默认 capability，长期过于 permissive。

## 8. Current semantic taxonomy

### 8.1 `NotificationType`

```text
Info
Success
Warning
Error
Reminder
System
Social
```

问题：presentation tone 与 semantic category 混合。

### 8.2 `NotificationCategory`

```text
Task
Goal
Schedule
Reminder
Account
System
Other
```

问题：中央枚举无法自然表达 Routine/Knowledge/Wallet 等 future bounded contexts。

### 8.3 `RelatedEntityType`

```text
Task
Goal
Schedule
Reminder
```

问题：与 `NotificationRequested.relatedEntity.type: string` 已产生新旧 contract mismatch。

### 8.4 `topic`

当前存在 query/presentation/workflow default 使用，但尚未证明有足够强的 subscription/digest 产品语义；后续需要 consumer inventory 决定保留为 `topicKey` 还是删除。

## 9. Current `NotificationChannel`

Source：

```text
packages/notification/src/server/domain/entities/notification-channel.ts
```

Current state：

```text
notificationId
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

Current status：

```text
Pending
Sent
Delivered
Failed
Cancelled
```

Issue：

它与以下两套真值重叠：

```text
NotificationDeliveryDecisionRecord
NotificationDispatchOutbox / BusinessOperationReceipt
```

Mapper 还存在部分时间字段无法完整 hydrate 的残差，说明它更适合作为 compatibility projection，而非长期 delivery truth。

## 10. Current DeliveryDecisionRecord

Prisma：

```text
notification_delivery_decisions
```

Unique：

```text
(notificationId, channel)
```

Stores：

```text
outcome
reason
preferenceSource
retryAt
```

这正是长期 Policy Truth，应保留。

## 11. Current durable dispatch

Prisma：

```text
notification_dispatch_outbox
```

Current fields include：

```text
notificationId
source
occurrenceKey
channel
payloadJson
idempotencyKey
status
attempt
ownerToken
claimId
fencingToken
leaseExpiresAt
lastHeartbeatAt
lastError
nextRetryAt
deadLetterAt
correlationId
causationId
attemptsHistoryJson
finishedAt
```

这是成熟的 reliable execution asset，应保护。

## 12. Current runtime behavior

Source：

```text
packages/notification/src/server/infrastructure/runtime/notification.runtime.ts
```

Runtime priority：

```text
1. claim/process NotificationDispatchOutbox
2. consume notification.requested shared outbox
3. recover missing channel response projection from durable ack
```

Strengths：

- fail-fast when reliable adapter missing；
- lease/claim/fencing；
- durable receipt before SSE；
- retryable vs dead-letter mutually exclusive；
- capability probe/fail-fast；
- NotificationRequested consumer reuses canonical materialization use case。

Residual：

成功/失败后仍会 mutate `NotificationChannel` child 再保存 Notification aggregate。

## 13. Current `NotificationHistory`

Source：

```text
packages/notification/src/server/domain/entities/notification-history.ts
```

Shape：

```text
action: string
details: unknown
createdAt
```

Repository include preset 仍会加载 history，但当前 `NotificationState` 不包含 history collection。

判断：

> 高置信 legacy residue。

后续 typed user interaction 由 ADR-087 替代；delivery/audit/history 则已有各自真值。

## 14. Current `NotificationTemplate`

Current full stack：

```text
NotificationTemplate Aggregate
NotificationTemplateConfig VO
Template repository
Template domain service
Prisma repository
PowerSync repository
notification_templates table
```

Current config：

```text
base template
channel config
emailTemplate
pushTemplate
```

但 canonical `NotificationRequested -> CreateNotificationUseCase` 主链不依赖它。

Current domain event 还存在：

```text
NotificationTemplate has no identityId
-> use template id as fallback identityId
```

判断：

> 不继续演进为产品 Aggregate；按 ADR-085 迁移能力后退役。

## 15. Current Preference

Current state：

```text
globalChannels
workflowOverrides
doNotDisturb
rateLimit
```

Already-correct：

- user global + workflow-specific layering；
- one preference document per identity；
- Prisma/PowerSync parity。

Residual：

### DND

`HH:mm + daysOfWeek` 用 JS `Date.getHours/getDay` 解释宿主 local time，缺少 TimeZoneId。

### RateLimit

用户 preference 和系统 anti-spam guard 语义混合。

## 16. Current user/API model

Product routes currently include：

```text
create
list/get
update
delete
mark read
batch read/delete
cleanup
preferences
unread-count
```

同一 API module 还包含 Ops：

```text
dead-letters
replay
receipts
operations/timeline
operations/audit
```

这形成 Product/Operations seam 混合。

## 17. Current realtime

SSE current strengths：

- auth identity scoping；
- Last-Event-ID / cursor；
- subscribe-before-query 防 window loss；
- buffered live events；
- composite cursor catch-up；
- pagination beyond 100 backlog。

但 realtime event 主要从 delivery success receipt 广播，因此 Inbox Fact lifecycle 与 Delivery realtime 尚未彻底分离。

## 18. Current UI mismatch

`NotificationItem.vue` 当前 type icon map 使用：

```text
SYSTEM
TASK
GOAL
REMINDER
SCHEDULE
```

但 contract `NotificationType` 是：

```text
Info
Success
Warning
Error
Reminder
System
Social
```

说明 UI 部分仍把 type 当 category 使用，是 taxonomy 不纯导致的真实 drift。

## 19. Current metadata/actions

Metadata：

```text
icon
image
color
sound
badge
data: unknown
```

Actions：

```text
Navigate
ApiCall
Dismiss
Custom
payload: unknown
```

Current UI 主要使用 click navigation / read / delete，并没有完整的 typed action execution product path。

目标见 ADR-087：

- `sound` -> Device Surface；
- `data: unknown` -> schema-validated workflow payload；
- ApiCall/Custom -> typed OwnerCommand/Navigation。

## 20. Current-to-target matrix

| Current                  | Status             | Target                                          |
| ------------------------ | ------------------ | ----------------------------------------------- |
| `NotificationRequested`  | protect            | keep canonical producer seam                    |
| `Notification`           | converge           | `NotificationFact`                              |
| `isRead + readAt`        | duplicate          | `readAt` truth + derived isRead                 |
| user delete              | mixed              | archive/restore                                 |
| `NotificationChannel[]`  | legacy third truth | DeliveryProjection                              |
| `DeliveryDecisionRecord` | protect            | Policy Truth                                    |
| DispatchOutbox/Receipt   | protect            | Execution Truth                                 |
| `NotificationHistory`    | legacy             | typed NotificationInteraction or delete         |
| `NotificationTemplate`   | legacy aggregate   | WorkflowDefinition + renderer                   |
| `NotificationType`       | mixed              | NotificationTone                                |
| `NotificationCategory`   | central enum       | workflow group/presentation metadata            |
| `RelatedEntityType`      | central enum       | open EntityRef                                  |
| WorkflowCatalog          | good foundation    | strict WorkflowRegistry                         |
| DND                      | timezone bug       | QuietHours(TimeZoneId,Hm)                       |
| Preference rateLimit     | mixed              | user preference + SystemDeliveryGuard           |
| one ApplicationPort      | mixed              | InboxPort + OperationsPort                      |
| delivery-driven SSE      | partial            | Inbox lifecycle stream + delivery/device stream |

## 21. Protected reliability assets

后续任何重构不得退化：

```text
Fact idempotency
shared NotificationRequested outbox
Fact + Decision + Dispatch transactional materialization
per-channel policy
lease / claim / fencing
retry / dead-letter / replay
durable receipt
correlation / causation
PowerSync desktop lane
capability fail-fast
SSE reconnect/catch-up
identity ownership fences
operations audit
```

## 22. Explicit non-facts

以下是已采纳设计，不是当前实现：

```text
NotificationFact class/name
archivedAt product lifecycle
NotificationTone
strict WorkflowRegistry
EntityRef replacing RelatedEntityType
NotificationChannel removal
NotificationInteraction
QuietHours with TimeZoneId
InboxPort / OperationsPort split
Fact lifecycle SSE
Template aggregate removal
```

## 23. Future implementation ordering suggestion

仅作为未来 plan 输入，不代表 active execution：

```text
1. Baseline/characterization
2. Fact + Inbox lifecycle
3. Workflow registry/taxonomy
4. Delivery projection + Channel retirement
5. Typed interaction/action seam
6. QuietHours + preference/system guard split
7. Product/Ops + realtime split
8. Prisma/PowerSync cleanup
9. anti-resurrection governance
10. five-layer review
```
