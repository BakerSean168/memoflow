---
tags:
  - adr
  - notification
  - preference
  - dnd
  - realtime
  - operations
description: 分离用户通知偏好、QuietHours、系统 delivery guard、设备覆盖，并拆开 Inbox realtime 与 delivery operations surface
created: 2026-09-08T22:00:00+08:00
updated: 2026-09-08T22:00:00+08:00
---

# ADR-088: Notification Preference、QuietHours、Realtime 与 Operations Boundary

**状态：** 已采纳（待实施）  
**日期：** 2026-09-08  
**影响范围：** notification、time、contracts、app-vue、desktop、api、operations  
**关联：** ADR-037、ADR-063、ADR-079、ADR-084~087

## 1. 决策摘要

Notification delivery eligibility 由五层共同决定：

```text
Workflow capability/default
        +
User preference
        +
Account QuietHours
        +
System delivery guard
        +
Device capability/local override
        ↓
DeliveryPolicy
```

同时拆分：

```text
Inbox/Product API & realtime
vs
Delivery/Operations diagnostics
```

当前 `NotificationPreference` 可保留为用户配置 Aggregate，但 DND 必须改成 Product Time-aware `QuietHours`，系统 anti-spam rate limit 不再冒充用户 preference。

## 2. 当前 Preference

当前：

```text
NotificationPreference
├── globalChannels
├── workflowOverrides
├── doNotDisturb
├── rateLimit
├── version
└── timestamps
```

方向基本正确，但 DND 和 RateLimit 仍需边界收敛。

## 3. QuietHours 替代 DoNotDisturbConfig

当前 DND：

```text
startTime: HH:mm
endTime: HH:mm
daysOfWeek: 0..6
```

Domain 使用：

```text
Date.getDay()
Date.getHours()
```

这隐式使用运行宿主本地时区，不符合 ADR-037 Product Time。

目标：

```ts
interface QuietHours {
  enabled: boolean;
  timeZone: TimeZoneId;
  weeklyWindows: readonly {
    daysOfWeek: readonly Weekday[];
    start: Hm;
    end: Hm;
  }[];
}
```

跨午夜窗口必须由明确 timezone + wall-clock semantics 解析成 Instant。

## 4. Account QuietHours vs Device DND

两层不能互相替代：

```text
Account QuietHours
  用户说“晚上 23:00~07:00 默认不要打扰我”
  可跨设备同步

Device DND / OS Focus
  当前设备实际是否允许 popup/sound
  设备本地 truth
```

执行：

```text
Notification server policy says Desktop eligible
          ↓
Desktop delivery adapter
          ↓
Device OS DND says suppressed
          ↓
no popup / optional local receipt
```

Device local DND 不修改 cloud Fact。

## 5. 用户 Preference 与 System Guard 分离

当前 `RateLimit(maxPerHour/maxPerDay)` 挂在 NotificationPreference 下，容易把：

```text
用户想少收到一点
```

和：

```text
系统必须防止 spam / provider abuse
```

混成一件事。

目标：

```text
NotificationPreference
= 用户选择

SystemDeliveryGuard
= 平台强制安全限制
```

用户偏好长期可以有：

```text
globalChannels
workflowOverrides
quietHours
optional digest/frequency preference
```

系统 guard 独立拥有：

```text
burst limit
provider quota guard
same-entity anti-spam
retry budget
abuse protection
```

## 6. DeliveryPolicy evaluation order

推荐：

```text
1. Resolve WorkflowDefinition
2. Check channel supported
3. Apply workflow default/read-only control
4. Apply user global channel preference
5. Apply workflow-specific override
6. Apply Account QuietHours / workflow DND behavior
7. Apply system delivery guard
8. Apply runtime/device capability where applicable
9. Persist DeliveryDecision
```

所有结果必须有 reason code。

## 7. Read-only / critical workflow

不使用模糊：

```text
critical = true
```

来绕过所有用户设置。

继续采用显式 allowlist：

```text
system.account-security
```

并由每个 channel 明确：

```text
preferenceControl = read_only
dndBehavior = bypass | defer | suppress
```

## 8. Product API 与 Operations API 分离

当前 `NotificationApplicationPort` 同时暴露：

Product：

```text
list/get
mark read
preferences
```

Ops：

```text
queryDeadLetters
replayDeadLetter
getDeliveryReceipts
getOperationTimeline
getOperationAudit
```

长期拆为：

```ts
interface NotificationInboxPort {
  list(...): ...;
  get(...): ...;
  markRead(...): ...;
  markUnread(...): ...;
  archive(...): ...;
  restore(...): ...;
  getUnreadCount(...): ...;
  getPreferences(...): ...;
  updatePreferences(...): ...;
}

interface NotificationOperationsPort {
  queryDeadLetters(...): ...;
  replayDeadLetter(...): ...;
  queryDeliveryReceipts(...): ...;
  queryTimeline(...): ...;
  queryAudit(...): ...;
}
```

## 9. API surface

产品：

```text
/api/v1/notifications
/api/v1/notifications/preferences
```

operations 可以是：

```text
/api/v1/notification-operations/...
```

或仅内部 admin/ops tool seam。

是否保留现有 URL 兼容窗口由实施计划决定；核心是不让产品 client port 认识 dead-letter/fencing/receipt internals。

## 10. Inbox realtime vs Delivery realtime

当前 SSE 主要从 successful delivery receipt 广播 realtime event。

目标拆分：

```text
InboxRealtime
  notification.fact-created
  notification.fact-read
  notification.fact-unread
  notification.fact-archived
  notification.fact-restored

DeliveryRealtime / Device Surface
  desktop delivery eligible
  native notification payload
  delivery ack / diagnostic event
```

Notification Center 不能依赖某个 channel delivered 才刷新。

## 11. SSE replay / cursor

现有 SSE 的 Last-Event-ID、cursor catch-up、subscribe-before-query window-loss 防护是成熟资产，应保留。

迁移只是把 source 从：

```text
delivery receipt only
```

扩成清晰的 Inbox Fact lifecycle event stream。

不得退化：

- reconnect catch-up；
- identity scope；
- dedup；
- buffered live event；
- > 100 backlog pagination。

## 12. Device Surface ownership

实际设备能力继续由 Desktop/Mobile owning：

```text
OS permission
sound
vibration
foreground/background
fullscreen state
Focus mode
local DND
native notification API
InterventionWindow
```

`NotificationMetadata.sound` 等设备细节从 Fact 移走。

## 13. `AppRealtime` / `InAppToast`

长期建议把当前 `NotificationChannelType.InApp` 的产品语义改成更准确的：

```text
AppRealtime
或 InAppToast
```

因为 Inbox 本身已经由 Fact 提供。

Rename 可以延后，但 policy/docs/UI 必须先不再把 InApp = Inbox。

## 14. Preference UI

目标 UI 层次：

```text
Notification Settings

Channels
[Desktop] [Push] [Email]

Quiet Hours
23:00 - 07:00
Timezone: Asia/Tokyo

By workflow
Task reminders       Desktop on / Push off
Goal reminders       Desktop on / Push on
Routine intervention Desktop on
Account security     required
```

不直接暴露：

```text
maxPerHour
fencing
lease
retry count
```

这些属于 system/ops。

## 15. Protected contracts

- existing preference rows/data；
- workflow override behavior；
- explicit read-only workflow semantics；
- ADR-037 time primitives；
- Desktop local capability checks；
- SSE cursor/reconnect；
- operations audit/replay；
- HTTP/IPC identity scoping；
- Prisma/PowerSync parity。

## 16. Migration outline（未来实施）

1. characterization current DND timezone behavior；
2. 新 QuietHours contract + TimeZoneId/Hm；
3. migrate existing HH:mm config with explicit account timezone policy；
4. system rate guard 从 preference 分离；
5. split InboxPort / OperationsPort；
6. add Fact lifecycle SSE stream；
7. preserve delivery/device realtime separately；
8. move sound/device hints out of Fact；
9. UI settings 改为用户语义；
10. final anti-resurrection governance。

## 17. 验收标准（未来实施）

- QuietHours 在任意 server timezone 下按用户 timezone 正确；
- 用户 preference 不承担平台 anti-spam hard limit；
- Notification Center 在所有 delivery 被 suppress 时仍能实时看到新 Fact；
- 普通 product port/client 不包含 dead-letter/replay internals；
- Desktop local DND 不改 cloud Fact；
- SSE reconnect/catch-up 行为不退化；
- device sound/vibration 不再是 NotificationFact business state。
