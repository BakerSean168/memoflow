---
tags:
  - adr
  - task
  - recurrence
  - lifecycle
  - outcome
  - overdue
  - missed
description: Task occurrence 的 Pending/Completed/Missed/Skipped 语义、Overdue 派生状态与 Task Plan outcome 生命周期
created: 2026-08-25T15:03:00+08:00
updated: 2026-09-08T09:00:00+08:00
---

# ADR-057: Task Occurrence Outcome、Overdue 与 Task Plan 生命周期

**状态：** 已采纳并实施
**日期：** 2026-08-25  
**影响范围：** Task domain、contracts、database、recurrence、Task UI、Goal contribution settlement、Schedule projection、AI workflow  
**关联：** ADR-037、ADR-038、ADR-053、ADR-056

## 2026-09-08 实现状态

Occurrence 当前持久状态为 Pending / InProgress / Completed / Missed / Skipped；`Expired` 已退休，Overdue 是派生事实。Task Plan outcome 使用 Open / Succeeded / Failed / Abandoned，有限计划 settlement 与历史修正已有集成测试覆盖。

## 1. 背景

当前 `TaskInstanceStatus`：

```text
Pending
InProgress
Completed
Skipped
Expired
```

存在三个业务语义问题：

1. `Expired` 把“截止时间已经过去”写成不可继续完成的终态，但个人任务场景中“用户没有及时在 MemoFlow 操作”并不等于“现实里没有完成”；
2. `Skipped` 同时承载“我明确没有完成”和“这次被豁免/不适用”两种不同事实；
3. 整个有限重复计划缺少清晰的 success / failed / abandoned outcome，导致 `PlanCompletion` 只能依赖“全部 instance Completed”的低层技术判断。

毕业二课场景暴露了这个问题：

```text
连续 15 天植物打卡
Day 7 第二天仍未在 MemoFlow 处理
```

系统只知道“尚未记录结果”，不能知道用户现实中是否已打卡；若用户确认确实忘记打卡，则应该记录一次 required occurrence 的失败；若官方当天取消活动，则应该记录一次豁免，而不是失败。

## 2. 外部产品语义参考

本决策参考以下成熟开源产品的行为语义，而不复制 copyleft source：

- Loop Habit Tracker：区分完成、明确未完成、跳过/豁免与尚未记录；
- Vikunja：overdue 是 `未完成 + due date 已过去` 的查询/展示条件，不是 task 终态；
- Taskwarrior：overdue 是 pending task 的派生属性，生命周期不使用通用 `Failed`；
- Super Productivity / Tasks.org：recurrence configuration 与 occurrence 分层，重复计划具有独立的生成/结束规则；
- Plane 等项目工具：completed 与 cancelled 类结果分离，说明“停止继续”不等于“成功完成”。

研究记录见 `docs/analysis/2026-08-25-goal-task-vnext-open-source-study.md`。

## 3. 决策：Occurrence 状态只记录用户/业务事实

vNext `TaskOccurrenceStatus` / 当前 `TaskInstanceStatus` 收敛为：

```text
Pending
InProgress
Completed
Missed
Skipped
```

### 3.1 Pending = outcome unknown

`Pending` 的精确定义：

> 该 occurrence 尚未被确认成 Completed / Missed / Skipped。

它不是失败，也不表示现实中一定没有执行。

### 3.2 Completed = required action completed

用户或受信任外部来源确认本次行动已完成。

### 3.3 Missed = required occurrence was not completed

`Missed` 表示：

> 本次本来应该执行，且已确认没有完成。

典型场景：

```text
昨天确实忘记植物打卡
-> Missed
reason = 忘记上传照片
```

`Missed` 可以保存可选 reason / recordedAt。为了纠正误操作，应支持将 Missed 更正为 Completed/Pending，并重新评估 plan outcome / Goal settlement。

### 3.4 Skipped = occurrence explicitly waived / not applicable

`Skipped` 表示：

> 本次 occurrence 被明确豁免、取消或不适用，不应被解释为“做失败了”。

例如：

```text
活动官方宣布今天暂停打卡
-> Skipped
```

它与 `Missed` 必须分开，否则历史分析、计划成功判断与 streak/完成率都会产生错误语义。

## 4. 删除 `Expired` 业务状态

`Expired` 从 Task instance/occurrence status 删除。

`Overdue` 改为 read-model / presentation derived fact：

```text
isOverdue =
  status in { Pending, InProgress }
  AND completionWindowEnd < now
```

如果第一版没有独立 completion window，则使用 canonical due/end time。

### 4.1 Overdue 不改变持久状态

过期后仍允许：

```text
标记完成
确认未完成
重新安排（若业务允许）
```

系统不得仅因为时间经过自动执行：

```text
Pending -> Missed
Pending -> Failed
```

因为 MemoFlow 无法从“没有点击”推断现实世界事实。

### 4.2 自动 maintenance 的变化

当前 `CheckExpiredInstancesUseCase` / `TaskExpirationService` 不能继续把 instance 持久化成 `Expired`。

vNext 选择：

- 删除该 mutation maintenance；或
- 若 Schedule 需要 overdue projection，则改成无副作用 query/projection 计算。

## 5. Delete / Missed / Abandoned 必须分语义

### Delete

仅用于：

> 错误创建、重复数据、该记录本来就不应该存在。

### Missed

用于：

> 某一次 required occurrence 确实没有完成。

### Abandoned

用于：

> 整个 Task Plan 原本仍可能继续，但用户主动决定不再尝试。

例如：

```text
植物打卡 8/15
用户因时间冲突决定退出活动
-> Plan Abandoned
```

不能通过删除整个 plan 表达这种事实，否则 Goal activity 和历史执行上下文会丢失。

## 6. Task Plan 将 lifecycle 与 outcome 分离

用户日常不需要理解 Template 技术术语，但领域上有限/重复任务拥有 Task Plan 语义。

建议最终模型：

```text
lifecycle:
  Active | Paused | Closed

outcome:
  Open | Succeeded | Failed | Abandoned
```

约束：

```text
Active/Paused -> outcome = Open
Closed -> outcome in {Succeeded, Failed, Abandoned}
```

`archivedAt` 继续是展示/隐藏属性，不作为业务 outcome；`deletedAt` 继续只处理删除语义。

### 6.1 Succeeded

由 Task-owned completion policy 判断。

v1：

```text
AllRequiredOccurrencesCompleted
```

### 6.2 Failed

不是普通 instance 上的按钮，也不是“用户觉得没做好”。

只有当 completion policy 可以确定：

> 该计划的成功条件已经无法满足

才得到 `Failed` outcome。

严格 15/15 且不允许补签时，一个 required occurrence 被确认 `Missed` 后即可失败。

若仍支持补录/补签，则只是 overdue/open，不能提前失败。

### 6.3 Abandoned

由用户显式命令触发，并允许记录原因。

`Abandoned` 与 `Failed` 的差异：

```text
Failed    = 想成功，但规则判断已经不可能成功
Abandoned = 本来仍可继续，但用户决定停止
```

## 7. Completion Policy 拥有“成功”的定义

Goal contribution trigger 不承担 Task Plan 成功规则。

```text
Occurrence facts
-> TaskPlanCompletionPolicy
-> Plan outcome
-> Contribution settlement eligibility
```

v1 policy：

```text
AllRequiredOccurrencesCompleted
```

其中：

- `Completed`：满足该 occurrence；
- `Missed`：required occurrence 未满足；
- `Skipped`：显式豁免，不与 Missed 混为一谈；是否允许豁免由 plan policy/plan definition 决定；
- `Pending/InProgress`：结果仍未确定。

第一版不增加 8/10、百分比阈值等通用 policy DSL；等真实第二个需求出现后再扩展。

## 8. 与 ADR-056 `PlanCompletion` 的关系

`PlanCompletion` 继续表示：

> Task Plan 成功时一次性结算 Goal contribution。

它不再定义为字面上的：

```text
all physical instances status == Completed
```

而定义为：

```text
TaskPlan outcome transitions to Succeeded
-> PlanCompletion settlement eligible
```

因此：

- `Succeeded -> Failed/Open/Abandoned`（因更正或撤销）时重新评估并撤回 settlement；
- `Failed/Abandoned` 永不产生成功贡献；
- Goal 不理解 Missed/Skipped/completion policy，只消费 Task 输出的 settlement fact。

## 9. UI 语义

### 9.1 正常 occurrence

```text
○ 植物观察打卡
  今天 · 第 5/15 次

[完成]
... -> [未完成] [跳过本次]
```

`未完成` 映射 `Missed`；`跳过本次` 只用于豁免/不适用语义，不能用同一个动作混淆。

### 9.2 逾期 occurrence

```text
○ 植物观察打卡
  昨天 · 已逾期

昨天是否完成？
[已完成] [未完成] [...]
```

不自动判失败。

### 9.3 Task Plan

```text
植物观察打卡
6/15 已完成 · 1 次未完成

状态：计划未达成
原因：第 7 次打卡未完成，活动要求 15/15
预期二课贡献：+1
实际贡献：0
```

主动停止时使用：

```text
放弃计划
```

而不是 Delete。

## 10. 统计语义

统计必须至少区分：

```text
completedCount
missedCount
skippedCount
pendingCount
```

不能再把 Skipped/Expired 混入“未完成”单一 bucket。

completion rate 默认以 required resolved occurrences 为分母；Skipped 是否排除取决于明确的 waiver semantics，不能偷偷当 Completed。

## 11. 实施影响

### Contracts / DB

- 删除 `TaskInstanceStatus.Expired`；
- 新增 `TaskInstanceStatus.Missed`；
- `SkipRecord` 与新的 `MissRecord`（或统一 OutcomeRecord discriminated union）在实现前做一次最小 contract 评审；
- Task Plan 增加/投影 lifecycle + outcome + closedAt / abandoned reason；
- archive/delete 与 outcome 分开。

### Domain / application

- 删除 `markExpired()` mutation；
- 删除/替换 `TaskExpirationService`；
- 增加 markMissed / correctOutcome；
- 增加 TaskPlan completion evaluator；
- Plan outcome transition 驱动 ADR-056 settlement re-evaluation。

### UI / AI

- Today/Upcoming 对 overdue 使用 derived badge；
- past unresolved occurrence 提供“已完成 / 未完成”；
- `Skipped` 文案只表达豁免；
- AI 不得因 due date 过去擅自标 Missed/Failed；
- AI “放弃整个计划”必须走显式 user-approved Abandon command。

## 12. 验收案例

### Case A — 忘记在 MemoFlow 点完成

```text
昨天 Task 到期
今天打开 MemoFlow
-> Pending + Overdue
用户确认现实里完成
-> Completed
```

### Case B — 确实漏打卡

```text
15/15 strict plan
Day 7 -> Missed
no-backfill policy
-> Plan Failed
-> PlanCompletion contribution = 0
```

### Case C — 官方暂停一天

```text
Day 7 -> Skipped/waived
-> 不解释为 Missed
-> completion policy 按 plan definition 重新评估
```

### Case D — 主动退出

```text
8/15 时用户放弃
-> Plan Abandoned
-> 历史 instances 保留
-> Goal activity 可显示“计划已放弃，未产生贡献”
```

### Case E — outcome correction

```text
误标 Missed
-> 更正为 Completed
-> plan policy 重新评估
-> 若重新 Succeeded，则只结算一次 Goal contribution
```

## 13. 不采用的方案

### 给所有 Task 增加 `Failed`

不采用。Action 完成但 outcome 未达到预期并不代表 Task execution failed，例如“去抢报名但没有抢到名额”。

### 时间一过自动 `Expired`

不采用。时间事实不能证明现实执行事实。

### 用 Delete 表达不想继续

不采用。会丢失个人执行历史以及 Goal-linked activity provenance。

### `Skipped` 同时表示漏做和豁免

不采用。它会破坏严格 PlanCompletion、统计与复盘语义。
