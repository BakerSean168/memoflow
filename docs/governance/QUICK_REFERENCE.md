---
tags:
  - governance
  - engineering-governance
  - quick-reference
description: Engineering Governance 一页速查
created: 2026-03-14T00:00:00
updated: 2026-10-03T10:30:00+09:00
---

# Engineering Governance 快速参考

## 当前边界

| Surface | Canonical owner |
| --- | --- |
| Engineering rule metadata | `tools/governance/engineering-rules.json` |
| Semantic pin | `tools/governance/pinned-engineering-rules.json` |
| Rule runner | `tools/governance/engineering-rule-adapter.mjs` |
| Deterministic audits | `tools/governance/*.mjs` |
| Human standards | `docs/standards/**` |
| Governance docs | `docs/governance/**` |
| Architecture decisions | `docs/architecture/adr/**` |
| Root gate | `pnpm nx run memoflow:governance-check` |

不存在 Product Governance package/contracts/UI/DB/API/IPC/route/DI surface。

## 常用命令

```bash
node tools/governance/engineering-rule-source-audit.mjs --check
node tools/governance/engineering-input-dependency-audit.mjs
node tools/governance/engineering-rule-adapter.mjs --source tools/governance/engineering-rules.json --mode check
node tools/governance/vnext-retirement-audit.mjs
pnpm nx run memoflow:governance-check
```

## 架构试点

```text
systemic change
  -> smallest real owner vertical slice
  -> characterization tests
  -> implement + verify
  -> second real owner
  -> promote shared abstraction only after repeated evidence
```

不要创建虚构业务模块作为 reference feature。

## 历史

ADR-110 的 Product Governance reference-module 模式已由 ADR-113 取代。需要理解历史原因时阅读 ADR；不要把历史路径复制回当前代码。
