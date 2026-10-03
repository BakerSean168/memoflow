---
tags:
  - product
  - task
  - vnext
description: Task Plan / Occurrence / Workspace 最终产品模型与创建、执行、详情交互
created: 2026-09-08T19:30:00+08:00
updated: 2026-09-29T13:35:00+08:00
---

# Task vNext — Plan / Occurrence / Workspace

## 1. 产品语言

用户主要看到：

```text
任务（Task）
今天要处理的任务（Occurrence，包含 overdue）
计划（Plan）
```

内部 canonical domain language：`TaskPlan` 与 `TaskOccurrence`。不再在产品文案出现 Template / Instance。

## 2. 创建 Task

创建 UI 采用轻量 property chips，而不是大块“模板配置表单”：

```text
任务名称
简短执行说明…

[今天] [全天] [不重复] [重要性] [标签] [目标] [提醒]

Checklist
+ 添加步骤
```

点击重复：

```text
每天 / 每周 / 每月 / 每年
interval
weekday
结束：永不 / 日期 / 次数
```

Goal chip 支持只选 Goal；需要把 Task 完成结果写入 KR 时才要求进一步选择 KR。绑定 KR 后支持：仅关联、自动记录固定值、完成时记录。

### 2.1 Quick Task

保留真正的快速捕获路径，不让每次记录动作都进入完整 Plan 表单：

```text
做什么？
[________________]

默认：今天 · 全天
                    创建
```

Quick Task 用于：

- Task Capsule；
- Today Overview；
- AI 快捷入口；
- 后续可选 global command。

创建后需要 recurrence / Goal / Checklist / Reminder 等复杂配置时，再进入 Task Plan Workspace 或完整 Task dialog。

Quick Task 与 Full Create 是两个 intent，不合并成一个越来越复杂的万能表单。

### 2.2 Task Native Surface family

Task 对外不再维护大量入口特化 UI。用户认知只保留：

```text
Task Full Surface
+
Task Quick Surface
```

Full Surface 是 Task Home / Task Plan Workspace；Quick Surface 是 Capsule、Home、Schedule、Notification、AI contextual work 复用的高频执行层。

目标组件边界：

```text
TaskOccurrenceQuickRow
        ↓
TaskOccurrenceCompactList
        ↓
TaskQuickSurface
```

`TaskCapsulePreview` 只是 Quick Surface 的一个宿主，不是其它模块应该直接复用的业务组件。

## 3. Today / Schedule handoff

Task Home 只保留 `Today | Plans`。Today 以 Occurrence 为核心：

```text
○ 投递 5 个 AI 岗位
  09:00 · 求职 · → 找到 AI 全栈工作
```

Overdue 只是提示，并继续留在 Today 的待处理范围：

```text
昨天 · 已逾期
[已完成] [未完成] [跳过]
```

不自动判 Missed。用户可以在逾期后补标 Completed，也可以明确选择 Missed 或 Skipped。

未来安排不再在 Task 内维护独立 Upcoming 列表。需要查看未来时间分布时进入 Schedule / Calendar，由 Schedule 作为未来安排的唯一浏览入口。

### 3.1 Occurrence interaction

高频执行尽量不离开 Today：

```text
○ 植物观察打卡                    全天
  第 5 / 15 次
  □ 上传照片

[完成]
... -> [未完成] [跳过]
```

点击整行只在确实需要更多信息时打开 compact Inspect Dialog；只有窄容器或边侧浏览确有优势时才退化为 Sheet：

```text
Occurrence Inspect
├─ 本次时间/状态
├─ Checklist snapshot
├─ Result / note
├─ Goal/KR context
└─ 查看计划 -> /tasks/:planId
```

不新增 `TaskOccurrenceDetailView`。TaskPlan 才是独立 owner workspace。

所有 Quick Surface 的 Complete/Uncomplete/Missed/Skipped/Checklist action 通过 Task-owned canonical action contract；尤其 Complete 不允许 Capsule/Home/Schedule 直接绕过 completion-time KR measurement。详见 ADR-112。

## 4. Task Plan Workspace

```text
每天投递 5 个 AI 岗位
[Active] [每天 09:00] [高重要性] [求职] [Goal/KR]

执行概览
18/30 completed · 2 missed · 1 skipped

最近执行
今天 Pending
昨天 Completed
前天 Missed

Checklist definition
相关 Notes
Reminder policy
计划设置
```

### 4.1 Lifecycle actions

普通用户只需要：

```text
Active Plan
├─ 暂停
├─ 结束计划
└─ 删除误创建

Paused Plan
├─ 恢复
├─ 结束计划
└─ 删除误创建
```

其中：

```text
结束计划 -> Abandon -> Closed + Abandoned
```

结束计划必须同时停止：

- future occurrence materialization；
- 已生成但尚未执行的 future occurrence；
- future reminders；
- Schedule 中的 future projection。

`Archive` 不进入普通 Task lifecycle UX。它只保留为 secondary/internal visibility metadata；未来若真的增加 Archives 产品面，再单独设计 Archive/Restore。

### 4.2 Outcome

不向用户显示“完成规则”配置。

```text
Overdue
-> unresolved

用户明确：
Completed / Missed / Skipped
```

有限 Plan：

```text
仍有 Pending / InProgress -> Open
全部已解析 + 无 Missed -> Succeeded
全部已解析 + 有 Missed -> Failed
```

无限 recurrence：

```text
Open until Abandoned
```

Missed/Skipped 后续允许纠正成 Completed，并重新评估 Plan outcome。Overdue 本身永远不自动变 Missed/Failed。

## 5. Checklist

Plan 定义步骤；Occurrence 独立保存本次勾选状态。修改 Plan checklist 仅影响未来新 occurrence，不篡改历史。

## 6. Notes / Goal context

Task Detail 能看到 Goal/KR 和相关 Note，但它们是 cross-module context projection，不成为 TaskPlan owned state。Note durable reference 使用 ADR-090 `KnowledgeDocumentRef`；禁止把 path-derived projection id 固化为长期关联。

### 6.1 Task completion → KR record

绑定 KR 后支持三种产品模式：

```text
仅关联
自动记录固定值
完成时记录
```

`自动记录固定值` 用于简单、可预先确定的自动更新；`完成时记录` 在用户点击 Complete 时打开 measurement-aware 记录弹窗，让用户输入本次实际值。

KR 聚合语义仍由 Goal owner 决定：

```text
Sum                 -> 本次变化 / delta
Average / Max / Min / Last -> 本次记录值 / sample
```

完成时记录弹窗展示 Current / After / Target 的实时预览，但最终 GoalRecord 与 currentValue 仍由 Goal owner 权威计算。Task 完成与 GoalRecord intent 通过 durable Task → Goal outbox 连接，不采用前端双写。

### 6.2 完成时记录 Dialog

示例：

```text
◎ 更新关键结果
  每周平均专注时长 · 平均值

本次记录
[ 3.5 ] 小时

      Current      After        Target
         ●──────────● - - - - - ○
        2.8         3.1          4.0

记录后进度 77.5%

[仅完成任务]                  [记录并完成]
```

输入改变时 After / progress / preview 同步变化。

模式语义：

```text
Sum
-> 输入 delta，可为正/负

Average / Max / Min / Last
-> 输入 sample
```

Max/Min 的 sample 若不会改变 current，也要明确显示“记录已保存，当前最大/最小值保持不变”。

Task Plan 可以为“完成时记录”保存 suggested/default value，减少重复输入；用户每次仍可以修改实际值。

### 6.3 Source correlation 与用户可修正性

自动 fixed record 与用户 completion-time measurement 都需要关联 occurrence，以保证幂等和撤销；但二者 provenance 不同：

```text
TaskAutomatic
-> system fact
-> 不允许普通手工改值

TaskUserMeasurement
-> 用户输入事实
-> 保留 occurrence source
-> 允许 Goal-owned correction 修改 value/note
```

用户输错 measurement 时，不要求先撤销 Task 完成再重新完成。

## 7. 组件复用边界

不让 `DailyTodoWidget`、`TaskCapsulePreview`、Schedule Task action panel 分别拥有完整 execution logic。

目标：

```text
Task owner business logic
 -> TaskOccurrenceActionCoordinator
 -> TaskQuickSurface
 -> Capsule / Home / Schedule hosts
```

Host 可以选择是否显示 summary、Quick Create、View All，但不能复制 Task completion semantics。

## 8. 明确不做

- 不恢复 Upcoming Task Home；
- 不新增 TaskOccurrence detail route；
- 不把 Archive 当“结束计划”；
- 不让用户配置 `AllowCorrection / StrictNoBackfill`；
- 不让 Task 自己重写 KR aggregation；
- 不用前端 `createGoalRecord()` + `completeTask()` 双写；
- 不把 Goal/KR/Note owned state 复制进 TaskPlan Aggregate。

## 9. 相关文档

- [ADR-112 Owner Native Surface Orchestration](../architecture/adr/ADR-112-owner-native-surface-orchestration-and-quick-surface-reuse.md)
- [Native Surface Orchestration + Quick Surface vNext](./native-surface-orchestration-and-quick-surfaces.md)
- [Task second-pass deep audit](../analysis/2026-09-29-task-vnext-second-pass-deep-audit.md)
