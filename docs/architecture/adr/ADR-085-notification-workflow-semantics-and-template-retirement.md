---
tags:
  - adr
  - notification
  - workflow
  - template
  - semantics
description: 以 NotificationWorkflowDefinition 统一通知业务语义、能力和默认展示，退役中央 Category/RelatedEntity 枚举与独立 NotificationTemplate 聚合
created: 2026-09-08T22:00:00+08:00
updated: 2026-09-08T22:00:00+08:00
---

# ADR-085: Notification Workflow Semantics 与 Template 退役

**状态：** 已采纳（待实施）  
**日期：** 2026-09-08  
**影响范围：** notification、contracts、database、app-vue、app-react/mobile、Task/Goal/Routine producers  
**关联：** ADR-063、ADR-079、ADR-084、ADR-086~088

## 1. 决策摘要

Notification 的 canonical semantic identity 使用稳定 `workflowKey`。`NotificationWorkflowDefinition` 负责：

- 该消息为什么存在；
- 默认 tone / importance / urgency；
- channel capability；
- preference control；
- DND behavior；
- 可选 rendering/action schema。

逐步退役：

```text
NotificationTemplate Aggregate
NotificationCategory closed enum
RelatedEntityType closed enum
混合语义的 NotificationType
```

并把 `NotificationType` 收敛为纯 presentation `NotificationTone`。

## 2. 当前问题

当前 Notification 同时有：

```text
workflowKey
topic
NotificationType
NotificationCategory
RelatedEntityType
```

其中 `NotificationType`：

```text
Info / Success / Warning / Error
Reminder / System / Social
```

把 presentation tone 和 semantic category 混在同一个 enum 中。

`NotificationCategory`：

```text
Task / Goal / Schedule / Reminder / Account / System / Other
```

是中央模块枚举；新 Routine 已经无法自然表示。

`RelatedEntityType`：

```text
Task / Goal / Schedule / Reminder
```

同样无法表达 Routine、KeyResult、未来 Knowledge/Wallet 等。

## 3. `workflowKey` 是唯一业务语义入口

示例：

```text
task.reminder
task.missed
task.completed
goal.reminder
goal.completed
routine.intervention
account.security
system.delivery-failure
```

它回答：

> 这条 Notification 为什么产生？

Workflow key 必须：

- 稳定；
- 可用于 preference；
- 可用于 analytics；
- 不依赖 UI 文案；
- 不依赖当前 module enum；
- producer owned / registry validated。

## 4. NotificationWorkflowDefinition

目标：

```ts
interface NotificationWorkflowDefinition {
  workflowKey: string;

  topicKey?: string;
  groupKey?: string;

  presentationDefaults: {
    tone: NotificationTone;
    importance: ImportanceLevel;
    urgency: UrgencyLevel;
  };

  channels: Partial<
    Record<
      NotificationChannelType,
      {
        supported: boolean;
        enabledByDefault: boolean;
        preferenceControl: 'user_configurable' | 'read_only';
        dndBehavior: 'defer' | 'suppress' | 'bypass';
        ttl?: Duration;
      }
    >
  >;

  contentSchema?: WorkflowContentSchema;
  actionSchemas?: readonly NotificationActionSchema[];
  rendererKey?: string;
}
```

## 5. Tone 替代混合 `NotificationType`

目标：

```text
Neutral
Info
Success
Warning
Error
```

例：

```text
goal.completed       -> Success
task.missed          -> Warning
routine.intervention -> Info
account.security     -> Warning/Error depending on workflow
```

不再：

```text
type = Reminder
```

因为 Reminder 是 workflow semantics，不是视觉 tone。

## 6. Category 的处理

不继续扩展中央 enum：

```text
Task
Goal
Routine
Knowledge
Wallet
...
```

否则 Notification 会重新认识所有 bounded context。

如 UI 需要分组，优先从 WorkflowDefinition 得到：

```text
groupKey = task | goal | routine | account | system
```

`groupKey` 是 presentation grouping metadata，不是全局 source-of-truth enum。

## 7. Topic 是否保留

`topicKey` 只有在真实支持以下能力时才保留：

- grouping；
- digest；
- subscription；
- workflow family preference。

例如：

```text
workflowKey:
  task.reminder
  task.missed
  task.completed

topicKey:
  task.activity
```

如果后续没有实际 consumer，应删除无意义 `topic`，而不是仅因历史 schema 保留。

## 8. EntityRef 替代 RelatedEntityType

目标统一通用引用：

```ts
interface EntityRef {
  type: string;
  id: string;
}
```

NotificationFact 可有：

```text
subjectRef = task:123
```

需要更多上下文时可扩展 read projection：

```text
contextRefs:
  goal:456
  key-result:789
```

禁止每增加一个模块就修改 `RelatedEntityType`。

`NotificationRequested.relatedEntity { type: string, id: string }` 已经比旧 Aggregate 模型更接近目标，应向该方向收敛。

## 9. NotificationTemplate 退役

当前已有完整：

```text
NotificationTemplate Aggregate
NotificationTemplateRepository
NotificationTemplateDomainService
Prisma table
PowerSync table
emailTemplate
pushTemplate
channel config
```

但 canonical `NotificationRequested -> CreateNotificationUseCase` 路径并不依赖 template 渲染。

同时当前 Template 没有 identityId，却为了 domain event 使用：

```text
identityId = templateId fallback
```

这是不稳定的业务语义。

决策：

> 不继续把 NotificationTemplate 作为用户产品 Aggregate 演进。

## 10. Template 能力迁移到哪里

### 10.1 Workflow defaults

```text
tone
importance
urgency
channel capability
DND behavior
```

→ WorkflowDefinition。

### 10.2 Content rendering

如果某 workflow 需要 server-side template：

```text
rendererKey
+ validated workflow input
```

由 Workflow Renderer Registry 处理。

### 10.3 Email / Push channel-specific rendering

由 channel renderer 决定：

```text
NotificationFact snapshot
+ WorkflowDefinition
+ Channel Render Adapter
-> Email subject/html
-> Push title/body
```

不需要一个独立 CRUD Template Aggregate。

## 11. Unknown workflow 的 fail-safe

当前 WorkflowCatalog 对未知 workflow 会生成 generic capabilities，并默认让多个 external channel supported/enabled。

长期不采用这种 permissive fallback。

目标：

```text
Unknown workflow
├── Fact: 可按受控内部路径创建
├── Inbox: 可见
└── External delivery: 默认 unsupported / fail-safe
```

或至少仅允许显式安全的 AppRealtime/InApp surface。

禁止因为忘记注册 workflow 自动获得 Email/SMS/Webhook 能力。

## 12. Workflow registration ownership

业务 producer 应明确声明稳定 key，而不是 Notification 通过 `category.toLowerCase() + '.general'` 猜测。

例如：

```text
Task module owns key: task.reminder
Goal module owns key: goal.reminder
Routine module owns key: routine.intervention
```

Notification owns：

```text
registry validation
capability/default policy
render schema integration
```

## 13. Presentation map

当前 Vue presentation 手写：

```text
if workflow === task.reminder -> label
if workflow === goal.reminder -> label
...
```

长期应由：

```text
WorkflowDefinition.presentationKey
```

或 workflow namespace + i18n key resolver 统一提供，减少 UI 维护第二份 workflow registry。

## 14. Protected contracts

实施时必须保护：

- 现有稳定 workflowKey；
- NotificationRequested schema 的向后兼容迁移；
- user workflow overrides；
- DND/read-only workflow behavior；
- Task/Goal/Routine producer idempotency；
- Notification Center 显示文案；
- HTTP/IPC/PowerSync parity。

## 15. Migration outline（未来实施）

1. inventory 实际 workflow keys；
2. 建立 strict WorkflowDefinition registry；
3. 为现有 type/category 生成兼容 projection；
4. 新增 `tone`；
5. `subjectRef` 替代 RelatedEntity closed enum；
6. UI 改由 workflow presentation/group 读取；
7. 迁移 Template render capability；
8. 删除 Template repository/service/API surface；
9. 删除 Template persistence；
10. 最终退役 Category/RelatedEntityType/旧 NotificationType。

## 16. 验收标准（未来实施）

- 新增 bounded context 不需要修改 NotificationCategory/RelatedEntityType；
- UI 不再把 NotificationType 当 Task/Goal category；
- 未注册 workflow 不会自动获得 Email/SMS/Webhook；
- Template Aggregate 不再参与 module composition；
- 所有 canonical producer 都使用显式 workflowKey；
- workflow preference 行为保持一致；
- Prisma/PowerSync 不存在 Template 双轨残留。
