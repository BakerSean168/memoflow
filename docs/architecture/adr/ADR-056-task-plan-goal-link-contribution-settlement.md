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
updated: 2026-09-08T09:00:00+08:00
---

# ADR-056: Task Plan → Goal Link / Contribution / Settlement

**状态：** 已采纳并实施
**日期：** 2026-08-25  
**影响范围：** Task domain、Goal domain、contracts、database、outbox、Task UI、Goal activity、AI workflow  
**关联：** ADR-038、ADR-053、ADR-055、ADR-057

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

> 2026-08-25 补充：PlanCompletion 的最终成功语义由 ADR-057 的 Task Plan completion policy / outcome 决定；不再把“所有物理 instance 字面上都是 Completed”当长期领域定义。

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

v1 completion policy：

```text
finite scope fully generated
AND
all non-deleted instances completed
```

这与当前 `areAllInstancesCompleted()` 逻辑方向一致，应保留并通过 domain service/policy 收敛。

未来如果出现：

```text
完成 8/10 即视为计划成功
```

扩展 `TaskPlanCompletionPolicy`，而不是再增加第三个 Goal trigger。`PlanCompletion` 表示业务结算时机，具体“计划何时算完成”由 Task Plan policy 决定。

## 6. Settlement，而不是事件偶然触发

建议将上层领域概念命名为 `ContributionSettlement`：

```text
Task execution fact
-> evaluate contribution rule
-> settlement eligible?
-> durable outbox
-> GoalRecord apply/revert
```

这样未来 completion policy 扩展后，Goal 不需要知道“为什么这个计划被判定完成”。

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

### 8.2 PlanCompletion v1

在“所有实例都必须完成”策略下，任何一个已完成实例被撤销都会让 plan 不再满足 completion policy，因此：

```text
remove TaskPlan source contribution
```

未来若 completion policy 支持 8/10 等阈值，不能盲目 uncomplete 就 remove；必须重新 evaluate plan completion policy，只有从 satisfied -> unsatisfied 时才 revert settlement。

## 9. 与 KR aggregation 的约束

v1 自动 numeric contribution 只允许目标 KR：

```text
aggregationMethod = Sum
```

原因：Task completion 能确定“贡献 +5km / +1分”，但不能自动知道：

```text
今天体重是多少
今天睡了几小时
本次测试正确率是多少
```

因此：

- Sum KR：Link + automatic contribution allowed；
- Average/Max/Min/Last：Link allowed，automatic contribution 默认 disabled；用户通过 measurement record 提交实际值。

未来若 Task completion form 明确收集 measurement value，再设计 typed measurement contribution，不在本轮提前泛化。

## 10. Task UI

目标关联区域：

```text
关联目标（可选）

目标
[顺利完成毕业要求]

关键结果
[二课分达到 50 分]

[ ] 完成任务后自动更新关键结果
```

开启后：

```text
计入方式
○ 每次完成
● 整个计划完成

贡献
[1] 分
```

预览必须使用自然语言：

```text
完成全部 15 次打卡后，“二课分达到 50 分”将增加 1 分。
```

无限计划不显示/禁用“整个计划完成”，并解释原因。

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

当前 durable event v1 可继续服务第一阶段迁移，但长期建议发布 v2 语义字段：

```text
contributionTrigger: EACH_COMPLETION | PLAN_COMPLETION
contributionSourceType
contributionSourceId
value
```

避免 Goal consumer 通过 `progressTrigger` 再推断 source type。

升级必须保持：

- schemaVersion 显式；
- v1/v2 migration window 有期限；
- 项目无生产数据时优先一次性切换，不长期双轨。

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

- Task 可以只关联 Goal/KR 而不贡献；
- EachCompletion 每个实例只贡献一次；
- PlanCompletion 只在有限计划满足完成策略后贡献一次；
- 无限 recurrence 无法配置 PlanCompletion；
- 重放 outbox 不重复贡献；
- uncomplete 能正确撤销；
- Goal 不回查 Task repository；
- non-Sum KR 仍可 link，但 v1 不允许无 measurement 的自动 contribution；
- 毕业/二课 15 天活动场景有完整 domain + integration + E2E coverage。
