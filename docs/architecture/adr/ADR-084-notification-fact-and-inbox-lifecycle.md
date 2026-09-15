---
tags:
  - adr
  - notification
  - inbox
  - fact
  - lifecycle
description: 将 Notification 收敛为不可任意改写的用户可见 Fact，并把 read/archive/retention 与 delivery lifecycle 分离
created: 2026-09-08T22:00:00+08:00
updated: 2026-09-08T22:00:00+08:00
---

# ADR-084: Notification Fact 与 Inbox Lifecycle

**状态：** 已采纳（待实施）  
**日期：** 2026-09-08  
**影响范围：** notification、contracts、database、app-vue、app-react/mobile、api、desktop  
**关联：** ADR-063、ADR-079、ADR-085~088

## 1. 决策摘要

MemoFlow 将当前 `Notification` 聚合进一步收敛为 **NotificationFact**：

> 一条已经对用户成立、应该可以在 Notification Center / Inbox 中追溯的消息事实。

NotificationFact 与渠道投递状态分离。Fact 创建后，业务语义与内容快照原则上不可被普通用户 CRUD 任意改写；用户可修改的是 Inbox lifecycle：已读/未读、归档/恢复。

North Star：

```text
NotificationRequested
        ↓
NotificationFact
        │
        ├── InboxLifecycle
        │     ├── readAt?
        │     └── archivedAt?
        │
        └── DeliveryPlan / Delivery Runtime
              （独立模型，见 ADR-086）
```

## 2. 当前事实

当前 `NotificationState` 包含：

```text
id / identityId
workflowKey / topic / idempotencyKey

title / content
type / category
importance / urgency

relatedEntityType / relatedEntityId
navigationIntent
actions / metadata
correlationId / causationId

isRead / readAt
expiresAt
version / deletedAt / timestamps

notificationChannels[]
```

当前 API 同时支持：

```text
POST   /notifications
PUT    /notifications/:id
DELETE /notifications/:id
POST   /notifications/:id/read
PATCH  /notifications/read-all
```

其中 `PUT` 可以修改 title/content/importance/urgency/navigationIntent/metadata/expiresAt。

## 3. 问题

### 3.1 Fact 与普通 CRUD Document 混合

如果 Notification 表示“发生过的一条消息事实”，允许用户任意修改内容会破坏追溯语义。

例如：

```text
21:00 任务已完成
```

第二天被编辑为：

```text
21:00 任务未完成
```

则这条记录不再是 Fact，只是一个可修改文档。

### 3.2 `isRead` 与 `readAt` 双真值

当前同时维护：

```text
isRead
readAt
```

但产品语义天然是：

```text
isRead = readAt != null
```

二者同时作为 canonical state 会制造同步风险。

### 3.3 用户 Delete 与数据 Retention 混合

普通用户在 Notification Center 中的“删除”更接近：

> 从我的 Inbox 中收起这条消息。

而 `deletedAt` 更适合表达：

- account closure；
- retention cleanup；
- privacy/data deletion；
- maintenance tombstone。

### 3.4 Delivery child 泄漏进 Fact Aggregate

`notificationChannels[]` 使 Delivery execution state 再次进入 Fact 聚合边界，与 ADR-063 的 Fact/Delivery 分离原则不完全一致。该问题由 ADR-086 处理。

## 4. 目标模型

```ts
interface NotificationFact {
  id: NotificationId;
  identityId: IdentityId;
  idempotencyKey: string;

  workflowKey: string;
  topicKey?: string | null;

  content: {
    title: string;
    body: string;
  };

  presentation: {
    tone: NotificationTone;
    importance: ImportanceLevel;
    urgency: UrgencyLevel;
  };

  subjectRef?: EntityRef | null;
  navigationIntent?: NavigationIntent | null;
  actionIntents?: readonly NotificationActionIntent[];

  correlationId?: string | null;
  causationId?: string | null;

  readAt?: Instant | null;
  archivedAt?: Instant | null;
  relevanceExpiresAt?: Instant | null;

  version: number;
  createdAt: Instant;
  updatedAt: Instant;
}
```

## 5. Fact 创建后的可变性

### 5.1 Immutable semantic snapshot

普通用户不应直接修改：

```text
workflowKey
content.title
content.body
subjectRef
correlation/causation
```

Producer 在创建 Fact 时物化快照；之后业务实体本身变化，不应静默重写历史 Notification。

例如：

```text
09:00 Goal target changed
09:01 Notification: “目标时间已调整到 Q4”
```

后续 Goal 再改成 Q1，不应把 09:01 的历史 Notification 修改成 Q1。

### 5.2 允许的 Inbox commands

```text
MarkRead
MarkUnread
Archive
Restore
```

### 5.3 系统级维护

允许通过受控 internal command：

```text
ExpireForRetention
DeleteForAccountClosure
RedactForPrivacyRequirement
```

这些不是普通产品 CRUD。

## 6. Read / Unread

Canonical truth：

```text
readAt: Instant | null
```

派生：

```ts
const isRead = readAt !== null;
```

`markUnread`：

```text
readAt = null
```

API/DTO 为兼容可以暂时继续返回 `isRead`，但领域模型只保存一个真值。

## 7. Archive / Delete

### 7.1 Product archive

新增：

```text
archivedAt?: Instant
```

Inbox 默认不显示 archived Fact；用户可以通过 Archive/Restore 控制列表。

### 7.2 Persistence delete

`deletedAt` 不再作为普通 Notification Center action。

长期：

```text
archive = user-facing lifecycle
physical/soft delete = retention/infrastructure lifecycle
```

## 8. Expiry 语义

当前 `expiresAt` 容易混淆两件事：

1. 这条信息对用户是否仍有意义；
2. 数据什么时候可以清理。

目标命名优先：

```text
relevanceExpiresAt
```

它表示：

> 过了这个时间，产品可以把该 Fact 视为过期/低相关，但并不等价于立即删除。

真正 retention policy 由 maintenance/data policy 决定。

## 9. Product API 方向

长期 Product API 更接近：

```text
GET    /notifications
GET    /notifications/:id
POST   /notifications/:id/read
POST   /notifications/:id/unread
POST   /notifications/:id/archive
POST   /notifications/:id/restore
PATCH  /notifications/read-all
GET    /notifications/unread-count
GET/PUT /notifications/preferences
```

逐步退役普通用户语义下的：

```text
POST /notifications           arbitrary create
PUT  /notifications/:id       arbitrary edit
DELETE /notifications/:id     inbox delete
```

跨模块 producer 继续使用 durable `NotificationRequested`，而不是 HTTP arbitrary create。

## 10. Inbox 是 Fact，不是 InApp Channel

正式定义：

```text
Notification Center / Inbox
= NotificationFact 的 read model
```

而当前 `InApp` channel 表示的是一种实时 presentation/delivery surface。

因此：

```text
Fact 被创建
≠
InApp channel 必须 delivered
```

即使 Desktop/Push/InAppRealtime 全部被 DND suppress，Fact 仍可存在于 Notification Center。

后续 contract 可考虑把 `InApp` 重命名为 `AppRealtime` 或 `InAppToast`，避免和 Inbox 混淆；该 rename 不要求与本 ADR 同一批实施。

## 11. NotificationInboxReadModel

产品 UI 不直接消费 worker/internal model。

目标：

```ts
interface NotificationInboxItem {
  fact: NotificationFactDTO;
  isRead: boolean;
  isArchived: boolean;
  workflowPresentation: NotificationWorkflowPresentationDTO;
  actions: readonly NotificationActionPresentationDTO[];
  deliverySummary?: NotificationDeliverySummaryDTO;
}
```

普通用户默认不展示：

```text
lease token
fencing token
attempt number
dead-letter worker internals
```

## 12. SSE / Realtime implications

Notification Center 的实时一致性应跟随 Fact lifecycle：

```text
notification.fact-created
notification.fact-read
notification.fact-unread
notification.fact-archived
notification.fact-restored
```

不能只依赖某个 delivery channel 成功后才让 UI 知道 Fact 存在。

Delivery realtime stream 仍可以保留给 device/presentation runtime，详见 ADR-088。

## 13. Protected contracts

实施时必须保护：

- `NotificationRequested` durable integration envelope；
- `(identityId, idempotencyKey)` Fact 幂等 fence；
- Notification Center 未读计数行为；
- Prisma / PowerSync parity；
- HTTP / IPC ownership fence；
- 当前 delivery outbox/retry/dead-letter 可靠性；
- account closure fail-closed。

## 14. Migration outline（未来实施）

1. characterization current CRUD/inbox behavior；
2. `readAt` 成为 canonical read truth，`isRead` 降为 projection；
3. 增加 `archivedAt`；
4. UI delete 迁移为 archive；
5. product DTO 继续兼容 `isRead`；
6. arbitrary update route 改 internal-only 或退役；
7. Notification Aggregate 移除 delivery child ownership（ADR-086）；
8. SSE 从 delivery-only invalidation 补齐 Fact lifecycle stream；
9. 最终清理 legacy `deletedAt` product semantics。

## 15. 验收标准（未来实施）

- Fact 内容无法通过普通 Inbox command 任意编辑；
- `readAt` 是唯一 read truth；
- archive 不物理删除 Fact；
- DND/Delivery failure 不导致 Fact 丢失；
- Inbox realtime 不依赖 Desktop/Push delivery success；
- Notification DTO 不以 channel state 决定 Fact existence；
- Account cleanup/retention 能独立执行。

## 16. 非目标

本 ADR 不要求：

- 重写 durable outbox；
- 引入第三方 Notification SaaS；
- 做复杂 digest/coalescing；
- 完成所有移动端 push provider；
- 修改 Task/Goal/Routine 的业务触发语义。
