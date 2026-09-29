---
tags:
  - adr
  - task
  - goal
  - key-result
  - recurrence
  - outbox
  - contribution
description: Task Goal Link 与可选 Contribution 解耦，并把整计划完成后贡献建模为 PlanCompletion settlement
created: 2026-08-25T14:28:00+08:00
updated: 2026-09-29T11:38:00+08:00
---

> **2026-09-08 Task vNext 后续修订：** ADR-071～075 保留本 ADR 已验证的 Goal settlement / occurrence outcome 语义，并进一步将 TaskTemplate/TaskInstance 收敛为独立 TaskPlan/TaskOccurrence 聚合、Goal-level link、Schedule union、Result/Checklist 与 reminder persistence 单轨。实施完成前当前代码事实仍以源码为准。
>
> **2026-09-29 Product vNext 收敛修订（target-design，待实施）：** Task→KR 不再只有 `link-only` 与“固定自动 contribution”两档。目标产品模型增加第三种“完成时记录”：用户点击 Complete 时输入本次真实 measurement，Task 把 measurement intent 与 completion 事实一起写入 durable outbox，Goal owner 负责创建 GoalRecord 与按 KR aggregation 重算。固定自动 contribution 继续是低摩擦路径，并与用户输入的 measurement 明确分开。

# ADR-056: Task Plan → Goal Link / Contribution / Settlement

**状态：** 已采纳并实施；2026-09-29 typed measurement 修订待实施
**日期：** 2026-08-25  
**影响范围：** Task domain、Goal domain、contracts、database、outbox、Task UI、Goal activity、AI workflow  
**关联：** ADR-038、ADR-053、ADR-055、ADR-057、ADR-068、ADR-075

> **2026-09-08 后续修订：** Link 与 Contribution 解耦、EachCompletion/PlanCompletion settlement 与幂等 source correlation 继续有效；[ADR-069](./ADR-069-goal-workspace-cross-module-context.md) 将 `TaskGoalLink.keyResultId` 从 required 修订为 optional，使 Task 可建立 Goal-level context。若 contribution 存在，KR 仍必须存在。实施完成前当前代码仍要求 KR。

## 2026-09-08 实现状态

Task Goal binding 已分成语义 Link 与可选 Contribution。link-only Task 不产生进度；自动 contribution 使用当前 `EachCompletion` / `PlanCompletion` settlement，持久 source correlation 保证重放幂等并支持撤销。数据库约束已升级为 `memoflow.task-goal-binding/v2`。

## 1. 背景

当前 `TaskGoalBinding` 把两个不同业务概念放在一起：

1. 这个 Task 与哪个 Goal/KR 有关；
2. 完成 Task 后是否、何时、贡献多少进度。

因此 UI 一旦“启用关联”，就必须同时选择 contribution value 与 trigger，无法表达：

```text
抢二课活动报名名额
-> 与“毕业 / 二课分达到 50”有关
-> 但抢报名本身不应该增加二课分
```

另一方面，当前 `ALL_INSTANCES_COMPLETED` 并不是多余能力。现实中存在大量“只有完成整个有限行动计划后，成果才结算”的场景：

```text
连续 15 天活动打卡
-> 全部完成
-> 二课分 +1
```

该能力应该保留并产品化，而不是删除。

## 2. 决策：Link 与 Contribution 解耦

目标语义：

```text
TaskGoalLink
- goalId
- keyResultId
- contribution?  // optional
```

Contribution：

```text
GoalContributionRule
- value
- trigger
```

于是形成三种自然状态：

```text
No link
-> 普通 Task

Link, contribution = null
-> 与 Goal/KR 有业务上下文关系，但不会自动修改进度

Link + contribution
-> 满足 settlement trigger 后创建 GoalRecord
```

### 2.1 2026-09-29 产品层三种模式

用户不需要理解 `GoalContributionRule` 技术对象，而看到三个明确选择：

```text
仅关联
自动记录固定值
完成时记录
```

映射：

```text
仅关联
-> TaskGoalLink only
-> 不创建 GoalRecord

自动记录固定值
-> automatic fixed rule
-> Task 可以在完成前就知道写入值

完成时记录
-> prompted measurement rule
-> value 在用户点击 Complete 时才产生
```

`完成时记录` 不等于 Task 拥有 KR aggregation。Task 只携带用户输入的 measurement intent；Goal 继续拥有 GoalRecord 和聚合真值。

## 3. Trigger 重命名与语义提升

产品/领域语义从：

```text
PER_INSTANCE
ALL_INSTANCES_COMPLETED
```

提升为：

```text
EachCompletion
PlanCompletion
```

UI：

```text
完成任务后更新关键结果

○ 每次完成时
● 完成整个计划后
```

不向用户暴露 Instance/Template 技术术语。

## 4. EachCompletion

适合：

```text
每次跑步 5km
每完成一次 -> 累计跑量 +5km
```

每个完成的 Task instance 创建一个 GoalRecord：

```text
source = TaskInstance(instanceId)
```

幂等键继续由 Goal-owned source correlation 保证。

撤销完成时删除该 instance source contribution。

## 5. PlanCompletion

> 2026-09-29 修订：PlanCompletion 的最终成功语义由 ADR-057 的 canonical Task Plan outcome evaluator 决定；不再把“所有物理 occurrence 字面上都是 Completed”或用户可配置 completion policy 当长期领域定义。

适合：

```text
植物观察活动
每天打卡，15 次
全部完成 -> 二课分 +1
```

### 5.1 仅有限计划可配置

PlanCompletion 只允许：

- one-time task；或
- recurrence 带 `occurrences`；或
- recurrence 带 `endDate` 且可确定完整 scope。

无限重复任务不能配置 PlanCompletion。

### 5.2 settlement source

整个计划只产生一次 GoalRecord：

```text
source = TaskPlan / current TaskTemplate identity
```

当前实现使用 `GoalRecordSourceType.TaskTemplate`；若本轮不做内部实体重命名，可以继续保存该 technical source type，但 client projection / activity 文案使用“任务计划”。

### 5.3 完成判定

`PlanCompletion` 不定义成功规则，只订阅 Task owner 已经得出的 `Succeeded` outcome。

2026-09-29 canonical 规则见 ADR-057：

```text
finite scope
+ no unresolved occurrence
+ no explicit Missed
-> Succeeded
-> PlanCompletion settlement eligible
```

`Skipped` 是 waiver，不等于 Completed，但从 required completion scope 排除。

如果未来出现“8/10 即视为成功”这类真实第二种业务规则，应新增明确的产品/领域语义并修订 ADR-057，而不是在 Task UI 重新暴露通用 `TaskPlanCompletionPolicy` DSL。

## 6. Settlement，而不是事件偶然触发

建议将上层领域概念命名为 `ContributionSettlement`：

```text
Task execution fact
-> evaluate contribution rule
-> settlement eligible?
-> durable outbox
-> GoalRecord apply/revert
```

这样未来 Task outcome 规则扩展后，Goal 不需要知道“为什么这个计划被判定完成”。

Task 是 eligibility owner；Goal 是 contribution application owner。

## 7. 保留 ADR-038 的可靠交付边界

以下设计继续保持：

1. Task completion 与 TaskGoalOutbox 在同一 Task transaction；
2. dispatcher 至少一次投递；
3. event payload 自包含，不让 Goal 回查 Task repository；
4. Goal 用 GoalRecord source correlation 做幂等；
5. GoalRecord + KR current value 在同一 Goal transaction；
6. uncomplete / rollback 也走 durable channel。

本 ADR 修订的是**业务语义**，不是推翻可靠交付架构。

## 8. Undo / Re-evaluation

### 8.1 EachCompletion

Instance 从 Completed -> 非 Completed：

```text
remove TaskInstance source contribution
```

### 8.2 PlanCompletion

任何 occurrence correction 都先重新运行 Task-owned outcome evaluator，而不是直接根据一次 uncomplete 猜 settlement：

```text
Succeeded -> Open/Failed/Abandoned
-> remove TaskPlan source contribution

Failed/Open -> Succeeded
-> apply TaskPlan source contribution once
```

Goal 只消费 apply/revert settlement，不复制 Task outcome 规则。

### 8.3 Prompt measurement correction

`完成时记录` 产生的 GoalRecord 与 TaskOccurrence 仍需要 source correlation，以保证：

```text
one occurrence -> at most one active correlated GoalRecord
replay -> idempotent
uncomplete -> revert correlated record
```

但 source correlation 与 record provenance 不是同一概念：

```text
TaskAutomatic
  value 由规则产生
  作为 system fact，不允许人工直接改值

TaskUserMeasurement
  value 由用户在 Complete 时输入
  仍关联 TaskOccurrence
  允许通过 Goal-owned correction command 修改 value/note
  修改 measurement 不改变 Task completion state
```

因此不能继续使用“只要有 sourceType/sourceId 就一律不可编辑”的粗粒度规则。

## 9. 与 KR aggregation 的约束

2026-09-29 后必须区分两类完全不同的写入：

### 9.1 Automatic fixed contribution

Task 在完成前就能确定固定值，例如：

```text
每完成一次投递 -> +1 次
每完成一次训练 -> +5 km
整个活动成功 -> +1 分
```

这种自动 contribution 默认只允许：

```text
aggregationMethod = Sum
```

因为它写入的是 delta，而不是观察 sample。

Sum delta 必须是 finite number；允许 signed value，以支持下降型累计 KR。UI 可以拒绝无意义的固定 `0` no-op，但 contract 不再用“必须为正数”表达所有业务方向。

### 9.2 User-authored completion measurement

有些值只有在完成 Task 时用户才知道：

```text
今天体重 61.2 kg
本次专注 3.5 h
本次测试正确率 87%
本次延迟 183 ms
```

这类 value 是用户输入的 measurement，不是 Task 自动猜出的 contribution。

允许所有 KR aggregation：

```text
Sum     -> 本次变化 / delta
Average -> 本次 sample
Max     -> 本次 sample
Min     -> 本次 sample
Last    -> 本次 sample
```

因此 non-Sum KR 仍然禁止“盲目固定自动 contribution”，但可以使用 `完成时记录` 模式收集用户输入的 sample。

### 9.3 Goal owner 仍是算法权威

Task 只需要读取：

```text
calculationMethod
unit
currentValue
targetValue
recordCount / bounded preview context
```

用于解释输入与展示 preview。

最终：

```text
Task completion + measurement intent
-> durable outbox
-> GoalRecord
-> Goal-owned aggregation
-> authoritative currentValue
```

Task UI 不复制一套 Average/Max/Min/Last 算法真值。

## 10. Task UI

目标关联区域使用低心智三模式，不再只显示一个“自动更新”开关：

```text
关联目标（可选）

目标
[顺利完成毕业要求]

关键结果
[二课分达到 50 分]

关键结果更新
○ 仅关联
● 自动记录固定值
○ 完成时记录
```

### 10.1 自动记录固定值

```text
固定记录
[1] 分

计入时机
○ 每次完成
● 整个计划成功
```

预览使用自然语言：

```text
完成全部 15 次打卡后，“二课分达到 50 分”将自动记录 +1 分。
```

无限计划不显示/禁用“整个计划成功”触发，并解释原因。

### 10.2 完成时记录

Task 配置只保存模式与可选 suggested/default value，不预先冻结真实 measurement。

点击 Complete：

```text
更新关键结果
每周平均专注时长 · Average

本次记录
[ 3.5 ] 小时

Current 2.8 -> After 3.1 -> Target 4.0

[仅完成任务] [记录并完成]
```

Dialog 必须根据 KR method 自动切换语义：

```text
Sum                 -> 本次变化
Average/Max/Min/Last -> 本次记录值
```

输入改变时实时更新 preview；最终值仍以 Goal owner 写入结果为准。

`仅完成任务` 是必要的 escape path：Goal context 暂时不可用时不能阻塞 Task completion。

## 11. Goal UI

Goal/KR 不显示完整 Task management，而显示来源摘要：

```text
二课分达到毕业要求
40 / 50    80%

2 个关联活动正在进行
```

点击进入 Task 模块：

```text
/tasks?goalId=...&keyResultId=...
```

Goal activity：

```text
植物观察打卡计划已完成
15 / 15 次
二课分 40 -> 41
```

记录必须展示来源事实，而不是只有 `+1`。

## 12. 毕业 / 二课验收旅程

### Goal

```text
顺利完成大学毕业要求

KR1 完成毕业论文与答辩       0 / 1
KR2 修满毕业要求学分         154 / 160
KR3 二课分达到毕业要求       40 / 50
```

### 报名阶段

Task：

```text
抢“植物观察打卡”活动名额
```

Goal link：

```text
毕业 -> 二课分
contribution = null
```

完成报名 Task 不改变 KR。

### 活动阶段

有限重复计划：

```text
植物观察打卡
每天一次
occurrences = 15
```

Goal link + contribution：

```text
KR = 二课分
trigger = PlanCompletion
value = 1
```

完成第 1-14 次：KR 仍 40。

完成第 15 次：创建一次 plan-source GoalRecord，KR 40 -> 41。

撤销任意一次完成：plan 不再 complete，撤销该 +1。

### 审核延迟

如果活动完成后积分仍需学校审核，不应把“预计到账”当作真实 KR：

```text
15 日计划完成
-> 创建/保留一个一次性 Task：确认二课分到账
-> 确认到账后该 Task EachCompletion +1
```

Goal 只记录真实成果。

## 13. Event Contract 演进

### 13.1 当前实现事实

当前 durable Task → Goal contract 已经是 `schemaVersion = 2`，核心 apply payload 包含：

```text
eventId
identityId
taskOccurrenceId
taskPlanId
goalId
keyResultId
value
source
occurredAt
```

它足够承载“固定自动 contribution”，但目前 `value` 永远来自 Plan 预配置的 fixed rule。

### 13.2 2026-09-29 target extension

typed measurement 不需要推翻 outbox；扩展 apply intent，使 Task 能明确区分：

```text
FixedAutomatic
PromptedUserMeasurement
```

Prompted path 的 value 来自 Complete command 的用户输入，而不是 Plan rule。

事件/GoalRecord 必须保留：

```text
source correlation
  occurrence / plan identity

authorship / provenance
  automatic rule | user measurement
```

最终 schema 名称与 version number 在 implementation ticket 中冻结，但必须满足：

- schemaVersion 显式；
- Task completion 与 outbox intent 同一 transaction；
- dispatcher 保持 at-least-once；
- Goal application 幂等；
- uncomplete 可 revert；
- user-measurement correction 不要求 uncomplete Task；
- migration window 有期限，不维护长期双轨。

## 14. 不采用的方案

### 14.1 删除 PlanCompletion

不采用。连续活动、课程、认证等现实场景明确需要“整套行动完成后才获得成果”。

### 14.2 所有关联 Task 都必须贡献

不采用。报名、加群、准备材料等 Task 只提供业务上下文，不产生结果值。

### 14.3 Goal consumer 自己查询所有 Task 判断完成

不采用。违反模块边界；Task 应在事件发出前拥有完成判定事实。

### 14.4 对非 Sum KR 猜 measurement

不采用。任务完成不等于知道实际体重、睡眠或正确率。

## 15. 验收标准

- Task 可以只关联 Goal/KR 而不产生 Record；
- Sum KR 支持低摩擦固定自动 delta；
- fixed Sum delta 支持 increasing/decreasing 方向，不再被 `positive()` 限死；
- Average/Max/Min/Last 不允许 Task 猜固定自动值；
- Sum/Average/Max/Min/Last 都支持 `完成时记录` 的用户输入；
- 完成时记录 Dialog 能按 method 正确解释 delta/sample，并实时展示 Current → After → Target preview；
- EachCompletion 每个 occurrence 只产生一个 active source-correlated record；
- PlanCompletion 只在有限计划进入 Succeeded 后贡献一次；
- 无限 recurrence 无法配置 PlanCompletion；
- 重放 outbox 不重复贡献；
- uncomplete 能正确撤销 source-correlated record；
- TaskUserMeasurement 可以纠正 value/note 而不改变 Task completion fact；
- Goal 不回查 Task repository；
- Goal 仍是 aggregation/currentValue 的唯一算法 owner；
- 毕业/二课 15 天活动与 non-Sum measurement Task 各有完整 domain + integration + E2E coverage。
