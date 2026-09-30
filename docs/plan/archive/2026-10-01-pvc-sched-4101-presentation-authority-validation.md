# PVC-SCHED-4101 — Projection presentation authority validation

Date: 2026-10-01
Branch/worktree: `product/vnext-sched-4101` / `_worktrees/memoflow-sched-4101`
Baseline: `98b5e9e9118`

## Scope

This pass validates the in-progress SCHED-4101 convergence without touching owner business actions or the later SCHED-4201/4202 dialog/action work.

The current patch centralizes Schedule projection source presentation in
`planner-presentation.ts`:

- source label i18n key;
- FullCalendar source class;
- compact dot class;
- compact badge class;
- event tone class with conflict override.

The same authority is consumed by:

- `PlannerCalendar.vue` (Day / Week / Month projections);
- `DayDetailSheet.vue`;
- `EventDetailSheet.vue`;
- `useCalendarView.ts` through the compatibility `calendarEventSourceLabel` alias;
- `ScheduleCapsulePreview.vue`.

No Task/Goal/Routine owner mutation semantics are moved into the presentation utility.

## Review findings

The change removes the previous concrete source-color drift:

- PlannerCalendar already represented Goal as warning and Routine as success.
- Day/Event detail previously represented Goal as success and Routine as muted.
- The centralized map now makes all these surfaces use the PlannerCalendar source identity.

Repository search finds no remaining local `sourceDotClass` / `sourceBadgeClass` implementation in the Schedule UI and no second `schedule.source.*` mapping outside the presentation authority/locales.

The source map is typed against `CalendarEventProjection['sourceType']`, so adding a new owner source requires updating the canonical map at compile time.

## Fresh validation

Executed on the development host against the current uncommitted SCHED-4101 worktree:

- Schedule module Vitest: **18 files / 63 tests PASS**.
- Focused presentation test: **1 file / 5 tests PASS**.
- PlannerCalendar + capsule focused tests: **2 files / 12 tests PASS**.
- `useCalendarView.spec.ts`: **1 file / 4 tests PASS**.
- `ScheduleInspect.characterization.spec.ts`: **1 file / 2 tests PASS**.
- `app-vue:typecheck`: **PASS**.
- ESLint on all seven changed production/test files: **PASS**.
- `git diff --check`: **PASS**.

The first combined focused Vitest invocation and one early typecheck attempt were interrupted by the MCP response timeout rather than a test/type error. Both were subsequently rerun in bounded commands and passed.

An additional Codex CLI review attempt could not access the repository because its local bubblewrap sandbox cannot create the loopback/user namespace on this host; this is an agent-runtime limitation, not a patch finding.

## Browser / visual acceptance

The isolated production-component Playwright harness now exercises the same production
`PlannerCalendar`, `DayDetailSheet`, `EventDetailSheet` and
`ScheduleCapsulePreview` surfaces with one canonical projection per owner source.

Fresh browser evidence covers two representative presentation states:

- `en-US`, light, 1280 px;
- `zh-CN`, dark, 360 px.

For each state the harness validates Day, Week and Month event classes, the Month overflow
dialog, Day detail source dots/badges/copy, every Event detail source, and the Schedule
capsule. It also rejects page/console errors and horizontal document overflow. The final
Playwright result file reports **passed / 0 failed tests**, and **12 fresh captures** were
written under
`reports/test-system-v2/schedule-presentation-authority/captures/`.

The first browser pass exposed two harness-only defects rather than production failures:

1. the test targeted FullCalendar's old private `.fc-more-popover` selector even though
   v7 exposes the overflow surface as an accessible dialog;
2. the Schedule capsule fixture alias did not match Vue's query-suffixed SFC importer, so
   the real `useCalendarView` attempted to resolve `ScheduleService`.

Both were repaired in the isolated harness. The rerun is green.

Visual review confirms the source identity itself is stable: Schedule = primary, Task =
info, Goal = warning, Routine = success across calendar/detail/capsule surfaces. The 360 px
Week and Month screenshots also make an existing density limitation obvious: seven-column
week labels compress to initials and the month overflow dialog is visually dense. That is
not a source-authority drift and does not block SCHED-4101; keep it as a follow-up for the
Schedule dialog/responsive work rather than adding another presentation mapping here.

## Final validation

- Focused Planner/calendar Vitest: **5 files / 22 tests PASS**.
- Previous full Schedule-module pass remains **18 files / 63 tests PASS**; no production
  code changed after that run.
- Direct App-Vue `vue-tsc`: **PASS**.
- Changed production + acceptance-harness ESLint: **PASS**.
- Prettier on the acceptance harness: **PASS**.
- `git diff --check`: **PASS**.
- `pnpm nx run memoflow:governance-check`: **PASS**.
- Isolated Playwright presentation authority: **PASS**, 2 scenarios / 12 captures.
- Browser console/page errors: **0**.
- Horizontal document overflow in captured scenarios: **0**.

## Acceptance state

**SCHED-4101 is accepted / frozen.** Its acceptance criterion is satisfied: the same owner
projection now has one Schedule-owned source presentation authority and renders consistently
through Day, Week, Month, day detail, event detail and capsule surfaces.

SCHED-4201/4202 remain separate follow-up work.
