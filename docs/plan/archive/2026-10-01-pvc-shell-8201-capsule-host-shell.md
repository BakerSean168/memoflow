# PVC-SHELL-8201 — Capsule host shell convergence

Date: 2026-10-01

## Status

Accepted / frozen on top of canonical Product vNext batch `f253bfa0f0e`.

Implementation was delegated to Codex Team `gpt-6.1-sol` at medium reasoning effort in the isolated `product/vnext-shell-8201` worktree. ChatGPT Web independently reviewed the diff and reran acceptance gates before batch convergence.

## Accepted architecture

The six capsule owner families now share presentation chrome through exactly four shared primitives:

- `CapsulePreviewShell`
- `CapsulePreviewHeader`
- `CapsulePreviewFooter`
- `CapsulePreviewState`

Owner business rows, owner commands, data access, navigation, selection and mutation semantics remain local to their owning surfaces.

The six owner families are:

- Task — through `TaskQuickSurface`
- Goal — `GoalCapsulePreview`
- Schedule — `ScheduleCapsulePreview`
- Routine — `RoutineCapsulePreview`
- Notification — `NotificationCapsulePreview`
- Knowledge/Note — `NoteCapsulePreview`

No universal capsule business-row abstraction was introduced.

## Production change

The canonical tree already had five of the six owner families on the shared capsule grammar. The remaining production gap was Schedule.

`ScheduleCapsulePreview.vue` now uses the shared shell/header/footer/state primitives for:

- bounded capsule host geometry;
- title/subtitle/action header chrome;
- loading state;
- empty state;
- footer chrome.

The Schedule owner script is unchanged except for importing the shared presentation primitives. The primary/current/upcoming event rendering body remains byte-identical to the pre-ticket baseline.

## Preserved owner behavior

Schedule behavior remains owner-canonical:

- `ensureTodayLoaded()` still completes before taking the capsule snapshot;
- current/upcoming/all-day presentation is unchanged;
- Planner source labels remain Schedule-owned;
- Product Time still formats event times and product-calendar day boundaries;
- upcoming events remain later-today timed events only;
- ordering remains ascending by start time;
- display limit remains four with remaining-count copy;
- primary/upcoming row selection emits the original owner event;
- footer `view-all` behavior is unchanged.

Task/Goal/Routine/Notification/Knowledge business rows and commands remain owner-specific.

AppShell focus, pinned/hover dismissal, stale-window query reuse and repeated-request behavior were not modified.

## Contract coverage

`CapsulePreviewShell.spec.ts` now locks two architecture properties:

1. all six owner families consume the four shared capsule chrome primitives;
2. the shared capsule primitives remain chrome/layout/state-only and do not import owner contracts/modules, emit business actions, iterate business rows or render business buttons.

A dedicated `ScheduleCapsulePreview.spec.ts` locks:

- loading → snapshot sequencing;
- loading/empty shared-state identity;
- shared header/footer/shell adoption;
- current/upcoming/all-day primary rendering;
- source labels;
- owner selection;
- view-all;
- Product Time formatting;
- Product Time date-boundary filtering;
- upcoming ordering, filtering, display limit and remaining count.

## Validation

Delegated implementation validation:

- focused capsule/shell suite: **12 files / 59 tests passed**
- additional Schedule cache/snapshot suites: passed
- fresh direct App-Vue typecheck: passed
- targeted ESLint: passed
- targeted Prettier: passed
- test inventory: **1336 files**
- `git diff --check`: passed

Independent ChatGPT acceptance:

- changed-contract suite: **2 files / 12 tests passed**
- `app-vue:typecheck --skip-nx-cache`: passed, including 28 dependency tasks
- test inventory: **1336 files**
  - unit 1155
  - integration 34
  - smoke 3
  - boundary-ipc 8
  - boundary-main 8
  - e2e 63
  - perf 2
  - governance 63
- `memoflow:governance-check --skip-nx-cache`: passed
- targeted ESLint / Prettier: passed
- `git diff --check`: passed

## Baseline boundary note

An extra exploratory run of `core-vnext-presentation-boundary.spec.ts` exposed a pre-existing assertion that searches for the literal `'Missed'` inside `TaskCapsulePreview.vue`.

That assertion is stale because Task capsule rendering is already delegated to `TaskQuickSurface`. The boundary spec, `TaskCapsulePreview.vue`, and `TaskQuickSurface.vue` were byte-identical to baseline `f253bfa0f0e`; therefore the failure is not attributed to SHELL-8201 and was not opportunistically repaired in this ticket.

## Files changed

Production:

- `packages/app-vue/src/layouts/shell/previews/ScheduleCapsulePreview.vue`

Contract/regression tests:

- `packages/app-vue/src/layouts/shell/previews/ScheduleCapsulePreview.spec.ts`
- `packages/app-vue/src/shared/components/CapsulePreviewShell.spec.ts`

Generated test metadata:

- `tools/test-system-v2/test-inventory.json`

Acceptance metadata:

- `docs/plan/active/2026-09-29-product-vnext-execution-master-plan.md`
- `docs/plan/active/2026-09-29-product-vnext-convergence.md`
- this report

## Result

PVC-SHELL-8201 is closed. Phase 6 shared surface grammar is now frozen through capsule host convergence. The next planned phase begins with PVC-AI-8001 — Owner Native Edit Session contract.
