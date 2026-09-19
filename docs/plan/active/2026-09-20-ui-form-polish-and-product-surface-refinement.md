---
tags:
  - plan
  - active
  - ui
  - form
  - linear
  - product
description: MemoFlow 表单与核心业务界面的 Linear-inspired 渐进披露、视觉密度与交互一致性精修计划
created: 2026-09-20T00:20:00+08:00
updated: 2026-09-20T00:49:00+08:00
status: active
---

# MemoFlow UI Form Polish & Product Surface Refinement

## 1. 背景与目标

Goal vNext 已经证明一条更适合 MemoFlow 的产品表单路径：

```text
Identity first
+ lightweight property chips
+ progressive disclosure
+ owner-specific detail editors
```

这套方向参考 Linear 的高密度 property row / progressive disclosure，但不复制团队项目管理属性。当前代码已经存在三种成熟度不同的形态：

1. **Goal**：Name + Summary + Status / Start / Target / Labels / Reminder / Notes property chips，当前最接近 North Star。
2. **Task**：已经是 property-chip first，但 Basic Info 仍保留传统 section/label/form 视觉，且 chip 样式与 Goal 重复实现。
3. **Schedule**：仍是传统长表单，一次性铺开标题、描述、全天、起止日期、起止时间、冲突检测、地点、参与者，是本轮最明显的 UI 密度问题。

本轮目标不是“把所有输入框都改成圆角胶囊”，而是建立一套可推广的 **MemoFlow Product Form Language**：

- 高频、强语义文本永远首先出现；
- 结构化属性使用紧凑 property chips；
- 低频属性默认收起，点击后局部编辑；
- 同一时刻最多展开一个主要属性编辑器；
- 长内容、复杂子对象保留独立 section / drawer / workspace，不塞进 property row；
- 所有 create/edit dialog 统一 draft/error/loading/focus/scroll/footer 行为；
- UI 收敛不改变领域 owner、contract 与持久化真值。

## 2. 当前代码审计

### 2.1 Goal

当前：

```text
GoalDialog
├─ Name
├─ Summary
├─ property chips
│  ├─ Status
│  ├─ Start
│  ├─ Target
│  ├─ Labels
│  ├─ Reminder
│  └─ Notes
└─ Key Results
```

问题：

- property chip 的视觉 class 仍在 Goal / Task 各自重复；
- Name 仍有传统 Label + bordered Input，Summary 仍是普通 Input，视觉层级还可进一步接近“identity editor”；
- status/read-only chip 与可交互 chip 没有共享的产品级 primitive。

### 2.2 Task

当前已经通过 `TASK-7307` 实现：

```text
Task title + description
[Schedule] [Recurrence] [Goal] [Reminder] [Checklist] [Properties]
                  ↓
            one inline editor
```

问题：

- `BasicInfoSection` 仍展示“基本信息”标题、Info icon、Label、传统输入框网格；
- property chip button 样式与 Goal 重复；
- property editor panel 有正确的 progressive disclosure，但视觉语言尚未抽为共享 primitive。

### 2.3 Schedule

当前 `CreateScheduleDialog` 是传统长表单：

```text
Title
Description
All day
Start date | Start time
End date   | End time
Auto detect conflicts
Location
Attendees
```

问题：

- 低频属性永久占据空间；
- date/time 是一个完整 grid，而不是“当前值摘要 + 点开编辑”；
- dialog 没有使用 `ProductDialogShell`；
- 与 Goal / Task 的 create/edit 心智模型不一致；
- 组件自己维护滚动容器/footer，而共享 shell 已经提供统一解法。

### 2.4 其他 UI

- Account/Profile 等仍有传统 Form，但并非所有表单都适合 property chips。
- Settings/provider onboarding 已经有“先选择，再展开配置”的渐进披露思路，应保留业务语义而非机械统一。
- 页面级 `LinearPageHeader / LinearListItem / LinearSidebarItem / LinearPanel` 已存在，可作为后续整体页面精修的基础。

## 3. MemoFlow Product Form Language

### 3.1 Identity zone

创建对象时首屏只展示最重要的 identity：

```text
Large title input
Lightweight summary / description
```

原则：

- title/name 强视觉；
- summary/description 弱视觉；
- 不用“基本信息”卡片包裹 identity；
- label 可以视觉隐藏，但必须保留 accessible name；
- validation 在用户交互后就地出现，不用常驻说明块占据高度。

### 3.2 Property row

适合 chip 的属性必须同时满足：

- 值可以被短文本摘要；
- 用户不需要持续看到完整编辑器；
- 点开编辑不会破坏上下文；
- 它是对象的 property，而不是一个复杂子工作流。

统一高度：32px；允许 wrap；图标 14px；文本以摘要值优先。

### 3.3 Property editor

点击 chip 后：

- inline panel / popover 展开；
- 同一 group 一次只展开一个；
- 再次点击同一个 chip 关闭；
- panel 使用轻背景 + 细边框，不再套第二层重型 card；
- 完成修改后 chip 自身立即投影摘要值。

### 3.4 Advanced / complex content

以下内容不强行 chip 化：

- KR editor；
- Task checklist items；
- Reminder multi-trigger editor；
- Provider secret / OAuth；
- Knowledge document；
- 长文本正文。

它们可以由 chip 作为入口，但内部仍使用适合业务的 editor。

### 3.5 Dialog shell

所有主业务 create/edit dialog 优先使用 `ProductDialogShell`：

- canonical header；
- single scroll owner；
- sticky footer；
- stable initial focus；
- draft-preserving error state；
- responsive max height。

## 4. 共享 UI primitive

### UFP-1001 — Product property primitives

新增：

- `ProductPropertyChip.vue`
  - interactive / active / disabled；
  - slot icon；
  - 单行摘要；
  - canonical 32px radius/density/focus；
  - `aria-pressed` 只在提供 active 时出现；
  - attrs/test id 正常透传。

本轮先不创建过度抽象的万能 Form DSL。只有当第二个以上 editor panel 出现完全相同结构时，才抽 `ProductPropertyPanel`。

**Acceptance**：Goal、Task、Schedule 不再复制 `h-8 rounded-full px-3 font-normal` chip class。

## 5. 第一批实施

### UFP-1002 — Goal visual polish

- property chips 切到共享 `ProductPropertyChip`；
- Name 改为 identity-style 大输入，不再显示传统 form label；
- Summary 改为轻量 summary 输入；
- 保留现有 Status / Start / Target / Labels / Reminder / Notes 语义与测试契约；
- 不改变 Goal contract / lifecycle / GoalTimeframe。

### UFP-1003 — Task visual polish

- property chips 切到共享 `ProductPropertyChip`；
- `BasicInfoSection` 去掉“基本信息”section chrome 与 Info icon；
- Title / Description 改成 identity-style；
- 保留 Schedule / Recurrence / Goal / Reminder / Checklist / Properties progressive disclosure；
- 不改变 `TaskPlanViewModel` 与 TASK-7307 contract。

### UFP-1004 — Schedule property-chip conversion

重写 `CreateScheduleDialog` presentation，不改请求 contract：

```text
Title
Description

[When] [Location] [Attendees] [Conflict check]

<only one expanded property editor>

Cancel / Create
```

`When` editor 内保留：

- All day switch；
- Start date / time；
- End date / time。

Location / Attendees / Conflict 分别由自己的 chip 打开 editor。

要求：

- 使用 `ProductDialogShell`；
- 保持失败时不关闭、不丢 draft；
- 保持成功才 reset；
- 保持 timed / all-day range contract；
- conflict detection 在 AllDay 时仍不提交为 true；
- 编辑既有 CalendarEntry 时值完整回填。

## 6. 第二批实施

### UFP-1005 — Secondary form inventory + selective migration

逐项审查：

- Account Profile；
- Label create/edit；
- Repository dialogs；
- Provider onboarding；
- cloud/profile connection；
- remaining schedule/admin dialogs。

每个表单先分类：

```text
A. compact property editor -> migrate
B. wizard/onboarding -> keep staged flow
C. long-content editor -> keep full editor
D. destructive/security flow -> keep explicit traditional confirmation
```

禁止为了视觉一致而牺牲任务语义。

### UFP-1006 — Page-level surface polish

在表单语言稳定后再推广页面：

- 页面 header density；
- toolbar 主次动作；
- list row hover/selection；
- empty/loading/error states；
- detail page property rows；
- sidebar section spacing；
- 减少重复 card-in-card 与边框层级；
- 窄面板/桌面宽屏矩阵。

优先复用现有 `LinearPageHeader / LinearListItem / LinearSidebarItem / LinearPanel`。

## 7. 验证策略

### Unit / surface

- shared chip component behavior；
- Goal dialog convergence lock；
- Task property-chip anti-resurrection lock；
- Schedule dialog submission lifecycle；
- Schedule 新 property-chip surface lock。

### Type / lint / build

```text
pnpm nx run app-vue:test
pnpm nx run app-vue:typecheck
pnpm nx run app-vue:lint
pnpm nx run app-vue:build
```

### Product validation

第一批完成后在 local Docker 验证：

1. Goal create/edit；
2. Task create/edit；
3. Schedule create/edit；
4. narrow business panel；
5. keyboard-only create flow；
6. failed submit preserves draft；
7. no nested-scroll/footer clipping。

## 8. 非目标

本轮不做：

- 改 Goal / Task / Schedule domain model；
- 引入另一个 UI framework；
- 为了模仿 Linear 增加 MemoFlow 不需要的团队属性；
- 把所有 settings/security forms 强行 property-chip 化；
- 重新设计移动端完整信息架构。

## 9. 执行顺序

```text
UFP-1001 shared primitive
      ↓
UFP-1002 Goal polish ─┐
UFP-1003 Task polish ─┼─ parallel-safe at component level
      ↓               │
UFP-1004 Schedule ────┘
      ↓
focused tests + typecheck + lint + build
      ↓
local Docker product validation
      ↓
UFP-1005 secondary forms
      ↓
UFP-1006 page-level polish
      ↓
final UI/a11y/product review
```

## 10. 当前状态

- [x] Current UI audit
- [x] Product Form Language documented
- [x] UFP-1001 shared property primitive
- [x] UFP-1002 Goal polish
- [x] UFP-1003 Task polish
- [x] UFP-1004 Schedule property-chip conversion
- [x] Focused validation
- [ ] Local Docker validation
- [x] UFP-1005 secondary form inventory
- [ ] UFP-1005 selective migration remainder
- [ ] UFP-1006 page-level refinement

## 11. First implementation checkpoint — 2026-09-20

UFP-1001～1004 已完成第一轮实现：

- 新增共享 `ProductPropertyChip`，统一 32px property trigger、active/disabled/focus/a11y 语义；
- Goal 的 Start / Target / Labels / Reminder / Notes 入口收敛到共享紧凑视觉，Name + Summary 改为 identity-first editor；
- Task 六个 property chips 使用同一 primitive，`BasicInfoSection` 删除传统 section chrome，Title/Description 改为 identity-first editor；
- Schedule 创建/编辑从常驻长表单改为 `ProductDialogShell + identity + When/Location/Attendees/Conflict property row`，同一时间只展开一个 editor；
- 所有 identity 输入保留明确 keyboard focus presentation，不以“无边框”牺牲可访问性；
- Goal / Task / Schedule domain/DTO/submission contract 均未修改。

验证证据：

- focused UI/anti-resurrection：6 files / 22 tests PASS；
- App-Vue full suite：200 files / 796 tests PASS；
- App-Vue typecheck PASS；lint 0 errors（8 个既有 warnings，无本轮新增）；build PASS；
- Web typecheck + production build PASS；
- Desktop typecheck + production build PASS；
- `docs:check` PASS；`governance:check` PASS；
- `git diff --check` PASS。

UFP-1005 inventory 已落到 `docs/analysis/2026-09-20-ui-form-and-surface-refinement-inventory.md`，并开始 selective migration：GoalRecord 改为共享 shell + quick-value property triggers；Task AI generation 与 Template selection 统一到 `ProductDialogShell`，但保留它们本来的 complex-editor / selection-grid 语义。Template selection 原有 outside-interaction lock 通过 `preventInteractOutside` 进入共享 shell，并有行为测试防止迁移时回归。

交互预览已部署为独立 Web preview，复用既有 SYS-3003 validation backend，不替代 canonical staging：`https://gcp-dev-01.taile92a8e.ts.net:20300/`。Web 与经 Nginx proxy 的 `/api/auth/capabilities` 均返回 HTTP 200，preview container healthy。完整 fresh local-Docker acceptance 仍保留为后续 gate。

下一步继续 UFP-1005 remainder，再进入 UFP-1006 页面级 density/toolbar/list/detail polish。
