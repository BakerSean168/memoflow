---
tags:
  - product
  - goal
  - ui
  - workspace
  - linear
  - ai
  - review
description: Goal vNext 创建、直接操作式 Workspace、KR/Record/Review 闭环与渐进披露 UI North Star
created: 2026-09-08T17:55:00+08:00
updated: 2026-09-29T10:20:00+08:00
status: target-design
---

# Goal vNext Workspace & Create UI

## 1. North Star

Goal UI 不再像“填写一张数据库表”，也不通过不断下钻到新页面完成日常操作。

Goal 是一个紧凑的个人目标工作区：

```text
Goal identity
+ lightweight properties
+ measurable outcomes
+ progress events
+ related actions / knowledge
+ review / diagnosis context
```

视觉交互参考 Linear 的 property chips、direct manipulation、低层级信息架构与 progressive disclosure，但只复用适合个人 MemoFlow 的部分。

核心原则：

1. **Direct Manipulation**：名称、摘要、描述、属性、KR 等优先在原位置直接修改，不设置独立“编辑模式”。
2. **Inline Editing**：高频字段点击后直接编辑，保存后回到展示态。
3. **Progressive Disclosure**：低频或深层信息用 Popover / Dialog 展开，不为了查看更多信息创建新的页面层级。
4. **Facts before interpretation**：Record/Task 等事实先形成轨迹与诊断上下文，再由用户或 AI 解释。
5. **One Goal workspace**：Goal Detail 是 Goal 领域主要上下文；KR / Record / Review 不再要求用户离开 Goal 页面完成常规操作。

领域真值见 ADR-067~070 与 Goal Measurement/Review contracts。

---

## 2. Manual Create Goal

当前 Linear-inspired 创建结构作为产品基准，不回退到传统多 section 大表单。

推荐结构：

```text
┌──────────────────────────────────────────────────────────┐
│ 🎯 New goal                              [Create with AI] ×│
│                                                          │
│ Goal name                                                │
│ Short summary...                                         │
│                                                          │
│ [Planned] [Start] [Target] [Labels] [Notes]             │
│                                                          │
│ Goal background / description...                         │
│                                                          │
│ Key Results                                              │
│                                                          │
│ ◇ Complete 100 qualified applications     [Target: Oct] │
│   trajectory / current state                              │
│                                                          │
│ + Add key result                                         │
│                                                          │
│                                           [Create goal]  │
└──────────────────────────────────────────────────────────┘
```

### 2.1 Create 阶段不展示 Reminder

Goal 创建时不要求用户同时决定提醒策略。

创建属性默认是：

```text
[Planned] [Start] [Target] [Labels] [Notes]
```

Reminder 在 Goal 已存在后，由用户在 Goal Detail 中按需添加。

理由：

- Reminder 是 support behavior，不是 Goal 定义的一部分；
- 创建阶段要求配置提醒会增加不必要心智负担；
- 用户往往需要先形成 Goal/KR，再知道哪些节点值得提醒；
- Goal Detail 已提供更合适的后置配置上下文。

---

## 3. Goal identity

### 3.1 Name

大号单行输入，创建 Goal 唯一强必填文本字段。

Placeholder：

```text
你想实现什么？
```

### 3.2 Summary

紧跟 Name 的轻量短摘要：

```text
用一两句话说明成功意味着什么…
```

Summary 应可直接 inline edit，不占据创建页大量垂直空间。

### 3.3 Description

Description 保留为 Goal 背景/边界/上下文的自由文本区域，但它不是传统表单中的“必填长描述”。

原则：

- 默认视觉层级低于 Name / Summary / KR；
- 使用自动增高输入，内容少时保持紧凑；
- 达到工作区最大高度后由 Dialog body 统一滚动；
- 不额外拆成 Motivation / Feasibility 等数据库式字段；
- 创建后在 Goal Detail 中继续 direct edit。

复杂分析、长期资料和外部内容仍优先通过 Knowledge/Notes 表达。

---

## 4. Property chips

创建阶段默认 property row：

```text
[Planned] [Start] [Target] [Labels] [Notes]
```

创建后 Goal Detail 可按需出现：

```text
[In Progress] [Start] [Target] [Labels] [Reminder] ...
```

每个 chip 点击打开 Popover/Dropdown，完成后直接显示值。

例如：

```text
[In Progress]
[2026年9月8日]
[Q4 2026]
[#求职 +2]
```

不要恢复：

```text
Priority
Lead
Members
Dependencies
Folder
Category
```

Property chip 不是“按钮堆”，而是低噪声属性入口。

---

## 5. Status

菜单：

```text
Planned
In Progress
Completed
Abandoned
```

创建时默认 Planned。

状态改变是显式用户 action；不因为 start/target/KR/Task 自动改变。

Completed / Abandoned 在创建初始状态下可以隐藏到二级区域，减少误选；编辑既有 Goal 时完整显示。

---

## 6. Start / Target

### 6.1 Start

Start 使用 `GoalTimeframe`，允许 Day / Month / Quarter / Half-year / Year 粒度。

UI 使用共享 `ProductTemporalPickerSurface`，不再由 Start 与 Target 各自维护独立 picker。

### 6.2 Target

Target 保留用户选择的语义精度：

```text
Q4 2026
```

不能偷偷显示成：

```text
Dec 31, 2026
```

只有在 reminder arithmetic、calendar projection 等需要 exact boundary 的地方才派生具体日期。

---

## 7. Labels

复用 Shared Label picker：

```text
Labels
- search existing
- multi-select
- create new label
```

选中后使用高密度摘要，例如：

```text
[#AI #求职]
```

或：

```text
[Labels: 3]
```

---

## 8. Reminder

Reminder 是 **Goal 创建后的 support property**。

它不出现在 Manual Create Goal 的默认 property row。

Goal Detail 中可以通过 More properties / Reminder row 添加：

```text
Target approaching
Periodic review reminder
Custom reminder
```

粗粒度 Target 的 relative reminder 以 timeframe end boundary 为 reference，并在 UI 中说清楚“目标周期结束前”。

---

## 9. Notes / Knowledge context

Goal 创建阶段允许提供轻量 Knowledge/Notes 入口，但不把 Knowledge 变成 Goal owned content。

创建后 Goal Workspace 展示 Knowledge context：

```text
Link existing note
Open note
Unlink from goal
```

Web 不因为 Goal 创建流程而新增独立 Note editor；Knowledge durable reference 继续由 Repository owner 管理。

Goal 删除不删除 Note，只删除 relation。

---

## 10. Key Result：Goal 内的主要 Outcome Surface

KR 不再只是一个可点击后进入详情页的 row，也不显示成 Task checklist。

Goal Detail 内的 KR 应直接把“这个结果是什么、现在在哪里、往哪里去、最近怎样变化”讲清楚。

目标结构：

```text
◇ 每周跑步距离

km
40 ┤                         ● 目标 40
   │                    ╱
30 ┤               ● 31
   │           ╱
20 ┤      ● 22
   │  ● 18
10 ┤
   └────────────────────────────
     9/1     9/8     今天      10/31

累计     权重 3      目标 10月31日
```

核心信息：

- title；
- description；
- initial/current/target；
- unit；
- calculation method；
- weight；
- target timeframe；
- trajectory；
- linked task/context count；
- quick record entry。

### 10.1 不设置常规“Edit KR”按钮

高频属性采用 direct manipulation：

```text
点击名称            -> inline edit
点击描述            -> inline edit
点击“累计”          -> calculation method menu
点击“权重 3”        -> popover
点击目标时间        -> temporal picker
点击当前点/当前值    -> quick Record
```

`...` 只保留真正低频动作，例如删除、复制、创建关联 Task 等。

---

## 11. KR Calculation Method

五种计算方式正式开放给用户，而不是藏进“高级设置”。

内部：

```text
Sum
Average
Max
Min
Last
```

用户语言：

| Internal | 用户概念 | 典型 Record 语义 |
| --- | --- | --- |
| Sum | 累计 | 本次贡献/增加多少 |
| Average | 平均值 | 本次测量值 |
| Max | 最高值 | 本次测量值，系统取最高 |
| Min | 最低值 | 本次测量值，系统取最低 |
| Last | 最新值 | 当前最新测量值 |

创建 KR 时可以给出一句短说明与场景示例，但不把它包装成技术高级选项。

`trackingBaseValue` 永远不作为普通 UI 输入。

---

## 12. KR create / inline edit

创建时仍需要一个结构化的编辑 Surface，但不回退到传统字段矩阵。

推荐继续沿用 trajectory-first 思路：

```text
Key result title
Short description

[Calculation] [Unit]                         [Target timeframe]

             trajectory editor
Initial -------------- Current -------------- Target
  0                      48                    100

Weight
```

### 12.1 Initial / Current / Target

三个值必须保留：

```text
Initial = 90
Current = 70
Target  = 55 kg
```

或：

```text
Initial = 0
Current = 50
Target  = 100 km
```

Initial 定义用户可见的 0% baseline；Current 允许用户在中途把已有计划迁入 MemoFlow。

---

## 13. Record = KR Check-in Event

Record 不是“编辑当前值”的另一个名字，而是一次可追溯的 progress/check-in event。

领域继续保存独立 value；KR current value 由 calculation method 聚合得到。

数据链：

```text
Record
   ↓
KR current value
   ↓
KR trajectory
   ↓
Goal progress
   ↓
Review facts / diagnosis
```

### 13.1 Record 输入语义随 calculation method 改变

**Sum**

```text
记录本次增加
[ +5 ] km
```

**Last**

```text
记录当前值
[ 65.2 ] kg
```

**Average / Max / Min**

```text
记录一次测量
[ 72 ] bpm
```

UI 不再对所有 KR 统一显示 `+1/+2/+5/+10` 增量语义。

### 13.2 Record UX

Record 是高频动作，应尽可能几秒完成：

- 从 KR current point/value 直接触发；
- 默认聚焦 value；
- unit 自动带入；
- note 可选；
- 保存后立即更新 trajectory；
- 更完整的 Record history 进入 KR Inspect Dialog，而不是新页面。

---

## 14. KR Inspect Dialog：深层信息，不是编辑页

`KeyResultDetailView` 不再作为目标产品 Surface。

日常操作全部留在 Goal Detail。

用户确实需要更多信息时，点击 KR 打开 Inspect Dialog：

```text
KR Inspect
├── larger trajectory
├── full Record history
├── linked Tasks
├── calculation explanation
├── data/source context
└── optional AI analysis
```

这个 Dialog：

- 不把“Edit Key Result”作为主目的；
- 关闭后仍停留在原 Goal 位置；
- 不制造 back navigation；
- 允许局部 direct manipulation；
- 适合更多数据、历史与诊断。

---

## 15. Manual create 不默认同时创建 Task

Manual Goal Create：

```text
Goal + KR + labels + planning properties
```

用户可以在 Goal Workspace 创建/关联 Task，或由 AI Plan 一次性提出 Task。

原因：把 Task editor 塞回 Goal Create 会扩大创建认知负担，并模糊 Goal/Task owner boundary。

---

## 16. AI Create with Agent

`Create with AI` 使用 GoalPlanDraft flow：

```text
User intent
 -> AI draft
 -> preview Goal/KRs/Tasks/Knowledge
 -> edit/remove
 -> Approve
 -> Apply
 -> Goal Workspace
```

Preview 显式分区：

```text
Goal
Key Results
Tasks
Knowledge
Warnings
```

用户不必接受 AI 建议的全部 Task/Note。

---

## 17. Goal Workspace Detail

推荐：

```text
← Goals

找到 AI 全栈开发工作
2026 年 Q4 获得 AI Agent / AI 全栈方向正式 Offer

[In Progress] [Start] [Target] [#求职] [...]

Goal background / description...

────────────────────────────────────────────────────
Overall progress                                           48%
████████████████░░░░░░░░

Key Results
────────────────────────────────────────────────────
◇ 完成 100 次高质量投递
  trajectory / current / target / calculation / weight

◇ 获得 10 次技术面试
  trajectory / current / target / calculation / weight

Recent progress
────────────────────────────────────────────────────
...

Reviews
────────────────────────────────────────────────────
最近复盘
[开始复盘]
```

Goal Workspace 不是“Overview 后再进入多个详情页”，而是 Goal 的 authoritative interaction surface。

---

## 18. Task boundary

Goal Workspace 只展示：

- summary/count；
- KR linked count；
- create/link shortcut；
- contextual preview；
- deep-link 到 Task filtered workspace。

完整 Today/Upcoming/recurrence/execution history 留在 Task 模块。

点击：

```text
/tasks?goalId=...
/tasks?goalId=...&keyResultId=...
```

仍然是合法的跨模块导航，因为用户是在切换 owner，而不是在 Goal 内下钻。

---

## 19. Review：不新增深层页面

Review 与 KR 一样遵循 One Goal workspace 原则。

目标：

```text
Goal Detail
 └─ Reviews
     ├─ 最近复盘摘要
     ├─ 开始复盘 -> Large Dialog
     └─ 历史 Review -> Read-only Dialog
```

`GoalReviewCreationView` 与 `GoalReviewDetailView` 不再作为目标产品 Surface。

### 19.1 Review 的信息顺序

Review 不是先给用户三个 Textarea。

顺序固定为：

```text
1. Snapshot / system facts
2. KR trajectories and changes
3. Activity evidence
4. deterministic diagnosis
5. optional AI analysis
6. manual reflection
7. next adjustments
```

原则：

> Facts first -> Diagnosis -> Reflection -> Adjustment

### 19.2 Review Snapshot

至少展示：

- review window；
- overall progress start/end/delta；
- 每个 KR 的 start/end/delta；
- trend；
- Record count；
- manual Record count；
- Task contribution count；
- 长时间无更新、显著偏离等可确定的 signal。

不要把所有事实压成一排数字卡片；优先使用轨迹图、趋势与清楚的变化表达。

### 19.3 AI 是可选辅助

主流程仍由用户完成。

AI 可以提供：

```text
[帮我分析本周期]
[使用这些内容生成复盘草稿]
```

AI 输入可包含：

- Goal/KR；
- Record；
- Task contribution；
- Knowledge context（受权限与引用边界限制）；
- previous Review；
- current review window。

AI 输出只是 draft / suggestion。

Ownership：

```text
系统事实          system
确定性诊断        deterministic product logic
AI 解释/建议      optional AI
最终复盘内容      user
```

---

## 20. Review window

默认优先使用：

```text
自上次 Review 覆盖结束以来
```

若存在 previous Review：

```text
windowStart = previousReview.systemContext.windowEndAt
windowEnd   = now
```

优先使用上次已覆盖的 `windowEndAt`，而不是 `reviewedAt`，避免因为“实际复盘保存时间晚于统计周期”产生数据空洞或重叠。

第一次 Review：

```text
now - 7 days -> now
```

用户仍可以切换：

```text
自上次复盘以来
最近 7 天
最近 30 天
自定义
```

---

## 21. Route retirement / deep-link compatibility

产品上退休深层页面不等于立即删除已有 URL。

现有 route 可以迁移为 compatibility entry：

```text
/goals/:goalId/key-results/:krId
 -> Goal Detail
 -> open matching KR Inspect Dialog

/goals/:goalId/review/:reviewId
 -> Goal Detail
 -> open matching Review Dialog
```

旧链接仍可打开相同业务对象，但不再渲染独立 detail page。

Create Review route 如果需要短期兼容，也应重定向/映射为 Goal Detail + create-review dialog state。

---

## 22. Past Target

Target 过去后 Goal header 可出现轻量 signal：

```text
Past target
已过目标时间
```

不使用 Task Overdue 的强错误语义，也不自动改变 status。

更合适的 action：

```text
Review goal
Adjust target
Mark completed
Abandon
```

---

## 23. Empty states

### No KR

```text
还没有关键结果
用可衡量结果定义怎样才算真正达成目标。
[Add key result]
```

### No Tasks

```text
还没有关联行动
你可以创建 Task，或让 AI 根据目标拆分下一步行动。
[Create task] [Ask AI]
```

### No Knowledge

```text
还没有关联知识
把指南、研究、策略或背景笔记连接到这个目标。
[Link note]
```

### No Reviews

```text
还没有复盘
等积累一段进展后，用系统事实回顾发生了什么。
[开始复盘]
```

---

## 24. Draft behavior

Manual form close时可以保留 UI 层临时状态/本地 autosave，但不创建 `GoalStatus.Draft`。

AI GoalPlanDraft 由 durable workflow 保存，仍不进入 Goal aggregate。

---

## 25. Responsive / Desktop parity

Web/Desktop 使用同一信息架构。

窄 business panel：

- property chips wrap / compact；
- KR trajectory 保留核心图形而非降级成纯文本；
- secondary metadata 渐进隐藏；
- Inspect/Review Dialog 在窄屏使用接近 sheet/full-height 的 presentation；
- 不因为屏幕变窄重新创建另一套页面层级。

Mobile 可以采用自己的 layout，但必须保持相同 Goal/KR/Record/Review contract。

---

## 26. 产品验收原则

1. Goal Create 延续当前 Linear-inspired、低心智 property-chip 方向；
2. Goal Create 不展示 Reminder，Reminder 在创建后按需添加；
3. Name / Summary / Description / properties 均支持直接操作，不存在全局 Edit mode；
4. Goal Start/Target 保留用户选择的 semantic precision；
5. KR 在 Goal Detail 中直接用 trajectory 讲清楚 Initial / Current / Target；
6. KR 五种 calculation method 对普通用户可见且有清楚语义；
7. 常规 KR 修改不需要“Edit”按钮；
8. Record 是可追溯 check-in event，输入文案随 calculation method 改变；
9. `KeyResultDetailView` 不再是产品目标，深层信息进入 Inspect Dialog；
10. Review 不创建新页面，Create/History 都在 Goal 上下文的 Dialog 中完成；
11. Review 默认覆盖“自上次 Review windowEndAt 以来”，第一次回退最近 7 天；
12. Review 先展示事实/轨迹/诊断，再进入人工 reflection；
13. AI 只作为可选分析与草稿辅助；
14. Task/Knowledge 仍由各自 owner 管理；
15. 旧 KR/Review deep link 在迁移期仍能打开相同业务对象；
16. Goal 模块完成后可作为 MemoFlow product-surface convergence 的 reference implementation。
