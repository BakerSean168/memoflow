---
tags:
  - adr
  - notification
  - interaction
  - action
  - entity-ref
description: 用 NotificationInteraction 与 typed action intents 替代 generic NotificationHistory、ApiCall/Custom payload 和 closed RelatedEntityType
created: 2026-09-08T22:00:00+08:00
updated: 2026-09-08T22:00:00+08:00
---

# ADR-087: Notification Interaction 与 Typed Action Intents

**状态：** 已采纳（待实施）  
**日期：** 2026-09-08  
**影响范围：** notification、contracts、app-vue、desktop、Task/Goal/Routine application ports  
**关联：** ADR-077、ADR-079、ADR-084~086、ADR-088

## 1. 决策摘要

Notification 只负责承载“用户可以从这条消息触发什么意图”，不直接成为跨领域 mutation engine。

退役：

```text
NotificationHistory { action: string; details: unknown }
NotificationActionType.ApiCall
NotificationActionType.Custom
unvalidated payload: unknown
```

目标：

```text
NotificationActionIntent
├── Navigate
├── OwnerCommand
└── Archive

NotificationInteraction
= 用户从 Notification surface 做了什么
```

业务结果继续归 owner domain 所有。

## 2. 当前问题

当前 Action contract：

```text
Navigate
ApiCall
Dismiss
Custom
payload?: unknown
```

但产品 UI 主要只真实使用：

```text
click navigation
mark read
delete
```

`ApiCall` / `Custom` 如果直接开放，会让 Notification 变成通用命令执行器，绕开业务 application port、validation、authorization 和 domain invariants。

当前 `NotificationHistory` 又是：

```text
action: string
details: unknown
actorId?
```

语义过宽，而且 repository 仍 include history，Notification Aggregate 却不真正消费它，是明显 legacy residue。

## 3. Typed Action Intent

目标：

```ts
type NotificationActionIntent =
  | {
      kind: 'navigate';
      actionKey: string;
      labelKey: string;
      destination: NavigationIntent;
    }
  | {
      kind: 'owner-command';
      actionKey: string;
      labelKey: string;
      owner: EntityRef;
      commandKey: string;
      input?: JsonValue;
    }
  | {
      kind: 'archive';
      actionKey: string;
      labelKey: string;
    };
```

`input` 必须受 `workflowKey + commandKey` 对应 schema 验证，不能是 unrestricted `unknown`。

## 4. OwnerCommand

例：Routine intervention：

```text
Notification:
  “起身活动一下”

Actions:
  [已完成]
  [稍后提醒]
```

Notification 不直接修改 Routine tables。

它表达：

```text
owner = routine-occurrence:123
commandKey = routine.complete
```

或：

```text
owner = routine-occurrence:123
commandKey = routine.snooze
input = { durationMinutes: 10 }
```

然后：

```text
Notification Action Router
      ↓
validated owner application port
      ↓
Routine command
      ↓
RoutineInteraction / TemporaryOverride
```

业务真值仍在 Routine。

## 5. Navigation

Navigation 继续保留为稳定 typed intent：

```text
route
params
```

客户端优先使用 explicit navigationIntent，不解析 raw worker payload。

长期 subjectRef + WorkflowDefinition 可以提供 fallback destination，但 fallback 不应覆盖明确 navigation intent。

## 6. NotificationInteraction

目标模型：

```ts
interface NotificationInteraction {
  id: NotificationInteractionId;
  identityId: IdentityId;
  notificationId: NotificationId;

  actionKey: string;
  actionKind: 'navigate' | 'owner-command' | 'archive';

  occurredAt: Instant;

  commandReceiptId?: string | null;
  outcome?: 'accepted' | 'rejected' | 'failed' | null;
}
```

它记录：

> 用户是通过 Notification surface 发起了哪个动作。

它不重复保存 owner domain 的最终业务 state。

## 7. 与 RoutineInteraction 的关系

```text
NotificationInteraction
  “用户点击了稍后提醒”

RoutineInteraction
  “该 RoutineOccurrence 收到 snooze 交互”

RoutineTemporaryOverride
  “实际延后到 22:10”
```

三者不是重复：

- NotificationInteraction = surface provenance；
- RoutineInteraction = domain interaction fact；
- TemporaryOverride = Routine runtime truth。

可通过 correlationId / causationId 链接。

## 8. 与 Task/Goal 的关系

例如 Task reminder：

```text
[打开任务]
[标记完成]
```

`标记完成` 应走 Task application command，并遵守 TaskOccurrence lifecycle，而不是 Notification 直接写 status。

Goal review notification 同理，不绕过 Goal application port。

## 9. EntityRef

本 ADR 与 ADR-085 共同采用通用：

```ts
interface EntityRef {
  type: string;
  id: string;
}
```

Action owner、Fact subject、navigation context 均复用同一引用语言。

不得再通过中央 `RelatedEntityType` enum 限制可引用模块。

## 10. Action authorization

执行 OwnerCommand 时必须重新做：

- identity ownership；
- permission/role；
- target existence；
- target current version/lifecycle；
- command schema validation；
- stale action validation。

Notification 创建时合法，不代表用户几小时后点击时仍然合法。

例：Task 已经 Completed 后，旧通知里的 `Complete` action 应返回 no-op/invalid，而不是重复 settlement。

## 11. Action idempotency

OwnerCommand action 需要稳定 action invocation idempotency key：

```text
notification:{notificationId}:action:{actionKey}
```

如果允许同一个 action 多次执行（如 Navigate）则不需要 business idempotency；mutation command 必须由 owner command contract 明确决定。

## 12. Interaction 与 read state

点击 Notification 是否自动 read 是产品策略，不要把它硬编码成 Interaction 本身。

可以：

```text
Navigate accepted
→ Inbox policy marks read
```

但二者是两个 command/fact，可在 application layer 编排。

## 13. History 退役

`NotificationHistory` 的 generic：

```text
action/details
```

不继续扩展。

迁移原则：

- 真正有产品价值的用户 action → NotificationInteraction；
- delivery attempt → reliable operation receipt；
- read/archive lifecycle → NotificationFact state/event；
- audit → Operations audit；
- 其它无 consumer legacy history → 删除。

## 14. Metadata 收敛

当前 `NotificationMetadata`：

```text
icon
image
color
sound
badge
data: unknown
```

目标拆分：

```text
Fact presentation hints:
  iconKey?
  imageKey?
  accentSemantic?

Device surface:
  sound
  vibration
  OS permission

Workflow-specific data:
  schema-validated workflow payload
```

`metadata.sound` 退出 Fact；`data: unknown` 不再作为通用逃生舱。

## 15. Protected contracts

- navigation click deep link；
- Routine/Task/Goal owner-domain invariants；
- identity scoping；
- durable action audit；
- desktop IPC action seam；
- existing NotificationRequested causality；
- mobile/web parity。

## 16. Migration outline（未来实施）

1. inventory 当前 action types/consumers；
2. 建立 typed ActionIntent contract；
3. 建立 Action Router registry；
4. 先迁移 Navigate；
5. 迁移 Routine/Task owner command vertical slices；
6. 新增 NotificationInteraction persistence/read model；
7. 删除 ApiCall/Custom generic execution semantics；
8. 删除 NotificationHistory generic entity/table；
9. 收敛 metadata/data；
10. governance lock 禁止 Notification 直接 mutate owner DB。

## 17. 验收标准（未来实施）

- Notification action 无任意 API/Custom payload 执行能力；
- owner-domain mutation 必须经过 application port；
- stale/unauthorized action fail closed；
- 用户 action provenance 可追溯；
- NotificationHistory 删除后不丢 delivery/audit/domain facts；
- Routine/Task/Goal 的 action 不绕过其 lifecycle invariant。
