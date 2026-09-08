---
tags:
  - analysis
  - core-vnext
  - hardening
  - review
  - acceptance
description: MemoFlow Core vNext HARD-7105 five-layer final review, focused repair, and pre-delivery acceptance evidence
created: 2026-09-08T10:27:00+08:00
updated: 2026-09-08T10:27:00+08:00
status: accepted-pre-delivery
---

# HARD-7105 — Final review and focused repair evidence

## Decision

**Five-layer review: PASS for implementation and pre-delivery acceptance.**

No unresolved P0/P1 finding remains in the Core vNext residual scope. The accepted local candidate is `3f7f7023f127` on `refactor/core-clean-reminder-schedule-legacy`, based on current `origin/main` with `0 behind / 23 ahead` at the time of this review.

This document does **not** claim merge/archive completion. GitHub PR CI and merge into `main` remain the final delivery gate; the umbrella plan stays active until that delivery is reconciled.

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

## Final pre-delivery verdict

**ACCEPTED — no unresolved P0/P1.**

Archive is gated only by durable GitHub delivery evidence, not by additional Core vNext implementation work.
