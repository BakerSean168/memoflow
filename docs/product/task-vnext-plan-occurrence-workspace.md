---
tags:
  - product
  - task
  - vnext
description: Task Plan / Occurrence / Workspace 最终产品模型与创建、执行、详情交互
created: 2026-09-08T19:30:00+08:00
updated: 2026-09-29T08:00:00+08:00
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
