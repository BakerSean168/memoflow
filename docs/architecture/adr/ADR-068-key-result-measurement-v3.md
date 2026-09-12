---
tags:
  - adr
  - goal
  - key-result
  - measurement
  - progress
  - migration
description: Key Result Measurement V3，以 initial/current/target 为用户真值并分离 tracking seed
created: 2026-09-08T17:55:00+08:00
updated: 2026-09-12T21:49:00+08:00
---

# ADR-068: Key Result Measurement V3 — Initial / Current / Target

**状态：** 已采纳并实施（GOAL-7204，2026-09-12）
**日期：** 2026-09-08
**影响范围：** Goal/KR domain、contracts、database、GoalRecord、Task contribution、AI Goal draft、Goal UI、Review snapshot
**修订：** ADR-055 的用户字段、baseline 与 progress 算法；本 ADR 现为 canonical KR Measurement 真值
**关联：** ADR-037、ADR-053、ADR-055、ADR-056、ADR-067、ADR-069、ADR-070

## 2026-09-12 实现状态

GOAL-7204 已完成 direct canonical cutover：公开 KR 使用 `initialValue/currentValue/targetValue`，server measurement 额外持有 `trackingBaseValue`；普通 client projection/UI 不暴露 tracking base。GoalRecord 的 Sum/Average/Max/Min/Last 聚合仅使用 tracking base 作为 seed/fallback；Initial 编辑不会隐式 rebase。Prisma/PowerSync 使用 `initial_value + tracking_base_value + target_kind + target_end_date`，KR target 复用 GoalTimeframe 的可逆/fail-closed codec。Data Portability 保留 tracking base 以保证 restore 后聚合语义不漂移。GOAL-7208 已将 AI workflow 直接切到 GoalPlanDraft V2；GOAL-7210 删除旧兼容轨道并扩大 anti-resurrection governance，因此当前 AI surface 也只接受本 ADR 的 V3 measurement vocabulary。

## 1. 问题

KR Measurement V2 已解决旧 `valueType` 重叠问题，但当前仍向实现暴露四个容易混淆的值：

```text
startingValue
currentValue
targetValue
progressBaselineValue
```

其中 `startingValue` 是 MemoFlow 追踪/聚合 seed，`progressBaselineValue` 才是 0% progress baseline。这个模型在技术上可工作，但对用户不自然。

用户真正理解的是：

```text
Initial -> Current -> Target
```

例如：

```text
累计跑步 100km
Initial = 0
Current = 50
Target  = 100
Progress = 50%
```

用户可能在已经完成 50km 时才创建 KR，因此“开始使用 MemoFlow 时的 current=50”不应该偷偷把 progress 0% 起点变成 50。

减重也需要相同公式：

```text
Initial = 90kg
Current = 70kg
Target  = 55kg
Progress = 57.14%
```

因此需要把“进度起点”和“records 聚合 seed”彻底分离。

## 2. 用户模型

新的 canonical KR measurement：

```text
KeyResultMeasurement
├── initialValue
├── currentValue
├── targetValue
├── unit?
├── aggregationMethod
└── trackingBaseValue   // system/internal
```

Key Result 还拥有：

```text
title
description?
weight
target?                 // optional GoalTimeframe
sortOrder
```

### 2.1 `initialValue`

`initialValue` 表示：

> 这个结果的 0% 进度起点是多少？

它是用户概念，创建时默认 `0`，必须在 UI 中可见且可编辑。

示例：

```text
跑步         0 -> 50 -> 100km
减重        90 -> 70 -> 55kg
存款     10000 -> 30000 -> 100000元
准确率      60 -> 78 -> 90%
```

### 2.2 `currentValue`

当前权威 measurement，用户可看到；可由 GoalRecord aggregation 重算。

新建默认：

```text
currentValue = initialValue
```

但用户可创建：

```text
initialValue = 0
currentValue = 50
```

用于“已经开始一段时间后才录入 MemoFlow”的情况。

### 2.3 `targetValue`

KR 达成的目标 measurement。必须存在。

要求：

```text
targetValue != initialValue
```

避免零跨度的无意义百分比。如果用户只需要二元结果，应使用 `0 -> 1`。

### 2.4 `trackingBaseValue`

`trackingBaseValue` 是系统字段：

> MemoFlow 开始通过 GoalRecord 重算 currentValue 时的聚合 seed / fallback。

它不参与 0% progress 定义，也不作为普通 UI 字段。

创建时：

```text
trackingBaseValue = currentValue
```

例如用户已经跑 50km 后创建：

```text
initialValue      = 0
currentValue      = 50
trackingBaseValue = 50
targetValue       = 100
```

后续记录：

```text
+5
+10
```

Sum aggregation 得到：

```text
currentValue = trackingBaseValue + sum(records)
             = 50 + 15
             = 65
```

progress 仍然按 0 -> 100 计算为 65%。

## 3. 单一 Progress 公式

所有 KR 统一：

```text
rawProgress = (currentValue - initialValue)
              / (targetValue - initialValue)

progress = clamp(rawProgress * 100, 0, 100)
```

该公式天然支持上升与下降目标。

### 3.1 上升目标

```text
Initial = 0
Current = 50
Target  = 100

(50 - 0) / (100 - 0) = 50%
```

### 3.2 下降目标

```text
Initial = 90
Current = 70
Target  = 55

(70 - 90) / (55 - 90) = 57.14%
```

### 3.3 Completion

方向由 `targetValue - initialValue` 推导：

```text
increasing: currentValue >= targetValue
decreasing: currentValue <= targetValue
```

不持久化额外 direction 字段。

Progress calculator 必须是唯一算法真值；DTO、UI、Review snapshot、Goal overall progress 不能各自重写公式。

## 4. Aggregation

继续保留成熟的：

```text
Sum
Average
Max
Min
Last
```

### 4.1 Sum

GoalRecord.value 表示 delta：

```text
current = trackingBaseValue + sum(records.value)
```

### 4.2 Average / Max / Min / Last

GoalRecord.value 表示 sample：

```text
Average -> average(records)
Max     -> max(records)
Min     -> min(records)
Last    -> last(records)
```

无 records 时：

```text
current = trackingBaseValue
```

### 4.3 Editing initialValue 不改变 tracking seed

用户修改 `initialValue` 表示“重新定义 0% 起点”，会改变 progress，但不重写已有 measurement records，也不改变 `trackingBaseValue`。

如果用户要重新开始一段新的 tracking baseline，应使用显式“重置追踪起点”应用命令，由系统重新建立 trackingBase/records 边界，而不是借修改 initialValue 隐式完成。

## 5. KR Target Timeframe

Key Result 新增：

```ts
target: GoalTimeframe | null;
```

使用 ADR-067 的同一个 `GoalTimeframe`，不创建第二套 KR 日期类型。

KR target 表示希望该结果何时达成，不是 Task deadline。

示例：

```text
Goal: 2026 Q4 找到 AI 全栈工作

KR1: 完成 100 次高质量投递   Target: Oct 2026
KR2: 获得 10 次技术面试      Target: Nov 2026
KR3: 获得正式 Offer          Target: Q4 2026
```

超过 KR target 只生成 planning/review signal，不自动修改 Goal/KR completion fact。

## 6. UI

默认 KR editor 必须展示：

```text
Title
Initial Value   Current Value   Target Value
Unit
Target Timeframe (optional)
```

Initial 默认显示 `0`，不能像当前 V2 一样隐藏在“高级设置”里。

高级设置仅保留：

```text
Aggregation Method
Weight
Description (optional)
```

示例：

```text
完成有效投递
Initial [0]   Current [48]   Target [100]   Unit [次]
Target [2026-10]

▸ Advanced
  Aggregation [Sum]
  Weight [3]
```

## 7. 与 Task contribution 的边界

Task 自动 numeric contribution 仍默认只支持 `Sum` KR：

```text
Task completion
 -> GoalContributionRule
 -> GoalRecord(delta)
 -> Sum aggregation
 -> currentValue
```

Task link 本身可指向非 Sum KR，但自动 numeric contribution 不能绕过 measurement semantics。

## 8. V2 -> V3 无损语义迁移

当前 V2：

```text
startingValue
currentValue
targetValue
progressBaselineValue?
```

迁移映射：

```text
trackingBaseValue = startingValue
currentValue      = currentValue
targetValue       = targetValue

if progressBaselineValue != null:
  initialValue = progressBaselineValue
else:
  initialValue = 0
```

这个映射保持现有 V2 progress 数学结果：

- V2 `baseline=null` 使用 `current/target`，等价于 V3 `initial=0`；
- V2 显式 baseline 使用 `(current-baseline)/(target-baseline)`，等价于 V3 `initial=baseline`。

因此不需要用户重新校正既有进度。

旧字段最终必须删除：

```text
startingValue
progressBaselineValue
```

不保留长期 alias。

## 9. Goal overall progress

Goal overall progress 继续使用 KR weight 的加权平均：

```text
sum(kr.progress * kr.weight) / sum(kr.weight)
```

但只用于展示进度，不自动决定 Goal status。

`weight` 继续是 1..5 的相对影响系数，默认 3，属于高级设置。

## 10. 验收条件

1. KR public model 使用 `initialValue/currentValue/targetValue`；
2. `initialValue` 创建默认 0 且 UI 可编辑；
3. decreasing target 与 increasing target 使用同一公式；
4. `trackingBaseValue` 不出现在普通产品 UI；
5. V2 数据迁移后 percentage 与 currentValue 不变；
6. GoalRecord 重算不把 initialValue 当 aggregation seed；
7. KR 支持 optional Target Timeframe；
8. Task contribution settlement 保持幂等与可撤销；
9. architecture locks 禁止 V2 `progressBaselineValue` 重新进入公开产品 contract。
