---
tags:
  - adr
  - goal
  - task
  - product
  - ui
  - simplification
description: MemoFlow 个人 Goal/Task 产品边界、信息架构与过度项目管理能力退役决策
created: 2026-08-25T14:28:00+08:00
updated: 2026-09-08T09:00:00+08:00
---

# ADR-053: Goal / Task 个人产品边界与信息架构收敛

**状态：** 已采纳并实施
**日期：** 2026-08-25  
**影响范围：** Goal、Task、contracts、database、app-vue、app-react、AI goal/task workflow、product docs  
**关联：** ADR-038、ADR-052、ADR-054、ADR-055、ADR-056

## 2026-09-08 实现状态

Goal 已收敛为 Direction + Measurement，Task 已收敛为 Action + Execution。GoalFolder / TaskFolder、Goal Focus/Comparison、Task Dependency/DAG/CriticalPath、dynamic priority 等过度项目管理 surface 已从生产 contract/domain/UI 清除；Web/Desktop 与 React/Mobile 均使用 vNext public contracts。历史章节中的旧模型仅用于说明迁移动机。

## 1. 背景

当前 Goal 与 Task 的领域能力已经明显强于个人 MemoFlow 的主产品需求：

- Goal 同时承担 OKR、文件夹、分类、父子层级、Focus Mode、Comparison、优先级、颜色、复盘、权重分析等多套心智；
- Task 同时承担 Todo、TaskTemplate 管理、TaskInstance 执行、文件夹、父子任务、四类依赖、DAG、Critical Path、动态 priority score 等项目管理能力；
- Goal 与 Task 的真实业务边界反而不够清楚，用户需要理解大量“系统如何建模”的术语；
- Goal 当前 UI 容易演化成“另一个项目管理器”，Task 当前 UI 则以 TaskTemplate 管理为主，而不是以用户每天真正执行的 TaskInstance 为主。

MemoFlow 是面向个人的长期信息与行动系统。个人 Goal 数量通常有限，Task 数量较多。系统应该优化“认知成本”和“每天使用的动作”，而不是以最大化企业项目管理表达能力为目标。

## 2. 核心决策

采用以下产品边界：

```text
Goal = Direction + Measurement
Task = Action + Execution
```

### 2.1 Goal 的职责

Goal 负责回答：

1. 我正在努力实现什么？
2. 怎样判断它达成？
3. 当前做到哪里？
4. 最近哪些事实改变了进度？
5. 我对这一阶段有什么反思？

Goal **不负责**成为每日行动编排器，不以“下一步 Task 列表”为主页面内容。

### 2.2 Task 的职责

Task 负责回答：

1. 今天以及接下来要做什么？
2. 什么时候做？
3. 是否重复？
4. 是否完成 / 跳过？
5. 这个行动是否与某个 Goal/KR 有关？
6. 完成行动后是否产生可度量的 Goal contribution？

Task 可以完全独立于 Goal 存在。Goal 也可以完全独立于 Task 存在。

### 2.3 Goal / Task 的连接

两者只通过轻量上下文与事实贡献连接：

```text
Task / Task Plan
  -> optional Goal/KR link
  -> optional measurable contribution
  -> GoalRecord
  -> KR current value
  -> Goal progress
```

Goal 页面可以展示“进度来源”和关联 Task 数量，但不复制 Task 模块的执行 UI。点击关联 Task 时通过 deep-link / context filter 进入 Task 模块。

## 3. Goal 产品能力收敛

### 3.1 保留

- Goal title / description；
- Active / Completed / Abandoned 等业务状态；
- start date（可选）；
- due date / deadline（可选）；
- Labels；
- Key Results；
- Goal Records / progress activity；
- lightweight Review；
- Task/KR link 的只读来源展示；
- Goal aggregate version / optimistic concurrency；
- Task -> Goal durable contribution 链路。

### 3.2 退役

以下能力从 Goal vNext 产品与领域中退役：

- Goal Folder；
- Goal Category；
- Parent Goal / child goal hierarchy；
- Goal rollup policy；
- Goal Importance；
- Goal dynamic Priority 0-100；
- Goal user-owned Color（分类颜色由 Label 承担）；
- Goal Focus Mode / Focus Session；
- Multi Goal Comparison；
- Goal 搜索作为常驻主界面能力；
- 独立 Progress Breakdown 页面；
- 以权重百分比为核心的分析 UI。

如果服务端存在仅为这些产品面服务的 endpoint / projection / schema / tests，实施时做 consumer inventory 后一并删除，不保留“看起来以后可能用”的僵尸接口。

### 3.3 状态与归档分离

业务状态描述目标结果：

```text
Active
Completed
Abandoned
```

“归档”不是目标是否达成的业务状态。若仍需要隐藏历史目标，使用 `archivedAt` 作为显示层归档属性，而不是 `GoalStatus.Archived`。

Goal 的完成不能只由 overall progress 数值决定；详见 ADR-055。

## 4. Task 产品能力收敛

### 4.1 用户只需要理解“任务”

用户创建入口统一为：

```text
+ 新建任务
```

不再把“快速任务”和“新建任务计划/模板”作为两个同级概念暴露。

内部可以继续使用定义/实例模型，但产品语言按以下方式表达：

- Task：用户看到并执行的具体任务；
- Repeating Task / Task Plan：重复规则与一组实例的来源，仅在需要管理重复规则时出现；
- Task Instance：内部/技术术语，日常 UI 不要求用户理解。

### 4.2 Task 首页以执行事实为主

默认 Task 首页优先展示 Task instances，而不是 TaskTemplate cards：

```text
Today
Upcoming
All
Completed
```

用户每天首先看到真正需要完成的任务。

重复规则进入二级管理面，例如“管理重复任务”。

### 4.3 保留

- one-time task；
- recurrence；
- recurrence end date / occurrence count；
- reminders；
- labels；
- checklist；
- simple priority；
- execution status；
- completion / uncomplete / skip；
- Goal/KR link；
- Goal contribution settlement；
- execution history / recurrence statistics 中真正可行动的部分。

### 4.4 退役

以下能力从个人 Task vNext 退役：

- Task Folder；
- TaskTemplate parent hierarchy；
- Task DAG view；
- Critical Path；
- Finish-to-Start / Start-to-Start / Finish-to-Finish / Start-to-Finish 四类依赖；
- relation filter（blocked / parented / dependencies / children）；
- dynamic priority score 0-100；
- Importance + dynamic Priority 两套并行优先级；
- 卡片中的 Graph locate 操作；
- 为项目排程服务的复杂关系统计。

如未来真实个人场景需要“B 必须等待 A”，重新引入单一 `BlockedBy` 语义，而不是预先维护完整 CPM 模型。

## 5. 时间配置 UI 决策

`TaskTimeType` 可以继续作为内部值对象，但 UI 不再要求用户选择“全天 / 时间点 / 时间段”这种领域枚举。

UI 使用：

```text
日期 [今天]
时间 [全天]
```

交互推导：

- 无时间：AllDay；
- 一个时间：TimePoint；
- 开始 + 结束：TimeRange。

目标是隐藏实现类型，而不是删除内部精确时间语义。

## 6. Goal Detail 的边界

Goal Detail 的主信息架构：

```text
Goal identity / labels / date
Overall progress + completion conditions
Key Results
Recent progress activity
Reviews
```

Task 信息只作为上下文：

```text
2 个任务正在贡献此 KR
```

点击后进入 Task 模块并携带 `goalId/keyResultId` context filter。

Goal Detail 不嵌入完整 Task list，不承担 Today/Upcoming 等执行视图。

## 7. Review 收敛

Review 是 Goal 的附属反思记录，不再作为复杂独立工作流。

退役：

- reviewType；
- rating；
- user-authored title；
- weekly/monthly/quarterly/final 等强制分类。

保留的最小语义：

- reviewedAt；
- reflection/summary；
- challenges；
- adjustments / next changes；
- KR snapshot / Goal progress snapshot。

创建 Review 时系统先呈现“这段时间发生了什么”的上下文，再要求用户反思；不再提供空白作文式表单。

## 8. UI North Star

### Goal

```text
[进行中 5 ▾] [标签 2 ▾]                         [+ 新建目标]

完成 MemoFlow 0.11                                      64%
#工作 #AI                                  8/25 -> 9/30
████████████████░░░░░░
3 个关键结果 · 1 个已完成
```

### Task

```text
任务                                             [+ 新建任务]
[今天 5] [即将到来] [全部] [已完成] [标签 ▾]

○ 植物观察打卡                         全天
  第 5 / 15 次 · #二课
  🎯 毕业 / 二课分

○ 修改 MemoFlow Provider UI             全天
  #工作 #AI
```

## 9. 外部参考与取舍

本决策吸收以下成熟模式，但不复制其整体产品复杂度：

- **Leantime**：Goal/metric 追踪 outcome，而 milestone/task 追踪 delivery；采用“结果与执行分离”，不采用其团队 Project/Milestone/Gantt 结构。
- **Super Productivity**：Today 是由时间派生的系统视图，Tag 是用户分类；采用“系统视图 != 用户标签”。重复任务按规则生成实例；不采用其完整 Project/Tag/Board/集成复杂度。
- **Vikunja**：Label 跨 Project 使用且可即时创建；采用 first-class label 与组合筛选，不采用其 Project/Kanban/Gantt 作为 Goal 组织方式。
- **Tasks.org**：普通任务创建简单，高级 recurrence/filter 逐步展开；采用 progressive disclosure，不把复杂 filter builder 直接放到主页面。

详细研究见 `docs/analysis/2026-08-25-goal-task-vnext-open-source-study.md`。

## 10. 与既有 ADR 的关系

- **ADR-038** 的 Goal 一致性、乐观锁、Task outbox、幂等 GoalRecord 继续有效；其 Task binding 产品语义由 ADR-056 进一步修订。
- **ADR-052** 的 AI workflow / HITL / deterministic apply 继续有效；其中 GoalPlanDraft 的 `category`、`importance`、`taskTemplates` 等旧字段需要按本决策与 ADR-054/055/056 更新。
- ADR-015 的开发期 simplicity preference 支持直接删除无用 schema / compatibility path；实施前确认没有生产数据迁移要求。

## 11. 不采用的方案

### 11.1 把 Goal 变成 Project

不采用。Goal 不承担完整 Task hierarchy / workflow / dependencies。

### 11.2 把 Task 强制归属 Goal

不采用。大量个人 Task 是临时行动，与长期 Goal 无关。

### 11.3 继续保留功能但“先隐藏 UI”

不作为最终状态。只有存在明确 API/AI consumer 的能力才允许保留；否则领域、contracts、database 和 UI 一起退役，避免隐藏复杂度继续拖累维护。

### 11.4 用更多页面解释复杂模型

不采用。优先删除重复概念，而不是给它们增加 onboarding / help text。

## 12. 验收原则

重构完成后，一个新用户无需理解以下术语即可完成核心旅程：

```text
GoalFolder
Category
GoalPriorityScore
FocusMode
Comparison
TaskTemplate
TaskDependencyType
DAG
CriticalPath
TaskTimeType
```

核心旅程必须只要求理解：

```text
目标
关键结果
任务
重复
标签
记录进度
复盘
```
