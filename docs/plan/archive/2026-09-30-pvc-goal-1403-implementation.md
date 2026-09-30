---
tags:
  - plan
  - goal
status: implemented
created: 2026-09-30
description: PVC-GOAL-1403 delegated implementation and verification
---

# PVC-GOAL-1403 implementation report

Implementation complete; ChatGPT Web owns architecture, review and acceptance. The existing partial diff was retained and completed. No commit or push was performed.

## Plan and guardrails

1. Keep all Goal/KR/Review deep links on the existing GoalDetail owner. Route names and params own overlay identity; same-owner transitions must not refetch the workspace.
2. Use the canonical Goal service for preview, creation and complete review lookup. Omit legacy windowDays so GOAL-1401 resolves since-last-review / first-review Product Time defaults. Reuse GoalReviewSnapshot without arithmetic or signal duplication.
3. Compare the create draft to its opening baseline; publish dirty/busy through usePanelSurfaceStatus. Guard both route update and leave. Reuse the existing shell leave protocol, with navigation-scoped approval to prevent duplicate prompts. Failed or cancelled transitions retain draft and status; save clears dirty and stays busy through workspace refresh/navigation.
4. Migrate behavioral and product-boundary tests, then remove standalone Review views. Cover missing/legacy reviews, stale reads, query/hash, history, owner changes, failures/retry, busy and shell navigation.
5. Run focused tests, app-vue typecheck, changed-file ESLint, diff check, applicable inventory/governance checks sequentially. Attempt isolated Chromium at wide/narrow widths and record evidence/limits.

No server/domain/persistence/AI/Task behavior changes. Existing typed client contracts remain the boundary. Complete review lookup must not mistake preview or a newly saved review for complete history. Requests must ignore stale owner/route results. Review mutation uses canonical expectedVersion and receipt; no automatic retries that could duplicate writes.

## Result

The three Goal/Review URLs and the existing KR URL share the same lazy GoalDetailView component. Route params own the workspace and route names/params own the overlays. Normal create/latest affordances, close, direct refresh and browser history stay on that owner and preserve unrelated query/hash. Same-owner overlay changes do not reload the workspace.

GoalReviewCreateDialog and GoalReviewInspectDialog live under Goal components/dialogs and both reuse GoalReviewSnapshot. Preview and creation omit legacy windowDays, so GOAL-1401 resolves the default since-last-review window, including the first-review seven Product Time day fallback. Both locales explain the default. Creation uses the canonical service, expectedVersion and mutation receipt; save refreshes the workspace and opens readonly detail. Readonly inspection preserves saved facts/signals, including legacy snapshots with empty or absent signals, without a preview query or historical re-analysis.

Each create opening has an empty baseline. Exact field comparison makes a reverted draft clean; synchronous dirty publication prevents dismiss actions from outrunning status updates. Saving locks the inputs and remains busy through owner refresh. Both onBeforeRouteUpdate and onBeforeRouteLeave use the existing shell leave protocol. Its approval now belongs to the navigation, not the draft: shell preflight, component guards and the settings guard share one approval; rejected/finished navigation releases the shell approval. Tab/module store changes happen after successful navigation. No new global guard was added. Failed saves retain all fields and the route, and explicit retry works. Successful save clears dirty before transition without confirmation.

Review lookup uses recentReviews only for hits, otherwise calls canonical getGoalReviews. A newly saved review is never treated as complete history. Late detail/context responses cannot replace a newer route/owner. Missing Goal/Review and failed reads show deterministic, closable feedback.

The standalone Review views were deleted after parity tests and reference search. Product shell/date/AI-boundary expectations now point to the dialogs. The only server-directory change is the signal analyzer test's two UI source paths; no server/domain/persistence/AI/Task production behavior changed. The generated inventory also incorporates nine existing GOAL-1401/1402 specs missing from the prior inventory.

## Verification

Verification was run sequentially. Logs are in `/tmp/goal1403-*.log`.

| Gate                                                                                      | Evidence                                                                                                                         |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Focused App-Vue Goal, KR and shell regressions                                            | PASS — 11 files / 223 tests; final Review/deep-link rerun PASS — 2 files / 45 tests, adding the production route-owner assertion |
| App-Vue typecheck                                                                         | PASS, including dependency targets                                                                                               |
| Changed-file ESLint                                                                       | PASS — zero errors/warnings after unused test-fixture cleanup                                                                    |
| Diff whitespace                                                                           | `git diff --check` PASS                                                                                                          |
| Goal review analyzer, context builder and window resolver                                 | PASS — 3 files / 31 tests                                                                                                        |
| Product surface, form language, ProductDialogShell, date boundary and final signals tests | PASS except the unrelated pre-existing Task assertion below; Goal-specific boundary separately PASS                              |
| Generated test inventory                                                                  | Regenerated successfully — 1284 files; governance inventory check PASS                                                           |
| `pnpm nx run memoflow:governance-check`                                                   | PASS with dependencies                                                                                                           |
| Isolated Chromium, production CSS                                                         | PASS — 1000px/en-US and 360px/zh-CN                                                                                              |

Focused command:

```sh
pnpm nx run app-vue:test -- src/modules/goal/views/GoalDeepLinks.characterization.spec.ts src/modules/goal/views/GoalReviewSignals.spec.ts src/modules/goal/views/GoalDetailView.spec.ts src/modules/goal/components/dialogs/GoalKeyResultInspectDialog.spec.ts src/modules/goal/composables/useGoalWorkspace.spec.ts src/modules/goal/components/GoalKeyResultTrajectoryPlot.spec.ts src/modules/goal/components/dialogs/GoalRecordDialog.spec.ts src/modules/goal/components/cards/GoalRecordCard.spec.ts src/modules/goal/utils/key-result-calculation-presentation.spec.ts src/layouts/shell/surface-leave-protocol.spec.ts src/layouts/shell/useShellRouterSync.spec.ts
```

Behavioral coverage includes all three draft fields reverting, close/Escape, browser back/forward cancellation, Review/KR/Goal owner switching, Goal creation overlay and different-component exits, query/hash-only updates, real shell Home/module/tab/settings actions, approval cleanup after another guard aborts, busy through delayed save and delayed refresh, rejected/thrown save retry, successful save without confirmation, full history after save, late reads, missing entities, readonly controls and en-US/zh-CN legacy signals.

Chromium used the real GoalDetailView, review/KR dialogs, shell routing/status and production CSS with isolated read/command doubles and unrelated component stubs. It checked initial focus, focus trapping, horizontal bounds, normal create, dirty cancel/Escape/outside click, busy close/navigation, failure/retry, successful readonly transition, history/refresh, query/hash, owner fetch counts and KR Inspect. There were no page errors. Create/detail screenshots at both widths are `/tmp/goal1403-create-{1000,360}.png` and `/tmp/goal1403-detail-{1000,360}.png`; screenshots were inspected. The temporary fixture was removed and its server stopped.

## Limitations for review

The full `core-vnext-presentation-boundary.spec.ts` run has one pre-existing Task failure: “uses Missed facts and never resurrects persisted Expired in Task capsule” expects the literal `'Missed'` in TaskCapsulePreview.vue. That unchanged component now delegates to TaskQuickSurface.vue, which contains the status handling. Task was left untouched per scope. The Goal date-boundary test passes separately. Full surface-run log: `/tmp/goal1403-surfaces.log`; targeted Goal log: `/tmp/goal1403-goal-boundary.log`.

Browser evidence is isolated component/router verification, not an authenticated live-backend journey. Product acceptance remains with ChatGPT Web. No contract defect required expanding the implementation scope.
