---
tags: [adr, governance, retirement, engineering-governance, simplification]
description: 提议退休虚构 Product Governance Runtime，仅保留真正可执行的 repository engineering governance
created: 2026-09-29T13:30:00+08:00
updated: 2026-09-29T13:30:00+08:00
---

# ADR-113: Retire Product Governance Runtime, Keep Engineering Governance

**状态：** 提议（待最终确认）
**日期：** 2026-09-29
**若采纳则取代：** ADR-110
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

## Proposal

### 1. 退休 Product Governance Runtime

若本 ADR 被采纳，进入 retirement queue：

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

若退休 Product Governance，则改为：

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

如果采纳本 ADR，必须同步修改 `AGENT.md` 当前“Governance 先行铁律”。

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

## Retirement gate

在真正删除前必须完成：

1. inventory 所有 Governance runtime/build/schema/DI references；
2. classify 为 Product Governance-only / Engineering Governance-keep / shared；
3. 给 Engineering Governance 建立不依赖 Product Governance 的输入；
4. 修改 AGENT reference-module policy；
5. 删除路由/DI/composition；
6. 删除 contracts/package/database models；
7. regenerate database/runtime generated assets；
8. 删除仅服务 Product Governance 的 tests/config；
9. 跑完整 governance-check、typecheck、unit、build、HTTP/IPC composition tests；
10. 搜索仓库确保无运行时 Product Governance reference。

## Until accepted

本 ADR 当前是提议，不改变现有运行时事实。

在最终确认前：

- ADR-110 仍描述当前 reference-module contract；
- 不执行 destructive retirement；
- 但暂停新的 Governance UI modernization 投资，避免在可能退休的 surface 上继续扩张。
