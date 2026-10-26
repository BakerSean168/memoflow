---
tags:
  - governance
  - engineering-governance
  - decisions
description: Engineering Governance 当前稳定决策
created: 2026-03-14T00:00:00
updated: 2026-10-03T10:30:00+09:00
---

# Engineering Governance 决策

## 1. Governance 是工程能力，不是产品 bounded context

ADR-113 已退休 Product Governance Runtime。当前 `Governance` 指 repository audits、standards、CI gates 与 engineering rule metadata。

## 2. Repository-native input 是唯一活动输入

`tools/governance/engineering-rules.json` + `pinned-engineering-rules.json` 是结构化规则输入。Engineering Governance 不读取 Product DB、Rule/RuleRevision、Product exporter 或 published Product snapshot。

## 3. 真实 owner 优先于 reference module

架构模式先在真实业务 owner 上验证。至少两个真实 owner 证明稳定重复后才抽取共享 abstraction。禁止为了架构试点创建虚构业务复杂度。

## 4. 文档解释，audit 强制

- standards / ADR 说明为什么与规则语义；
- deterministic audit 负责可执行约束；
- CI 负责持续执行；
- negative retirement lock 防止已删除 surface 回流。

## 5. 自动修复必须 reviewable

默认只允许 `autofix-proposal` 生成建议。除非单独决策明确允许，Engineering Governance 不直接写产品源码。

## 6. 历史决策保留但不再是当前指引

ADR-109/110 与旧归档计划保留 Product Governance reference-module 的历史背景；当前决策以 ADR-113、当前代码和 tests 为准。
