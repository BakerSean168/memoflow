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

## Pinned GovernanceRuleBundle engineering bridge

`GOV-1904` keeps product Governance truth and repository engineering enforcement separate:

```text
Rule + RuleRevision (product truth)
→ explicit GovernanceRuleBundle export (GOV-1903)
→ reviewed repository snapshot + semantic-hash pin
→ explicit engineering adapter registry
→ check / report / autofix-proposal
```

CI consumes only the committed snapshot at
`published/governance-rule-bundle.v1.json`, pinned by `pinned-rule-bundles.json`; it never
connects to a live Governance database or network endpoint. `engineering-rule-adapters.json`
is an allowlist, not an executable command registry. A Rule's `Mandatory` severity does not
make it a CI gate by itself. Unmapped rules stay visible as `unmapped (non-enforcing)`.
The current `DDD-003` mapping reuses the package-internal boundary runner and is explicitly
`partial` coverage rather than claiming full Layer Isolation enforcement.

```bash
node tools/governance/governance-rule-bundle-adapter.mjs \
  --bundle tools/governance/published/governance-rule-bundle.v1.json \
  --mode check

node tools/governance/governance-rule-bundle-adapter.mjs \
  --bundle tools/governance/published/governance-rule-bundle.v1.json \
  --mode report

node tools/governance/governance-rule-bundle-adapter.mjs \
  --bundle tools/governance/published/governance-rule-bundle.v1.json \
  --mode autofix-proposal
```

`autofix-proposal` is proposal-only: it emits review-required guidance and never mutates
product source. The standalone `package-internal-boundary-audit.mjs` remains a first-class,
independently runnable repository gate; the bundle bridge composes with it rather than
replacing it.
