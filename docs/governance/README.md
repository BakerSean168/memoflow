---
tags:
  - governance
  - engineering-governance
description: MemoFlow repository Engineering Governance 唯一维护入口
created: 2026-03-14T00:00:00
updated: 2026-10-03T10:30:00+09:00
---

# Repository Engineering Governance

ADR-113 已退休 Product Governance Runtime。当前仓库中的 **Governance** 只表示 Engineering Governance，不是产品 bounded context，也没有产品路由、数据库、HTTP/IPC、DI 或 UI surface。

## 真值与所有权

Engineering Governance 的机器输入是：

- `tools/governance/engineering-rules.json`：结构化 engineering rule metadata；
- `tools/governance/pinned-engineering-rules.json`：semantic pin；
- `tools/governance/*.mjs`：deterministic audits / adapters；
- `project.json` 与 CI workflows：执行入口；
- `docs/standards/**`：人读规则；
- `AGENT.md`：AI 协作与真实 owner vertical-slice policy。

它不依赖 Product Rule UUID、Rule/RuleRevision 数据库、Product exporter 或 published Product snapshot。

## 常用验证

```bash
node tools/governance/engineering-rule-source-audit.mjs --check
node tools/governance/engineering-input-dependency-audit.mjs
node tools/governance/engineering-rule-adapter.mjs --source tools/governance/engineering-rules.json --mode check
node tools/governance/engineering-rule-adapter.mjs --source tools/governance/engineering-rules.json --mode report
node tools/governance/engineering-rule-adapter.mjs --source tools/governance/engineering-rules.json --mode autofix-proposal
pnpm nx run memoflow:governance-check
```

`autofix-proposal` 只产生 review-required 建议，不直接修改产品代码。

## 架构变化规则

系统性架构变化不使用虚构 reference module。按 ADR-113 / `AGENT.md`：

1. 选择最小真实业务 owner vertical slice；
2. 先写 characterization / contract tests；
3. 在该 owner 上实施并验收；
4. 在第二个真实 owner 上复验；
5. 只有稳定重复后才提升共享 abstraction；
6. 把已确认约束编码成 Engineering Governance audit。

## 文档边界

- `docs/standards`：规则是什么；
- `docs/guides`：日常开发怎么做；
- `docs/test`：测试类型与入口；
- `docs/plan`：实施计划；
- `docs/architecture/adr`：架构决策历史；
- `docs/governance`：Engineering Governance 的维护、决策与工具入口。

Product Governance 的历史设计保留在 ADR-109/110 与归档计划中，不再作为当前实现指引。

## 相关入口

- [ADR-113 — Retire Product Governance Runtime](../architecture/adr/ADR-113-retire-product-governance-runtime-keep-engineering-governance.md)
- [Engineering Governance 快速参考](./QUICK_REFERENCE.md)
- [Engineering Governance 变更手册](./CHANGE_PLAYBOOK.md)
- [治理决策](./DECISIONS.md)
- [Standards](../standards/README.md)
- [Dual Registry](./dual-registry.md)
- 机器账本：`tools/governance/dual-registry.json`
