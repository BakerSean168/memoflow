---
tags: [adr, governance, knowledge, standards, superseded]
description: 已被 ADR-110 取代的 Governance -> Knowledge Standards 退休提案
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-09T10:30:00+09:00
---

# ADR-109: Product Governance to Knowledge Standards

**状态：** 已被 ADR-110 取代，不实施
**日期：** 2026-09-09
**取代者：** [ADR-110](./ADR-110-governance-permanent-executable-reference-module.md)

## Historical proposal

本 ADR 曾提出：

```text
Product Governance
Rule + RuleRevision + /governance UI/API/IPC
        ↓
Knowledge Standards
        ↓
retire packages/governance
```

提出该方案时的主要依据是 Rule 内容具有文档性质，Knowledge vNext 已拥有 Git/Vault、stable document identity、frontmatter、revision history 和 AI indexing。

## Why this proposal was rejected

后续复核确认 `packages/governance` 并不是单纯的“重复知识管理产品”：

1. 它是 MemoFlow 长期使用的 executable reference module / gold standard；
2. 它故意使用低复杂度的虚构业务语义展示完整 feature vertical slice；
3. 它真实覆盖 Prisma/PowerSync、HTTP/IPC、client、Vue、composition root 和 transport parity；
4. 开发模式下它本身也有真实价值，可作为编码/架构规范管理工作台；
5. 删除它会让工程架构失去稳定、可运行的教材，而不是简单减少重复模型。

因此“迁入 Knowledge 后删除 Governance bounded context”不再是目标架构。

## Preserved observation

本 ADR 中仍然成立的一点是：

```text
Engineering Governance
= tools/governance + docs/governance + docs/standards + CI/oracles/registries
```

它与 Product/Reference Governance 是不同层次，不能混为同一 durable state owner。

二者后续如需集成，必须使用 ADR-110 定义的显式、可版本化发布/快照边界，而不是让 CI 直接读取动态 Rule DB。
