---
tags:
  - adr
  - goal
  - key-result
  - progress
  - measurement
description: Key Result Measurement V2，删除 valueType、拆分记录起点与进度基线并统一进度/完成语义
created: 2026-08-25T14:28:00+08:00
updated: 2026-09-12T21:49:00+08:00
---

# ADR-055: Key Result Measurement & Progress V2

**状态：** 已实施，后由 ADR-068 修订（V2 仅保留历史决策）
**日期：** 2026-08-25  
**影响范围：** Goal domain、contracts、database、Task contribution、Goal UI、Review snapshots、AI Goal workflow  
**关联：** ADR-038、ADR-052、ADR-053、ADR-056

> **2026-09-12 后续状态：** [ADR-068](./ADR-068-key-result-measurement-v3.md) 已完成实施，`initialValue/currentValue/targetValue + trackingBaseValue` 现为 canonical KR 模型。V2 的 `startingValue/progressBaselineValue` 已从 Goal owner contract/domain/persistence/UI 删除；本 ADR 仅保留历史设计与迁移语义。

## 2026-09-12 实现状态

KR Measurement V2 已被 ADR-068 的 Measurement V3 取代。旧 `valueType`、`startingValue`、`progressBaselineValue` 均不再是 Goal owner 产品真值；统一 calculator、Goal Record aggregation、Review snapshot、Prisma/PowerSync、Vue/React 与 Data Portability 已切到 V3。GOAL-7208 已将 AI workflow 切到 GoalPlanDraft V2，GOAL-7210 进一步删除旧兼容产品轨道并让治理门禁拒绝这些字段重新进入当前 Goal/AI/persistence surface。

## 1. 背景

当前 KR 同时要求用户理解：

```text
valueType
- Incremental
- Absolute
- Percentage
- Binary

aggregationMethod
- Sum
- Average
- Max
- Min
- Last
```

两套概念存在重叠，而且 `Percentage`/`Binary` 都可以由普通数值 + 单位 + target 表达。

更严重的是当前 `initialValue` 同时承担两种不同事实：

1. 创建 KR 时已经拥有的当前值 / Sum 聚合的 seed；
2. 进度百分比的 0% baseline。

这在现实场景中会产生错误：

```text
二课分：当前 40，目标 50
```

用户期望看到 80%，但若把 `initialValue=40` 当成 0% baseline，则系统显示 0%。

另一个问题是领域中存在多套 percentage 算法：ValueObject 已考虑上升/下降方向，KeyResult entity 的实现又对 `target <= start` 返回 0，造成同一事实多份算法。

## 2. 决策

### 2.1 删除 `valueType`

从 contracts、domain、database、UI、AI draft 中彻底删除：

```text
KeyResultValueType
valueType
Incremental / Absolute / Percentage / Binary
```

表达方式统一为数值 + 单位 +聚合：

```text
完成上线        current 0 target 1 unit null
测试正确率      current 72 target 90 unit %
累计跑步        current 40 target 100 unit km
二课分          current 40 target 50 unit 分
```

### 2.2 KR Measurement V2

目标字段：

```text
KeyResultMeasurement
- startingValue
- currentValue
- targetValue
- progressBaselineValue?  // optional
- unit?
- aggregationMethod
```

含义：

- `startingValue`：开始在 MemoFlow 追踪时已有的事实，也是重新从 records 计算时的 seed/fallback；
- `currentValue`：当前权威结果，可由 records 重新计算；
- `targetValue`：达成目标值；
- `progressBaselineValue`：仅当 0% 不是自然的 0 时使用，例如 75kg -> 70kg；
- `aggregationMethod`：records 如何映射为 current value。

创建时通常：

```text
startingValue = currentValue
progressBaselineValue = null
```

### 2.3 默认进度公式

如果没有显式 `progressBaselineValue`，采用自然零点：

```text
progress = currentValue / targetValue
```

仅允许在该公式语义成立时使用默认模式，通常要求 `targetValue > 0`。

例：

```text
二课分 40 / 50 = 80%
学分   154 / 160 = 96.25%
跑步   40 / 100 = 40%
```

### 2.4 显式 baseline 进度公式

如果存在：

```text
progressBaselineValue = baseline
```

统一公式：

```text
(current - baseline) / (target - baseline)
```

并 clamp 到 0-100%。

例：

```text
体重 baseline 75
current 73
target 70

progress = (73 - 75) / (70 - 75) = 40%
```

如果 `targetValue == 0` 或目标为下降型，必须提供 baseline，避免隐式除零或错误方向。

进度算法只存在一个 domain implementation；所有 DTO projection / UI selector / Review snapshot 复用同一语义，不再各自实现。

## 3. Aggregation 决策

保留：

```text
Sum
Average
Max
Min
Last
```

但 UI 默认折叠为高级设置。

默认：

```text
aggregationMethod = Sum
```

### 3.1 Sum

GoalRecord.value 表示 delta：

```text
current = startingValue + sum(records.value)
```

例：二课分已有 40，某活动 +1：

```text
startingValue = 40
record = +1
current = 41
```

### 3.2 Average / Max / Min / Last

GoalRecord.value 表示 measurement sample：

```text
Average -> average(records)
Max     -> max(records)
Min     -> min(records)
Last    -> last(records)
```

在没有 record 时 current 回退 `startingValue`。

## 4. Record UI 语义

Record dialog 必须根据 aggregation 改变文案：

```text
Sum:
  本次增加 [5] km

Average/Max/Min/Last:
  本次记录值 [7.5] h
```

不再对所有 KR 统一显示“增加值”。

Task 自动 numeric contribution v1 只允许目标 KR 使用 `Sum`；其他 aggregation 可建立 Goal/KR context link，但默认不自动生成 measurement，详见 ADR-056。

## 5. Weight 决策

保留 1-5 integer weight，但把它降为高级设置：

```text
weight default = 3
```

UI：

```text
高级设置
  计算方式 [累计]
  对目标进度的权重 [3]
```

删除：

- 低影响 / 中影响 / 高影响按钮；
- weight 的 `%` 文案；
- “权重总和必须 100%”规则。

Goal overall progress：

```text
sum(KR progress * KR weight) / sum(KR weight)
```

weight 只是相对影响系数。

## 6. Progress 与 Completion 分离

Goal overall progress 是“当前大致走到哪里”的可视化，不是业务完成判定。

默认 Goal completed rule：

```text
所有 KR 均达成
```

示例：毕业目标：

```text
论文        0%
学分       96%
二课分     80%
```

即使加权 overall progress 已经很高，只要任一必需 KR 未达成，Goal 仍不能自动 Completed。

UI 同时显示：

```text
Overall progress 59%
0 / 3 requirements completed
```

这避免平均数掩盖硬性毕业条件。

## 7. KR 创建 UI

默认表单只展示：

```text
关键结果标题
当前值
目标值
单位（可选）
```

新 KR 默认 current/starting 可为 0。

高级设置：

```text
进度起点（仅特殊方向目标需要）
计算方式
权重（默认 3）
```

空 Goal 不再预先渲染“第一个关键结果”特殊表单；用户点击“添加关键结果”后统一进入同一个 KR editor。

## 8. Review Snapshot

Review snapshot 必须保存当时用于解释 progress 的权威字段：

```text
krId
currentValue
targetValue
progressBaselineValue?
aggregationMethod
weight
progressPercentage
```

Review 页不得用“所有 KR simple average”替代 Goal 的 weighted progress。

## 9. 数据迁移策略

项目仍处开发期，优先采用 ADR-015 简化策略：

- 无生产有价值数据时直接 reset development database；
- 不保留 `valueType` 双写/兼容 adapter；
- `initialValue` 迁移为 `startingValue` 时必须明确语义，不做字段机械改名后继续拿它计算 0% baseline；
- 对需要下降型进度的 fixtures 显式创建 `progressBaselineValue`。

若实施时确认已有必须保留的数据，则单独增加 migration mapping，不把兼容逻辑留进长期 domain。

## 10. 典型验收场景

### 10.1 二课分

```text
current/start = 40
target = 50
baseline = null
aggregation = Sum
=> 80%
```

Task Plan 完成 +1 后：

```text
current = 41
=> 82%
```

### 10.2 跑步

```text
current/start = 0
target = 100 km
aggregation = Sum
```

每次 Task completion +5km。

### 10.3 减重

```text
start/current = 75kg
target = 70kg
progressBaseline = 75kg
aggregation = Last
```

记录 73kg 后显示 40%。

### 10.4 平均睡眠

```text
start = 0
target = 8h
aggregation = Average
records = [7, 8, 9]
current = 8
```

Task 可以关联“平均睡眠”，但普通完成动作不自动猜测用户睡了几小时。

## 11. 验收标准

- contracts/database/domain 中无 `KeyResultValueType`；
- `40 / 50` 默认显示 80%，不是 0%；
- 下降型 KR 使用 explicit baseline 正确计算；
- Sum 与 sample aggregation 的 GoalRecord 文案/算法一致；
- KR weight 默认 3，UI 不再显示低/中/高第二套语义；
- Comparison/Breakdown 中不存在 weight 百分比旧逻辑；
- Goal 完成要求所有 KR completed，weighted progress 只作为展示；
- domain 只有一个 canonical percentage calculator。
