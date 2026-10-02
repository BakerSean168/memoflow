---
tags:
  - governance
  - reference
description: 仓库治理入口
created: 2026-03-14T00:00:00
updated: 2026-07-05T00:15:00+08:00
---

# 仓库治理

## Repository-native Engineering Governance input

Engineering rules use `tools/governance/engineering-rules.json` and the semantic pin in
`tools/governance/pinned-engineering-rules.json`. The native adapter needs no Product UUIDs,
contracts, database, exporter or published Product snapshot. DDD-003 has explicit partial,
read-only package-boundary coverage; DDD-001/002/004/005 remain visible and non-enforcing.
`autofix-proposal` emits review-required guidance without applying changes.

```bash
node tools/governance/engineering-rule-source-audit.mjs --check
node tools/governance/engineering-input-dependency-audit.mjs
node tools/governance/engineering-rule-adapter.mjs --source tools/governance/engineering-rules.json --mode check
node tools/governance/engineering-rule-adapter.mjs --source tools/governance/engineering-rules.json --mode report
node tools/governance/engineering-rule-adapter.mjs --source tools/governance/engineering-rules.json --mode autofix-proposal
```

ADR-113 remains Proposed. AGENT.md Governance-first policy and Product presence guards remain
active. The real-owner vertical slice policy is a proposal only; GOV-7903 remains blocked.

`docs/governance` 负责说明仓库为什么这样维护、哪些内容以文档表达、哪些内容以配置和脚本强制表达，以及冲突时谁是最终真值。

## 真值顺序

1. 当前代码、配置和测试
2. `nx.json`、`project.json`、`eslint.config.ts`、`package.json`
3. `docs/` 下的正式文档
4. 历史材料和实现背景说明

旧的脚手架目录已从维护体系中退役，不再作为正式规范来源。

## 当前治理口径

- `docs/` 是唯一维护中的正式文档入口。
- `AGENT.md` 是唯一维护中的 AI 协作入口。
- `README.md` 只保留项目概览、真实目录结构、真实技术栈和文档导航。
- `docs/product` 负责维护业务功能资产底图，服务优化前的功能边界、用户路径和代码落点确认。
- `docs/standards` 负责定义规则是什么。
- `docs/guides` 负责定义日常开发怎么做。
- `docs/test` 负责定义测试类型与入口。
- `docs/plan` 负责存放 agent 和工程实施计划。
- 退役的历史计划目录和旧脚手架目录不再作为正式规范来源。
- ADR 统一收敛到 `docs/architecture/adr`，编号唯一，索引必需更新。

## 配置继承原则

- 默认继承根配置，不在文档里重复抄每个项目的配置细节。
- 允许包级 / app 级存在显式例外，但例外应体现在对应 `project.json`、`tsconfig*.json` 或局部配置里。
- 当需要解释某个例外时，优先在该配置附近写清楚原因，而不是在总览文档里维护一份平行清单。

## 可执行检查

- `pnpm nx run memoflow:docs-check`：检查退役脚手架残留、ADR 编号与索引、关键文档链接、旧配置引用。
- `pnpm nx run memoflow:governance-check`：检查 agent 入口、计划目录、治理文档、project tags、局部配置约定、`packages/governance` 活文档顶层 JSDoc、target 基线与 server feature shape 合规性，以及高层生产代码对 raw `eventBus.on/off/send` 的回退。
- `pnpm nx run memoflow:target-baseline-check`：单独运行 target 基线审计，检查所有项目是否按分类具备必要 target。
- `pnpm nx run-many -t lint,typecheck --all`：验证工作区配置收敛没有引入明显回归。

## Target 基线治理

每个项目按类别（`app`、`runtime-lib`、`ui-lib`、`tooling-lib`、`meta-project`）必须具备对应的 target 基线。基线和豁免清单维护在 `tools/governance/target-baseline-manifest.json`。

详细规则和维护流程参见：[`./target-baseline-governance.md`](./target-baseline-governance.md)

## 相关资料

- 仓库级决策：[`../architecture/adr/README.md`](../architecture/adr/README.md)
- 产品功能资产：[`../product/README.md`](../product/README.md)
- 规则入口：[`../standards/README.md`](../standards/README.md)
- 开发入口：[`../guides/development/README.md`](../guides/development/README.md)
- 配置治理：[`./configuration-governance.md`](./configuration-governance.md)
- 计划目录：[`../plan/README.md`](../plan/README.md)
- Product Governance compatibility/reference-policy资料（ADR-113 Proposed）：[`../../packages/governance/README.md`](../../packages/governance/README.md)、[`QUICK_REFERENCE.md`](./QUICK_REFERENCE.md)、[`CHANGE_PLAYBOOK.md`](./CHANGE_PLAYBOOK.md)、[`DECISIONS.md`](./DECISIONS.md)

## Dual Registry

- [Dual Registry（人读）](./dual-registry.md)
- 机器账本：`tools/governance/dual-registry.json`
