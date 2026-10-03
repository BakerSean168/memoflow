# PVC-UI-9001 — Full screenshot matrix

Date: 2026-10-02. Writer branch: `product/vnext-ui-9001`. Baseline: `7de6afa0dc1`.

## Inventory and convergence

Goal reference (53161), Task visual grammar (53171), and Schedule presentation authority (53181) already mount production components with deterministic injected services. They share Vite source aliases, product locales, reduced motion, fixed business dates and screenshot assertions. Their snapshots currently live under report paths. UI-9001 will reuse these fixture owners through one manifest and Playwright entry point, with shared browser environment setup. Additional production page fixtures extend that owner instead of duplicating domain fixtures.

Desktop screenshot and shell geometry suites launch Electron and a backend. Their debug/thesis `page.screenshot` outputs are not acceptance baselines. Keep host ownership and expose their existing runner/config in the canonical inventory; do not claim those captures as deterministic UI-9001 evidence.

## Target matrix

Exactly one canonical case per required surface, with deliberate representative variants where text/theme/layout changes matter:

- Collection: Goal, Task, Routine, Notification.
- Entity: Goal, TaskPlan (plus Goal create and TaskPlan create for BASE-003).
- Specialized: Schedule Day/Week/Month; Knowledge wide/narrow (Web projection only); Settings; AI native workflow.
- Overlays: Goal Record/KR/Review; Task Inspect/measurement; Schedule Day/Event; Routine Editor.
- Shell: normal split, narrow (~520 business panel), focus, capsules.

Case IDs use `category.surface.theme.locale.width`, never ordinals. A manifest contract checks required surface coverage, unique IDs/canonical ownership, representative themes/locales and narrow/wide dimensions. Explicit owner-ready selectors and overlay interaction assertions precede screenshots.

## Deterministic fixture strategy

Use stable production page/component fixtures and injected API doubles, never a real DB seed. Shared Playwright setup owns fixed viewport, explicit theme/locale, UTC timezone, fixed clock, reduced motion, font readiness and layout frames. Business panel width is a fixture parameter; test dimensions are 520 and 1280 pixels unless shell geometry needs a wider viewport. No product-wide animation changes. Screenshot assertions disable animations only during capture. Unexpected network calls and page errors fail acceptance rather than being hidden. Reuse Goal/Task/Schedule service doubles. Native AI uses owner edit-session context and current Task/Goal/Knowledge owner surface; no retired AI editor. No Web Knowledge writing or Desktop capability simulation.

## Baseline and review ownership

Canonical PNGs belong under `apps/web/e2e/visual-regression/baselines`, separate from reports, debug and thesis outputs. The writer generates Linux Chromium baselines; ChatGPT Web owns independent review, repair decisions, commit/push and merge. Compare-only is the default Nx target. An explicit update configuration regenerates only this matrix. Review/CI runs the dedicated browser target independently of normal unit tests; use Playwright's existing sharding option when needed. Desktop remains a separately listed host-specific runner.

## Phases and validation

1. Inventory accepted surface owners and write this plan before edits.
2. Extract shared environment, add manifest/completeness contract and canonical config/target.
3. Implement required production surface fixtures and owner overlay assertions.
4. Generate baselines once, then run two consecutive compare-only passes; run existing Goal/Task/Schedule compatibility suites.
5. Check inventory, target governance, formatting, lint, relevant typechecks, full governance and diff whitespace. Record actual evidence and limitations here.
6. Reconcile BASE-003 execution with this ticket only after its Goal create/detail, Task Today/Plan and Schedule baseline evidence passes. Do not mark unverified coverage fulfilled.

## Execution evidence

Writer implementation complete and independently reviewed by ChatGPT Web. One architecture-lint repair was applied to the matrix governance test; no Product runtime behavior was changed. Commit/integration remains the final closeout step.

- Baseline generation: 27/27 PASS. Source baseline directory: `apps/web/e2e/visual-regression/baselines/` (27 PNGs, approximately 1.1 MiB).
- Consecutive compare-only run 1: `pnpm nx run web:e2e:visual-regression` — 27/27 PASS, Playwright 1.2 minutes (Nx 1m 16s).
- Consecutive compare-only run 2: same command, no updates — 27/27 PASS, Playwright 42.2s (Nx 43.6s). Threshold: zero differing pixels.
- Existing compatibility: Goal reference 11/11 PASS (1.1m); Task visual grammar 11/11 PASS (1.6m); Schedule presentation authority 15/15 PASS (1.2m). These are compare-only results. Their ignored report baselines were absent in the fresh worktree, so they were generated into disposable report paths first; no compatibility snapshots/reports enter the source diff.
- Manifest/negative/artifact contracts: 3/3 PASS; test-system-v2 suite passed through the full workspace check. Inventory regenerated: 1,351 files, canonical matrix classified as e2e and collected exactly once. Target check PASS.
- Web and App-Vue typechecks PASS. Dedicated fixture vue-tsc and `web:typecheck:visual-regression` PASS.
- Targeted lint, Prettier and `git diff --check` PASS after the final implementation update. Independent review found one architecture hygiene defect in `visual-matrix.test.mjs`: a static relative import crossed the Nx project boundary. It was repaired to resolve and dynamically import the source manifest at runtime; the 3/3 manifest tests, targeted ESLint, Prettier and diff checks are green after repair.
- Independent compare-only acceptance reran the complete canonical matrix: 27/27 PASS. The exact CI invocation shape was also enumerated with `--shard=1/4` through `4/4`, yielding 7 + 7 + 7 + 6 cases = all 27 with no skipped surface.
- A fresh direct visual-fixture `vue-tsc --noEmit -p e2e/visual-regression/tsconfig.json` PASS was obtained after the repository dependency outputs were present. A no-cache Nx wrapper attempt was blocked earlier by pre-existing flaky dependency build/output ordering (`time:build` / declaration artifacts), not by the UI-9001 fixture sources.
- Full `pnpm governance:check` now passes after closeout repaired two stale documentation inventory paths: GOV-7902 had already moved from `active/` to `archive/`, and UI-9001 itself moved to `archive/` during acceptance. Both repairs are path-only governance maintenance; ADR-113 remains Proposed and `destructiveAllowed=false`.
- CI adds compare-only matrix execution to the existing four Web Flow Shard jobs via Playwright's native `--shard`; no custom shard runner and no browser dependency in ordinary unit targets. CI itself was not executed end-to-end in GitHub during this worktree review.
- Desktop remains exposed through `manifest.mjs#desktopRunner`; its Electron/backend/debug/thesis lane was not launched or counted as matrix acceptance.

### Governance closeout

ChatGPT Web repaired the stale GOV-7902 active-to-archive references in the engineering reference-policy test and retirement inventory, then updated the same inventory when UI-9001 itself moved from `active/` to `archive/`. The targeted inventory audit and 20 focused governance tests pass, followed by a full uncached-facing `pnpm governance:check` success. No Product runtime, retirement decision, or destructive migration changed; ADR-113 remains Proposed and destructive Product Governance retirement remains disallowed.

### Determinism and fixture details

Shared bootstrap owns document theme/locale and Product Time; Goal keeps its existing Los Angeles cross-day acceptance seam while other fixtures use UTC. Browser business time is fixed to 2026-10-01 09:30 UTC. Panels are 520/1280; normal shell split uses a 720 business column, narrow split asserts 520, and focus/capsules assert actual shell state. Playwright serves built static fixture bytes through route fulfillment to avoid host `ERR_NETWORK_CHANGED` during local asset loading, blocks external requests, waits for fonts and two layout frames, and disables animations only during screenshot assertions. No product UI effects were disabled.

Routine snapshots and native AI run fixtures pass production runtime schemas. Knowledge uses its selected read-only GitHub projection at both widths. AI restores a durable task.create workflow pointer, checks the pending owner as NOT_FOUND, and projects through the current shell-native Task session into the real TaskPlanDialog; its draft title is asserted. Task Inspect opens the real TaskOccurrenceInspectDialog; measurement opens its real coordinator-owned dialog from the existing Schedule fixture. Other overlays assert their owner-ready selectors.

### Representative inventory

15 light / 12 dark; 15 en-US / 12 zh-CN; 17 wide / 10 narrow. These are deliberate cases rather than a cartesian expansion. IDs retain dot-delimited semantic names; Playwright sanitizes dots to hyphens in PNG filenames.

| Case ID                                       | Fixture owner | Ready surface                           |
| --------------------------------------------- | ------------- | --------------------------------------- |
| `collection.goal.light.en.wide`               | goal          | `goal-list`                             |
| `collection.task.dark.zh.narrow`              | task          | `task-page-toolbar`                     |
| `collection.routine.light.en.wide`            | pages         | `routine-card-routine-1`                |
| `collection.notification.dark.zh.narrow`      | pages         | `notification-list`                     |
| `entity.goal.dark.zh.narrow`                  | goal          | `goal-detail-view`                      |
| `entity.task-plan.light.en.wide`              | task          | `task-detail-metadata`                  |
| `specialized.schedule-day.light.en.wide`      | schedule      | `schedule-presentation-acceptance`      |
| `specialized.schedule-week.dark.zh.wide`      | schedule      | `schedule-presentation-acceptance`      |
| `specialized.schedule-month.light.en.narrow`  | schedule      | `schedule-presentation-acceptance`      |
| `specialized.knowledge-wide.light.en.wide`    | pages         | `knowledge-projection-preview`          |
| `specialized.knowledge-narrow.dark.zh.narrow` | pages         | `knowledge-projection-preview`          |
| `specialized.settings.light.en.wide`          | pages         | `appearance-settings-card`              |
| `specialized.ai-native.light.en.wide`         | pages         | `task-plan-dialog`                      |
| `overlay.goal-record.light.en.narrow`         | goal          | `goal-detail-view`                      |
| `overlay.goal-kr.dark.zh.wide`                | goal          | `goal-detail-view`                      |
| `overlay.goal-review.light.en.wide`           | goal          | `goal-review-create-dialog`             |
| `overlay.task-inspect.light.en.wide`          | task          | `task-occurrence-body`                  |
| `overlay.task-measurement.dark.zh.narrow`     | schedule      | `schedule-event-task-task-occurrence-1` |
| `overlay.schedule-day.dark.zh.wide`           | schedule      | `planner-day-dialog`                    |
| `overlay.schedule-event.light.en.narrow`      | schedule      | `planner-event-sheet`                   |
| `overlay.routine-editor.dark.zh.narrow`       | pages         | `routine-card-routine-1`                |
| `shell.split.light.en.wide`                   | pages         | `app-shell`                             |
| `shell.narrow.dark.zh.wide`                   | pages         | `app-shell`                             |
| `shell.focus.light.en.wide`                   | pages         | `app-shell`                             |
| `shell.capsules.dark.zh.wide`                 | pages         | `app-shell`                             |
| `foundation.goal-create.light.en.narrow`      | goal          | `goal-dialog`                           |
| `foundation.task-create.dark.zh.wide`         | task          | `task-plan-dialog`                      |

### Exact changed files

Modified:

- `.github/workflows/ci.yml`
- `apps/web/project.json`
- `apps/web/e2e/goal/reference/main.ts`
- `apps/web/e2e/task/visual-grammar/main.ts`
- `apps/web/e2e/schedule/presentation-authority/main.ts`
- `tools/test-system-v2/test-inventory.json`
- `tools/governance/product-governance-retirement-inventory.json` (one documentation classification only)
- `docs/plan/active/2026-09-29-product-vnext-execution-master-plan.md` (BASE-003 and UI-9001 evidence)

Added:

- This implementation plan.
- `apps/web/playwright.visual-regression.config.ts`
- `apps/web/e2e/visual-regression/README.md`
- `apps/web/e2e/visual-regression/app-environment.ts`
- `apps/web/e2e/visual-regression/environment.ts`
- `apps/web/e2e/visual-regression/index.html`
- `apps/web/e2e/visual-regression/main.ts`
- `apps/web/e2e/visual-regression/manifest.mjs`
- `apps/web/e2e/visual-regression/manifest.d.mts`
- `apps/web/e2e/visual-regression/matrix.spec.ts`
- `apps/web/e2e/visual-regression/pages.ts`
- `apps/web/e2e/visual-regression/tsconfig.json`
- `apps/web/e2e/visual-regression/vite.config.ts`
- `tools/test-system-v2/__tests__/visual-matrix.test.mjs`
- Exactly the 27 PNGs named by the case IDs above under `apps/web/e2e/visual-regression/baselines/`.

Independent review found no remaining implementation P0/P1 after the architecture-lint repair. The remaining full-governance blocker is the pre-existing GOV-7902 archived-path drift described above. All source edits stayed in the authorized worktree on `product/vnext-ui-9001`.
