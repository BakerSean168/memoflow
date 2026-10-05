---
tags:
  - product
  - ui
  - ai
  - shell
  - task
  - schedule
  - vnext
description: MemoFlow Owner Native Surface、Quick Surface、AI 原生业务面板操控与组件复用 North Star
created: 2026-09-29T13:20:00+08:00
updated: 2026-09-29T13:20:00+08:00
---

# MemoFlow Native Surface Orchestration + Quick Surface vNext

## 1. 核心结论

MemoFlow 后续 UI/AI 收敛不再围绕“每个入口做一个页面/Widget/Sheet”展开，而采用：

```text
Primitive
    ↓
Owner Native Surface
    ↓
Host Surface
```

其中每个 owner 模块只维护少数 canonical product surfaces：

```text
Full Owner Surface
Quick Surface
Create/Edit Surface
Inspect Surface（仅在确实需要更多信息时）
```

Capsule、Home、Schedule、Notification、AI 等只是这些 owner surfaces 的不同宿主，不再分别维护第二套业务 UI 与 action logic。

North Star：

> **AI 不拥有第二套 Goal/Task/Knowledge 产品 UI。AI 打开并操控右侧业务面板中的 owner-native UI；跨模块快速入口复用 owner 的 Quick Surface。**

## 2. 组件分层

### 2.1 Primitive Layer

负责视觉和交互基础，不包含 owner 业务语义：Button、Input/Textarea/Select、Badge、ProductPropertyChip、ProductDialogShell、Product Time picker、Empty/Loading/Error primitives、semantic tokens/elevation/focus。

Primitive 可以跨模块复用。

### 2.2 Owner Native Surface Layer

由业务 owner 提供，负责展示事实、action 语义、owner validation、edit session/dirty state 和 context projection。

```text
Goal
├─ GoalCreateSurface
├─ GoalWorkspaceSurface
├─ GoalQuickSurface
├─ KeyResultQuickSurface
└─ GoalRecordComposer

Task
├─ TaskPlanCreateSurface
├─ TaskPlanWorkspaceSurface
├─ TaskQuickSurface
├─ TaskOccurrenceQuickRow
└─ TaskOccurrenceInspect

Routine
├─ RoutineEditorSurface
├─ RoutineQuickSurface
└─ RoutineOccurrenceQuickRow
```

Owner Native Surface 不知道自己最终被放在 Capsule、Home、Dialog 或 Schedule 中。

### 2.3 Host Surface Layer

Host 只决定放置位置、尺寸、打开关闭、浮层方式和 shell chrome。

典型 host：BusinessPanel、Capsule、Home、Dialog、Calendar day dialog、Notification contextual action、AI-opened business tab。

Host 不复制 owner action logic。

## 3. Full Surface 与 Quick Surface

### 3.1 Full Owner Surface

当前明确保留：

```text
Goal          -> Goal Workspace
TaskPlan      -> Task Plan Workspace
Routine       -> Routine Configuration / owner workspace
Schedule      -> Calendar Workspace
Knowledge     -> Document Workspace
Settings      -> Settings Scene
```

Full Surface 处理全量属性、生命周期、历史、配置、关系、深度分析和低频管理操作。

### 3.2 Quick Surface

用于 Capsule、Home、Schedule、Notification、AI contextual work。

Quick Surface 只包含最重要摘要、高频 action、必需的最小上下文和显式 View owner 出口，不能逐步膨胀成第二套 Full Surface。

## 4. Task Surface 收敛

### 4.1 用户认知只保留两层

```text
Task Full Surface
+
Task Quick Surface
```

Full：

```text
Task Home
├─ Today
└─ Plans

Task Plan Workspace
├─ properties
├─ schedule
├─ checklist
├─ Goal/KR
├─ reminder
├─ progress
└─ occurrences/history
```

Quick：

```text
TaskQuickSurface
├─ Today summary（可选）
├─ TaskOccurrenceCompactList
│   └─ TaskOccurrenceQuickRow
└─ Quick Create（宿主可选）
```

### 4.2 当前重复入口必须收敛

当前 TaskManagementView、TaskDetailView、TaskCapsulePreview、DailyTodoWidget、Schedule DayDetailSheet、Schedule TaskEventActionPanel 都包含 execution UI。

目标不是让它们都 import TaskCapsulePreview，而是：

```text
TaskOccurrenceQuickRow
        ↓
TaskOccurrenceCompactList
        ↓
TaskQuickSurface
        ↓
Capsule / Home / Schedule 按需组合
```

Capsule 只是 TaskQuickSurface 的一个宿主。

### 4.3 Canonical occurrence action

Quick Row 不直接决定业务完成流程。

```text
Complete
   ↓
TaskOccurrenceActionCoordinator
   ↓
是否要求 KR completion-time measurement?
   ├─ no  -> canonical complete
   └─ yes -> GoalRecordComposer / Task completion measurement dialog
              ↓
            canonical complete + measurement intent
```

这样 Task Capsule、Home、Schedule、Notification、AI 都不会绕过 Task→KR 的完成时记录语义。

## 5. Schedule Surface 收敛

Schedule 保持 Day/Week/Month、period navigation、Calendar canvas、drag/resize、owner projections 和 CalendarEntry CRUD，不转换成 Task list。

### 5.1 优先 Dialog，而不是右侧套右侧 Sheet

BusinessPanel 本身已经是右侧 workspace。在其中继续从右侧推出 DayDetailSheet / EventDetailSheet 会制造额外空间层级。

推荐：

```text
Calendar -> click day   -> PlannerDayDialog
Calendar -> click event -> PlannerEventDialog
```

Dialog 内再嵌 owner Quick Surface：

```text
PlannerDayDialog
├─ CalendarEntryQuickRow
├─ TaskOccurrenceQuickRow
├─ Goal marker quick info
└─ Routine occurrence quick info
```

Owner-specific action：

```text
CalendarEntry -> Schedule edit/delete
Task occurrence -> Task Quick Surface / Task action coordinator
Goal marker -> Goal quick info / View Goal
Routine marker -> Routine quick info
```

Schedule 不复制其它 owner 的 mutation semantics。

## 6. AI Native Surface Orchestration

### 6.1 当前问题

2026-10-02 PVC-AI-8121 已删除 AIGoalDraftEditor / AITaskDraftEditor 和 editor visibility state。
正常 Goal/Task/Knowledge review 使用 owner-native sessions；workflow panels 保留状态、clarification、
recovery、result 和 native reopen。Goal supporting Task/Knowledge overlay 仍是 AI-8101 接受的跟进能力。

此前的第二套业务 editor 会随 owner 表单变化而漂移，现已由 native owner surface 替代。

### 6.2 Target

AI 应该像用户一样在右侧打开真正的 owner surface：

```text
User natural language
        ↓
Mastra plan / structured proposal
        ↓
Surface Orchestrator
        ↓
open Goal/Task/Knowledge native surface in BusinessPanel
        ↓
Owner Edit Session
        ↓
user observes / AI updates / user can edit
        ↓
owner validation + owner command
        ↓
canonical business truth
```

示例：

```text
“帮我创建一个三个月把引体向上提升到 12 个的目标”
        ↓
AI opens Goal Create native surface
        ↓
fills Goal name / target timeframe / KR
        ↓
user sees normal Goal UI
        ↓
“第一个 KR 改成每周三次”
        ↓
AI patches current Goal edit session
        ↓
same native UI updates
```

### 6.3 Semantic computer use, not DOM automation

“像真人操作”是产品效果，不表示底层通过 DOM selector/click/type 模拟。

目标是 typed semantic surface action，例如：

```ts
goalSurface.openCreate()
goalEditSession.patch(...)
goalEditSession.addKeyResult(...)
goalEditSession.focus(...)
```

而不是 querySelector/click/type/find dropdown。

这样可以保持 typed contract，复用 owner validation 和 dirty/unsaved guard，并减少 selector fragility。

### 6.4 Workflow internal draft 仍可保留

`draftRef / workflowRunId / revision / receipt / referenceMap` 仍可能服务 workflow restart、deterministic identity、retry、partial recovery 和 workflow-local object reference。

因此本轮不是删除所有 workflow draft identity。

```text
Mastra Workflow
  internal draft / revision / receipt
             ↓
Surface Projection / Orchestrator
             ↓
Owner Native Edit Session
             ↓
Owner UI
```

内部 identity 不进入普通用户表单和 normal workflow review UI。

### 6.5 AI-owned product editor 与 workflow workbench 已退休

AIGoalDraftEditor、AITaskDraftEditor 与 AI-only Goal/Task form 已由 PVC-AI-8121 退休。AIC-3003 又在 clarification、recovery、supporting-resource handoff 和 diagnostics 都迁出 shell workflow surface 后，物理删除了 `BusinessPanel.workflow` 及其 Teleport / attention / restore 状态。

保留的是 conversation、planning、durable workflow checkpoint、approval/recovery、execution record、diagnostic details 和 owner mutation/read ports；这些能力不再要求一个独立大型 workflow workbench。

## 7. AI workflow context / diagnostics

当前 Shell 只有：

```text
PanelSurface = home | business
```

职责边界是：

```text
AI planning / messages         -> conversation
clarification / recovery       -> Chat + main Composer / Chat actions
product editing / review       -> business owner native surface
supporting resource handoff    -> native Task / Knowledge routes
workflow context / diagnostics -> explicit AIChatView secondary details
```

AIC-2101 先停止 Goal workflow 自动抢占右侧；AIC-3001/AIC-3002 再把 Task/Knowledge clarification、recovery 与 supporting-resource handoff 迁到 Chat/native owner path；AIC-3003 最后删除 shell-owned workflow chrome 和状态机。可选 diagnostics 仍可由桌面或移动端用户显式打开，但它只展示 context/status，不得 import owner dialog、直接调用 owner mutation/persistence，或重新成为 owner editing surface。

## 8. 组件复用原则

### 8.1 先提炼业务 Surface，再提炼外壳

错误：看到 Task Capsule 好用，就让 Schedule 直接 import TaskCapsulePreview。

正确：TaskCapsulePreview 提炼 TaskQuickSurface，再由 Capsule/Home/Schedule 按需组合。

### 8.2 不创建 Universal Entity UI

不要创建 UniversalModulePage、UniversalBusinessCard、UniversalQuickRow、UniversalDetailForm。

真正应该复用的是 shell、state presentation、property grammar、action coordinator 和 owner-provided Quick Surface。

### 8.3 拆分依据是 stable semantic boundary

不要按“超过 500 行”机械拆分。

优先拆：TaskOccurrenceQuickRow、TaskOccurrenceCompactList、TaskQuickSurface、TaskOccurrenceActionCoordinator、Goal/Task native edit session、AI Surface Orchestrator、PlannerDayDialog、PlannerEventDialog。

## 9. Governance 方向

ADR-113 已确认此前 Product Governance Runtime 的“虚构 reference module / 活文档”不再值得作为产品 bounded context 维护。原有 Rule/RuleRevision、contracts、Prisma/PowerSync、HTTP/IPC、Web/Desktop client、Vue surfaces 与 bundle export 已由 GOV-7903 完成 destructive retirement。

真正持续有价值的 repository governance 是：

```text
tools/governance
docs/governance
docs/standards
CI architecture checks
ownership checks
Product Time checks
surface audits
```

因此新的方向是：

```text
Retire Product Governance Runtime
Keep Engineering Governance
```

详细 retirement decision 由 ADR-113 定义。当前禁止重新引入 Product Governance UI/runtime；Engineering Governance 继续由 repository-native rules/audits/CI 负责。

## 10. Protected contracts

Native Surface 重构必须保护 owner domain ownership、owner command/read ports、公共 route/deep-link（除非有明确 retirement mapping）、BusinessPanel dirty/busy/leave guard、Mastra restart/retry/approval、Task→Goal durable measurement、Product Time、Knowledge stable identity、Settings/Auth scene boundary 和 Schedule owner-command routing。

## 11. 非目标

本方案不意味着 AI 获得 DOM/浏览器级任意点击权限，不允许 AI 直接修改 Pinia/组件任意 state，不删除 Mastra durable workflow，不把所有模块压成同一种页面，不创建 universal quick row，不删除 Calendar 或 TaskPlan detail route，也不会为了统一 UI 而删除仍有真实业务 owner 的 workflow surface。Product Governance package 已由 ADR-113 单独退休。

## 12. 实施顺序

```text
Phase A
Task Quick Surface extraction
+ canonical occurrence action coordinator

Phase B
Schedule Day/Event Dialog
+ owner Quick Surface composition

Phase C
Owner Native Edit Session contract
Goal first
Task second

Phase D
AI Surface Orchestrator
+ Goal native workflow vertical slice
+ Task native workflow vertical slice
+ Knowledge native workflow vertical slice

Phase E
retire AI-owned Goal/Task editors
workflow surface retirement (completed by AIC-3003)

Parallel closure track
GOV-7903 Product Governance destructive retirement

Final
shared grammar + visual regression closure
```

共享组件只在至少两个真实宿主验证相同语义之后上提。
