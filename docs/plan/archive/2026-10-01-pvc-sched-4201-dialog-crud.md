# PVC-SCHED-4201 — Adaptive Planner dialogs and CalendarEntry CRUD

Date: 2026-10-01
Worktree: `/home/dev/projects/_worktrees/memoflow-sched-4201`
Branch: `product/vnext-sched-4201`
Audited starting HEAD: `86e7e3a80842`; existing WIP retained and completed without commit/push.

## Audit and implementation

The starting WIP added wide Planner dialogs, CalendarEntry edit/delete wiring,
locale copy, and inspect characterization. It had no narrow fallback, still retained
legacy sheets and their browser/shared-test consumers, and lacked stale-entry and
write/refresh failure checks.

Completion sequence: audit owner API and editor seeding; adapt both surfaces with
one body/footer each; complete versioned owner CRUD and failure feedback; migrate
presentation/shared tests and retire legacy files; validate and record evidence.

- `useScheduleCalendar.updateCalendarEntry` returns a `Result<CalendarEntryClientDTO>`;
  delete returns a boolean and calls `deleteSchedule(id, expectedVersion)`.
  Tests verify these shapes and owner-cache updates after successful writes.
- `CreateScheduleDialog` already seeds title, description, location, attendees, Timed
  date/time and AllDay Ymd ranges from its `schedule` prop. Added tests save both
  seeded ranges without introducing another editor or time conversion authority.
- `PlannerDayDialog` and `PlannerEventDialog` each use `usePanelWidth().isNarrow`
  to select Sheet or ProductDialogShell/Dialog. VueUse reusable templates share
  one body and footer across both shells. No viewport media selects the shell.
- Schedule inspect offers Edit/Delete; Edit passes current owner facts to the existing
  editor, Update sends the seeded version, and Delete uses destructive confirmation
  and the inspected version. Owner facts are checked before edit/delete/save and
  again after asynchronous confirmation. Missing/stale facts have localized feedback.
  Cleared optional editor fields become explicit empty strings/lists for Update, whose
  omitted-field semantics otherwise preserve the previous value.
- Inspect closes while destructive confirmation is active, then returns on cancellation
  or rejection. This fixes an overlay obstruction reproduced by normal browser clicks.
- Successful create/update/delete retain success feedback when Planner refresh rejects;
  a separate warning explains the failed read refresh, including Schedule reads that
  report failure in store state instead of rejecting. Failed writes retain the draft
  or inspect and do not claim success.
- Goal/Routine remain read-only in inspect. TaskEventActionPanel and direct completion
  behavior remain the 4201 baseline. SCHED-4202 and SCHED-4301 are untouched.
- Presentation identity remains owned by `planner-presentation.ts` from SCHED-4101.
  Time rendering continues through Product Time; day-title computation also observes
  Product Time preference revisions.
- Browser harness and shared surface tests now consume the adaptive production
  components. `DayDetailSheet.vue` / `EventDetailSheet.vue` and the legacy export
  are removed; production/test/tool searches contain no remaining references.

## Validation

All final checks passed:

| Check                                                                                   | Result                                                  |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Focused Schedule inspect/editor/cache/presentation/adaptation plus shared surface tests | 7 files / 51 tests                                      |
| Full Schedule app-vue suite after the confirmation repair                               | 18 files / 82 tests                                     |
| `pnpm nx run app-vue:typecheck`                                                         | PASS; app-vue check executed with 28 dependency targets |
| Changed-file ESLint; Prettier for TS/Vue/harness/docs                                   | PASS; locale files deliberately retain baseline style   |
| `git diff --check`                                                                      | PASS                                                    |
| `pnpm test:inventory:check`                                                             | PASS; 1,288 files, unchanged inventory                  |
| `pnpm nx run memoflow:governance-check`                                                 | PASS                                                    |
| Chromium baseline regeneration                                                          | 6 / 6 tests                                             |
| Chromium strict `--update-snapshots=none` comparison                                    | 6 / 6 tests; 14 screenshot comparisons / captures       |

Focused command (workspace root):

```sh
NX_DAEMON=false pnpm nx run app-vue:test --skip-nx-cache -- src/modules/schedule/views/ScheduleInspect.characterization.spec.ts src/modules/schedule/components/CreateScheduleDialog.spec.ts src/modules/schedule/composables/useScheduleCalendar.cache.spec.ts src/modules/schedule/planner/planner-presentation.spec.ts src/modules/schedule/views/schedulePanelAdaptation.spec.ts src/shared/components/product-surface-polish.surface.spec.ts src/shared/utils/format-time-range-keep-boundary.surface.spec.ts
```

Full Schedule command:

```sh
NX_DAEMON=false pnpm nx run app-vue:test --skip-nx-cache -- src/modules/schedule
```

Browser command (workspace root; add `--update-snapshots` to regenerate):

```sh
pnpm exec playwright test --config apps/web/playwright.schedule-presentation-authority.config.ts --update-snapshots=none
```

The source scenarios are en-US/light/1280px and zh-CN/dark/360px. CRUD scenarios
use 1280px and 600px panels in a 1280px viewport, asserting seeded edit, Update
version 1, cancellation without Delete, destructive Delete version 2, Create, and
success plus refresh-warning for all three writes. Two additional browser scenarios
assert missing/stale inspect feedback and no owner command. All six scenarios assert
zero page/console errors. All 14 captures assert zero document horizontal overflow.
Representative wide CalendarEntry Dialog and narrow day Sheet captures were visually
inspected. Narrow Week/Month overflow density remains the SCHED-4101 limitation.

The first browser attempt exposed the real confirm-overlay obstruction; it was repaired
before the successful regeneration and strict run. A unit harness missing SheetTitle
context stubs was also corrected. Nx prints historical flaky-task notices for
`time:build` / `contracts:build`; typecheck runs completed successfully.
The two edited locale files retain the baseline JSON-like double-quoted style, with only
the required SCHED-4201 locale changes applied manually.

## Independent reviewer acceptance

ChatGPT Web reviewed the final diff after locale-hygiene repair. The adaptive surfaces use a single reusable body/footer per Day/Event component, with `usePanelWidth()` selecting wide Dialog versus narrow Sheet. CalendarEntry edit/delete remains Schedule-owned and versioned; Goal/Routine remain read-only and Task behavior remains the 4201 baseline. The browser CRUD harness mounts the production `ScheduleCalendarView`, Schedule store/composable, editor, confirm dialog, styles and locales, with only the Schedule service replaced by a deterministic double.

Reviewer visual inspection confirmed the same 1280px viewport renders a centered Event Dialog when panel width is 1280 and the Sheet fallback when panel width is 600, with no horizontal document overflow. After the locale diff was reduced from whole-file formatting churn to 22 insertions / 4 deletions, the focused reviewer matrix passed 10 files / 64 tests, locale ESLint, governance and `git diff --check`.

A final strict Chromium rerun after review repair passed **6/6 tests in 34.9s**. One immediately preceding attempt timed out before tests began because the cold Vite build exceeded the Playwright webServer 60s startup window; the warm rerun started normally and all six scenarios passed, so this is recorded as harness startup contention rather than a product failure.

**SCHED-4201 is accepted / frozen.**

## Browser scope and limits

The isolated harness uses production components, styles, locales, Schedule store,
Schedule composable, editor, and destructive confirmation. CRUD commands use a
Schedule service double; Planner aggregation reads use a fixture. No backend/database
is started, and this is not live-backend E2E. Source presentation scenarios retain
all four owners across Day/Week/Month overflow, details and capsule. CRUD scenarios
use wide and narrow panel widths inside a wide viewport to distinguish panel adaptation
from viewport adaptation. Baselines/captures remain local ignored artifacts.

CodeGraph and nx-mcp are unavailable in this session; repository searches and
existing Nx targets supply the audit/verification evidence. The UTC browser matrix
is limited and does not establish exhaustive timezone or live-server concurrency coverage.

## Exact changed files

- `apps/web/e2e/schedule/presentation-authority/main.ts` (modified)
- `apps/web/e2e/schedule/presentation-authority/schedule-presentation-authority.spec.ts` (modified)
- `apps/web/e2e/schedule/presentation-authority/vite.config.ts` (modified)
- `docs/plan/active/2026-09-29-product-vnext-execution-master-plan.md` (modified)
- `packages/app-vue/src/locales/en-US/schedule.ts` (modified)
- `packages/app-vue/src/locales/zh-CN/schedule.ts` (modified)
- `packages/app-vue/src/modules/schedule/components/CreateScheduleDialog.spec.ts` (modified)
- `packages/app-vue/src/modules/schedule/components/DayDetailSheet.vue` (deleted)
- `packages/app-vue/src/modules/schedule/components/EventDetailSheet.vue` (deleted)
- `packages/app-vue/src/modules/schedule/components/index.ts` (modified)
- `packages/app-vue/src/modules/schedule/composables/useScheduleCalendar.cache.spec.ts` (modified)
- `packages/app-vue/src/modules/schedule/views/ScheduleCalendarView.vue` (modified)
- `packages/app-vue/src/modules/schedule/views/ScheduleInspect.characterization.spec.ts` (modified)
- `packages/app-vue/src/modules/schedule/views/schedulePanelAdaptation.spec.ts` (modified)
- `packages/app-vue/src/shared/components/product-surface-polish.surface.spec.ts` (modified)
- `packages/app-vue/src/shared/utils/format-calendar-event-time-range.ts` (modified)
- `packages/app-vue/src/shared/utils/format-time-range-keep-boundary.surface.spec.ts` (modified)
- `apps/web/e2e/schedule/presentation-authority/plannerCalendar.fixture.ts` (added)
- `docs/plan/archive/2026-10-01-pvc-sched-4201-dialog-crud.md` (added)
- `packages/app-vue/src/modules/schedule/components/PlannerDayDialog.vue` (added)
- `packages/app-vue/src/modules/schedule/components/PlannerEventDialog.vue` (added)
