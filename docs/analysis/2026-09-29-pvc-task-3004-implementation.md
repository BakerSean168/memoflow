# PVC-TASK-3004 implementation report

**Status (2026-09-29): Implemented / validated.**

## Result

Quick Task is now a real Task-owned native entry instead of a dead deep link.

- `/tasks?dialog=quick-task` opens the existing `QuickTaskDialog` on direct load and later route changes.
- Cancel/dismiss removes only the `dialog=quick-task` query key and preserves unrelated query/hash state.
- Save creates a normal one-time Product-Today / AllDay `TaskPlan` through the existing `createPlanSafe(..., 'quick')` path.
- Failed create keeps the dialog and draft open.
- Successful create closes the quick dialog and refreshes the bounded Today occurrence read; the existing create mutation continues to seed normal Task Plan detail cache.
- Full `TaskPlanDialog` create and create-and-bind flows are unchanged.
- `TaskCapsulePreview` keeps its inline quick-create interaction, but now shares the canonical request builder rather than duplicating schedule/default payload semantics.
- Today Overview and AI no-model shortcuts continue to target `/tasks?dialog=quick-task`.

The canonical request builder is:

`packages/app-vue/src/modules/task/utils/quick-task-request.ts`

It owns only request defaults; it does not introduce a second persistence or orchestration path.

## Validation

- Focused app-vue regression suite: **8 files / 66 tests passed**.
- Focused `TaskManagementView.runtime.spec.ts`: **20 tests passed** after the lint-only test-stub repair.
- `pnpm nx run app-vue:typecheck`: **PASS**.
- Changed-file ESLint: **PASS**.
- `git diff --check`: **PASS**.

The focused suite covered:

- `QuickTaskDialog` title-only, trimming, dirty-state, cancel, blank/pending guards;
- direct/deferred `dialog=quick-task` route consumption;
- preserving unrelated query/hash state;
- create failure/retry behavior;
- exact quick-create payload and quick feedback intent;
- bounded Today refresh after success;
- full TaskPlan create-and-bind parity;
- Capsule shared request builder;
- Today Overview and AI quick-action entry regression.

## Scope boundary

No TASK-3401 Quick Surface/action coordinator, occurrence inspect, Goal measurement, Schedule dialog, AI workflow refactor, or shell redesign was implemented in this ticket.
