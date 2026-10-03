---
tags: [plan, archive, governance, retirement, evidence]
description: GOV-7903 Product Governance retirement closure, validation and baseline limitations
created: 2026-10-03T00:00:00+00:00
updated: 2026-10-03T00:00:00+00:00
---

# PVC-GOV-7903 — Product Governance retirement closure

Worktree: `memoflow-gov-7903`; branch: `product/vnext-gov-7903`; implementation baseline: `0703bc6140b`.
Fresh-build review also exposed and separately committed the pre-existing AI Goal mutation adapter repair as `b924054b6d0`; it is not part of the Governance retirement surface. ADR-113 is accepted/implemented; ADR-110 is superseded. GOV-7903 is complete with the scoped evidence and explicit baseline limitations below.

## Closure fixes

Beyond the existing package/contracts/UI/composition/Prisma/PowerSync/bridge removal, closure
removed the remaining Dockerfile API copies, tracked environment flags/database URL, shared
Vitest aliases, Nx test-domain registries, Product ESLint scopes/override, and the native
Engineering runner's obsolete Product-package exclusion. Goal/Task READMEs and the active
import-path standard now refer to surviving owners. Older UI design documents explicitly label
Product Governance navigation/Knowledge integration as historical and forbidden to restore.

The tracked Nx graph was regenerated using the current Nx version; its expanded inferred-target
metadata explains the large generated diff. It contains 41 projects, no `governance` project,
and retains `governance-tools`. The existing ADR policy tests now guard Product imports,
Prisma models, routes/DI, package exports, graph nodes, delivery/env and test aliases. Their
external subjects are included in the project's `namedInputs.default`; canonical generated
test targets remain unchanged and `nx sync:check` passes.

## Validation

All Nx runs below use `NX_DAEMON=false`. Validation logs are local `/tmp/gov7903-*.log` files,
not committed evidence or CI/release claims.

| Command / evidence | Result |
| --- | --- |
| `pnpm nx run-many -t typecheck -p contracts,database,app-vue,api,desktop,web,ai,goal,utils,ipc-client,powersync-schema,ui-vue-shadcn --parallel=2 --skip-nx-cache` | PASS: all 12 typechecks and 30 dependency tasks, including Prisma generation and shared/owner builds |
| `pnpm nx run-many -t build -p api,desktop,web --excludeTaskDependencies --parallel=2 --skip-nx-cache --output-style=stream` | PASS: three host builds; dependencies were freshly built by the preceding run |
| `pnpm nx run-many -t test -p database,app-vue,api,desktop,web,ai,goal,utils,ipc-client,powersync-schema,ui-vue-shadcn --parallel=2 --skip-nx-cache` | Ten targets PASS; full App-Vue: 265/267 files, 1,655/1,659 tests PASS; four unrelated failures below |
| `pnpm nx run contracts:test --skip-nx-cache --output-style=stream` | 90/91 files, 547/548 tests PASS; one unrelated index failure below |
| `pnpm nx run app-vue:test --skip-nx-cache --output-style=stream -- src/di/service-client-port-facade-keep-boundary.surface.spec.ts src/layouts/shell/useShellRouterSync.spec.ts src/platform/server-state/invalidation-dispatcher.spec.ts src/platform/server-state/query-keys.spec.ts src/shared/utils/format-date-keep-boundary.surface.spec.ts` | PASS: all five modified specs / 57 tests |
| `pnpm nx run governance-tools:test --skip-nx-cache --output-style=stream` | PASS: 18 files / 199 tests; final gate reruns the completed locks |
| `pnpm install --lockfile-only --frozen-lockfile --offline --ignore-scripts` | PASS; lockfile already current, no extra regeneration needed |
| `node tools/test-system-v2/inventory.mjs --check` | PASS: 1,300 files; unit 1,119, integration 34, smoke 3, IPC 8, main 8, E2E 64, perf 2, governance 62; no regeneration needed |
| `pnpm nx sync:check`; `pnpm nx graph --file=graph.json`; `pnpm list --filter @memoflow/governance --depth=-1` | Sync PASS; generated graph has no Product project; package manager matches no Product package |
| `pnpm exec eslint` over all changed surviving TS/JS/MJS/Vue files, excluding generated Prisma | PASS: zero errors; three existing warnings in IPC client and test-target tooling |
| `git diff --check`; `git diff HEAD --check` | PASS |
| `pnpm nx run memoflow:governance-check --skip-nx-cache` | PASS: root gate and all six dependency tasks, uncached |

Runtime imports of the generated Prisma, built contracts and PowerSync schema were exercised
without connecting to a database: 73 Prisma models preserve Goal/TaskPlan while excluding
Rule/RuleRevision; 45 PowerSync tables exclude rules/rule_revisions; contracts expose no retired
Product symbols. A zero-match `rg` scan covers apps/packages/Docker, built outputs, generated
client/graph, lockfile, environment and workspace/test config. It excludes historical SQL,
README prose, test assertions and source maps; Engineering Governance terminology remains.
The final ADR policy test additionally scans surviving source files including their tests.

## Existing failures and validation limits

Full suites are **not all green**. The following files and their tested owner implementations
have no GOV-7903 diff from HEAD; these failures are outside this retirement scope:

- `contracts` → `product-module-index-paths.surface.spec.ts`: six stale Goal index links to
  GoalReviewCreationView, GoalReviewDetailView and KeyResultDetailView, already absent at HEAD.
- `app-vue` → `useAppShellStore.spec.ts`: three width expectations (620/666/653 versus
  608/658/645).
- `app-vue` → `core-vnext-presentation-boundary.spec.ts`: Task capsule expects the literal
  `'Missed'` in an unchanged component that delegates to TaskQuickSurface.

The worktree's local prod-like configuration lacks `AI_PROVIDER_ENCRYPTION_KEY`. Compose
structure validates with an interpolation-only placeholder. No fresh container runtime smoke,
authenticated E2E or live database migration was performed; the existing shared prod-like
stack was not restarted. The destructive table-drop SQL is prepared, not applied to that stack.

No retirement-attributable blocker remains. Historical ADRs, archived plans/inventory/evidence,
changelog entries and explicitly superseded UI design prose retain Product references. Active
retirement statements and negative test assertions describe or prohibit those former surfaces.
UI-9002/9003/9004 and unrelated baseline failures remain untouched. This note is the closure evidence carried by the GOV-7903 commit.
