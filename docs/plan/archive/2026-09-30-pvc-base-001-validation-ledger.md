---
tags:
  - plan
  - archive
  - product-vnext
status: evidence
created: 2026-09-30T08:20:00Z
updated: 2026-09-30T08:26:17Z
description: PVC-BASE-001 command resolution, clean ancestry baseline and actual validation evidence
---

# PVC-BASE-001 — Validation ledger and clean baseline evidence

Scope: documentation and validation only. Source of truth: [current master-plan ticket and validation matrix](../active/2026-09-29-product-vnext-execution-master-plan.md#pvc-base-001--validation-ledger-and-clean-baseline). No runtime/product code, configuration, scripts, commits or pushes are part of this execution. Other PVC tickets retain their inherited status.

## Baseline identity and clean-state contract

- Worktree: `/home/dev/projects/_worktrees/memoflow-base-001`.
- Branch: `product/vnext-base-001`.
- Validation-baseline HEAD before acceptance commit/rebase: `6e2bac28df74992a785d5ddab33c259d96b3593d`.
- `origin/main` and merge-base: `d3a32135709cc650aee712bf7fb13e02a17ea08d`.
- `git merge-base --is-ancestor origin/main HEAD`: exit 0.
- `git rev-list --left-right --count origin/main...HEAD`: `0 37` (behind 0, ahead 37).
- `git ls-remote origin refs/heads/main`: exit 0, same `d3a32135709cc650aee712bf7fb13e02a17ea08d`; remote verification was read-only, no fetch/rebase.
- Initial `git status --short` and `git status --porcelain=v1`: empty.
- Node `v24.21.0`; pnpm `11.20.0`.
- After validation, only the master plan and this report may appear in status; ignored dependencies/generated declarations/build output/reports do not constitute product edits. No claim that the post-edit checkout is clean: these two uncommitted documents are the expected difference.

## Inherited Product vNext execution-line commits

All 37 commits below are already in HEAD and absent from the verified main ref. They are context for this baseline, not changes implemented by BASE-001. Ordered oldest first (`git log --reverse --format='%h %s' origin/main..HEAD`):

```text
44d4d583aa0 docs: define product vnext convergence plan
707a52a180a docs: deepen task vnext convergence audit
fa28e94a7bc docs: resolve task vnext product decisions
80c771d32f1 docs: consolidate task vnext decisions
9b2ae5a5a0e docs: audit remaining product surfaces
b37577ebd9d docs: define native surface convergence
557564bc764 docs: split product vnext execution plan
844440f93d2 feat(ui): refine adaptive business panel chrome
49596e01309 feat(ui): polish workspace chrome and home surfaces
9de4075e0f6 feat(ui): refine chat workspace surfaces
a140db02770 feat(ui): unify module surfaces and navigation chrome
75f32debf45 feat(ui): refine overlays and secondary surfaces
ec9dadd8942 feat(ui): finish high-frequency surface cleanup
5af1dddadc8 feat(ui): complete semantic surface convergence
17266e9f3c0 feat(ui): introduce inset workspace panes
18dbaa3247b fix(ui): restore discoverable workspace resizing
e31ad266cab fix(ui): strengthen workspace pane hierarchy
61c7c606784 feat(ui): adopt hybrid workspace shell
703d62306ed feat(task): converge lifecycle and outcome semantics
039d612ec77 feat(task): converge home to today and plans
bd209f5837c feat(task): bound home queries and goal scope
98e7de3c7eb feat(task): restore canonical quick task entry
e37fb32508e feat(task): unify quick execution surfaces
4d35436df20 docs(task): close quick surface ticket
52a4a8e86fb feat(task): add occurrence inspect dialog
acd77ce3254 docs(task): close occurrence inspect ticket
88a0190e74e feat(goal): centralize kr calculation presentation
7b0c4c015ce feat(goal): make record composer measurement aware
df854f0ff7f feat(goal): add record live preview
4fd233700ad fix(goal): align record preview ordering
fb53c666424 feat(task): add kr measurement recording modes
c229b629e96 docs(task): close kr recording modes
af419f1a5e2 feat(goal): distinguish record authorship and source
b21360b6f0d feat(task): persist completion measurement intent
9e769415b50 feat(task): complete goal measurement workflow
3ab8d5acf9c docs(product-vnext): close measurement slice acceptance
6e2bac28df7 feat(goal): remove reminder from create flow
```

## Command resolution and execution policy

The active ticket contains the reusable owner matrix, package batches, browser flow commands, database safeguards and governance split. Resolved from `packages/{goal,task,schedule,notification,ai,setting,account,app-vue}/project.json`, `nx.json`, `vitest.shared.ts`, integration configs, and `apps/web` Playwright configs/spec manifests. `pnpm nx show project web --json` verified the inferred `web:build`: executor `nx:run-commands`, cwd `apps/web`, command `vite build`, output `dist/apps/web`, inherited `^build`. `pnpm nx show projects --withTarget=test:integration` verifies integration target names; no invented AI/Setting/Vue database target.

Nx MCP and CodeGraph were unavailable in this session; Nx CLI and repository configuration were used. `NX_DAEMON=false` was set for Nx commands. Fresh test executions use `--skipNxCache`; typecheck/build may reuse valid Nx cache, which is reported separately from fresh tests.

This fresh worktree initially lacked dependencies. The first pnpm Nx invocations automatically installed the existing locked 3,269 packages from the local store and ran existing Prisma client generation/normalization and Nx-link postinstall hooks. Multiple initial invocations overlapped dependency provisioning. No package or lockfile edits resulted; this is setup overhead, not a test result or database schema push. Subsequent validation uses the populated worktree.

## Actual command results

Results are recorded below after each command completes; discovery counts are not executed tests.

All Nx entries below were prefixed with `NX_DAEMON=false`. Commands run from repository root unless a package cwd is stated. Logs are transient local `/tmp/pvc-base-001-*.log` files; the durable evidence is the command/exit/count summary here.

| Executed command                                                                                                                                                                                 | Actual result                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm nx run goal:test --skipNxCache -- src/shared/goal-record-preview.spec.ts --maxWorkers=2`                                                                                                   | PASS, exit 0; 1 file / 21 tests                                                                                                                                                                                                                                                      |
| `pnpm nx run task:test --skipNxCache -- src/server/domain/aggregates/__tests__/TaskOccurrence.test.ts --maxWorkers=2`                                                                            | PASS, exit 0; 1 file / 20 tests                                                                                                                                                                                                                                                      |
| `pnpm nx run schedule:test --skipNxCache -- src/server/domain/aggregates/__tests__/calendar-entry.spec.ts --maxWorkers=2`                                                                        | PASS, exit 0; 1 file / 16 tests                                                                                                                                                                                                                                                      |
| `pnpm nx run notification:test --skipNxCache -- src/server/domain/aggregates/__tests__/notification.spec.ts --maxWorkers=2`                                                                      | PASS, exit 0; 1 file / 11 tests                                                                                                                                                                                                                                                      |
| `pnpm nx run ai:test --skipNxCache -- src/server/domain/aggregates/__tests__/ai-conversation.spec.ts --maxWorkers=2`                                                                             | PASS, exit 0; 1 file / 4 tests                                                                                                                                                                                                                                                       |
| `pnpm nx run setting:test --skipNxCache -- src/server/preferences/user-preference-service.spec.ts --maxWorkers=2`                                                                                | PASS, exit 0; 1 file / 11 tests                                                                                                                                                                                                                                                      |
| `pnpm nx run account:test --skipNxCache -- src/server/domain/aggregates/__tests__/Account.test.ts --maxWorkers=2`                                                                                | PASS, exit 0; 1 file / 17 tests                                                                                                                                                                                                                                                      |
| `pnpm nx run app-vue:test --skipNxCache -- src/modules/goal/components/dialogs/GoalDialog.spec.ts --maxWorkers=2`                                                                                | PASS, exit 0; 1 file / 25 tests                                                                                                                                                                                                                                                      |
| `pnpm nx run contracts:test --skipNxCache -- src/modules/goal src/modules/task --maxWorkers=2`                                                                                                   | PASS, exit 0; 24 files / 167 tests; includes contracts build                                                                                                                                                                                                                         |
| `pnpm nx run-many -t typecheck --projects=goal,task,schedule,notification,ai,setting,account,app-vue --parallel=2 --outputStyle=static`                                                          | First attempt FAIL, exit 1, 8m51s; only `ai:typecheck` failed, TS2307 missing generated contract modules and a cascading TS7006. Other seven typechecks passed, including Vue. Concurrent fresh contracts build replaced declarations; do not use this failed attempt as acceptance. |
| `pnpm nx run-many -t typecheck --projects=goal,task,schedule,notification,ai,setting,account,app-vue --parallel=2 --outputStyle=stream`                                                          | Rerun after dependency builds settled: PASS, exit 0, 27s; all 8 owner gates, 36 tasks; 34/36 cache hits, AI compiler reran successfully. Nx labels previous AI failure flaky; no source repair made.                                                                                 |
| `pnpm nx run-many -t test --projects=goal,task,schedule,notification,ai,setting,account --parallel=2 --skipNxCache --outputStyle=static`                                                         | Interrupted after >7 minutes, exit 143; initial provisioning overhead plus unbounded workers. No full-package acceptance.                                                                                                                                                            |
| `pnpm nx run app-vue:test --skipNxCache --outputStyle=static`                                                                                                                                    | Interrupted after >7 minutes, exit 143; no full-Vue acceptance.                                                                                                                                                                                                                      |
| `pnpm nx run-many -t test --projects=goal,task,schedule,notification,ai,setting,account --parallel=1 --skipNxCache --outputStyle=stream -- --maxWorkers=2`                                       | Bounded retry interrupted after about 5 minutes, exit 143, still executing Task tests with no completed package summary. Replaced for this baseline by the eight verified focused commands above. Full package command remains available in the active ledger; not claimed green.    |
| `pnpm nx run app-vue:test --skipNxCache --outputStyle=stream -- --maxWorkers=2`                                                                                                                  | Bounded retry interrupted after about 5 minutes, exit 143, no complete summary. Verified lower-level `GoalDialog.spec.ts` above; full Vue command remains available, not claimed green.                                                                                              |
| `pnpm nx show project web --json`                                                                                                                                                                | PASS, exit 0; inferred Vite build resolved (first capture included pnpm install text, so repeated after provisioning for valid JSON)                                                                                                                                                 |
| `pnpm nx show projects --withTarget=test:integration`                                                                                                                                            | PASS, exit 0; includes all five requested database integration owners; AI/Setting/app-vue do not expose this target                                                                                                                                                                  |
| `pnpm exec vitest list --config vitest.integration.config.ts --filesOnly` separately with cwd `packages/goal`, `packages/task`, `packages/schedule`, `packages/notification`, `packages/account` | All PASS, exit 0 each; respectively 4 / 6 / 2 / 3 / 7 integration files discovered. Global setup and tests not executed. Root equivalent uses `pnpm --dir packages/<owner> exec …`.                                                                                                  |
| `git ls-remote origin refs/heads/main`                                                                                                                                                           | PASS, exit 0; same SHA as local main, behind 0                                                                                                                                                                                                                                       |
| `node tools/runtime/preflight.mjs --profile e2e`                                                                                                                                                 | PASS, exit 0; underlying command of `pnpm runtime:preflight:e2e`, ports/ownership caveat below                                                                                                                                                                                       |
| `TEST_INVENTORY_LIST=1 pnpm nx run web:e2e -- --list`                                                                                                                                            | PASS, exit 0; 71 tests / 21 files discovered; no browser scenarios executed                                                                                                                                                                                                          |
| `pnpm nx run web:e2e:audit -- --list --reporter=list`                                                                                                                                            | PASS, exit 0; 73 tests / 11 files discovered; no browser scenarios executed                                                                                                                                                                                                          |
| `pnpm nx run web:build --outputStyle=static`                                                                                                                                                     | Initial overlapping build interrupted, exit 130; rerun separately below                                                                                                                                                                                                              |
| `pnpm nx run memoflow:docs-check --outputStyle=stream`                                                                                                                                           | PASS, exit 0; first document gate, 21.8s                                                                                                                                                                                                                                             |
| `pnpm nx run memoflow:governance-check --outputStyle=static`                                                                                                                                     | PASS, exit 0; first post-doc gate, 1m39s; 7 tasks, 6/7 cache hits. Full audit chain executed; no timeout split required.                                                                                                                                                             |

Focused total: **8 files / 125 tests passed**; contracts: **24 files / 167 tests passed**. Database integration and browser discovery are separate evidence. Broad interrupted runs are not failed assertions and are not green suites.

| Additional command                           | Actual result                                                                                                                                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm nx run web:build --outputStyle=stream` | PASS, exit 0, 1m28s; 31 tasks, 28/31 cache hits. Fresh Vue package declarations/build and web production bundle completed; Web Vite build 9.36s. Existing chunk-size/plugin timing warnings remain. |

BASE-001 is **Implemented / validated** for the ledger and baseline scope only. Post-status `pnpm nx run memoflow:governance-check --outputStyle=stream` **PASS**, exit 0, 45s; 7 tasks, 6/7 cache hits, full audit chain reran. `git diff --check` **PASS**, exit 0. Recording these results is followed by one final governance/diff rerun before handoff.

## Explicit caveats and deferred acceptance

- Full database integration and browser scenario execution are deferred. Existing integration global setup and browser API startup call `packages/test-utils/src/setup/database.ts` → `ensureTestDatabase`: enable `vector`, Prisma `db push --accept-data-loss`; tests can truncate tables with cascade. Database ownership/disposability is not proven by a listening port. No destructive flags, reset, schema push, or test-table cleanup were invoked by this ticket.
- E2E preflight passed: API :3000 closed, Web :5173 closed, PostgreSQL :5433 open; prod-like API :20201 is up and isolated. Existing host services were left alone. Safe `--list` discovery does not launch Playwright web servers, execute global setup or grant end-to-end behavioral acceptance.
- Default core manifest: `apps/web/web-flow-specs.mjs`; audit manifest: `apps/web/web-audit-specs.mjs`. Core discovers 71 tests / 21 files; audit discovers 73 tests / 11 files. The audit manifest includes retired Reminder but discovery resolves no Reminder file; this is an existing manifest condition, not a BASE-001 code change.
- No screenshots, accessibility/performance acceptance, remote CI, release/deploy or unrelated PVC implementation is claimed. BASE-001 completion means a verified command ledger and documented baseline, not that every inherited product behavior passes every deployment lane.
- Tool warnings (Nx asset plugin deprecation, future Vite native loader/import extension warnings, FORCE_COLOR/NO_COLOR, and build-size warnings if present) are preserved in command logs; no dependency upgrades or warning suppression changes were made.

## Documentation closure

Only the two scoped Markdown files are changed. `git diff --check` passed after the ledger/evidence edits (exit 0). Full governance passed after the first documentation edit and again after the execution status/evidence update (45s, exit 0). At validation handoff, status contained exactly the active master plan (modified) and this archive report (untracked), on baseline HEAD `6e2bac28df74992a785d5ddab33c259d96b3593d`. The later acceptance commit/rebase does not retroactively change those recorded validation results.
