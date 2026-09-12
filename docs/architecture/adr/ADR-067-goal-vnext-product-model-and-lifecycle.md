---
tags:
  - adr
  - goal
  - product
  - lifecycle
  - timeframe
  - summary
description: Goal vNext 核心产品模型、生命周期、Target Timeframe 与文本信息边界
created: 2026-09-08T17:55:00+08:00
updated: 2026-09-08T17:55:00+08:00
---

# ADR-067: Goal vNext Product Model、Lifecycle 与 Target Timeframe

**状态：** 已采纳，待实施
**日期：** 2026-09-08
**影响范围：** Goal domain、contracts、database、PowerSync、AI Goal draft、Goal UI、product docs
**关联：** ADR-037、ADR-052、ADR-053、ADR-054、ADR-055、ADR-056、ADR-068、ADR-069、ADR-070

## 1. 背景

Core vNext 已把 Goal 收敛为 `Direction + Measurement`，并删除 Folder、Category、Parent Goal、Priority、Focus、Comparison 等过度项目管理能力。但当前 Goal 仍有几处产品语义与领域模型没有完全收敛：

1. `dueDate` 把个人目标误建模成硬截止任务，实际更接近 intended / expected achievement target；
2. `Active | Completed | Abandoned` 缺少“已经决定要做、但尚未开始”的显式状态；
3. `description / motivation / feasibilityAnalysis` 将短摘要、长期知识、AI 分析混在 Goal aggregate；
4. 精确某一天的 `dueDate` 会迫使用户为季度、月份、年度目标提供伪精确日期；
5. 创建 UI 仍以传统字段表单呈现，未体现 Goal 少量高价值属性的产品心智。

Linear Project 被用作交互与术语参考，而不是领域模型复制对象。Linear 将 Project 的 `Start` / `Target` 与 Issue `Due` 分离，并允许 Target 使用 Day / Month / Quarter / Half-year / Year 等精度；Project status 手动维护。MemoFlow 采用这些成熟交互思想，但拒绝 Lead、Members、Dependencies、enterprise priority 等团队项目管理属性。

## 2. 核心决策

Goal aggregate 的 vNext 用户模型收敛为：

```text
Goal
├── identity
│   ├── id
│   ├── identityId
│   ├── name
│   └── summary?
│
├── lifecycle
│   └── status
│       ├── Planned
│       ├── InProgress
│       ├── Completed
│       └── Abandoned
│
├── planning
│   ├── startDate?
│   └── target?
│       └── day | month | quarter | half-year | year
│
├── measurement
│   └── keyResults[]
│
├── support
│   └── reminderConfig?
│
├── reflection
│   └── reviews[]
│
└── system
    ├── completedAt?
    ├── archivedAt?
    ├── sortOrder
    ├── version
    ├── createdAt
    ├── updatedAt
    └── deletedAt?
```

Labels、Task、Note 不进入 Goal aggregate；它们通过 Shared Label projection、TaskGoalLink、Relation 与 Goal Workspace Read Model 聚合，详见 ADR-069。

## 3. Identity：`name + summary`，长文本退出 Goal 核心状态

### 3.1 `name`

`name` 是 Goal 的身份标题：

```text
找到 AI 全栈开发工作
完成 MemoFlow 1.0
体重降到 55kg 并稳定维持
```

约束保持简洁：required、trimmed、最大长度沿用当前产品级标题约束。

### 3.2 `summary?`

新增可选 `summary`，用于一到两句话回答：

> 这个 Goal 具体意味着什么？

示例：

```text
2026 年 Q4 前获得杭州或深圳 AI Agent / AI 全栈方向正式 Offer，优先产品型团队。
```

`summary` 是列表、详情页头部、AI 预览都能快速消费的短文本，不承担知识文档职责。建议产品约束最大约 500 字符，UI 默认单行/两行编辑体验。

### 3.3 退役 Goal 核心文本字段

Goal aggregate 与公开产品 contract 最终不再保存：

```text
description
motivation
feasibilityAnalysis
```

原因：

- `description` 与 short summary / long-form Note 职责重叠；
- `motivation` 与 `feasibilityAnalysis` 更像 AI planning artifact 或长期知识；
- 这些内容可能很长、持续演化、包含引用、来源和多篇材料，不适合 Goal row 的稳定业务状态。

长文本进入关联 Note，例如：

```text
Goal Brief
├── 为什么做
├── 可行性分析
├── 风险
├── 策略
├── 约束
└── 参考资料
```

这并不删除“动机/可行性”能力，只是将其从 Goal aggregate 移到 Knowledge Context。

## 4. Lifecycle

Goal status 改为：

```text
Planned
InProgress
Completed
Abandoned
```

### 4.1 Planned

表示用户已经确认这是一个真正要追求的目标，但尚未进入实际执行阶段。

`Backlog` 不作为 Goal status。尚未决定是否追求的想法应留在 Inbox、Note、AI proposal 或未确认的 GoalPlanDraft 中，避免 Goal 列表成为愿望堆积区。

### 4.2 InProgress

表示用户当前正在追求该 Goal。

旧 `Active` 迁移为 `InProgress`，不保留 `Active` alias 作为长期公开契约。

### 4.3 Completed

表示用户确认 Goal 已达成。KR progress 可以支持判断与提示，但不得仅根据 overall percentage 自动完成 Goal。

进入 Completed 时设置 `completedAt`；从 Completed 显式 reopen 时清除 `completedAt`。

### 4.4 Abandoned

表示用户明确决定不再追求该 Goal。个人目标语义使用 `Abandoned / 已放弃`，不采用企业项目的 `Canceled / 已取消`。

### 4.5 状态只由显式业务动作改变

以下事实均不得自动改变 Goal status：

- `startDate` 已到；
- `target` 已过去；
- 所有 Task 完成；
- overall progress = 100%；
- Reminder 到期。

这些事实可以生成 suggestion / review signal，但不能替用户推断现实状态。

允许显式 correction/reopen：

```text
Planned -> InProgress | Abandoned
InProgress -> Planned | Completed | Abandoned
Completed -> InProgress
Abandoned -> Planned | InProgress
```

所有迁移必须进入领域方法与事件，不由 UI 直接改字符串。

## 5. Planning：Start Date 与 Target Timeframe

### 5.1 Start Date

Goal 的开始时间表达为产品日期：

```ts
startDate: Ymd | null;
```

它表示计划开始追求 Goal 的日历日期，不表示时区相关执行 instant，也不自动切换 status。

本轮不为 start 引入 Month / Quarter 等粗粒度 timeframe；保持精确 Date 可以控制模型复杂度。若真实使用证明需要，可由后续 ADR 扩展。

### 5.2 Target Timeframe

Goal 不再使用 `dueDate`。canonical target：

```ts
type GoalTimeframe =
  | { kind: 'day'; date: Ymd }
  | { kind: 'month'; year: number; month: 1..12 }
  | { kind: 'quarter'; year: number; quarter: 1 | 2 | 3 | 4 }
  | { kind: 'halfYear'; year: number; half: 1 | 2 }
  | { kind: 'year'; year: number };

target: GoalTimeframe | null;
```

用户因此可以自然表达：

```text
2026-10-31
2026 年 10 月
2026 Q4
2027 H1
2027 年
```

而无需把 `2026 Q4` 伪造为 `2026-12-31`。

### 5.3 Target 是预期达成窗口，不是 Deadline

`target` 表示 expected / intended achievement timeframe：

- 到了 target 并不失败；
- target 之后仍可继续追求；
- target 之后不自动 Abandoned；
- target 之后不自动 Completed；
- Task 的 `dueDate / isOverdue` 语义完全不受影响。

Goal 派生语言使用：

```text
Past target / 已过目标时间
Target approaching / 接近目标时间
```

禁止 Goal 使用：

```text
Overdue / 逾期
Deadline / 截止日期
```

### 5.4 Timeframe 正规化

Domain 提供单一 GoalTimeframe helper：

```text
startBoundary(timeframe) -> Ymd
endBoundary(timeframe)   -> Ymd
label(timeframe, locale) -> string
```

其中：

- Day：start=end=该日；
- Month：当月第一天 / 最后一天；
- Quarter：季度第一天 / 最后一天；
- Half-year：半年第一天 / 最后一天；
- Year：1 月 1 日 / 12 月 31 日。

`isPastTarget(today)` 定义为：

```text
today > endBoundary(target)
```

因此 `Target = Q4 2026` 不会在 10 月 1 日就显示“已过目标时间”。

### 5.5 排序与提醒

按 Target 排序使用 `endBoundary(target)`，无 Target 默认置后。

若 Goal reminder 使用“目标时间前 N 天”语义，粗粒度 timeframe 的 reference boundary 为 `endBoundary(target)`，UI 必须明确展示为：

```text
目标周期结束前 7 天
```

不能将 Q4 在 UI 中偷偷显示成“截止 12 月 31 日”。

## 6. Archive 与 Lifecycle 分离

`archivedAt` 保持独立显示/历史属性，不成为第五种 status：

```text
status = Completed
archivedAt != null
```

是正常组合。

归档回答“是否还需要出现在主要工作区”，status 回答“用户对这个目标做出了什么业务判断”。

## 7. Draft 不进入 Goal Status

Manual unsaved form、AI workflow draft 都不是 Goal status：

```text
GoalPlanDraft -> approve/apply -> Goal
```

不新增：

```text
GoalStatus.Draft
GoalStatus.Backlog
```

若未来提供“保存草稿”，应建独立 Draft lifecycle，而不是污染 Goal lifecycle。

## 8. Persistence 与迁移目标

最终存储必须只表达新模型，不保留长期双轨：

```text
dueDate / due_date                DELETE
Active                            DELETE from GoalStatus
motivation                        DELETE
feasibilityAnalysis               DELETE
description                       DELETE from Goal canonical model

target                            ADD canonical GoalTimeframe
summary                           ADD
Planned / InProgress              ADD
```

旧数据迁移原则：

```text
Active              -> InProgress
description         -> summary candidate only when short enough; otherwise migrate to generated Goal Brief note or preserve through explicit migration artifact
dueDate             -> target(kind = day)
motivation / feasibilityAnalysis -> Goal Brief note content where non-empty
```

不得通过长期 `oldField + newField` 兼容 DTO 掩盖迁移未完成。

## 9. Protected boundaries

本 ADR 不恢复：

```text
GoalFolder
Goal Category
Parent Goal
Goal priority score
Goal custom color
Goal Focus Mode
Multi Goal Comparison
Task DAG / Critical Path
```

也不把 Linear 的团队属性复制到 MemoFlow：

```text
Lead
Members
Teams
Project Dependencies
enterprise Project Priority
```

## 10. UI consequence

Goal 创建/编辑表单使用轻量 property chips：

```text
Goal name
Short summary...

[Planned] [Start] [Target] [Labels] [Reminder] [Notes]
```

详细交互由 `docs/product/goal-vnext-workspace-and-create-ui.md` 定义。

## 11. 验收条件

实施完成后必须同时满足：

1. public Goal contract 不再出现 canonical `dueDate`、`Active`、`description`、`motivation`、`feasibilityAnalysis`；
2. Goal 支持 `Planned / InProgress / Completed / Abandoned`；
3. Target 支持 Day / Month / Quarter / Half-year / Year；
4. passing target 不自动改变 status；
5. Task due/overdue semantics 未改变；
6. Web / Desktop / React/Mobile 对新模型 parity；
7. Prisma / PowerSync / portability 完成同一迁移；
8. architecture lock 阻止旧 Goal 字段重新成为产品真值。
