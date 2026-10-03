---
tags:
  - governance
  - engineering-governance
  - playbook
description: Engineering Governance 变更手册
created: 2026-03-14T00:00:00
updated: 2026-10-03T10:30:00+09:00
---

# Engineering Governance 变更手册

ADR-113 已退休 Product Governance Runtime。本手册只描述 repository-native Engineering Governance。

## 修改 engineering rule metadata

1. 编辑 `tools/governance/engineering-rules.json`。
2. 保持 rule code / tags 排序与唯一性，referencePath 必须指向真实、维护中的 standards/architecture source。
3. 审查语义变化后运行：
   ```bash
   node tools/governance/engineering-rule-source-audit.mjs --write
   node tools/governance/engineering-rule-source-audit.mjs --check
   ```
4. 运行 native adapter 的 `check` / `report`。
5. 运行 `pnpm nx run memoflow:governance-check`。

不要创建 Product Rule、RuleRevision、数据库 seed、HTTP/IPC endpoint 或 Product UI 来承载工程规则。

## 新增可执行规则

优先顺序：

1. 先在 `docs/standards` 或 ADR 中明确约束与 owner；
2. 为真实业务 owner 补 characterization / contract evidence；
3. 在 `tools/governance` 中实现 deterministic audit；
4. 给 audit 补 pass/fail fixture；
5. 把 audit 接入 `project.json` 的 `memoflow:governance-check`；
6. 必要时再把 metadata 加入 `engineering-rules.json`。

Audit 必须尽量 fail-closed、可重复、无网络依赖；不得把产品数据库当作规则事实源。

## 修改现有 audit

- 优先修改纯函数/library，再修改 CLI wrapper；
- 保持 production source、fixtures、generated assets 的扫描边界显式；
- 新增例外必须具备 owner / reason / retirement condition；
- 如果规则会影响多个业务模块，先在至少两个真实 owner 上证明相同约束后再提升为共享 gate；
- 任何自动修复默认输出 proposal，除非专门 ADR 明确允许写入。

## Retirement / negative lock

已退休的架构 surface 应进入 `tools/governance/vnext-retirement-manifest.json` 或对应 canonical retirement manifest，使用 forbidden path/reference 做负向锁，不保留为了“证明已退休”而继续依赖旧实现的兼容测试。

## 最小验收

```bash
node tools/governance/engineering-rule-source-audit.mjs --check
node tools/governance/engineering-input-dependency-audit.mjs
node tools/governance/vnext-retirement-audit.mjs
pnpm nx run memoflow:governance-check
git diff --check
```

涉及代码、workspace 或 build graph 时，再运行受影响项目的 typecheck / test / build。
