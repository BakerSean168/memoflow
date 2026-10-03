---
tags: [adr, governance, retirement, engineering-governance, simplification]
description: 退休虚构 Product Governance Runtime，仅保留 repository-native Engineering Governance
created: 2026-09-29T13:30:00+08:00
updated: 2026-10-03T10:30:00+09:00
---

# ADR-113: Retire Product Governance Runtime, Keep Engineering Governance

**状态：** 已采纳并实施（GOV-7903）
**日期：** 2026-09-29
**采纳/实施：** 2026-10-03
**取代：** ADR-110
**关联：** ADR-031、ADR-048、ADR-109、ADR-110、ADR-111

## Context

ADR-110 将 `packages/governance` 固化为永久 executable reference module / development standards workbench。

2026-09-29 Product vNext UI/architecture review 重新检查了其实际收益与维护成本。

当前 Product Governance Runtime 维护完整虚构业务链：

```text
Rule / RuleRevision
contracts
Prisma / PowerSync
HTTP / IPC
Web / Desktop client
Vue list/detail/editor/history
rule bundle export
reference-module tests
```

仓库当前规模约为：

```text
packages/contracts/src/modules/governance  ~40 files
packages/governance                        ~103 files
packages/app-vue/src/modules/governance     ~36 files
```

而 `AGENT.md` 同时明确承认其业务功能是虚构的，主要目的是“活文档 / reference module”。

本次审查发现这个 reference mechanism 已经出现反例：Goal/Task 已经进入新的产品 UI/architecture grammar，而 Governance UI 仍保留旧 native controls、旧 page/card patterns。它没有自然保持为真实项目的最新参考，反而需要额外投入才能继续“模拟”真实模块。

同时，AI coding agent 已经能够直接分析真实 Goal/Task/Schedule/Knowledge 模块、contracts、tests 与 ADR，不再强依赖一个人为构造的 gold-standard feature。

真正持续发挥作用的治理资产是：

```text
tools/governance
docs/governance
docs/standards
CI architecture gates
ownership audits
Product Time audits
public-surface audits
failure-contract audits
```

这些 deterministic repository-versioned checks 与 Product Governance DB/CRUD 并不要求绑定。

## Decision

### 1. 退休 Product Governance Runtime

本 ADR 采纳后，以下 Product Governance surface 进入 destructive retirement：

- `packages/governance`；
- `packages/contracts/src/modules/governance`；
- `packages/app-vue/src/modules/governance`；
- Governance Prisma/PowerSync models；
- Governance API/IPC/client composition；
- `/governance/**` product/dev routes；
- Rule/RuleRevision runtime；
- Product Governance-specific mocks/fixtures；
- 仅用于维护 reference feature 完整性的 tests/config/dependencies。

### 2. 保留 Engineering Governance

明确保留：

- `tools/governance/**` 中真实使用的 repository audits；
- `docs/governance/**`；
- `docs/standards/**`；
- `pnpm ... governance-check` 等 CI gate；
- architecture/surface/ownership/time/failure checks；
- 与真实模块无关的通用 governance libraries/registries。

“Governance”一词以后主要指 Engineering Governance，不再指一个 Product bounded context。

### 3. Rule Bundle 链路改为 repository-native input

当前链路：

```text
Product Rule DB
 -> export GovernanceRuleBundle
 -> committed pinned JSON
 -> engineering adapter
 -> check/report
```

Product Governance 退休后，Engineering Governance 使用：

```text
docs/standards and/or repository engineering-rules registry
 -> engineering adapter
 -> deterministic check/report
```

如果需要 structured metadata，可保留轻量 repository file，例如：

```text
tools/governance/engineering-rules.json
```

不再为这些规则维护 DB、CRUD UI、RuleRevision、HTTP/IPC。

### 4. Reference-module policy 改为真实 vertical slice 验证

同步修改 `AGENT.md`，删除“Governance 先行铁律”，改用真实 owner vertical slice 验证。

新规则：

```text
systemic architecture change
   ↓
choose the smallest real owner vertical slice
   ↓
characterization tests
   ↓
implement/verify
   ↓
apply to a second real module
   ↓
only then promote shared abstractions
```

Goal / Task / Schedule / Knowledge 等真实模块成为 architecture evidence，不再先给虚构模块增加模拟复杂度。

### 5. 不把 Product Governance 迁成 Knowledge 产品

ADR-109 的“迁为 Knowledge Standards”也不是本提案目标。

标准可以保存在 repository docs/structured config；Knowledge 仍保持 user-owned knowledge product，不承担 repository engineering governance owner。

## Why this is preferable now

- 删除长期维护的虚构 bounded context；
- 减少 contracts/DB/transport/UI/DI/test 的无业务 ROI surface；
- 避免“reference module 必须永远追赶真实代码”的额外税；
- 让 AI 和人都直接以真实生产 owner 模块为参考；
- 保留真正有价值的 executable CI governance；
- 更符合当前“先真实 vertical slice，重复后再抽象”的工程策略。

## Risks

### 1. 一次删除 blast radius 大

Governance 目前进入：

- API/Desktop/Web composition；
- app-vue DI/router；
- database schema/generated client；
- Docker/build manifests；
- workspace tags/tsconfig/vitest；
- governance rule bundle adapter；
- AGENT/docs reference policy。

因此不能把 retirement 简化为删除三个目录。

### 2. 部分 engineering governance 目前引用 Product Governance bundle

必须先把仍有价值的 rule metadata / adapter input 改成 repository-native source，再删除 Product Rule bundle contracts/runtime。

### 3. 历史 ADR/文档需要保留历史但标记 superseded

ADR-110 不应被改写成“从未存在”，而应在本 ADR 最终采纳后标记 superseded，以保留决策历史。

## Implementation / retirement gate

本决策按三阶段执行：

1. **GOV-7901 — inventory**：枚举并分类 Product-only、shared、Engineering-keep surface；
2. **GOV-7902 — decouple**：Engineering Governance 切换到 repository-native `engineering-rules.json` + deterministic adapters，不再以 Product Rule DB / bundle 为运行输入；
3. **GOV-7903 — destructive retirement**：删除 Product Governance contracts/package/UI/transport/composition/Prisma/PowerSync/runtime compatibility surface，并保留负向 retirement lock。

GOV-7903 的完成条件固定为：

- Product Governance route / DI / composition / package exports 为零；
- `Rule` / `RuleRevision` 产品持久化模型与 PowerSync projection 被移除，并提供 destructive drop migration；
- legacy Product rule-bundle bridge 被删除；
- Engineering Governance 的 repository-native source、audits、standards docs 与 CI gate 保留；
- `AGENT.md` 使用真实 owner vertical-slice policy；
- database/runtime generated assets 已重新生成；
- governance-check、受 retirement 影响的 typecheck/tests/build 与 repository grep 全部通过；完整测试集结果必须记录，并单独列出与本票无关的既有失败，不把部分通过写成全量通过。

## GOV-7903 closure evidence

2026-10-03 已完成物理退休、generated/workspace slots 清理、真实 owner policy 与负向锁。12 项 typecheck、30 个 dependency tasks、三个 host build、10 个 package test targets、57 个 focused App-Vue tests、199 个 Engineering Governance tests 和 full uncached governance 均通过。完整 App-Vue / contracts 保留五个与本票无关的既有失败；没有 retirement-attributable blocker。Prod-like runtime smoke / live SQL 未执行。详见 [GOV-7903 closure evidence](../../plan/archive/2026-10-03-pvc-gov-7903-retirement-closure.md)。

## Consequences

- `Governance` 不再是 MemoFlow Product bounded context，也不再出现在产品导航、HTTP/IPC、DI、数据库或同步协议中。
- `governance` 作为工程术语继续存在于 `tools/governance`、`docs/governance`、`docs/standards` 与 CI gates 中。
- 架构演进不再创建或扩展虚构 reference feature；改为先在最小真实 owner vertical slice 上验证，再在第二个真实 owner 上复验，最后才提升共享抽象。
- ADR-110 保留为历史记录，但其“永久 executable reference module”决策已被本 ADR 取代。
