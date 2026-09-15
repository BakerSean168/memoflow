---
tags:
  - analysis
  - goal
  - linear
  - product
  - ui
  - reference
description: Linear Project 的 Target、Status、Overview、Documents 与 Milestone 模式对 MemoFlow Goal vNext 的参考取舍
created: 2026-09-08T17:55:00+08:00
updated: 2026-09-08T17:55:00+08:00
---

# Goal vNext — Linear Project Reference Study

## 1. 研究目的

本研究只回答：Linear Project 中哪些成熟产品模式适合 MemoFlow Goal，哪些不应该复制。

MemoFlow 仍是个人长期目标、知识与行动系统，不转型为团队项目管理工具。

参考来源：

- https://linear.app/docs/projects
- https://linear.app/docs/project-overview
- https://linear.app/docs/project-status
- https://linear.app/docs/project-milestones
- https://linear.app/docs/documents
- https://linear.app/docs/due-dates

## 2. Linear Project 的关键产品事实

### 2.1 Project 与 Issue 的日期语义不同

Linear Project 使用：

```text
Start date
Target date
```

而 time-sensitive Issue 使用 Due date。

这说明成熟产品会区分：

```text
Project / Goal planning target
vs
Task / Issue deadline
```

MemoFlow 采用该区分：Goal 使用 Target；Task 保持 Due/Overdue。

### 2.2 Target 支持不同精度

Linear Project 的 Start/Target 可以按 certainty 选择：

```text
Year
Half-year
Quarter
Month
Day
```

Linear 明确指出项目早期通常并不知道精确结束日期，因此允许用与确定性匹配的 timeframe。

MemoFlow 采用 Target Timeframe，但本轮 Start 保持精确 Ymd，控制复杂度。

### 2.3 Project properties 使用轻量 property row

Linear 在 Project name / short summary 下直接显示 property chips，例如：

```text
Status
Priority
Lead
Members
Start
Target
Labels
Dependencies
```

这个交互能让少量结构化属性高密度呈现，不需要传统“标签 + 两列日期 + 多个 Select”表单。

MemoFlow 采用交互形式，但只保留个人 Goal 真正需要的属性：

```text
Status
Start
Target
Labels
Reminder
Notes
```

拒绝复制：

```text
Lead
Members
Teams
Dependencies
enterprise project priority
```

### 2.4 Short summary 与 detailed description 分离

Linear Project Overview 同时存在：

- brief / short project summary；
- extensive detailed description；
- Resources；
- Project documents。

Detailed description 本身已经接近 document，支持更长的协作文本和链接。

这对 MemoFlow 的启发不是“也增加 summary + description + documents 三层”，而是利用 MemoFlow 已有知识系统做进一步收敛：

```text
Goal name
Goal summary
linked Knowledge Notes
```

因此 Goal 不保留长期 detailed description；长文本进入 Note。

### 2.5 Project documents / resources

Linear 允许在 Project 中创建文档、挂外部资源，并把长规格与执行对象放在同一个 Project context 中。

MemoFlow 对应：

```text
Goal Workspace
 -> linked Notes
```

但 Note 是全局可复用知识资产，不由 Goal 生命周期拥有。

### 2.6 Project status 手动维护

Linear Project status 不会因为所有 Issues 完成就自动更新；状态是人工维护的。

MemoFlow 采用同一原则：

```text
Planned
InProgress
Completed
Abandoned
```

KR progress、Task completion、target passage 都不能自动改变 Goal status。

### 2.7 Linear status categories 不应完整复制

Linear 有：

```text
Backlog
Planned
In Progress
Completed
Canceled
```

MemoFlow 取舍：

```text
Backlog   -> reject as Goal status; 留在 Inbox/Note/Draft
Planned   -> adopt
InProgress-> adopt
Completed -> adopt
Canceled  -> adapt to Abandoned
```

### 2.8 Milestone 可有 target date

Linear Project Milestone 表示项目生命周期阶段，并可设置 target date，进度由关联 Issues 计算。

MemoFlow KR 不是 Milestone：

```text
Milestone = delivery stage
KR        = measurable outcome
```

但 Milestone 的 UI 形态和可选 target 概念可参考到 KR：

```text
KR row
- measurable values
- progress
- optional target timeframe
- linked tasks count
```

不能把 KR 改成阶段节点或 Issue container。

## 3. Adopt / Adapt / Reject 矩阵

| Linear 模式                             | MemoFlow 决策         | 原因                                                 |
| --------------------------------------- | --------------------- | ---------------------------------------------------- |
| Project Target                          | Adopt                 | Goal 更像 intended achievement target，不是 deadline |
| Day/Month/Quarter/Half-year/Year target | Adopt                 | 避免伪精确日期                                       |
| Start date                              | Adopt                 | 目标计划起点明确                                     |
| Property chips                          | Adopt                 | 高密度、低认知成本                                   |
| Manual status                           | Adopt                 | 不让系统替用户推断现实状态                           |
| Planned / In Progress / Completed       | Adopt                 | 与个人 Goal 生命周期匹配                             |
| Backlog                                 | Reject as Goal status | 未决定的愿望不应污染 Goal 集合                       |
| Canceled                                | Adapt -> Abandoned    | 更符合个人目标语言                                   |
| Short summary                           | Adopt                 | Goal identity 需要一句话语义                         |
| Detailed description                    | Replace with Notes    | MemoFlow 已有知识系统，避免重复长文本层              |
| Project Documents / Resources           | Adapt -> linked Notes | 知识可复用且独立生命周期                             |
| Milestone target                        | Adapt -> KR target    | 只借 target/UI，不借生命周期阶段语义                 |
| Lead/Members/Teams                      | Reject                | 团队管理，不属于个人 Goal                            |
| Project Dependencies                    | Reject                | 重新引入过度项目管理                                 |
| Project Priority                        | Reject                | 已在 ADR-053 退役 Goal priority                      |

## 4. 对 MemoFlow 的 North Star

Linear 提供的是成熟交互参考；MemoFlow 的最终产品模型不是：

```text
Linear Project clone
```

而是：

```text
Goal Workspace
= Goal identity/planning
+ measurable Key Results
+ action context from Task
+ reusable knowledge from Notes
+ progress facts
+ review
```

因此 UI 可以像 Linear 一样清爽，但领域模型必须继续保持 MemoFlow 的个人知识 + 行动闭环。

## 5. 直接驱动的 ADR

- ADR-067：Goal Product Model / Lifecycle / Target Timeframe
- ADR-068：KR Measurement V3
- ADR-069：Goal Workspace / Task / Note Context
- ADR-070：AI GoalPlanDraft V2
- `docs/product/goal-vnext-workspace-and-create-ui.md`：具体 UI North Star
