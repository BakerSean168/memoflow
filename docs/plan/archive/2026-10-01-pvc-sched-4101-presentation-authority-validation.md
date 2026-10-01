# PVC-SCHED-4101 — Projection presentation authority validation

Date: 2026-10-01
Branch/worktree: `product/vnext-sched-4101` / `_worktrees/memoflow-sched-4101`
Reviewed HEAD: `9c5a95140ed4`; parent/baseline: `98b5e9e9118`

## Scope and authority audit

This delegated review audits the committed SCHED-4101 diff against its parent and
repairs only presentation/acceptance defects. SCHED-4201/4202 and the separate
SCHED-4201 worktree are untouched. Repairs are uncommitted; architecture, final
review, acceptance, commit and integration onto the newer batch belong to ChatGPT Web.

`planner-presentation.ts` is the single Schedule-owned source presentation authority:

- source label i18n key and FullCalendar source class;
- compact dot and badge classes;
- calendar source color and foreground tokens;
- a separate event-tone helper driven by metadata and derived conflict state.

Consumers are `PlannerCalendar.vue` for Day/Week/Month (including Month overflow),
`DayDetailSheet.vue`, `EventDetailSheet.vue`, the `useCalendarView.ts` compatibility
label helper, and `ScheduleCapsulePreview.vue`. The capsule currently displays
source copy, rather than source dots/badges. Production source-label search finds
only the canonical map outside locales; no local dot/badge or source-to-color
mapping remains. Test expectations deliberately spell out the required identities.

CalendarEntry/Schedule = primary, Task = info, Goal = warning, Routine = success.
Conflict overrides the rendered event tone with warning without rewriting the owner
source class, source colors, dot, badge or label. Existing metadata tones remain
presentation overrides, separate from owner identity. CSS still implements generic
layout, occupancy and tone rendering; it no longer maps owner source to color.

No owner commands, capability decisions, mutations or conflict derivation moved into
the utility. Its unchanged Product Time helpers read `productTimeRevision`, format
timed instants through the session facade, keep all-day Ymd values calendar-native,
and derive timed date keys with `calendar.toYmd`. No ambient `Date` calls were
introduced there. Existing timezone, DST and all-day tests pass.

## Findings and smallest repairs

1. **Duplicated calendar identity:** the committed utility owned dot/badge identity,
   but PlannerCalendar CSS independently mapped all four source classes to colors.
   Calendar color/foreground tokens now live in the same typed source map and are
   applied as source CSS variables when FullCalendar mounts each event.
2. **Month overflow identity loss:** FullCalendar portals its overflow dialog outside
   `.planner-calendar`, so ancestor-scoped source/tone rules did not apply there.
   Browser computed-color assertions reproduced an empty event color in both
   scenarios. Schedule-specific event selectors now also reach portalled events.
   Calendar structure/layout selectors remain scoped to the calendar ancestor.
3. **Capture-only browser evidence:** the original harness had no screenshot comparison.
   It now uses `toHaveScreenshot` with an explicit baseline directory, full-page
   captures and a 0.002 maximum differing-pixel ratio. It also asserts actual source
   color tokens for every owner in Day, Week and Month overflow. The selected locale
   is now passed to PlannerCalendar, rather than leaving calendar headers in English.
4. **Stale test inventory:** regeneration adds only the 4101 Playwright collector/spec
   and changes E2E inventory count from 60 to 61. No unrelated registrations changed.

Existing tests were strengthened for calendar color/foreground and badge identity,
source identity during conflict, and restoration of normal tone after conflict removal.
No new owner action or dialog design was added.

## Fresh final validation

- `NX_DAEMON=false pnpm nx run app-vue:test --skip-nx-cache -- src/modules/schedule`:
  **18 files / 63 tests PASS**, after the final production repair.
- Focused presentation / PlannerCalendar / capsule helpers / useCalendarView /
  ScheduleInspect rerun: **5 files / 23 tests PASS** (subset of the full run).
- `NX_DAEMON=false pnpm nx run app-vue:typecheck --skip-nx-cache`: **PASS**, including
  all 28 dependency tasks. Nx additionally printed historical flaky-task notices for
  `time:build` and `contracts:build`; the fresh run completed successfully.
- Changed-file ESLint across the original commit plus repairs: **PASS**.
- Changed-file Prettier check: **PASS**.
- `git diff --check` and committed diff whitespace check: **PASS**.
- `pnpm test:inventory:check`: **PASS**, **1,288 files**, after regeneration.
- `pnpm nx run memoflow:governance-check`: **PASS**.

CodeGraph and nx-mcp tools are unavailable in this worker session; repository searches
and the existing Nx targets supplied the audit and validation evidence.

## Isolated browser evidence and limits

Chromium uses production components, CSS and locales with read-only owner-command and
capsule-data doubles. It starts no backend or database and is **not live-backend E2E**.

Final baseline regeneration: **2/2 tests PASS**. Subsequent strict comparison
(`--update-snapshots=none`): **2/2 tests PASS**, with **12 screenshot comparisons**,
**12 fresh captures**, **0 page/console errors** and **0 horizontal document overflow**.
The scenarios are `en-US / light / 1280px` and `zh-CN / dark / 360px`.

Each scenario asserts all four owners in Day, Week and Month overflow, source dot/badge
and translated copy in day detail and every event detail, plus all four capsule labels.
Event detail captures show the final Routine selection; other sources are asserted
but not individually captured. Conflict transitions are covered by Vitest; browser
fixtures contain no conflicts. The matrix uses UTC and is not exhaustive across
viewport/locale/theme/timezone combinations.

Artifacts are local and ignored under
`reports/test-system-v2/schedule-presentation-authority/{baselines,captures}/`.
Use `pnpm exec playwright test --config playwright.schedule-presentation-authority.config.ts
--update-snapshots` from `apps/web` to regenerate them; rerun with
`--update-snapshots=none` for comparison.

The narrow seven-column Week/Month and overflow dialog remain visually dense,
including overflow text overlap. That existing responsive/dialog limitation is left
for the separate Schedule work. This report establishes source identity and focused
regression evidence, not final product acceptance.

## Changed files in this repair

- `packages/app-vue/src/modules/schedule/planner/planner-presentation.ts`
- `packages/app-vue/src/modules/schedule/planner/planner-presentation.spec.ts`
- `packages/app-vue/src/modules/schedule/planner/PlannerCalendar.vue`
- `packages/app-vue/src/modules/schedule/planner/PlannerCalendar.spec.ts`
- `apps/web/e2e/schedule/presentation-authority/main.ts`
- `apps/web/e2e/schedule/presentation-authority/schedule-presentation-authority.spec.ts`
- `apps/web/playwright.schedule-presentation-authority.config.ts`
- `tools/test-system-v2/test-inventory.json`
- `docs/plan/archive/2026-10-01-pvc-sched-4101-presentation-authority-validation.md`
- `docs/plan/active/2026-09-29-product-vnext-execution-master-plan.md` (4101 Execution paragraph only)

## Final acceptance

ChatGPT Web independently reviewed the repair diff, confirmed source identity remains separate from conflict/status tone, verified the global `planner-*` selectors are confined to Schedule-owned class names needed by FullCalendar overflow portals, and visually inspected representative wide/light and narrow/dark Day/Month/Event Detail captures. The known narrow Month/Week overflow density remains a separate responsive/dialog follow-up and does not block SCHED-4101.

SCHED-4101 is accepted / frozen. Evidence was captured before the final integration commit and push; batch integration remains a delivery step rather than an acceptance gap.
