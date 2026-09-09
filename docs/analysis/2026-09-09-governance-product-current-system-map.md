---
tags: [analysis, governance, reference-module, standards]
description: Governance 产品规范工作台、可执行参考模块与仓库工程 Governance 的真实边界
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-09T10:35:00+09:00
---

# Governance Current-System Map

## 1. Three roles currently share the word Governance

### 1.1 Product / development standards workbench

`packages/governance` 是一个真实可运行的编码/架构规范管理模块：

```text
Rule
├── code
├── title / description
├── severity
├── status Draft / Active / Deprecated
├── tags
├── goodExamples[] / badExamples[]
├── liveReferenceLocation?
└── author

RuleRevision[]
```

它真实拥有：

- Prisma / PowerSync persistence；
- HTTP / IPC transport；
- Web/Desktop client；
- Vue list/detail/editor/history surfaces；
- CRUD/search/lifecycle/revision behavior；
- tests and transport/composition parity coverage。

因此它不是纯 docs，也不是 compile-only example。

### 1.2 Executable reference feature

Repository history repeatedly uses `packages/governance` as the canonical feature-package reference implementation.

它的低业务复杂度是有意设计：目标是让工程人员能够观察一个完整 feature 如何贯穿：

```text
contracts
→ domain
→ application
→ transport
→ infrastructure
→ Prisma / PowerSync
→ API / IPC
→ client
→ Vue
```

Goal、Task、AI 等模块过去多次以 Governance 作为 composition-root、public seam、transport parity 和 internal structure rollout 的先行样板。

### 1.3 Repository engineering governance

`tools/governance/**`、`docs/governance/**`、`docs/standards/**`、architecture locks、CI oracles、registries、test inventory 是仓库工程质量基础设施。

它们不由 Product Governance Rule DB 直接驱动，并且必须保持 deterministic / repository-versioned。

## 2. Previous convergence mistake

2026-09-09 第一版统一模型把 Product Governance 当成“重复的知识文档系统”，提出：

```text
Rule / RuleRevision
→ Knowledge Standards
→ delete packages/governance
```

这个判断忽略了 reference-module 职责。

如果照此执行，会同时删除：

- 一个真实可用的开发模式规范管理工具；
- 一个完整 API/IPC/Prisma/PowerSync/Vue vertical slice；
- repository-level architecture rollout 的长期教材；
- 多个 surface/transport/composition tests 的稳定示范对象。

因此 ADR-109 已被 ADR-110 取代。

## 3. Target ownership

### Governance owns

```text
GovernanceRule
GovernanceRuleRevision
Rule lifecycle
Rule severity
Rule examples
Rule tags
Rule live reference
Rule search / revision audit
```

这些结构化事实继续由 Governance 自己持久化。

### Knowledge owns

```text
Vault/Git documents
KnowledgeDocumentId
Knowledge projection
AI knowledge indexing source
```

Knowledge 可以引用或索引 Governance rule，但不能替代 Rule/RuleRevision canonical truth。

### Engineering Governance owns

```text
architecture locks
public-surface audits
dual/retirement registries
test inventory
docs governance
CI governance oracle
static/versioned standards enforcement
```

它不能依赖开发者本地实时 Rule DB 才能决定 CI 结果。

## 4. Target runtime role

Governance 继续作为真实 module 运行：

```text
Developer
   ↓
/governance
   ↓
Rule list / detail / editor / history
   ↓
GovernanceApplicationPort
   ↓
Rule aggregate + revision
   ↓
Prisma or PowerSync
```

它至少在 development / diagnostic 模式下必须可访问、可修改、可验证。

Production 是否暴露导航属于 surface policy，不改变 package 的永久存续和测试义务。

## 5. Future bridge to executable engineering governance

开发模式 Rule 管理和 CI enforcement 可以集成，但必须通过显式发布边界：

```text
Governance Rule DB
      ↓ explicit publish/export
versioned GovernanceRuleBundle
      ↓
repository adapter
      ↓
tools/governance
      ↓
check
report
autofix proposal
```

关键要求：

- snapshot/bundle 必须版本化或固定 hash；
- CI 不直接读取某台开发机的动态数据库；
- bundle generation 可重复；
- Rule code/version/revision/provenance 可追踪；
- autofix 必须产生可审查变更，不允许静默修改 production source。

这让 Governance 可以真正参与代码规范闭环，同时保留工程门禁可复现性。

## 6. Reference-module protected contracts

不得在普通 cleanup 中删除或弱化：

- `packages/governance`；
- `packages/contracts/src/modules/governance`；
- Prisma / PowerSync Rule persistence；
- API / IPC parity；
- server composition root；
- client seam；
- Vue development surface；
- RuleRevision audit behavior；
- reference-module docs/tests。

任何全局 feature architecture 调整都应重新确认 Governance reference feature 是否仍能展示 canonical shape。

## 7. Current gaps worth improving, not retiring

1. Product Governance 与 Engineering Governance 的命名/边界文档需要持续明确；
2. 当前 Rule 主要管理规范内容，尚未形成稳定的 published rule bundle；
3. Rule 与 `tools/governance` check/report/autofix 之间还缺显式 adapter；
4. development-mode surface policy 需要正式化，避免“隐藏 UI = 功能死亡”；
5. TechLead/Architect authorization 是 reference/enterprise-shaped 示例语义，后续需要明确 dev-mode policy，而不是用其作为删除模块的理由；
6. Reference README / QUICK_REFERENCE 必须随全局 architecture convergence 更新，防止样板腐化。

## 8. Final conclusion

Governance 不是需要迁入 Knowledge 的遗留产品。

它是一个**有意保留的、可真实运行的简单业务模块**，同时也是 MemoFlow 的 executable architecture reference 和 development standards workbench。

统一模型后需要优化它的 reference contract 和 engineering-governance bridge，而不是退休它。
