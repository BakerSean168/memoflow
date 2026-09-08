---
tags:
  - analysis
  - core-vnext
  - hardening
  - review
  - acceptance
description: MemoFlow Core vNext HARD-7105 five-layer final review, focused repair, and pre-delivery acceptance evidence
created: 2026-09-08T10:27:00+08:00
updated: 2026-09-08T11:55:00+08:00
status: accepted-pre-delivery
---

# HARD-7105 — Final review and focused repair evidence

## Decision

**Five-layer review: PASS for implementation and pre-delivery acceptance.**

No unresolved P0/P1 finding remains in the Core vNext residual scope. The initial five-layer implementation review accepted `3f7f7023f127`; the pre-delivery evidence was then committed and opened as PR #338. GitHub's first independent CI pass correctly rejected delivery on fresh-workspace / acceptance-fixture drift that local cached runs had not exposed. Those delivery-gate findings were repaired in `e314e6da344` without widening any vNext product contract.

This document does **not** claim merge/archive completion. The first delivery repair is `e314e6da344`; the second fresh-integration repair is `ce603b6e612`; the third CI-only test-harness repair is `9d505c5f655`. PR #338 must pass a new exact-head GitHub CI run after these repairs and merge into `main` before the umbrella plan can be archived.

## 1. Contract correctness

Review covered Goal/Task vNext contracts, Shared Label classification, Routine command semantics, Planner/Notification AI read projections, canonical `ExecutionContext`, and Scheduler capability boundaries.

Findings and repair:

1. **P1 — obsolete AI Goal/Task validation contract remained publicly reachable.**
   - `AIGenerationValidationService` still exposed old KR `valueType` and Task `priority` / `dependencies` assumptions even though no production consumer used them.
   - Repair removed obsolete `validateKeyResultsOutput` / `validateTasksOutput` surfaces and their legacy tests instead of creating a third Goal/Task schema authority.
   - HARD-7102 anti-resurrection rules now fail if these retired validators or retired AI draft fields return to production code.

2. **P1 — AI product tools used an unsafe `as ExecutionContext` narrowing.**
   - The tool checked `identityId` but the type cast could conceal missing canonical request metadata.
   - Repair replaced the cast with explicit structural validation of canonical request context fields before any Routine command is delegated.
   - Repository-wide fail-closed context inventory now passes again.

3. **Documentation contract drift — feature map rewrite dropped still-valid public facts.**
   - Existing public-surface tests correctly failed when Better Auth/Desktop Profile and Mastra composition-root facts disappeared from the rewritten feature map.
   - Repair restored the current canonical facts; the tests were preserved unchanged.

Focused repair commit: `3f7f7023f127 fix(ai): close final vnext contract residuals`.

## 2. Vertical completeness

The final review confirmed the residual product lanes are closed and single-track:

- Shared Label is the Goal/Task classification authority.
- Routine Method Library is implemented without a second runtime/persistence model.
- AI Routine commands delegate through Reminder-owned command ports; Planner and Notification tools are read-only projections.
- API and Desktop compose the same AI product capability semantics.
- PowerSync has Routine temporary-override parity with the server-side persistence model.
- AI does not import Scheduler or expose raw ScheduleTask mutation.
- Schedule/Planner remains product/calendar ownership; Scheduler remains Temporal Engine/worker ownership.
- Mobile parity contains no retired Goal/Task fields or raw Scheduler mutation surface.

The previously open PR #337 was reviewed patch-by-patch and closed as **superseded** because its intermediate `ScheduleProductClientPort` / Mobile raw ScheduleTask mutation design would regress the completed Schedule/Scheduler physical split. GitHub had zero open PRs immediately after that reconciliation.

## 3. Behavioral completeness

A fresh final regression matrix was run after the focused repairs. All twelve project test suites passed in one sequence:

| Project | Result | Test files |
| --- | --- | ---: |
| Contracts | PASS | 68 |
| Label | PASS | 3 |
| Goal | PASS | 79 |
| Task | PASS | 71 |
| Reminder | PASS | 75 |
| Notification | PASS | 45 |
| Schedule | PASS | 20 |
| Scheduler | PASS | 31 |
| AI | PASS | 76 |
| App Vue | PASS | 201 |
| API | PASS | 65 |
| Desktop | PASS | 61 |

Notable executable totals observed in the same final run include Goal `440/440`, Task `717/717`, Scheduler `273/273`, App Vue `774/774`, API `329/329`, and Desktop `322/322`.

HARD-7101 remained `22/22` executable cross-domain failure scenarios.

## 4. Engineering quality

The final post-repair quality sequence passed:

- lint across 14 Core projects: **PASS** (existing warnings remain non-blocking; no lint errors);
- typecheck across 14 Core projects plus 31 dependency tasks: **PASS**;
- build across all 13 Core projects with build targets plus 20 dependency tasks: **PASS**;
- Test System V2 inventory: **1185 files**;
- target governance: **PASS**;
- HARD-7101 manifest/runner: **22/22 PASS**;
- Core vNext architecture lock: **1769 production source files audited, 0 violations**;
- full `memoflow:governance-check`: **PASS**.

Residual production grep found retired Goal/Task terms only in explicit comments that document those fields as retired. AI raw Scheduler access remained zero.

## 5. Plan integrity

- Wave 0–5 are closed and must not be restarted.
- Product parity is closed: ROUTINE-5302, AI-6101~6103, MOBILE-6201/6202.
- Scheduling convergence is closed: CLEAN-6301~6304; POC-6401 = `Keep custom` with pg-boss dev-only candidate status.
- HARD-7101~7104 are complete.
- HARD-7105 implementation/review is accepted after focused repair and full recheck.
- Delivery is intentionally still pending: push current exact candidate, open PR against `main`, require repository CI, merge exact accepted source, then archive the umbrella plan from merged `main`.

## 6. GitHub delivery-gate repair after PR #338 first CI

The first PR #338 CI run was treated as independent review evidence, not as a rerun-to-green exercise. It exposed four concrete truth gaps:

1. **Web acceptance fixtures still used retired Task / AI classification fields.**
   - Planner Fixture J, Task completion, and local-Docker Phase B still posted Task `tags`; Goal/Task AI workflow mocks still returned AI draft `tags`.
   - Repair changed only acceptance fixtures to the current contract: Task create uses `labelIds`; AI draft mocks use `labels`. The production Task/AI schemas stayed strict and were not relaxed.
2. **Fresh-workspace Vitest resolution missed the new physical Scheduler package.**
   - Cached local `dist` output had hidden the missing `@memoflow/scheduler` source alias.
   - Repair added Scheduler to the shared Vitest workspace source aliases. With `packages/scheduler/dist` removed, API compose-schedule and Schedule Orchestration source-resolution checks passed from source.
3. **Parser ownership and database integration fixtures still encoded pre-CLEAN-6304 / pre-binding-v2 assumptions.**
   - Utils/Data-portability keep-boundary tests now read Scheduler-owned worker parsers, not Schedule-owned Calendar routes.
   - Label integration no longer seeds retired Task `tags`; Task binding integration now seeds real identity-owned Goal/KR rows and validates identity isolation through the current composite binding constraints.
4. **Schedule coverage governance still referenced an empty migrated use-case slice.**
   - `packages/schedule/src/server/application/use-cases` no longer exists after the physical split, so its old coverage config could only fail with `No test files found`.
   - Repair removed the empty Schedule use-case coverage config, kept Schedule main + mapper coverage, retained Scheduler main + use-case + mapper coverage, and synchronized the Nx generator, target-governance checker, reporting self-test, and generated test inventory.

Focused re-acceptance after these repairs:

- Planner Fixture J full drag -> owner `409` -> UI rollback browser journey: **PASS**;
- Web Flow Shard 2, including Goal/Task AI approval + task completion: **23/23 PASS**;
- real PostgreSQL: Task binding **2/2**, Label **3/3**, Notification -> Scheduler -> Fact **3/3**, Schedule concurrency **18/18**, Schedule Orchestration **34/34**;
- coverage targets for Schedule / Scheduler / Data-portability / API: **PASS**;
- current-revision local-Docker Phase B with image provenance gate: **1/1 PASS**;
- affected typecheck for API / Schedule / Scheduler / Task / Label / Data-portability / Utils / Web plus dependencies: **PASS**;
- Test System V2 self-test **18/18**, target governance **PASS**, Nx sync **clean**, inventory **1185 files**, `git diff --check` **PASS**;
- full `memoflow:governance-check`: **PASS**, including HARD-7101 **22/22** and Core vNext architecture lock **1769 production files / 0 violations**.

Focused delivery-repair commit: `e314e6da344 test(ci): repair core vnext fresh-workspace gates`.

## 7. PR #338 second CI — integration-workspace source-resolution repair

The second exact-head CI run at `235f17ddaea62c6ae3d8a54052e58238052f0045` validated the first repair broadly: Scope, Static Analysis, Governance, Build, Unit Tests, Typecheck, all four Web Flow shards, Boundary, Coverage, Performance, Validate and their corresponding Oracles passed. The only root failure remained the Integration child lane; Delivery Observation failed only because that required lane was red.

Machine-readable Integration evidence showed **163/163 executed tests passed**. Exactly two suites failed before executing assertions:

- Notification `scheduler-to-fact-vertical-wave3.integration.test.ts`;
- Schedule `schedule-w5-real-concurrency.integration.test.ts`.

Both had the same startup error: `Failed to resolve entry for package "@memoflow/scheduler"`. The cause was a second alias plane: `vitest.workspace-helpers.ts`, used by integration configs, still knew `@memoflow/schedule` but not the physically split `@memoflow/scheduler`. Local builds had hidden this via an existing Scheduler `dist`.

Focused repair:

- add Scheduler bare/deep source aliases to `domainResolveAliases`;
- add Scheduler to `domainResolveAtAlias` package ownership;
- add a Test System V2 regression lock proving integration workspaces resolve Scheduler source on a fresh checkout;
- regenerate the canonical test inventory from **1185 -> 1186 files**.

Fresh-workspace acceptance deliberately removed `packages/scheduler/dist` during execution. Under that condition:

- Notification Scheduler -> Fact integration: **3/3 PASS**;
- Schedule real-concurrency integration: **18/18 PASS**;
- Test System V2: **19/19 PASS**;
- Notification / Schedule / Scheduler targeted typecheck: **PASS**;
- Nx sync, inventory (1186), `git diff --check`, target governance and full governance: **PASS**.

Focused repair commit: `ce603b6e612 test(ci): resolve scheduler in integration workspaces`.

## 8. PR #338 third CI — Static Analysis test-harness boundary repair

The third exact-head CI run at `242b5aa0a874dbef467d2405dc1336799aa3b74a` independently confirmed the integration repair: Verification Children, Integration Oracle, Boundary Oracle, Coverage Oracle, Performance Oracle, Unit Tests, Typecheck, Build, Governance, all four Web Flow shards and Web Flow Oracle all passed. Delivery Observation also completed successfully.

The only root failure was **Static Analysis**. `Validate Oracle` failed only as the expected fail-closed aggregate of the red Static lane. The Static error was isolated to the newly added Test System regression lock: it directly imported the root-level `vitest.workspace-helpers.ts` by a relative path, which correctly violated Nx `@nx/enforce-module-boundaries`.

The repair keeps the same runtime assertion but loads the real helper inside an isolated Node + `tsx/cjs` subprocess rooted at the workspace. That preserves the purpose of the lock (validate actual Scheduler bare/deep integration aliases) without creating a project-to-root relative import edge.

Post-repair local acceptance:

- `test-system-v2:lint`: **PASS**;
- exact CI-like affected lint across 41 projects: **PASS** with zero errors;
- Test System V2: **19/19 PASS**;
- inventory: **1186 files**;
- Nx sync and `git diff --check`: **PASS**;
- full `governance:check`: **PASS**, including HARD-7101 **22/22** and Core vNext architecture lock **1769 production files / 0 violations**.

Focused repair commit: `9d505c5f655 test(ci): respect test-system module boundaries`.

## Final pre-delivery verdict

**ACCEPTED — no unresolved P0/P1.**

Archive is gated only by durable GitHub delivery evidence, not by additional Core vNext implementation work.
