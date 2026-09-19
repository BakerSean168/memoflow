---
tags:
  - analysis
  - goal
  - current-system
  - migration
  - task
  - relation
description: Goal vNext 收敛前的当前代码真值、残差与迁移边界清单
created: 2026-09-08T17:55:00+08:00
updated: 2026-09-08T17:55:00+08:00
---

# Goal vNext — Current System Map & Migration Baseline

## 1. 目的

本文只记录 2026-09-08 当前实现真值，作为 ADR-067~070 与 active plan 的迁移基线。目标设计不能反向被误写成“当前已经实现”。

## 2. 当前 Goal create UI

当前 Web/Desktop Vue `GoalDialog.vue` 用户可编辑：

```text
name
description
startDate
dueDate
labels
keyResults
```

当前 UI 已经不显示：

```text
motivation
feasibilityAnalysis
folder
category
importance
parentGoal
```

相关测试甚至明确断言 Goal create form 不应出现 `draft.motivation` / `draft.feasibilityAnalysis`。

因此 motivation/feasibility 在 server/domain/contract 中继续存在，但已不是当前主要产品面，是需要清理的 residual。

## 3. 当前 Goal aggregate / public DTO 残差

当前 read model / route fixture 仍包含：

```text
description
feasibilityAnalysis
motivation
status = Active
dueDate
```

目标迁移：

```text
description            -> summary or linked Goal Brief migration
feasibilityAnalysis    -> linked Goal Brief Note
motivation             -> linked Goal Brief Note
Active                 -> InProgress
dueDate                -> target(kind=day)
```

## 4. 当前 KR Measurement V2

当前 contract：

```text
startingValue?
currentValue?
targetValue
progressBaselineValue?
aggregationMethod
unit?
weight
```

内部 canonical progress DTO：

```text
startingValue
currentValue
targetValue
progressBaselineValue
aggregationMethod
unit
```

当前 calculator：

- `progressBaselineValue=null` 时使用 `current/target`；
- explicit baseline 时使用 `(current-baseline)/(target-baseline)`；
- Sum aggregation 使用 `startingValue + sum(records)`；
- Average/Max/Min/Last 无 record 时 fallback `startingValue`。

当前创建 aggregate 默认行为：

```text
currentValue = input.currentValue ?? input.startingValue ?? 0
startingValue = input.startingValue ?? currentValue
```

因此若用户只输入 Current=50 / Target=100，则 starting 可能变成 50。这解释了为什么 UI/领域需要引入明确的 user-facing `initialValue`。

## 5. KR UI 当前状态

当前 Vue editor 已经有：

```text
startingValue = 0
currentValue = 0
targetValue
progressBaselineValue (advanced)
aggregationMethod (advanced)
weight (advanced)
```

但默认可见主要是 Current / Target；`startingValue` 没有按“Initial”作为核心进度字段呈现。

目标：

```text
Initial / Current / Target
```

都进入默认编辑面，`trackingBaseValue` 完全转为 system/internal。

## 6. 当前 Task -> Goal/KR Link

当前 canonical TaskGoalLink：

```text
goalId        required
keyResultId   required
contribution? optional
```

当前创建/更新 Task contract 使用 singular `goalBinding`，Task owner 负责保存关系。

目标：

```text
goalId        required
keyResultId   optional
contribution? optional

contribution != null -> keyResultId required
```

当前 Task query 已支持按 `goalId` 过滤，为 Goal Workspace reverse projection 提供了现有基础。

## 7. 当前 Goal -> Task read boundary

Goal 当前已有 `taskBindingReadPort`，主要用于删除等一致性检查；host 必须显式注入 Prisma/PowerSync adapter。

但 Goal Detail 还没有完整的 typed Goal Workspace context read model。

目标不是让 Goal 直接读取 Task repository，而是扩展 owner-controlled read port / query service：

```text
TaskContextReadPort
 -> summary
 -> preview/pagination
 -> by Goal
 -> by Goal + KR
```

## 8. 当前 Relation 能力

当前 generic Relation：

```text
SubjectTypes:
note | goal | task | reminder | habit | wallet

RelationTypes:
references | related | depends_on | contributes_to
```

持久化表支持 subject/object 双向 index，并有 `findBySubject` / `findByObject`。

但 ownership 目前存在架构债务：

```text
IRelationRepository
Relation use cases
Prisma adapter
```

暂驻 `packages/goal`。

并且当前实现注释明确：Relation repository 仅 Prisma lane 提供；PowerSync lane 不伪造实现。

Goal <-> Note 若成为正式产品能力，必须在实施前解决：

```text
generic Relation ownership extraction
+ PowerSync parity
+ typed GoalKnowledge facade
```

## 9. 当前 Knowledge / Note 能力

MemoFlow 当前没有独立 `packages/note`；知识 Note 主要由 Repository/Knowledge 能力承载，并已经存在 AI knowledge capture / persistence workflow 与 noteId receipt。

AI Goal flow 不应重新实现第二套 Note storage。目标是复用现有 Knowledge mutation/capture port，然后通过 Relation 连接 Goal。

## 10. 当前 AI Goal workflow

ADR-052 的 durable Mastra workflow / HITL / deterministic apply 原则仍正确。

但历史 `GoalPlanDraft` 结构仍记录了：

```text
description
motivation
feasibilityAnalysis
category
importance
tags
targetDate
```

文档已有 2026-08-25 注释说明其中部分字段被后续 Goal/Task vNext 修订，但 draft contract 仍需要进一步与新 Goal vNext 模型统一。

目标由 ADR-070 定义：

```text
Goal + KRs + Tasks + Knowledge + Relations
```

同时 review/apply。

## 11. 当前 Product docs 冲突

当前 `docs/product/goal-task-vnext.md` 仍记录：

```text
Goal dueDate / 截止日期
Active / Completed / Abandoned
Current + Target 默认 KR UI
```

这些是上一轮 vNext 的当前实现说明，不再是下一轮目标设计。

实施前文档规则：

- `docs/product/modules/goal.md` 继续说明当前系统真值；
- ADR-067~070 / new UI doc 说明 accepted target design；
- active plan 负责从 current -> target；
- 只有代码迁移完成后，才把 current product docs 改成新真值。

## 12. 关键迁移矩阵

| 当前                        | 目标                               | Owner                      |
| --------------------------- | ---------------------------------- | -------------------------- |
| `Goal.description`          | `Goal.summary` / long text -> Note | Goal + Knowledge migration |
| `Goal.motivation`           | Goal Brief Note                    | Knowledge                  |
| `Goal.feasibilityAnalysis`  | Goal Brief Note                    | Knowledge                  |
| `GoalStatus.Active`         | `InProgress`                       | Goal                       |
| no Planned                  | `Planned`                          | Goal                       |
| `dueDate`                   | `target: GoalTimeframe`            | Goal                       |
| `startDate: Instant`        | `startDate: Ymd`                   | Goal/Product Time          |
| `startingValue`             | `trackingBaseValue`                | KR system                  |
| `progressBaselineValue`     | `initialValue`                     | KR user model              |
| KR no target time           | KR optional `target`               | KR                         |
| Task requires KR            | Goal-only Task link allowed        | Task                       |
| Relation in Goal package    | shared Relation owner              | Relation                   |
| Relation Prisma-only        | Prisma + PowerSync                 | Relation                   |
| Goal Detail limited context | GoalWorkspaceReadModel             | Goal query composition     |
| AI Goal-only-ish draft      | Goal/KR/Task/Knowledge plan        | AI workflow                |

## 13. Protected current capabilities

迁移不得破坏：

- Goal optimistic concurrency/version；
- Goal Record source correlation 与 Task contribution idempotency；
- Review snapshots；
- Shared Labels；
- Task occurrence / Task Plan lifecycle；
- Scheduler single authority；
- HTTP/IPC parity；
- PowerSync offline model；
- data portability；
- AI durable workflow/HITL；
- current Core vNext architecture locks。
