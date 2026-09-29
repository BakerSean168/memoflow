---
tags: [adr, ui, ai, shell, owner-boundary, quick-surface]
description: AI 通过 typed semantic surface action 操控 owner-native UI，跨模块快速入口复用 owner Quick Surface
created: 2026-09-29T13:30:00+08:00
updated: 2026-09-29T13:30:00+08:00
---

# ADR-112: Owner Native Surface Orchestration and Quick Surface Reuse

**状态：** 已采纳（Product vNext target-design，待实施）
**日期：** 2026-09-29
**关联：** ADR-096、ADR-098、ADR-099、ADR-108、[Native Surface Orchestration + Quick Surface vNext](../../product/native-surface-orchestration-and-quick-surfaces.md)

## Context

MemoFlow 当前已经形成较好的 owner-domain 边界，但 presentation/action surface 仍存在重复实现：

- Task 在 Task Home、Task Detail、Capsule、Today Overview、Schedule 中各有 execution UI；
- AI 维护 AIGoalDraftEditor、AITaskDraftEditor 与 WorkflowPanel，形成第二套 Goal/Task/Knowledge product vocabulary；
- Schedule 用 DayDetailSheet / EventDetailSheet / TaskEventActionPanel 分别承载本可由 owner Quick Surface 提供的能力；
- Capsule/Home/Context surfaces 各自重写 loading/empty/action behavior。

这会造成两个长期问题：

1. owner 业务语义升级后，外围入口容易绕过 canonical action；
2. AI-only/editor-only UI 会与人工原生 UI 长期漂移。

Task completion-time KR measurement 已证明该问题不是纯视觉重复：一旦 completion 需要 measurement，任何直接 `completeOccurrence(id)` 的外围入口都会绕过产品语义。

## Decision

### 1. UI 分为 Primitive / Owner Native Surface / Host Surface

```text
Primitive
    ↓
Owner Native Surface
    ↓
Host Surface
```

- Primitive 负责视觉与基础交互；
- Owner Native Surface 负责 owner 事实、action、validation、edit session；
- Host Surface 只负责 placement、geometry、open/close 与 shell chrome。

Host 不得复制 owner action logic。

### 2. Owner 模块提供 Full Surface 与 Quick Surface

Full Surface 用于完整 owner 管理；Quick Surface 用于 Capsule、Home、Schedule、Notification、AI contextual work。

Quick Surface 必须保持最小：摘要 + 高频 action + 必需 context + View owner 出口。

Quick Surface 不是第二套 Full Surface。

### 3. Task 只维护一个 canonical Quick execution family

目标组件/语义层次：

```text
TaskOccurrenceQuickRow
        ↓
TaskOccurrenceCompactList
        ↓
TaskQuickSurface
```

Task Capsule、Today Overview、Schedule 等按宿主需求组合该 surface，不直接复用 Capsule 外壳，也不分别重写 occurrence action。

### 4. Task completion 通过一个 Task-owned action coordinator

```text
request complete
      ↓
TaskOccurrenceActionCoordinator
      ↓
direct complete OR prompt completion-time KR measurement
      ↓
canonical Task command + optional durable measurement intent
```

Goal 继续拥有 GoalRecord/aggregation；Task owner 决定 completion interaction；Schedule/Capsule/Home 只发起 action request。

### 5. Schedule 优先使用 Dialog 组合 owner Quick Surface

BusinessPanel 已经是右侧 workspace，因此 Day/Event inspect 默认采用 centered Dialog，而不是继续叠加右侧 Sheet。

```text
Calendar -> PlannerDayDialog
Calendar -> PlannerEventDialog
```

Dialog 内嵌 Task/Goal/Routine 等 owner Quick Surface。CalendarEntry 自身 CRUD 仍由 Schedule owner 提供。

Sheet 只在窄容器或信息结构确实更适合边侧浏览时使用，不作为默认层级。

### 6. AI 采用 Native Surface Orchestration

AI 不再长期维护第二套业务编辑器。

目标链路：

```text
natural language
   ↓
Mastra plan / structured proposal
   ↓
Surface Orchestrator
   ↓
Owner Native Edit Session
   ↓
Owner UI in BusinessPanel
   ↓
owner validation / command
```

AI 对 UI 的操控是 typed semantic action，而不是 DOM automation。

允许的目标接口形态：

```text
openCreate
openObject
patchDraft
addChild
removeChild
focusField
requestSubmit
requestCancel
```

具体接口必须由 owner surface 定义，不允许 AI 直接写组件内部 state 或绕过 owner validation。

### 7. Mastra internal draft identity 保留为 runtime detail

`draftRef / workflowRunId / revision / receipt / referenceMap` 可以继续服务 durable workflow 的 restart/retry/recovery/deterministic identity。

但这些 internal identities：

- 不作为 normal user form 字段；
- 不作为 AI-only product UI 的理由；
- 不成为业务 owner 的第二份 identity。

### 8. AI-owned product editors 进入 retirement queue

当 native vertical slice 完成后，逐步退休：

- AIGoalDraftEditor；
- AITaskDraftEditor；
- AI-only Goal/Task form vocabulary；
- WorkflowPanel 中由 owner native surface 承担的编辑职责。

保留 clarification、approval、recovery、workflow state、execution record 和 diagnostics。

### 9. BusinessPanel `workflow` surface 是条件性 retirement candidate

当前 `home | business | workflow` 继续作为实现事实。

只有当 Goal/Task/Knowledge native workflow parity、clarification/recovery、dirty/busy/attention 与 diagnostics replacement 均完成后，才允许删除独立 workflow surface。

## Consequences

### Positive

- AI 与人工真正共享同一套产品 UI；
- owner 语义升级只需要改一个 canonical surface/action path；
- Task Capsule/Home/Schedule 不再各自维护完成逻辑；
- UI 组件拆分以语义边界而不是页面数量/行数为依据；
- 更适合 AI-native 右侧业务面板交互。

### Cost

- 需要显式设计 owner edit-session contract；
- 现有 AI WorkflowPanel 迁移不能一次性删除；
- Host/Owner 之间需要新的 typed orchestration seam；
- 部分现有组件要先拆业务 surface，再删除重复外壳。

## Protected contracts

必须保留：

- owner domain ownership；
- public route/deep-link 与明确的 retirement mapping；
- BusinessPanel dirty/busy/leave guard；
- Mastra restart/retry/approval；
- Task→Goal durable measurement；
- Schedule owner-command routing；
- Product Time；
- Knowledge stable identity。

## Explicitly forbidden

- 使用 DOM selector/click/type 作为产品 AI surface orchestration 主路径；
- AI 直接改 Pinia/组件任意 state；
- 让 Host Surface 拥有 owner business mutation semantics；
- 创建 UniversalQuickRow / UniversalBusinessCard 统一不同 owner 语义；
- 为减少页面数量而删除真正 first-class owner workspace。

## Implementation follow-up

实施顺序以 [Native Surface Orchestration + Quick Surface vNext](../../product/native-surface-orchestration-and-quick-surfaces.md) 与 Product vNext active plan 为准。
