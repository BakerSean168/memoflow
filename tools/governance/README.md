# Governance tools

## Package-Internal Boundary: `@memoflow/database` & `@prisma/client`

`package-internal-boundary-audit.mjs` is the fail-closed gate: `server/domain` and
`server/application` production code must not import `@memoflow/database` or any of its
exported subpaths (e.g. `@memoflow/database/prisma`), nor `@prisma/client` directly.
Application/Domain consume Port only; Prisma concrete code (exposed through
`@memoflow/database`, backed by `@prisma/client`) belongs to Infrastructure. DB
deps are allowed only in `server/infrastructure`, host runtime composers
(`apps/*/src/runtime`) and test fixtures (`.spec.ts` / `.test.ts` / `__tests__`).

`server/domain` 与 `server/application` 的生产代码禁止 import `@memoflow/database` 及其所有
导出的子路径（如 `@memoflow/database/prisma`），也禁止直接 import `@prisma/client`。
Application/Domain 只消费 Port；Prisma 具体实现（经 `@memoflow/database` 暴露、由
`@prisma/client` 支撑）属于 Infrastructure。DB 依赖只允许出现在
`server/infrastructure`、宿主 runtime composer（`apps/*/src/runtime`）与测试
fixture（`.spec.ts` / `.test.ts` / `__tests__`）中。

The check lives in `lib/package-internal-boundary.mjs` (pure function, shared with the
CLI and unit tests); the rule set is defined in `package-internal-boundary-audit.mjs`.

The matcher covers `from '…'`, bare side-effect `import '…'`, `import type … from '…'` and
dynamic `import('…')`. Comment-interleaved forms (e.g. `import /* x */ '@memoflow/database'`)
are not matched — keep imports in the canonical forms above.

匹配器覆盖 `from '…'`、裸副作用 `import '…'`、`import type … from '…'` 与动态
`import('…')`。注释穿插形式（如 `import /* x */ '@memoflow/database'`）不会被匹配——请保持
导入使用上述规范形式。

## Failure Contract Inventory

`failure-contract-inventory-audit.mjs` scans production TypeScript/JavaScript with the
TypeScript AST and enforces the ADR-049 migration boundary. It currently tracks:

- message-based failure branching;
- raw Result-message rethrows that lose machine semantics;
- presentation code that directly owns raw error messages;
- provider vocabulary outside infrastructure adapters;
- new subclasses of the legacy global `DomainError`.

The historical inventory is stored in
[`failure-contract-baseline.json`](./failure-contract-baseline.json). Every entry has an
owner, reason, and `retireBy` date. Existing findings remain visible, but any new
production finding fails immediately; expired findings also fail, and removed findings
are reported as stale baseline entries to delete.

`failure-contract-inventory-audit.mjs` 使用 TypeScript AST 扫描生产源码，执行 ADR-049
迁移门禁。历史项保存在带 owner/reason/retireBy 的基线中；新增违规立即失败，过期豁免失败，
已修复项会提示删除 stale baseline。测试、fixture、生成物与 Playwright 报告不进入生产 inventory。

```bash
# Verify the current tree against the owned baseline.
node tools/governance/failure-contract-inventory-audit.mjs

# Emit a machine-readable report for review/CI evidence.
node tools/governance/failure-contract-inventory-audit.mjs --json /tmp/failure-inventory.json

# Regenerate only after reviewing every new entry and assigning ownership.
node tools/governance/failure-contract-inventory-audit.mjs --write-baseline
```

A baseline update must be part of an explicit migration/review decision and must retain
owner, reason, and expiry metadata for every remaining historical finding.

## Dual Registry

- **Machine source of truth**: [`dual-registry.json`](./dual-registry.json)
- **Human summary**: [`../../docs/governance/dual-registry.md`](../../docs/governance/dual-registry.md)

Each `*dual*.surface.spec.ts` and `*keep-boundary*.spec.ts` is classified as:

| class                          | meaning                                                |
| ------------------------------ | ------------------------------------------------------ |
| `retired`                      | dual implementation removed; surface is a lock (asset) |
| `keep_boundary`                | intentional semantic boundary; do not force-merge      |
| `open_S` / `open_M` / `open_X` | real dual debt (S/M fixable; X → product plan)         |

Regenerate after dual surface moves:

```bash
# from repo root (script embedded in elegance residual; or re-run classifier)
node -e "console.log('see docs/governance/dual-registry.md')"
```

E3b tax cut may merge many `*-dual.surface.spec.ts` in one directory into `dual-registry.surface.spec.ts` (table/describe suite). Locks must be preserved.

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

The native rule runner excludes `packages/governance` from its audit subjects because that
Product reference feature is queued for retirement. The standalone package boundary audit
keeps its existing global behavior, including Governance. It remains a separate root gate.
The dependency audit traverses static module imports/re-exports with the TypeScript AST;
subject-scanner violation strings are not input dependencies. The adapter closure itself
uses Node built-ins only. TypeScript is tooling for the audit, not a runtime input dependency.

## Legacy Product bundle compatibility/parity evidence

The GOV-1904 Product export bridge, `published/governance-rule-bundle.v1.json`,
`pinned-rule-bundles.json`, `engineering-rule-adapters.json` and Product fixtures remain
physically present for compatibility and legacy/native parity tests until GOV-7903 review.
They are not active root engineering inputs. Product provenance/schema validation stays
covered by legacy hard guards; historical GOV-1903/GOV-1904 ownership is preserved.
