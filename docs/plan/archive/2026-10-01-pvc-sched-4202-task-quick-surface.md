# PVC-SCHED-4202 — Task Quick Surface in Schedule

Date: 2026-10-01
Worktree: `/home/dev/projects/_worktrees/memoflow-sched-4202`
Branch: `product/vnext-sched-4202`
Baseline: `fdb428dce53a`. No commit or push. ChatGPT Web owns final review,
acceptance, commit and merge.

## Architecture and audit

The existing `TaskQuickSurface` composes `TaskOccurrenceCompactList` /
`TaskOccurrenceQuickRow`, delegates Complete, Uncomplete, Missed, Skip and Checklist
to `useTaskOccurrenceActionCoordinator`, and hosts `TaskCompletionMeasurementDialog`.
Prompt resolves from the current plan binding; the coordinator serializes actions,
opens a measurement session before completion, supports measured and complete-only
completion, retains failed sessions and clears successful sessions. Missed/Skipped
can be corrected to Completed. Checklist commands carry the occurrence version.
These semantics are reused without new Schedule mutation code.

Task owns the new `TaskOccurrenceQuickSurface`, accepting only `occurrenceId` and
emitting `open-plan`. It reads `TASK_SERVICE_KEY.getOccurrence` through a new
identity-scoped detail query and resolves the plan through existing
`useTaskPlanDetailQuery` / `getPlan` cache. Loading and retryable missing-owner
errors expose no actionable row. It renders exactly one occurrence and plan in
canonical Quick Surface, with summary, quick capture and View All disabled.

The detail key extends the existing `taskOccurrenceQueryKeys` identity root;
there is no second QueryClient/cache authority. The query captures its owner id
per request. Existing canonical `useTaskOccurrences.updateInstanceProjection`
now patches the detail key alongside range caches and existing store entries,
then refreshes/patches the canonical plan cache. Planner projections already read
that store, so occurrence writes converge without another Schedule-owned mutation
or forced range fetch. Identity clearing already removes the occurrence identity
root. This ticket does not add a new realtime occurrence invalidation mechanism;
it preserves the existing occurrence cache stale-time/read policy.

`PlannerEventDialog` exposes an `owner-content` slot in its reusable body, shared
by wide ProductDialogShell/Dialog and narrow Sheet. It imports no Task module.
`ScheduleCalendarView` embeds the Task-owned host through this slot and only passes
the occurrence owner id and handles navigation to `task-detail` / `/tasks/:id`.
Calendar and day-dialog task clicks now enter normal Event inspect and close Day
inspect. Task status is presented by the live canonical row; the old projection
status field and read-only hint are omitted for Task to avoid misleading stale
status/read-only copy. Goal/Routine read-only behavior and CalendarEntry CRUD
remain unchanged. Existing reschedule routing is untouched; no SCHED-4301 work.

The direct Day complete affordance and Schedule complete handler are removed.
`TaskEventActionPanel.vue` is deleted after parity tests; production, shared-time
and inspect-test consumers are migrated. Historical report/plan mentions are
retained as historical evidence.

## Exact files

Added:

- `packages/app-vue/src/modules/task/components/TaskOccurrenceQuickSurface.vue`
- `packages/app-vue/src/modules/task/components/TaskOccurrenceQuickSurface.spec.ts`
- `packages/app-vue/src/modules/task/composables/useTaskOccurrenceDetailQuery.ts`
- `packages/app-vue/src/modules/task/composables/useTaskOccurrenceDetailQuery.spec.ts`
- `apps/web/e2e/schedule/presentation-authority/task-quick.spec.ts`
- This archive report.

Modified:

- `packages/app-vue/src/modules/task/composables/useTaskOccurrences.ts`
- `packages/app-vue/src/platform/server-state/query-keys.ts`
- `packages/app-vue/src/modules/schedule/components/PlannerDayDialog.vue`
- `packages/app-vue/src/modules/schedule/components/PlannerEventDialog.vue`
- `packages/app-vue/src/modules/schedule/views/ScheduleCalendarView.vue`
- `packages/app-vue/src/modules/schedule/views/ScheduleInspect.characterization.spec.ts`
- `packages/app-vue/src/modules/schedule/views/schedulePanelAdaptation.spec.ts`
- `packages/app-vue/src/shared/utils/format-calendar-event-time-range.ts`
- `packages/app-vue/src/shared/utils/format-time-range-keep-boundary.surface.spec.ts`
- `apps/web/e2e/schedule/presentation-authority/main.ts`
- `apps/web/e2e/schedule/presentation-authority/plannerCalendar.fixture.ts`
- `tools/test-system-v2/test-inventory.json`
- Only the SCHED-4202 Execution paragraph in
  `docs/plan/active/2026-09-29-product-vnext-execution-master-plan.md`.

Deleted: `packages/app-vue/src/modules/schedule/components/TaskEventActionPanel.vue`.
The temporary implementation plan was archived into this report.

## Verification

The first characterization command passed 6 files / 57 tests. Final combined
Task + full Schedule command passed 28 files / 146 tests:

```bash
pnpm nx run app-vue:test -- \
  src/modules/schedule \
  src/modules/task/components/TaskOccurrenceQuickSurface.spec.ts \
  src/modules/task/components/TaskQuickSurface.spec.ts \
  src/modules/task/components/TaskOccurrenceQuickRow.spec.ts \
  src/modules/task/components/TaskOccurrenceCompactList.spec.ts \
  src/modules/task/composables/useTaskOccurrenceActionCoordinator.spec.ts \
  src/modules/task/composables/useTaskOccurrenceDetailQuery.spec.ts \
  src/modules/task/composables/useTaskOccurrences.spec.ts \
  src/modules/task/composables/useTaskPlanQueries.spec.ts \
  src/modules/task/components/dialogs/TaskCompletionMeasurementDialog.spec.ts \
  src/shared/utils/format-time-range-keep-boundary.surface.spec.ts
```

New Task evidence covers successful owner composition, occurrence/plan read
failure and retry, canonical cached plan reuse, View Plan emit, all five operations
and checklist version propagation, detail/range/store convergence, Prompt measured
completion, same-key deduplication, identity isolation and reactive owner changes.
Schedule tests cover both click sources with both panel modes, canonical owner-id
passing, closing Day inspect, View Plan route, absence of direct completion and
unchanged Goal/Routine/CalendarEntry behavior.

Other checks passed:

- `pnpm nx run app-vue:typecheck`: app-vue plus 28 dependency targets. The final
  source check ran; this was not an app-vue cached result.
- Changed-file ESLint: all 16 changed/added TypeScript/Vue files, including browser
  harness files.
- Changed-file Prettier: the same code files plus archive/master-plan Markdown.
- `git diff --check`.
- `pnpm test:inventory` and `pnpm test:inventory:check`: 1,291 files, no missing,
  duplicate or unexpected ownership; adds exactly the two Task specs and browser spec.
- `pnpm nx run memoflow:governance-check`: PASS.

## Browser evidence

Commands run from `apps/web`:

```bash
pnpm exec playwright test --config playwright.schedule-presentation-authority.config.ts --update-snapshots
pnpm exec playwright test --config playwright.schedule-presentation-authority.config.ts task-quick.spec.ts --update-snapshots
pnpm exec playwright test --config playwright.schedule-presentation-authority.config.ts
```

The full baseline run passed 10/10. The four new Task cases cover 1280px Dialog
and 600px panel Sheet inside a 1280px viewport. They use normal clicks for
Checklist, Complete, Uncomplete, Skip, Missed, Missed/Skipped completion correction,
Prompt measured completion and View Plan sentinel navigation. The checklist request
asserts the inspected version; the Prompt request asserts exact value/note payload.
Existing six cases preserve source presentation across Day/Week/Month/overflow,
Goal/Routine inspect, en-US/light/1280 and zh-CN/dark/360, CalendarEntry create/edit/
delete/cancellation/refresh warnings and missing/stale inspect.

Visual inspection of the wide Task inspect and Prompt over narrow Sheet found
readable, unobstructed canonical interactions. The initial heading incorrectly
reused Task Plan Workspace copy; it now reads Tasks. Task baselines were refreshed
after this copy repair. Captures and comparison baselines are local ignored
artifacts in `reports/test-system-v2/schedule-presentation-authority/`:

- `captures/task-quick-1280.png`
- `captures/task-quick-600.png`
- `captures/task-prompt-1280.png`
- `captures/task-prompt-600.png`

Final strict comparison passed **10/10** with **18 screenshot comparisons/captures**.
The final Task-only baseline refresh passed 4/4; final host/query follow-up passed
2 files / 7 tests after the heading repair. Collected browser errors are empty.
Representative final captures were visually inspected for both Task inspect and
Prompt measurement over the adaptive host. Command logs are available locally in
`reports/test-system-v2/schedule-presentation-authority/validation/` (ignored evidence):
`tests-final.log`, `host-tests-final.log`, `typecheck-final.log`,
`browser-baseline.log`, `browser-task-baseline-final.log`,
`browser-comparison-final.log`, `eslint-final.log`, `prettier-check.log`,
`inventory-check.log` and `governance-final.log`.

Earlier failures were repaired or rerun: one new assertion omitted the canonical
service's `undefined` second completion argument; the new convergence test initially
omitted seeding the store entry (canonical store update intentionally patches existing
entries). The first harness build preceded dependency build availability. The first
browser action run had no Task projection because the existing aggregation fixture
only projected CalendarEntries; the fixture now composes production Task reads and
projection helpers. One cold harness rebuild exceeded the existing 60s startup
limit before tests began; the subsequent warm run passed all four action scenarios.
No production workaround or timeout change was introduced.

## Limitations

Browser acceptance uses isolated production components, a doubled Planner owner
aggregation read, deterministic Task/Schedule/Goal service ports and a sentinel
Task plan route. New Task action scenarios use en-US/light and a 1280px viewport;
the narrow action host is driven by a 600px panel, proving panel-based Sheet
selection. zh-CN/dark/360 is existing presentation coverage. It is fixture-based
acceptance, not live-backend E2E. It does not
prove persisted Goal progress/outbox delivery. No database bootstrap, server or
live-account mutation was performed. SCHED-4301 collision/drag/create hardening
remains separate. ## Independent reviewer acceptance

ChatGPT Web reviewed the final SCHED-4202 diff and verified that Schedule only composes the Task-owned surface: completion, correction, checklist and Prompt measurement stay behind `TaskOccurrenceQuickSurface` / `TaskQuickSurface` / `useTaskOccurrenceActionCoordinator`, while Schedule retains only its existing planner reschedule routing needed for drag/drop. The new occurrence-detail query shares the identity-scoped Task query authority, and successful Task mutations converge the occurrence detail cache, range caches and Task store without a second Schedule mutation path.

The reviewer reran a focused matrix covering the Task host, occurrence-detail query, action coordinator, occurrence projection convergence, Schedule inspect/adaptation and time boundary: **7 files / 58 tests passed**. A characterization-only router initialization warning introduced by the new `useRouter` dependency was repaired by starting the test router on `/`; the same matrix then completed with **0 Vue Router R0004 warnings**.

The final strict Chromium comparison passed **10/10 tests in 45.7s**, including wide Dialog and 600px panel Sheet Task actions, checklist version propagation, Complete/Undo/Skip/Missed correction, Prompt measurement payload and View Plan navigation. Reviewer visual inspection confirmed the canonical Task surface remains readable in both adaptive hosts and that the Prompt dialog layers correctly over the narrow Sheet.

**SCHED-4202 is accepted / frozen.** Browser evidence remains fixture/service-double based rather than live-backend E2E.
