---
tags:
  - product
  - goal
  - ui
  - workspace
  - linear
  - ai
description: Goal vNext 创建、编辑、详情 Workspace、KR、Task 与 Knowledge Context 的 UI North Star
created: 2026-09-08T17:55:00+08:00
updated: 2026-09-08T17:55:00+08:00
status: target-design
---

# Goal vNext Workspace & Create UI

## 1. North Star

Goal UI 不再像“填写一张数据库表”，而应像一个紧凑的个人目标工作区：

```text
Goal identity
+ lightweight properties
+ measurable outcomes
+ related actions
+ related knowledge
+ progress/review context
```

视觉交互参考 Linear Project 的 property chips、Overview、Resources、Milestones，但只复用适合个人 MemoFlow 的部分。

领域真值见 ADR-067~070。

## 2. Manual Create Goal

推荐结构：

```text
┌──────────────────────────────────────────────────────────┐
│ 🎯 New goal                              [Create with AI] ×│
│                                                          │
│ Goal name                                                │
│ Short summary...                                         │
│                                                          │
│ [Planned] [Start] [Target] [Labels] [Reminder] [Notes]  │
│                                                          │
│ ──────────────────────────────────────────────────────── │
│                                                          │
│ Key Results                                              │
│                                                          │
│ ◇ Complete 100 qualified applications     [Target: Oct] │
│   0 → 48 → 100 applications                      48%     │
│                                                          │
│ ◇ Get 10 technical interviews             [Target: Nov] │
│   0 → 4 → 10 interviews                          40%     │
│                                                          │
│ + Add key result                                         │
│                                                          │
│                                           [Create goal]  │
└──────────────────────────────────────────────────────────┘
```

## 3. Goal header fields

### 3.1 Name

大号单行输入，创建 Goal 唯一强必填文本字段。

Placeholder：

```text
你想实现什么？
```

### 3.2 Summary

紧跟 Name 的轻量短摘要，不用大 Textarea：

```text
用一两句话说明成功意味着什么…
```

Summary 应可直接 inline edit，不占据创建页大量垂直空间。

不再展示：

```text
Description 大文本框
Motivation
Feasibility Analysis
```

这些长内容通过 Notes/AI Goal Brief 表达。

## 4. Property chips

默认 property row：

```text
[Planned] [Start] [Target] [Labels] [Reminder] [Notes]
```

每个 chip 点击打开 popover，完成后 chip 直接显示值：

```text
[In Progress]
[Start: Sep 8]
[Target: Q4 2026]
[#求职 +2]
[Reminder: 2]
[Notes: 3]
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

## 5. Status chip

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

## 6. Start chip

Start 是 exact product date：

```text
Start date
[calendar]
```

不使用 time-of-day。

## 7. Target chip

Target popover 参考 Linear 的紧凑选择：

```text
Target
[ Try: May 2027, Q4, 2027/05/20 ]

[Day] [Month] [Quarter] [Half-year] [Year]

(calendar / period picker)
```

支持键盘自然输入与显式粒度切换。

展示必须保留用户选择精度：

```text
Q4 2026
```

不能偷偷显示成：

```text
Dec 31, 2026
```

## 8. Labels chip

复用 Shared Label picker：

```text
Labels
- search existing
- multi-select
- create new label
```

选中后 chip 只显示高密度摘要，例如：

```text
[#AI #求职]
```

或：

```text
[Labels: 3]
```

## 9. Reminder chip

Reminder 是 Goal 的 support property，不应该像传统表单一样常驻占据整块。

Popover 可配置：

```text
Target approaching
Periodic review reminder
Custom reminder
```

粗粒度 Target 的 relative reminder 以 timeframe end boundary 为 reference，并在 UI 中说清楚“目标周期结束前”。

## 10. Notes chip / Knowledge context

创建 Goal 时 Notes chip 支持：

```text
Link existing note
Create new note
```

Manual flow 不强迫用户写长 description。

创建后 Goal Workspace 中单独展示 Knowledge section。

## 11. Key Result list

KR UI 参考 Linear Milestone 的紧凑 list/block，但保留 KR 的 outcome measurement 语义。

Row：

```text
◇ 完成 100 次高质量投递                         Target: Oct
  0 → 48 → 100 次                                     48%
  █████████░░░░░░░░░
  2 linked tasks >
```

不要把 KR 显示成 Task checklist。

## 12. Add / Edit KR

默认编辑器：

```text
Key result
[ title ]

Initial       Current       Target
[0]           [48]          [100]

Unit [次]
Target timeframe [Oct 2026]

▸ Advanced

Cancel                              Add key result
```

### 12.1 Initial 必须显示

默认：

```text
Initial = 0
Current = 0
```

用户可直接改成：

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

不再把 progress 0% baseline 隐藏到高级设置。

### 12.2 Advanced

只放低频属性：

```text
Description?
Aggregation Method [Sum]
Weight [3]
```

`trackingBaseValue` 永远不作为普通 UI 输入。

## 13. Manual create 不默认同时创建 Task

保持手工路径简单：

```text
Manual Goal Create
 -> Goal + KR + labels + planning properties
```

用户可以在 Goal Workspace 创建/关联 Task，或由 AI Plan 一次性提出 Task。

原因：把 Task editor 塞回 Manual Goal form 会重新扩大创建认知负担，并模糊 Goal/Task owner boundary。

## 14. AI Create with Agent

`Create with AI` 打开 GoalPlanDraft V2 flow：

```text
User intent
 -> AI draft
 -> preview Goal/KRs/Tasks/Knowledge
 -> edit/remove
 -> Approve
 -> Apply
 -> Goal Workspace
```

Preview 应显式分区：

```text
Goal
Key Results
Tasks
Knowledge
Warnings
```

用户不必接受 AI 建议的全部 Task/Note。

## 15. Goal Workspace Detail

推荐：

```text
← Goals

找到 AI 全栈开发工作
2026 年 Q4 获得 AI Agent / AI 全栈方向正式 Offer

[In Progress] [Start: Sep 8] [Target: Q4 2026] [#求职] [#AI] [Reminder]

────────────────────────────────────────────────────
Overall progress                                           48%
████████████████░░░░░░░░

Key Results
────────────────────────────────────────────────────
◇ 完成 100 次高质量投递                         Target: Oct
  0 → 48 → 100 次                                     48%
  2 linked tasks >

◇ 获得 10 次技术面试                            Target: Nov
  0 → 4 → 10 次                                       40%
  3 linked tasks >

◇ 获得正式 Offer                               Target: Q4
  0 → 0 → 1 个                                         0%
  1 linked task >

Tasks                                                     6 >
────────────────────────────────────────────────────
整理 AI 公司池
优化 AI 全栈简历
每日筛选并投递岗位

Knowledge                                                 4 >
────────────────────────────────────────────────────
📄 Goal Brief：AI 全栈求职
📄 杭州 AI 公司调研
📄 技术面试复习路线
📄 简历优化策略

Recent progress
────────────────────────────────────────────────────
...

Reviews
────────────────────────────────────────────────────
...
```

## 16. Task section boundary

Goal Workspace 只显示：

- summary/count；
- 少量 preview；
- KR linked count；
- create/link shortcut；
- deep-link。

完整 Today/Upcoming/recurrence/execution history 留在 Task 模块。

点击：

```text
Tasks 6 >
```

进入：

```text
/tasks?goalId=...
```

点击 KR 的 linked tasks：

```text
/tasks?goalId=...&keyResultId=...
```

## 17. Knowledge section boundary

Knowledge section可以：

```text
Link existing note
Create note
Open note
Unlink from goal
```

Unlink 不删除 Note。

Goal 删除也不应删除 Note；只删除 relation。

## 18. Past Target presentation

Target 过去后 Goal header 可以出现轻量 signal：

```text
Past target
已过目标时间
```

但不使用红色强“Overdue”任务语义，也不自动改变 status。

更合适的 action：

```text
Review goal
Adjust target
Mark completed
Abandon
```

## 19. Empty states

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
[Link note] [Create note]
```

## 20. Draft behavior

Manual form close时可以保留 UI 层临时状态/本地 autosave，但不创建 `GoalStatus.Draft`。

AI GoalPlanDraft 由 durable workflow 保存，仍不进入 Goal aggregate。

## 21. Responsive / Desktop parity

Web/Desktop 使用同一信息架构。React/Mobile 可按屏幕压缩：

```text
property chips horizontal scroll / wrap
Task/Knowledge preview reduced
full context via section navigation
```

不能通过移动端删除核心字段或重新引入另一套 Goal contract。

## 22. 验收原则

1. 创建页主要属性都可以通过 chips 完成；
2. Name + Summary 取代传统大 Description 区域；
3. Goal Target 能保留 Day/Month/Quarter/Half-year/Year 精度；
4. KR 显示 Initial/Current/Target；
5. Goal Workspace 可看 Task 与 Knowledge context；
6. Task/Note 仍由各自 owner 管理；
7. AI draft 能预览 Goal/KR/Task/Knowledge；
8. UI 不复制 Linear 的团队项目管理属性；
9. `Past target` 与 Task `Overdue` 视觉/语言清楚区分。
