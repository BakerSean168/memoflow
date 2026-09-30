---
tags:
  - plan
  - goal
status: completed
created: 2026-09-30
description: PVC-GOAL-1601 reference surface acceptance matrix and evidence
---

# PVC-GOAL-1601 — Goal reference acceptance

Validated from worktree `memoflow-goal-1601`, branch `product/vnext-goal-1601`,
baseline `d9fb14f436a`. This ticket adds acceptance evidence; production Goal,
server, persistence, AI and Task code remain unchanged.

**Execution (2026-09-30): Accepted / reference frozen.** Goal reference acceptance
is complete with the real-backend E2E limitation below explicitly retained. ChatGPT
Web owns architecture, review, acceptance and delivery. No GOAL-1301/1401/1402/1403
production behavior is changed.

## Required state matrix

Paths below are relative to `packages/app-vue/src/modules/goal` unless qualified.
Existing behavior specs are reused rather than copied into another suite.

| Required state           | Behavioral evidence                                                                                                                                                                                                                                                                                 | Browser/visual evidence and limits                                                                                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create empty             | `components/dialogs/GoalDialog.spec.ts`: create request without reminder; stale edit state resets to `initialKeyResults: []`; `packages/goal/.../commands/__tests__/create-goal.test.ts`: real create use case                                                                                      | Real GoalDialog empty form capture; named empty-KR create through production composable and injected service double. “Empty” means no KRs, not an invalid blank Goal name.          |
| Create with KR           | `GoalDialog.spec.ts`: locally drafted KR and Label submitted in one aggregate request; `create-goal.test.ts`: every initial KR saved once                                                                                                                                                           | Production form/KR draft editor browser interaction; persistence is doubled.                                                                                                        |
| Goal no KR               | Existing GoalDialog reset/create and workspace specs; new `goal-reference-flow.test.ts` asserts empty domain Goal before KR creation                                                                                                                                                                | Actual GoalDetail no-KR presentation and localized progress-needs-KR copy.                                                                                                          |
| Goal multiple KR         | `views/GoalDetailView.spec.ts`: five simultaneous KRs, authoritative progress, units, timeframe inheritance; direct-control concurrency tests                                                                                                                                                       | Real GoalDetail renders five KRs at each width/theme/locale.                                                                                                                        |
| Five calculation methods | `utils/key-result-calculation-presentation.spec.ts`, `GoalKeyResultEditors.spec.ts`, `GoalKeyResultDirectControls.spec.ts`, `GoalKeyResultTrajectoryPlot.spec.ts`, `GoalDetailView.spec.ts`, `GoalKeyResultInspectDialog.spec.ts`; server `key-result-measurement-v3.spec.ts`, shared preview specs | Canonical Sum / Last / Max / Min / Average DTOs use production localized vocabulary and production trajectory. Browser double delegates Record prediction to canonical calculator.  |
| Record success/error     | `GoalRecordDialog.spec.ts`: awaited save, pending lock, failed draft retention, retry, correction ownership; `GoalRecordComposerSurface.spec.ts`, `GoalRecordPreview.spec.ts`; real create-record use-case specs                                                                                    | Real Current → composer → preview → save → owner refresh browser flow; failure evidence remains focused Vitest, not a live failing backend.                                         |
| KR Inspect               | `GoalKeyResultInspectDialog.spec.ts`: five methods × two locales, history ordering/provenance, pagination, retry, stale-response safety; `GoalDeepLinks.characterization.spec.ts`: direct load/refresh/close/back/forward                                                                           | Real owner Inspect screenshot; production history service port is doubled.                                                                                                          |
| First Review             | Server `review-window-resolver.spec.ts`, `review-window-continuity.test.ts`, `add-goal-review.test.ts`; route characterization validates reflection and resolver-default request                                                                                                                    | Real owner Review create/save/read-only dialog, no AI registered.                                                                                                                   |
| Subsequent Review        | `review-window-continuity.test.ts`: first/second/third exact shared boundaries; new application flow compares query and saved context and preserves first snapshot                                                                                                                                  | Two browser Reviews; illustrative context double does not prove backend resolver arithmetic.                                                                                        |
| AI unavailable           | New five-method `goal-reference-flow.test.ts` constructs real Record, context builder, query and Review command without any provider; existing analyzer boundary spec prohibits AI dependencies                                                                                                     | Browser fixture registers no AI service/provider, completes Review normally.                                                                                                        |
| Expired target           | Existing `GoalProgressRow.spec.ts`; browser fixed clock plus canonical `setProductTimePreferences` with Los Angeles timezone                                                                                                                                                                        | Sep 30 01:00 UTC is still product Sep 29: target remains current. Sep 30 12:00 UTC is product Sep 30: Past Target visible. Status stays InProgress. No ambient UTC-date comparison. |
| Narrow panel / wide      | Existing module layout characterization preserves route DOM/focus/scroll across panel tiers; trajectory/direct-control specs                                                                                                                                                                        | Production CSS and `@container/panel`, 360px and 1280px. Isolated full-width owner, not shell drag/auth acceptance.                                                                 |
| Light / dark             | Production CSS shared theme variables                                                                                                                                                                                                                                                               | Both themes in browser matrix; no fixture theme palette.                                                                                                                            |
| zh-CN / en-US            | Production messages, five-method editors/Inspect, Review signals parity specs                                                                                                                                                                                                                       | Both locales in browser matrix.                                                                                                                                                     |

## Complete flow and owner boundaries

The new five-case application test exercises real Goal creation, KR creation, Record
write/measurement recalculation, trajectory read model, Review context query, first
Review and subsequent Review with repository doubles. Query context and persisted
snapshot must match; successive windows share the exact boundary; first snapshot
facts remain unchanged after the second Review. There is no AI provider dependency.

`GoalDeepLinks.characterization.spec.ts` remains the behavioral route authority:
Goal, legacy KR and legacy Review URLs resolve to GoalDetail; same-owner overlay
transitions preserve query/hash and do not re-fetch the workspace; dirty/busy guards
cover browser and shell navigation. Full-history Review lookup and legacy snapshots
without signals remain covered. The existing test corrections align
`index.spec.ts` route props with the accepted `false` contract and allow only the
calendar-native `formatProductYmd(getProductTodayYmd())` call for Product Today in
the Goal date boundary. Other `formatProductYmd` calls remain prohibited there.
Finalization also compares the complete first Review snapshot after the second
Review. Production routing and time semantics are untouched.

## Commands and results

Nx commands use `NX_DAEMON=false`; fresh Vitest runs
use `--skipNxCache -- --maxWorkers=2`. Raw local logs are under
`/tmp/pvc-goal-1601/` and are not checked into source.

The implementation worker's completed runs were checked against their local logs;
they were not repeated as full suites during finalization. Exact commands from the
repository root (log names are relative to the directory above):

| Evidence                            | Command                                                                    | Result / log                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full Goal package                   | `NX_DAEMON=false pnpm nx run goal:test --skipNxCache -- --maxWorkers=2`    | PASS, 99 files / 713 tests; `goal.log`. This earlier full run does not include the newly added reference-flow file; that file passes in the focused run below.                                                                                                                                                                                                      |
| Focused Goal reference              | Command A below                                                            | PASS, 7 files / 79 tests, fresh; `goal-focused.log`.                                                                                                                                                                                                                                                                                                                |
| Goal + Product Date + surface leave | Command B below                                                            | PASS, 31 files / 315 tests, fresh after correcting the stale Goal boundary; `app-goal.log`.                                                                                                                                                                                                                                                                         |
| App-Vue typecheck                   | `NX_DAEMON=false pnpm nx run app-vue:typecheck`                            | PASS, App-Vue and 28 dependencies; 12/29 tasks used cache; `typecheck.log`.                                                                                                                                                                                                                                                                                         |
| Full App-Vue                        | `NX_DAEMON=false pnpm nx run app-vue:test --skipNxCache -- --maxWorkers=2` | FAIL, 251 files (248 passed / 3 failed), 1,327 passed / 1,332 tests, five failures before the Goal correction; `app-full.log`.                                                                                                                                                                                                                                      |
| Inventory generation                | `pnpm test:inventory`                                                      | PASS, 1,286 files; `inventory-generate-final.log`.                                                                                                                                                                                                                                                                                                                  |
| Inventory check                     | `NX_DAEMON=false pnpm nx run test-system-v2:test:inventory`                | PASS, 1,286 files; `inventory-check-final.log`.                                                                                                                                                                                                                                                                                                                     |
| Changed-file ESLint                 | Command C below                                                            | PASS, 7 TypeScript files, zero errors and zero warnings; `eslint-final.log`. Initial nine cross-project relative-import errors were corrected with scoped imports and a harness-local source alias; the canonical Goal calculator uses a dynamic import to respect the web app’s lazy-load boundary. No production exports changed and no lint rules were disabled. |
| Final assertion checks              | Commands D below                                                           | PASS: Goal 1 file / 5 tests (`goal-assertions-final.log`); App-Vue 2 files / 7 tests (`app-assertions-final.log`), both fresh.                                                                                                                                                                                                                                      |
| Formatting                          | Command E below                                                            | PASS, all 11 acceptance/test/harness/doc files; `prettier-final.log`. Only files reported by Prettier were written; generated inventory retains generator formatting.                                                                                                                                                                                               |
| Governance                          | `NX_DAEMON=false pnpm nx run memoflow:governance-check`                    | PASS, memoflow plus 6 dependencies (6/7 tasks cached): 56.3s in `governance-final.log`; completed-report rerun PASS in 33.9s, `governance-completed-report.log`.                                                                                                                                                                                                    |
| Diff whitespace                     | `git diff --check`                                                         | PASS, no whitespace errors.                                                                                                                                                                                                                                                                                                                                         |

Command A:

```sh
NX_DAEMON=false pnpm nx run goal:test --skipNxCache -- \
  src/server/application/use-cases/commands/__tests__/goal-reference-flow.test.ts \
  src/server/application/use-cases/commands/__tests__/create-goal.test.ts \
  src/server/application/use-cases/commands/__tests__/review-window-continuity.test.ts \
  src/server/application/services/review-window-resolver.spec.ts \
  src/server/application/services/goal-review-context-builder.spec.ts \
  src/server/application/services/goal-review-signal-analyzer.spec.ts \
  src/shared/goal-record-preview.spec.ts --maxWorkers=2
```

Command B:

```sh
NX_DAEMON=false pnpm nx run app-vue:test --skipNxCache -- \
  src/modules/goal \
  src/shared/utils/format-date-keep-boundary.surface.spec.ts \
  src/layouts/shell/surface-leave-protocol.spec.ts --maxWorkers=2
```

Command C:

```sh
NX_DAEMON=false pnpm exec eslint \
  packages/app-vue/src/modules/goal/index.spec.ts \
  packages/app-vue/src/shared/utils/format-date-keep-boundary.surface.spec.ts \
  packages/goal/src/server/application/use-cases/commands/__tests__/goal-reference-flow.test.ts \
  apps/web/playwright.goal-reference.config.ts \
  apps/web/e2e/goal/reference/goal-reference.spec.ts \
  apps/web/e2e/goal/reference/main.ts \
  apps/web/e2e/goal/reference/vite.config.ts
```

Commands D (only the strengthened assertions and changed route spec):

```sh
NX_DAEMON=false pnpm nx run goal:test --skipNxCache -- \
  src/server/application/use-cases/commands/__tests__/goal-reference-flow.test.ts --maxWorkers=2
NX_DAEMON=false pnpm nx run app-vue:test --skipNxCache -- \
  src/modules/goal/index.spec.ts \
  src/shared/utils/format-date-keep-boundary.surface.spec.ts --maxWorkers=2
```

Command E:

```sh
pnpm exec prettier --check \
  packages/app-vue/src/modules/goal/index.spec.ts \
  packages/app-vue/src/shared/utils/format-date-keep-boundary.surface.spec.ts \
  packages/goal/src/server/application/use-cases/commands/__tests__/goal-reference-flow.test.ts \
  apps/web/playwright.goal-reference.config.ts \
  apps/web/e2e/goal/reference/goal-reference.spec.ts \
  apps/web/e2e/goal/reference/main.ts \
  apps/web/e2e/goal/reference/vite.config.ts \
  apps/web/e2e/goal/reference/index.html \
  apps/web/e2e/goal/reference/README.md \
  docs/plan/archive/2026-09-30-pvc-goal-1601-reference-acceptance.md \
  docs/plan/active/2026-09-29-product-vnext-execution-master-plan.md
```

Inventory counts: unit **1,116**, integration **34**, smoke **3**, boundary-ipc **8**,
boundary-main **6**, e2e **59**, perf **1**, governance **59**. The generated diff adds
one unit file and one isolated Playwright file. Inventory classifies the latter as
`e2e` by runner/collector; this classification does not establish live-backend coverage.

**Full App-Vue is not green.** The fresh broad run took 11m 7s and found five
failures. One was the stale Goal Product Date assertion corrected here, subsequently
passing in the 31-file / 315-test focused run. Four unrelated baseline failures
remain outstanding, without a full-suite rerun or a fabricated post-fix pass count:

- `useAppShellStore.spec.ts`: render clamp width 608 vs expected 620; responsive
  business-dominant width 658 vs expected 666; legacy persisted seed width 645 vs
  expected 653.
- `core-vnext-presentation-boundary.spec.ts`: Task capsule source expected to contain
  `'Missed'`.

Neither the shell geometry tests/production nor Task tests/production were changed.

## Browser fixture and visual baselines

[Fixture instructions](../../../apps/web/e2e/goal/reference/README.md) describe the
production components, doubles, fixed clock, commands and screenshot locations.
The dedicated Playwright configuration never starts the database/backend harness.
Screenshots are generated into ignored `reports/test-system-v2/goal-reference`, then
compared in a second run on the same Chromium/Linux environment. The fixture and
this evidence report are durable; local images are artifacts, not committed CI
golden files. Do not interpret these captures as authenticated backend coverage.

```sh
pnpm exec playwright test --config apps/web/playwright.goal-reference.config.ts --update-snapshots
pnpm exec playwright test --config apps/web/playwright.goal-reference.config.ts
```

Baseline generation: **11/11 PASS** in 1.1m (`browser-update.log`). The subsequent
comparison against those existing images: **11/11 PASS** in 60.0s
(`browser-compare.log`), with no page or console errors. Harness imports were then aligned with ESLint. The first finalization comparison
passed 10/11 (`browser-compare-final.log`); create-with-KR differed by 7,052 pixels
because input focus scrolled the dialog body 100px. Inspection of expected/actual
images showed the same layout at different scroll positions. The test now
explicitly scrolls that dialog body to the top before its capture. The comparison
after this harness correction is recorded below; baselines and tolerance are unchanged.
The build emitted a non-failing >500 kB chunk-size warning.

The 8 matrix tests are en-US/zh-CN × light/dark × 360/1280px (900px height). Each
captures multi-KR, expired Inspect, no-KR, create-empty, Review-create and
Review-inspect: **48 PNGs**. The Record/Review flow adds Record preview, first
Review and second Review: **3 PNGs**. Create-with-KR adds **1 PNG**, total **52**.
The two non-matrix creation cases and the flow use Playwright's default viewport.

Combined SHA-256 over the path-sorted screenshot SHA-256 manifest:

`ef598bd8b4a273b048426250c333932daa808468ec3c5b66462871183518c4f1`

Finalization independently counted all 52 PNGs and reproduced that digest. From
repository root, the manifest/digest command is:

```sh
find reports/test-system-v2/goal-reference -type f -name '*.png' -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum
```

ChatGPT Web visually inspected representative **360px dark zh-CN** Goal multi-KR
and Review-create captures, plus **1280px light en-US** expired Inspect and
Review-inspect captures. No clipping, overflow or layout defect was observed in
those representatives; this is not a claim of manual inspection of every image.
Browser assertions additionally check KR card `scrollWidth <= clientWidth` in the
multi-KR state and document horizontal overflow in the final Review-inspect state.
The matrix uses a full-width Goal owner container, not an authenticated shell or
shell drag/resize session.

Final comparison after explicit create-with-KR scroll positioning: **11/11 PASS**
in **1.4m** (`browser-compare-final-stable.log`), with no page/console errors. All
52 existing PNG baselines and the combined hash above remain unchanged.

## Backend E2E and limitations

The repository's real Goal Web subset is `goal/goal-crud.spec.ts` in the default
Playwright harness. Its API bootstrap calls `ensureTestDatabase`, which can execute
`prisma db push --accept-data-loss`. This ticket does not authorize bypassing database
ownership/safety guards or destructive schema synchronization. Database-backed
journey results must be reported separately from the isolated browser fixture.

Discovery only:

```sh
TEST_INVENTORY_LIST=1 pnpm exec playwright test --config apps/web/playwright.config.ts goal/goal-crud.spec.ts --list
```

Result: **9 tests in 1 file** (`e2e-list.log`). The real default Goal E2E suite was
**not executed**: `ensureTestDatabase` can run `prisma db push --accept-data-loss`,
and this ticket does not authorize destructive schema synchronization. No DB push
was run during finalization. The accepted reference therefore has this explicit
real-backend E2E limitation; it is not live-backend acceptance.

Evidence layers are distinct:

- Application-flow Vitest uses real Goal domain/application commands, canonical
  Record calculation and Review window/context logic with persistence doubles and
  no AI provider. It does not exercise HTTP, authentication or a database.
- The isolated browser harness uses production components, CSS, messages, Product
  Time, router/store/composables and deterministic injected service ports. Its
  illustrative Review context does not prove server window arithmetic; error/retry
  behavior remains covered by focused component specs.
- Real backend E2E is discovered but unexecuted, for the exact reason above.

## Final scope and retirement check

```sh
rg -n 'KeyResultDetailView|GoalReviewCreationView|GoalReviewDetailView' apps packages \
  -g '*.ts' -g '*.tsx' -g '*.vue' -g '*.js' \
  -g '!*.spec.*' -g '!*.test.*' -g '!**/__tests__/**' -g '!**/e2e/**'
git diff --check
```

Production references to retired standalone KR/Review views: **zero** (ripgrep
exit 1 means no matches). GOAL-1601 has **zero production code changes**: only
acceptance tests, the isolated browser harness, generated inventory and these
acceptance/plan docs. The master plan changes only its GOAL-1601 section. Validation
completed on the feature branch before delivery; resulting delivery commits are
recorded in Git history.
