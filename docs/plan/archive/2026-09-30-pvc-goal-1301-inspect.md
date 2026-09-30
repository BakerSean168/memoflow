---
tags:
  - plan
  - goal
status: implemented
created: 2026-09-30
description: PVC-GOAL-1301 KR Inspect implementation and validation evidence
---

# PVC-GOAL-1301 implementation report

Implemented and validated locally. ChatGPT Web owns final review/acceptance, which remains pending. No commit or push was performed.

## Result and route compatibility

Goal owns `GoalKeyResultInspectDialog`, composed in GoalDetailView. Both Goal Detail and the legacy `key-result-detail` URL use the same lazy component reference. The view owns route params, normalizing `id`/`goalId`; unused Goal/KR route props are disabled. Review routes retain their original props and behavior. Inspect presence and identity derive only from `keyResultId`, so refresh loads the workspace then opens the requested KR, and browser back/forward follows the URL without a second aggregate fetch or local dialog-state watcher. Normal KR detail overflow uses this same surface. Closing by footer button, Escape or dismissal navigates to `goal-detail` and preserves query/hash. The workspace stays mounted when opening/closing Inspect for the same Goal. Late workspace responses for another owner and late dialog page reads for another KR are ignored.

The dialog uses ProductDialogShell with a named title/description, explicit close button as initial focus, modal keyboard/focus behavior, a bounded scroll body and fixed footer. GoalKeyResultTrajectoryPlot remains readonly and gains an Inspect size (160px chart versus 48px compact chart); no chart or arithmetic engine was duplicated. Inspect includes Initial/Current/Target with KR unit, Goal start and effective KR/Goal target, weight, completion/percentage and description. All five calculation labels and explanations use the GOAL-1104 presentation authority in both locales. Explanation distinguishes the starting tracked value from the visible initial progress baseline.

Current emits to Goal Detail's existing quick check-in adapter and GoalRecordDialog. A successful record save refreshes the workspace and Inspect pages. Inspect imports no metadata command or Task mutation command and provides no metadata edit controls. GOAL-1103 edits remain on the workspace.

## History, provenance and Task context

History uses `GoalService.getGoalRecordsByKeyResult(goalId, keyResultId, { limit: 20, offset })`, converting public client entities via `toDTO()`. It never uses bounded workspace recentProgress. Each response's canonical recordedAt/id descending order is retained across pages. Loaded/total copy and Load more show the actual bounded state; failures offer Retry and do not claim completeness. Tests load 25 records beyond the workspace preview and cross the first-page boundary, including tied timestamps and all three authorship labels.

Existing GoalRecordCard supplies the GOAL-1203 Manual / TaskAutomatic / TaskUserMeasurement labels and recorded time/comment. Inspect adds value-after/unit and readable Manual, Task occurrence or Task plan source context. Raw source IDs never appear in normal UI. The public record projection supplies source kind/identity, but no source Task title or occurrence-to-plan resolver; the dialog explicitly says the title is unavailable rather than inventing a name. Missing source context on a Task-authored record is labeled unavailable, not Manual.

Linked Tasks use the Goal workspace KR-scoped Task page service, with independent 20-item paging, retry/unavailable states and read/navigation-only buttons. Goal Detail's existing Task detail and filtered Task-list navigation own destinations. No Task aggregate or mutation is imported into Inspect.

## Intentional BASE-002 behavior change and retirement

The historical missing Goal/KR deep-link blank bodies are deliberately replaced. Missing/unavailable Goal shows an explicit alert in Goal Detail and a close-to-owner action for the legacy URL. Missing KR keeps the loaded workspace and opens Inspect with an explicit not-found message and close action. Both retain the requested URL until close. Updated characterization tests cover these states; Review behavior stays unchanged. The BASE-002 report records this intentional successor behavior while preserving its original baseline evidence.

Reference search found no governance manifest requiring KeyResultDetailView. Its Vue file and spec are deleted; the legacy URL is supported directly by Goal Detail. Localization parity moved to Inspect tests and the product-surface regression now targets the shared dialog shell. Generated test inventory is synchronized, including previously implemented Goal characterization/direct-control/trajectory specs that were absent from the prior inventory.

## Green validation evidence

All gates were green before updating the master-plan execution marker and writing this report.

| Gate                                                   | Result                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| App-Vue focused and regression specs                   | PASS — 10 files / 175 tests                                                    |
| Final strengthened Inspect stale-read test rerun       | PASS — 1 file / 18 tests (already part of the 175-test suite)                  |
| Goal record provenance/preview/order/query regressions | PASS — 4 files / 33 tests                                                      |
| `pnpm nx run app-vue:typecheck`                        | PASS with dependency targets                                                   |
| Changed-file `pnpm exec eslint`                        | PASS — 13 Vue/TypeScript files, zero errors/warnings; locale cleanup rechecked |
| `git diff --check`                                     | PASS                                                                           |
| `pnpm nx run memoflow:governance-check`                | PASS with dependencies                                                         |
| `pnpm test:inventory`                                  | PASS — 1275 files                                                              |
| Isolated production-CSS Chromium                       | PASS — 1000px and 360px                                                        |

App-Vue command:

```sh
pnpm nx run app-vue:test -- src/modules/goal/views/GoalDetailView.spec.ts src/modules/goal/views/GoalDeepLinks.characterization.spec.ts src/modules/goal/components/dialogs/GoalKeyResultInspectDialog.spec.ts src/modules/goal/composables/useGoalWorkspace.spec.ts src/modules/goal/components/GoalKeyResultTrajectoryPlot.spec.ts src/modules/goal/components/dialogs/GoalRecordDialog.spec.ts src/modules/goal/components/cards/GoalRecordCard.spec.ts src/modules/goal/utils/key-result-calculation-presentation.spec.ts src/shared/components/ProductDialogShell.spec.ts src/shared/components/product-surface-polish.surface.spec.ts
```

Owner command:

```sh
pnpm nx run goal:test -- src/infrastructure-client/adapters/goal-record-provenance.spec.ts src/infrastructure-client/adapters/goal-record-preview-context.spec.ts src/server/infrastructure/adapters/goal-record-ordering.spec.ts src/server/application/use-cases/queries/__tests__/list-goal-records.test.ts
```

Mounted tests exercise the production Goal workspace/dialog and memory router with read-port doubles. They cover normal action, repeated fresh direct load, close/query/hash, back/forward without duplicate workspace reads, explicit missing states, Current delegation/save refresh, metadata/localization, history and Task paging/retry, unavailable/missing provenance, stale responses, readonly command boundaries and accessibility. Existing GoalRecordDialog/Card and trajectory regressions remain green.

The temporary Chromium fixture used the production Inspect dialog, production CSS and real browser router at both widths. It checked direct deep link, initial focus, accessible dialog role, horizontal bounds, 25-record load-more, hidden source IDs, Escape close, back/forward, normal fixture open, Tab focus trapping and Enter close, with zero page errors. Screenshots `/tmp/goal1301-1000.png` and `/tmp/goal1301-360.png` were visually inspected. Fixture sources were removed and its server stopped. This is isolated component/router evidence, not authenticated E2E or a live backend journey.

## Remaining caveats

Source Task names are unavailable in the existing record projection; linked Task names are shown through the separate Task context read model. Pagination uses the existing live offset API, with no snapshot/cursor guarantee if another writer changes history between pages. No persistence/schema changes, Review window work, Task business changes or AI changes were introduced. Final product acceptance belongs to ChatGPT Web.

## Exact changed files

- `docs/plan/active/2026-09-29-product-vnext-execution-master-plan.md`
- `docs/plan/archive/2026-09-30-pvc-base-002-interaction-characterization.md`
- `packages/app-vue/src/locales/en-US/goal.ts`
- `packages/app-vue/src/locales/zh-CN/goal.ts`
- `packages/app-vue/src/modules/goal/components/GoalKeyResultTrajectoryPlot.vue`
- `packages/app-vue/src/modules/goal/composables/useGoalWorkspace.ts`
- `packages/app-vue/src/modules/goal/router/index.ts`
- `packages/app-vue/src/modules/goal/utils/key-result-calculation-presentation.ts`
- `packages/app-vue/src/modules/goal/views/GoalDeepLinks.characterization.spec.ts`
- `packages/app-vue/src/modules/goal/views/GoalDetailView.spec.ts`
- `packages/app-vue/src/modules/goal/views/GoalDetailView.vue`
- `packages/app-vue/src/modules/goal/views/KeyResultDetailView.spec.ts` (deleted)
- `packages/app-vue/src/modules/goal/views/KeyResultDetailView.vue` (deleted)
- `packages/app-vue/src/shared/components/product-surface-polish.surface.spec.ts`
- `tools/test-system-v2/test-inventory.json`
- `docs/plan/archive/2026-09-30-pvc-goal-1301-inspect.md`
- `packages/app-vue/src/modules/goal/components/dialogs/GoalKeyResultInspectDialog.spec.ts`
- `packages/app-vue/src/modules/goal/components/dialogs/GoalKeyResultInspectDialog.vue`
- `packages/app-vue/src/modules/goal/composables/useGoalWorkspace.spec.ts`
