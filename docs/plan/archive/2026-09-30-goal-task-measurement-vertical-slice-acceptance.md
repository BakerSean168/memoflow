---
tags:
  - plan
  - task
  - goal
  - acceptance
description: Integrated acceptance for the Goal measurement + Task completion measurement vertical slice
created: 2026-09-30T00:00:00Z
updated: 2026-09-30T00:00:00Z
---

# Goal measurement + Task completion measurement — integrated acceptance

## Scope

This acceptance closes the integrated batch slice on `product/vnext-batch1-task-lifecycle` at `9e769415b50`:

- GOAL-1202 — Record live preview + quick check-in
- GOAL-1203 — Record authorship / provenance / correction contract
- TASK-3301A — LinkOnly / Fixed / Prompt recording modes
- TASK-3301B — durable completion measurement intent
- TASK-3301C — measurement dialog + correction / revert

The supporting GOAL-1104 / GOAL-1201 calculation vocabulary and Record Composer remain the owner foundations for the slice.

## Cross-owner review

No merge-blocking ownership or correctness defect was found.

- Task owns the completion decision, pending Prompt session, canonical completion command and dialog shell.
- Goal owns measurement vocabulary, unit, preview arithmetic, authoritative GoalRecord persistence, provenance and correction.
- Prompt completion writes through `completeOccurrence(..., { goalMeasurement })`; the frontend does not perform a Goal write plus Task write.
- Goal read failure keeps the Task-only completion path available.
- `TaskAutomatic` stays immutable to normal Goal UI.
- `TaskUserMeasurement` correction preserves source correlation and Task completion state.
- Uncomplete uses the existing source-correlated revert; re-complete creates the replacement through the same Task command path.

## Changed-spec closure

The changed-spec set from the GOAL-1201 baseline `7b0c4c015ce` through `9e769415b50` contains 58 test files.

57 / 58 files were executed and passed, totaling 745 tests:

| Layer | Files | Tests | Result |
| --- | ---: | ---: | --- |
| app-vue changed specs | 14 | 197 | PASS |
| Goal unit / characterization changed specs | 15 | 171 | PASS |
| Goal PostgreSQL integration | 1 | 1 | PASS |
| Task changed specs excluding protected Prisma transaction integration | 17 | 305 | PASS |
| Contracts changed specs | 6 | 46 | PASS |
| Database schema specs | 2 | 10 | PASS |
| PowerSync schema specs | 1 | 12 | PASS |
| Migrator spec | 1 | 3 | PASS |

The Goal integration test `register-goal-event-listeners.integration.test.ts` passed against `memoflow_test` after safe schema sync.

The related Task plan settlement PostgreSQL integration was also revalidated separately during plan-hygiene closure: 1 file / 5 tests PASS.

## Static gates

- `app-vue:typecheck`: PASS
- `task:typecheck` + `goal:typecheck`: PASS
- `contracts:typecheck`: PASS
- `database:typecheck`: PASS
- `powersync-schema:typecheck`: PASS
- `migrator:typecheck`: PASS
- test inventory: PASS — 1270 files
- `memoflow:governance-check`: PASS
- changed-file ESLint: 0 errors; warnings are existing test/generated-file warnings
- `git diff --check`: PASS

## Explicit remaining acceptance gaps

### Protected Task Prisma transaction integration

The only changed spec not executed is:

`packages/task/src/server/infrastructure/adapters/prisma/prisma-task-write-transaction-runner.integration.test.ts`

Its harness requires the protected Prisma schema-bootstrap path that can invoke `prisma db push --accept-data-loss`. This acceptance does not bypass that guard. The follow-up is to provide a safe disposable test-database bootstrap rather than weakening the protection.

### Browser E2E

TASK-3301C still needs browser-level acceptance for the full human interaction loop:

`Prompt Task -> Complete -> measurement dialog -> record and complete -> Goal current changes -> correct measurement -> Goal recalculates while Task stays Completed -> uncomplete -> record removed -> re-complete replacement`

This remains part of TASK-3901 / final visual-E2E closure.

## Acceptance conclusion

The Task -> durable measurement intent -> GoalRecord -> canonical KR aggregation -> correction -> uncomplete revert -> re-complete replacement vertical slice is accepted on the batch branch at the component/runtime/domain/integration level, subject only to the two explicit gaps above.
