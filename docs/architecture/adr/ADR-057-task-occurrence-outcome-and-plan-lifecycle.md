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
updated: 2026-09-29T11:38:00+08:00
---

> **2026-09-08 Task vNext 后续修订：** ADR-071～075 保留本 ADR 已验证的 Goal settlement / occurrence outcome 语义，并进一步将 TaskTemplate/TaskInstance 收敛为独立 TaskPlan/TaskOccurrence 聚合、Goal-level link、Schedule union、Result/Checklist 与 reminder persistence 单轨。实施完成前当前代码事实仍以源码为准。
>
> **2026-09-29 Product vNext 收敛修订（target-design，待实施）：** 用户不再配置 `TaskPlanCompletionPolicy`。Overdue 继续只是未决事实；Occurrence 由用户明确记录为 Completed / Missed / Skipped。有限 Plan 使用一个 canonical derived outcome evaluator：存在未决 occurrence 时保持 Open；全部 required occurrence 已 Completed/Skipped 时 Succeeded；计划范围结束后仍保留显式 Missed 时 Failed。Missed/Skipped 后续可纠正为 Completed，并重新评估 outcome。普通 Task UX 不暴露 Archive；“结束计划”必须走 Abandon，并完整停止未来 occurrence/reminder/Schedule projection。

# ADR-057: Task Occurrence Outcome、Overdue 与 Task Plan 生命周期

**状态：** 已采纳并实施；2026-09-29 产品收敛修订待实施
**日期：** 2026-08-25  
**影响范围：** Task domain、contracts、database、recurrence、Task UI、Goal contribution settlement、Schedule projection、AI workflow  
**关联：** ADR-037、ADR-038、ADR-053、ADR-056、ADR-071～075

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

本决策参考成熟任务/项目产品的行为语义，而不复制实现：

- Loop Habit Tracker：区分完成、明确未完成、跳过/豁免与尚未记录；
- Vikunja：overdue 是 `未完成 + due date 已过去` 的查询/展示条件，不是 task 终态；
- Taskwarrior：overdue 是 pending task 的派生属性，生命周期不使用通用 `Failed`；
- Super Productivity / Tasks.org：recurrence configuration 与 occurrence 分层，重复计划具有独立的生成/结束规则；
- Asana 官方文档明确区分 Complete 与 Archive：Archive 用于收起项目，不更新项目状态，并支持恢复；
- Linear 官方文档把 Completed / Canceled 作为 lifecycle status，而 Archive 是关闭并静置后的二级存储机制，普通 issue 不提供手动 Archive；
- Todoist 官方文档把 Archive 定义为把项目暂时移出 active list、以后可 restore 的整理动作。

Archive 参考：

- Asana: <https://help.asana.com/s/article/understanding-projects>
- Linear: <https://linear.app/docs/delete-archive-issues>
- Todoist: <https://www.todoist.com/help/todoist/features/introduction-to-projects-TLTjNftLM>

这些产品共同支持本 ADR 的低心智模型：**业务结束状态与 Archive/收纳语义分离**。

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

2026-09-29 后，不再让用户选择 completion policy。Task owner 使用一个 canonical derived evaluator。

有限 Plan：

```text
存在 Pending / InProgress
-> Open

全部 required occurrence 已解析
且没有 Missed
-> Succeeded
```

`Skipped` 表示显式豁免，不视为失败；它从 required completion scope 中排除。

无限 recurrence 不会因为若干次 Completed 自动进入 Succeeded；它持续 Open，直到用户显式 Abandon，或未来出现明确的业务关闭规则。

### 6.2 Failed

不是 occurrence 上的按钮，也不是用户直接选择的 Plan 状态。

用户只声明 occurrence fact：

```text
Completed
Missed
Skipped
```

对于有限 Plan，当范围已经结束、所有 occurrence 都已解析，但仍存在一个或多个显式 `Missed` 时，Task owner 派生：

```text
outcome = Failed
status  = Closed
```

关键点：

- due date 过去本身不会失败；
- Pending/InProgress + Overdue 仍保持 Open；
- Missed 后续可以被纠正成 Completed；
- 纠正后重新评估，允许 `Failed -> Succeeded`；
- 不需要用户理解“严格模式 / 允许补做”之类的额外 policy 概念。

### 6.3 Abandoned

由用户显式命令触发，并允许记录原因。

`Abandoned` 与 `Failed` 的差异：

```text
Failed    = 想成功，但规则判断已经不可能成功
Abandoned = 本来仍可继续，但用户决定停止
```

## 7. Canonical Outcome Evaluator 取代用户可配置 Completion Policy

Goal contribution trigger 不承担 Task Plan 成功规则；Task owner 仍然是 outcome eligibility owner。

目标链路：

```text
Occurrence facts
-> canonical TaskPlan outcome evaluator
-> Plan outcome
-> PlanCompletion settlement eligibility
```

统一规则：

```text
Infinite recurring
  -> Open until explicit Abandon

Finite plan
  if any Pending/InProgress:
    Open
  else if any Missed:
    Failed
  else:
    Succeeded
```

其中：

- `Completed`：required occurrence 已满足；
- `Missed`：用户明确确认 required occurrence 没有完成；
- `Skipped`：显式豁免，从 required scope 中排除；
- `Pending/InProgress`：事实未决，即使已 Overdue 也不能被推断为 Missed。

### 7.1 `completionPolicy` compatibility migration

当前 contracts / persistence / Portable V3 已经存在：

```text
AllowCorrection
StrictNoBackfill
```

2026-09-29 产品决策是退休“用户可配置 policy”这一产品概念，但不能在实现时无迁移直接删字段。

迁移要求：

1. UI 立即不再暴露 policy 选择；
2. canonical evaluator 成为新行为真值；
3. 过渡期继续读取/round-trip 旧 `completionPolicy` 字段，避免 IPC/HTTP/portable restore 断裂；
4. 新建 Plan 写入单一 compatibility 默认值，不让该字段影响新行为；
5. 更新 portability/version contract 后，再删除 persistence/DTO 中的字段；
6. characterization tests 覆盖旧 `AllowCorrection` / `StrictNoBackfill` 输入在迁移后的确定行为。

本 ADR 不引入 8/10、百分比阈值等通用 policy DSL。只有出现真实第二类“计划成功条件”后，才通过新的业务语义扩展，而不是重新暴露通用 completion-policy 配置。

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

- outcome 因 occurrence correction 发生变化时重新评估 settlement；
- `Failed/Abandoned` 永不产生成功贡献；
- `Failed -> Succeeded` 时只允许产生一次 PlanCompletion settlement；
- `Succeeded -> Open/Failed/Abandoned` 时必须撤回既有 settlement；
- Goal 不理解 Missed/Skipped 或 Task outcome 规则，只消费 Task 输出的 settlement fact。

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
原因：第 7 次打卡未完成
预期二课贡献：+1
实际贡献：0
```

主动停止时使用：

```text
结束计划
-> Abandon
```

不是 Delete，也不是 Archive。

普通 Task UI 不显示 Archive。`archivedAt` 继续只是 secondary visibility/storage metadata；未来若增加 Archives 页面，可在 closed history 上提供 Archive/Restore，但不进入主执行路径。

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
- 将可配置 completion policy 收敛为 canonical TaskPlan outcome evaluator；
- 过渡期保留旧 `completionPolicy` contract round-trip，再按 versioned migration 删除；
- Plan outcome transition 驱动 ADR-056 settlement re-evaluation；
- `End plan` 统一走 Abandon；
- Abandon 除关闭 Plan 外，还必须清理/撤销已经 materialize 的未来未完成 occurrence；
- Abandon 必须产生 Schedule projection 可消费的 lifecycle signal，使未来日程从 Schedule 中消失；
- Reminder fire 必须在 Closed/Abandoned Plan 上 fail closed。

### UI / AI

- Task Home 收敛为 `Today | Plans`；未来浏览统一进入 Schedule / Calendar，不再维护独立 Upcoming；
- Today 对 overdue 使用 derived badge，并保留在待处理范围；
- past unresolved occurrence 提供“补完成 / 未完成 / 跳过”；
- `Skipped` 文案只表达豁免；
- occurrence 详情采用 compact Dialog/Sheet，不新增 Occurrence Detail route；
- `结束计划` 映射显式 Abandon，不映射 Archive；
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
15 次有限计划
Day 7 -> Missed
其他 occurrence 仍未决
-> Plan Open

计划范围结束且全部 occurrence 已解析
Day 7 仍然 Missed
-> Plan Failed
-> PlanCompletion contribution = 0
```

### Case C — 官方暂停一天

```text
Day 7 -> Skipped/waived
-> 不解释为 Missed
-> 从 required completion scope 排除
-> canonical outcome evaluator 重新评估
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
-> canonical outcome evaluator 重新评估
-> 若 Failed -> Succeeded，则只结算一次 Goal contribution
```

### Case F — 结束计划

```text
Active recurring Plan
已有未来 occurrence / reminder / Schedule projection

用户点击“结束计划”
-> Abandon
-> Plan Closed + Abandoned
-> 不再生成新 occurrence
-> 删除/撤销未来未完成 occurrence
-> Reminder 不再触发
-> Schedule 不再展示未来执行
-> 历史 occurrence 保留
```

### Case G — Archive 不承担业务结束

```text
archivedAt != null
!= Closed
!= Abandoned
```

因此普通用户路径不使用 Archive 结束计划。

## 13. 不采用的方案

### 给所有 Task 增加 `Failed`

不采用。Action 完成但 outcome 未达到预期并不代表 Task execution failed，例如“去抢报名但没有抢到名额”。

### 时间一过自动 `Expired`

不采用。时间事实不能证明现实执行事实。

### 用 Delete 表达不想继续

不采用。会丢失个人执行历史以及 Goal-linked activity provenance。

### `Skipped` 同时表示漏做和豁免

不采用。它会破坏严格 PlanCompletion、统计与复盘语义。
