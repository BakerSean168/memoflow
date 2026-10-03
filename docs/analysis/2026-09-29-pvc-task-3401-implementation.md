# PVC-TASK-3401 — Task Quick Surface + canonical action coordinator

**Status:** Implemented / validated on 2026-09-29.

## Implemented

- Added `useTaskOccurrenceActionCoordinator` as the Task-owned command entry for Complete, Uncomplete, Missed, Skip, and Checklist mutations. The completion entry keeps an explicit hook point for TASK-3301 completion-time KR measurement.
- Extracted the shared quick execution grammar into:
  - `TaskOccurrenceQuickRow`
  - `TaskOccurrenceCompactList`
  - `TaskQuickSurface`
- Task Home and Task Detail keep their full occurrence rows but route occurrence mutations through the canonical coordinator.
- Task Capsule and `DailyTodoWidget` reuse `TaskQuickSurface`; Capsule retains inline quick-create and reuses the canonical quick-task request builder introduced by TASK-3004.
- Schedule integration remains deferred to SCHED-4202.
- Removed the superseded `TaskOccurrenceCompactRow`.

## Review repairs

A semantic-parity review found two major gaps and both were fixed:

1. Quick-row correction semantics now match the Task aggregate/full row:
   - Pending/InProgress/Missed/Skipped -> Completed
   - Completed -> Pending via Uncomplete
   - Missed/Skip menu actions remain limited to Pending/InProgress
   - Checklist mutation is blocked only by in-flight surface mutation, not by terminal status alone.
2. Busy presentation now distinguishes command serialization from visual state:
   - only the active occurrence renders a spinner;
   - sibling rows are disabled while the surface command is in flight without showing a fake spinner.

The extraction also migrated browser selectors from DailyTodo-specific child markup to shared semantic contracts:
- `data-task-occurrence-id`
- `data-task-status`
- shared `task-compact-complete-*` controls
- shared `task-quick-count` / `task-quick-progress` with integer `data-progress`.

## Validation

| Check | Result |
| --- | --- |
| Final focused app-vue suite | PASS — 9 files / 64 tests |
| `app-vue:typecheck --skipNxCache` | PASS — exit 0 |
| Changed-file ESLint | PASS |
| `git diff --check` | PASS |
| Selector-migration focused suite | PASS — 3 files / 19 tests |
| Playwright discovery/compile | PASS — 4 affected tests discovered (1 task completion loop + 3 local-docker Phase A/B tests) |
| Actual browser E2E `task/task-completion-loop.spec.ts` | PASS — 1/1; test 31.3s, total 1.2m |

The actual browser E2E exercised the canonical DailyTodo quick-row selector and the Task -> Goal EachCompletion closed loop.

Nx reported `account:build` and `time:build` as flaky-task advisories during typecheck, but the target completed successfully.

## Remaining validation boundary

The Local Docker Phase A/B specs were compile/discovery checked after selector migration, but were not executed against a freshly built current-worktree container in this ticket. Their runtime execution remains a later integration/acceptance check; no product-code blocker is currently known.

## Scope held

This ticket did **not** implement Schedule quick-surface integration, Occurrence Inspect, TASK-3301 Goal/KR measurement, or unrelated shell/workspace changes.
