# PVC-SCHED-4301 — Drag/drop/create collision regression hardening

Date: 2026-10-01. Branch: `product/vnext-sched-4301`. Baseline: `f0ea96eeed05e0cfa7d4e2a6fb637e0da265f738`.

Implementation evidence only. ChatGPT Web retains architecture, final review, acceptance, commit and merge. Changes remain uncommitted; no push was performed.

## Audit and reproduced causes

The production chain remains `PlannerCalendar` → FullCalendar adapter → optimistic adapter → owner router. Task completion remains Task-owned; the router only reschedules Task occurrences.

1. **Exception rollback gap.** The optimistic adapter awaited `router.route` without catching rejection. A thrown owner command escaped before `revert` or the host outcome toast. A move/resize regression reproduced both exceptions.
2. **Accidental callback replay gap.** Replaying the same FullCalendar mutation dispatched the owner three times in the concurrent-plus-settled replay regression. FullCalendar 7.1.0 creates a fresh `revert` closure per gesture and passes that closure with `eventDrop`/`eventResize`; its separate `eventChange` notification is not wired to a MemoFlow write. No evidence shows that ordinary FullCalendar gestures naturally double-dispatch. The hardening addresses accidental replay, without claiming it explains every historical intermittent conflict.
3. **Schedule stale-conflict classification gap.** Schedule application and Prisma/PowerSync CAS paths return `CONFLICT` with numeric `error.context.currentVersion` and `expectedVersion`. The router recognized Task detail codes and top-level version codes, but classified this actual Schedule envelope as generic. A regression reproduced the missing stale classification. Target-date-occupied Task detail codes still take precedence; an unstructured `CONFLICT` remains generic.
4. **Fresh cache prevents canonical refresh.** Schedule range refresh reused its still-fresh account query. The force-read regression observed one service read instead of two and retained version 1. A stale outcome now requests force reads through Schedule, Task occurrences, Goal markers and Routine markers. This refresh is a read after rollback, never a retry of the rejected write. A final failure audit also reproduced forced Goal/Routine read errors clearing both prior markers (1 failed / 2 passed in `/tmp/sched-marker-red.log`). Forced refresh now retains failed marker reads and rejects to the host warning; a successful empty response still clears markers. Schedule/Task store-reported refresh failures also produce the refresh warning.
5. **Repeated selection changes the parent range under an open draft.** The dialog seeds on open, while repeated select/create callbacks replaced/reset `pendingCreateRange` in the parent. The regression observed `null` instead of the original selected range. Selection now keeps one open session; a duplicate day click cannot stack the day inspect over it, and selection closes a preceding day inspect. A new session after close may select a different range.
6. **Existing create protections audited.** Synthetic FullCalendar selection mirrors already have a guarded preview renderer. The dialog already synchronously marks submission busy before awaiting the owner, and 4201 already preserves committed create/update/delete success when refresh fails. These mechanisms remain. Submission now also rejects callbacks when the dialog is closed.

Red-capable commands actually run before fixes:

```bash
NX_SKIP_NX_CACHE=true pnpm nx run app-vue:test -- src/modules/schedule/planner/planner-fullcalendar-mutation.adapter.spec.ts src/modules/schedule/views/ScheduleInspect.characterization.spec.ts
# 2 files: 5 failed, 24 passed (exception, replay and selection regressions).
NX_SKIP_NX_CACHE=true pnpm nx run app-vue:test -- src/modules/schedule/composables/useScheduleCalendar.cache.spec.ts
# 1 file: 1 failed, 2 passed (fresh-cache forced refresh).
NX_SKIP_NX_CACHE=true pnpm nx run app-vue:test -- src/modules/schedule/planner/planner-owner-command.router.spec.ts
# 1 file: 1 failed, 13 passed (structured Schedule-style version conflict).
NX_SKIP_NX_CACHE=true pnpm nx run app-vue:test -- src/modules/schedule/composables/useCalendarView.owner-cache.spec.ts
# 1 file: 1 failed, 2 passed (forced read failure erased prior Goal/Routine markers).
```

Logs: `/tmp/sched-red.log`, `/tmp/sched-cache-red.log`, `/tmp/sched-classification-red.log`. The marker-failure red log is `/tmp/sched-marker-red.log`. These are local session evidence, not committed artifacts. Initial command setup corrected `python` to `python3` and moved Nx cache control out of Vitest's forwarded arguments. Dependencies were installed by the workspace wrapper; Prisma client generation performed no database push.

## Changes and boundary guarantees

- FullCalendar adapter stores one promise per owner router and rollback closure using weak keys, including settled outcomes and invalid events. New rollback closures always dispatch distinct gestures, even with identical owner/range/revision values. No debounce or range-based suppression was added.
- PlannerCalendar reports one outcome per closure, preventing repeated feedback and stale refreshes.
- The optimistic adapter converts thrown owner commands into a typed failed outcome and rolls back once. Applied outcomes never revert. Canonical projection objects are not modified by the adapters.
- Invalid/missing dates, invalid end ordering and Product Time conversion exceptions revert before owner dispatch.
- The owner router recognizes structured CAS context while preserving target-date, explicit stale and generic conflict distinctions. Every write retains the projection's exact `expectedVersion`.
- Existing CreateScheduleDialog, shared presentation, owner inspect, Task Quick Surface and Product Time authorities are retained. Range/session guards change behavior only at repeated callback boundaries; dialog layout is unchanged.
- The isolated browser fixture retains production PlannerCalendar, ScheduleCalendarView, CreateScheduleDialog and Schedule/Task composables. Only owner services and cross-owner aggregation are doubled. Schedule doubles now preserve unspecified update fields, expose read/write evidence, simulate an external version advance, and hold create until the test releases it.

## Exact changed files

Production:

- `packages/app-vue/src/modules/schedule/planner/planner-owner-command.router.ts`
- `packages/app-vue/src/modules/schedule/planner/planner-optimistic-mutation.adapter.ts`
- `packages/app-vue/src/modules/schedule/planner/planner-fullcalendar-mutation.adapter.ts`
- `packages/app-vue/src/modules/schedule/planner/PlannerCalendar.vue`
- `packages/app-vue/src/modules/schedule/views/ScheduleCalendarView.vue`
- `packages/app-vue/src/modules/schedule/components/CreateScheduleDialog.vue`
- `packages/app-vue/src/modules/schedule/composables/useCalendarView.ts`
- `packages/app-vue/src/modules/schedule/composables/useScheduleCalendar.ts`

Unit/characterization:

- `packages/app-vue/src/modules/schedule/planner/planner-owner-command.router.spec.ts`
- `packages/app-vue/src/modules/schedule/planner/planner-fullcalendar-mutation.adapter.spec.ts`
- `packages/app-vue/src/modules/schedule/planner/PlannerCalendar.spec.ts`
- `packages/app-vue/src/modules/schedule/views/ScheduleInspect.characterization.spec.ts`
- `packages/app-vue/src/modules/schedule/components/CreateScheduleDialog.spec.ts`
- `packages/app-vue/src/modules/schedule/composables/useCalendarView.owner-cache.spec.ts`
- `packages/app-vue/src/modules/schedule/composables/useScheduleCalendar.cache.spec.ts`

Isolated browser, inventory and docs:

- `apps/web/e2e/schedule/presentation-authority/collision-regression.spec.ts` (new)
- `apps/web/e2e/schedule/presentation-authority/main.ts`
- `apps/web/e2e/schedule/presentation-authority/plannerCalendar.fixture.ts`
- `tools/test-system-v2/test-inventory.json` (one added browser spec, isolated collector count 2 → 3)
- `docs/plan/archive/2026-10-01-pvc-sched-4301-collision-regression.md` (this file)
- `docs/plan/active/2026-09-29-product-vnext-execution-master-plan.md` (only SCHED-4301 Execution paragraph)

## Final validation

| Check                                                | Result / local log                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------------- |
| Focused planner/create/inspect/cache specs (7 files) | 97/97 PASS; `/tmp/sched-focused.log`                                       |
| Full Schedule app-vue suite (18 files)               | 134/134 PASS; `/tmp/sched-suite.log`                                       |
| `pnpm nx run app-vue:typecheck`                      | PASS; `/tmp/sched-typecheck-final.log` (prior uncached run also passed)    |
| Changed-file ESLint                                  | PASS; `/tmp/sched-eslint.log`                                              |
| Changed-file Prettier                                | PASS; `/tmp/sched-prettier-check.log`                                      |
| `pnpm test:inventory`                                | PASS, 1,292 files; `/tmp/sched-inventory.log`                              |
| `pnpm test:inventory:check`                          | PASS                                                                       |
| `pnpm nx run memoflow:governance-check`              | PASS                                                                       |
| `git diff --check`                                   | PASS                                                                       |
| Isolated Chromium baseline regeneration              | 15/15 PASS, 24 PNG comparisons/captures; `/tmp/sched-browser-baseline.log` |
| Isolated Chromium comparison with updates disabled   | 15/15 PASS, 24 comparisons; `/tmp/sched-browser-compare-final.log`         |

Exact final commands:

```bash
NX_SKIP_NX_CACHE=true pnpm nx run app-vue:test -- src/modules/schedule/planner/planner-owner-command.router.spec.ts src/modules/schedule/planner/planner-fullcalendar-mutation.adapter.spec.ts src/modules/schedule/planner/PlannerCalendar.spec.ts src/modules/schedule/components/CreateScheduleDialog.spec.ts src/modules/schedule/views/ScheduleInspect.characterization.spec.ts src/modules/schedule/composables/useScheduleCalendar.cache.spec.ts src/modules/schedule/composables/useCalendarView.owner-cache.spec.ts
NX_SKIP_NX_CACHE=true pnpm nx run app-vue:test -- src/modules/schedule
pnpm nx run app-vue:typecheck
pnpm exec eslint $(git diff --name-only -- '*.ts' '*.vue') apps/web/e2e/schedule/presentation-authority/collision-regression.spec.ts
pnpm exec prettier --check $(git diff --name-only -- '*.ts' '*.vue' '*.md' '*.json') apps/web/e2e/schedule/presentation-authority/collision-regression.spec.ts docs/plan/archive/2026-10-01-pvc-sched-4301-collision-regression.md
pnpm test:inventory
pnpm test:inventory:check
pnpm nx run memoflow:governance-check
git diff --check
pnpm exec playwright test --config apps/web/playwright.schedule-presentation-authority.config.ts --update-snapshots
pnpm exec playwright test --config apps/web/playwright.schedule-presentation-authority.config.ts --update-snapshots=none
```

No test assertions were removed to make a failure pass. The browser expected-conflict logger assertion was corrected as described below. Nx emitted its historical flaky-task annotation for contracts/time builds, but both typechecks and all required dependency tasks completed successfully.

## Browser evidence and safety limits

The added Chromium cases use actual pointer drag/click and production components:

| Case                                                        | Required evidence                                                                                                                                        |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task drag into occupied target day                          | One Task reschedule, exact revision/snapshot, original visual Y position restored, target-day warning, no extra read/write                               |
| CalendarEntry drag succeeds                                 | One Schedule update with exact range/version, version 2 retained and one card after switching Day/Week                                                   |
| CalendarEntry stale conflict                                | Revert, stale warning, second canonical Schedule read despite fresh cache; a distinct later user drag uses version 2 and commits version 3               |
| CalendarEntry generic conflict                              | Revert and generic feedback; one write and no second canonical read                                                                                      |
| Empty-cell create with repeated synchronous form submission | One dialog, canonical 13:00–13:30 range, one held owner create, disabled busy submit; one committed card plus success/refresh warning when refresh fails |

The two Schedule conflict cases explicitly expect one existing console diagnostic (`This request conflicts with existing data. Please try again.`); additional console/page errors fail acceptance. The first browser run failed only this initially over-strict console assertion (13/15), then the assertion was corrected to characterize the existing production error handler. The initial isolated build also needed the fresh worktree's workspace dependency builds; the required Nx typecheck supplied those builds.

Baseline regeneration and final comparison each passed 15/15 tests. There are 24 baseline PNGs and 24 capture PNGs. New collision comparisons require zero differing pixels; frozen presentation/Task scenarios retain their existing 0.002 ratio tolerance, with snapshot updates disabled for comparison. No unexpected console or page errors were observed.

New captures: `collision-task-revert.png`, `collision-entry-success.png`, `collision-entry-stale.png`, `collision-entry-conflict.png`, `collision-create-dialog.png`, `collision-created-card.png`. Baselines and captures are local artifacts under `reports/test-system-v2/schedule-presentation-authority/{baselines,captures}` (gitignored). Representative success, Task revert, selected-range create dialog and committed create captures were visually inspected: one event/card per owner, restored prior positions, selected time fields and feedback are visible. Existing overlap/title density remains within frozen presentation scope.

Existing en-US/light/1280 and zh-CN/dark/360 presentation scenarios and 1280/600px Task Quick/Prompt and CalendarEntry CRUD scenarios remain in the full harness. Collision pointer acceptance runs at 1280px/en-US/UTC; browser resize, touch, other browser engines and real backend races are not claimed. Unit coverage exercises both move and resize across applied and every rollback outcome, exceptions, replay, independent gestures, unchanged canonical facts, selection and submission races, and canonical forced reads.

**Live backend E2E intentionally not run.** `apps/web/e2e/schedule/planner-task-revert.spec.ts` uses `apps/web/playwright.config.ts` → `createApiServer` → `apps/web/e2e/helpers/start-api-server.ts` → `ensureTestDatabase`. `packages/test-utils/src/setup/database.ts:177` executes Prisma `db push --accept-data-loss`. No destructive bootstrap or guard bypass was performed. Historical production symptom frequency and the exact original trigger remain unverified; the reproduced current gaps and safe isolated regressions are the evidence supplied for review.

## Independent reviewer acceptance

ChatGPT Web independently reviewed the production boundaries after delegated implementation. The review confirmed that owner writes remain CAS-based and are never silently retried; FullCalendar callback replay is deduplicated by rollback-closure identity while a fresh closure remains a distinct gesture; thrown owner commands become a failed planner outcome and revert exactly once; structured Schedule version evidence is classified as stale without changing target-date or generic conflict semantics; forced canonical reads bypass freshness without replacing failed owner-marker reads; and one open create session cannot be retargeted by repeated select/day/create callbacks.

Fresh independent reviewer evidence passed **7 files / 97 tests** with Nx cache disabled. The new collision-only Chromium strict comparison passed **5/5** with snapshot updates disabled, and representative success, stale rollback, Task rollback, selected-range create and committed-card captures were visually inspected. The delegated full isolated harness remains **15/15** for baseline generation and **15/15** for strict comparison, preserving SCHED-4101/4201/4202 presentation, CRUD, Task Quick and Prompt scenarios.

The reviewer also repaired the worktree dependency links after a tool timeout interrupted a `pnpm` dependency status check. `pnpm install --frozen-lockfile` completed successfully and only regenerated/normalized Prisma client artifacts; no database command was executed and no tracked source diff was introduced by that repair.

**SCHED-4301 is accepted / frozen.**
