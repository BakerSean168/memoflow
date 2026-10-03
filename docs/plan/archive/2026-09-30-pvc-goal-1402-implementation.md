---
tags:
  - plan
  - archive
  - goal
description: PVC-GOAL-1402 deterministic review facts and signals implementation evidence
created: 2026-09-30T00:00:00Z
updated: 2026-09-30T00:00:00Z
---

# PVC-GOAL-1402 — Review facts + deterministic diagnosis

Implemented, validated, rebased onto the accepted GOAL-1301 integration baseline, and independently reviewed.

## Ownership and signal semantics

`analyzeGoalReviewSignals` is one pure Goal application function. `GoalReviewContextBuilder` calls it after computing the existing authoritative facts. Preview and AddReview therefore use the same analyzer and calculation authority. The analyzer has no clock, repository, AI dependency, measurement arithmetic, cause, confidence or recommendation. No generic rules engine was introduced.

The contract owns a strict discriminated union with three kinds, in this order:

| Kind                   | Observed meaning                                                                                       | Evidence                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `overall-movement`     | `increased`, `decreased`, `unchanged`, comparing normalized start/end progress                         | Exact startPercentage, endPercentage, deltaPercentage from overallProgress                                                            |
| `key-result-movement`  | Per-KR `improved`, `regressed`, `unchanged`, comparing canonical normalized progress toward its target | KR ID/title and exact startPercentage, endPercentage, deltaPercentage; evidence sorted lexically by KR ID, independent of child order |
| `measurement-activity` | Recorded measurements in the window, including zero activity                                           | Exact recordCount, manualRecordCount, taskContributionCount from summary                                                              |

KR movement is omitted when there are no KRs. Overall and activity evidence remain informative for an empty Goal. Directions compare endpoints; deltas are copied from authoritative facts, not recalculated. For an 80 → 70 kg target, a measurement decrease from 78 → 75 means normalized progress increases 20% → 50%, correctly classified as improved. Progress deltas are presented as percentage points.

Record summary semantics are preserved: manual means sourceType null; Task contributions mean TASK_INSTANCE or TASK_TEMPLATE. This is the existing Review summary, not a new classification by GOAL-1203 authorship. No record/source IDs enter signals or normal UI. KR IDs correlate evidence internally and are not displayed.

The shared Vue `GoalReviewSnapshot` renders facts, trend points, summary and persisted/server-generated evidence. Both en-US and zh-CN include observed-fact labels, zero-activity explanation and a legacy no-saved-signals explanation. Review routes, create's explicit seven days, selection/default resolution and inclusive record predicates remain unchanged. No Task mutation, AI change or dialog/route retirement.

## Persistence, compatibility and portability evidence

Independently inspected `packages/database/prisma/schema/goal.prisma`: `GoalReview.systemContext` is **String** mapped to `system_context`, containing serialized JSON. The existing Prisma repository uses JSON.stringify on create/update; PowerSync uses JSON.stringify in update/insert SQL parameters. No database column or migration was added.

The new persistence test executes the real `GoalPrismaRepository.saveRootWithExpectedVersion` against a recording transaction double, inspects both create/update JSON payloads, then passes that exact stored payload through the real Prisma and PowerSync mappers, the server Review entity, JSON transport/client schema and client Review entity. Signals/evidence survive unchanged. The test also verifies that mutating returned nested signal evidence cannot alter the server Review snapshot. This proves production serialization/mapping code; it is not a live database test or live PowerSync SQL test.

The contract's additive `signals` default is `[]`. Both storage mappers parse unknown JSON through that contract, and server/client Review entity loading normalizes and clones the snapshot. Legacy snapshots retain original facts and receive no retroactive analysis. Malformed new signal variants fail schema validation. Existing child DTOs and responses inherit the canonical context schema rather than duplicating a signal DTO.

Portability shares the signal schemas while replacing KR IDs with portable references. Export strips raw IDs; import remaps signal evidence to the same deterministic KR IDs as facts. Counts and historical directions are retained, not re-derived from restored records. A real capability export/parse/apply/replay test verifies this. Exercising reviews exposed two existing portability issues necessary for parity: exported KR facts retained raw keyResultId, and replay compared differently normalized KR references. Both are corrected in the same owner path.

## Validation

All listed focused checks passed on 2026-09-30:

| Check                                                                                                                                   | Command                                                                                                                                                                                                                                                                                                                                                                                  | Result                                |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Goal analyzer/context/window, client HTTP/IPC parity, production transport, entities, persistence mappers/repository write, portability | `NX_DAEMON=false pnpm nx run goal:test --args='goal-review-signal-analyzer.spec.ts goal-review-context-builder.spec.ts review-window-resolver.spec.ts goal-portability.spec.ts goal-review-portability.spec.ts goal-review-signals.spec.ts goal-review-window.spec.ts goal-transport-parity.spec.ts goal-management.spec.ts prisma-goal-mapper.additional.spec.ts'`                      | 10 files / 117 tests PASS             |
| Commands/queries and preview/saved signal equality with frozen clock and non-empty decreasing-target facts                              | From packages/goal: `node ../../node_modules/vitest/vitest.mjs run --config vitest.use-cases.config.ts review-window-continuity.test.ts add-goal-review.test.ts update-goal-review.test.ts get-goal-review-context.test.ts`                                                                                                                                                              | 4 files / 22 tests PASS               |
| New/old contract, client JSON round-trip, portable schema, existing windows                                                             | From packages/contracts: `node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts src/modules/goal/api/goal-review-signals.spec.ts src/modules/goal/api/goal-review-window.spec.ts src/modules/goal/portable-v3.spec.ts`                                                                                                                                                 | 3 files / 26 tests PASS               |
| Integrated Review / deep-link / KR Inspect / shared-surface matrix after GOAL-1301 rebase                                               | `pnpm exec vitest run --config packages/app-vue/vitest.config.ts packages/app-vue/src/modules/goal/views/GoalReviewSignals.spec.ts packages/app-vue/src/modules/goal/views/GoalDeepLinks.characterization.spec.ts packages/app-vue/src/modules/goal/components/dialogs/GoalKeyResultInspectDialog.spec.ts packages/app-vue/src/shared/components/product-surface-polish.surface.spec.ts` | 4 files / 44 tests PASS               |
| Sequential typechecks with dependency builds                                                                                            | `NX_DAEMON=false pnpm nx run goal:typecheck`, then `NX_DAEMON=false pnpm nx run contracts:typecheck`, then `NX_DAEMON=false pnpm nx run app-vue:typecheck`                                                                                                                                                                                                                               | PASS; no overlapping build lane       |
| Final Goal check after final edits                                                                                                      | `NX_DAEMON=false pnpm nx run goal:typecheck --excludeTaskDependencies`                                                                                                                                                                                                                                                                                                                   | PASS; dependencies already built      |
| Changed TS/Vue ESLint                                                                                                                   | `node node_modules/eslint/bin/eslint.js <changed TS/Vue files>`                                                                                                                                                                                                                                                                                                                          | PASS, 0 errors / 22 existing warnings |
| Diff / governance                                                                                                                       | `git diff --check`; `NX_DAEMON=false pnpm nx run memoflow:governance-check`                                                                                                                                                                                                                                                                                                              | PASS                                  |

Post-rebase focused behavioral acceptance: **209 passed** (117 Goal + 22 command/query + 26 contracts + 44 App-Vue). Static analyzer tests inspect analyzer/builder/Review component/views for AI dependencies/calls and raw source IDs. Strict signal contract tests reject cause/recommendation/confidence fields and unsupported vocabulary. UI fixtures deliberately supply signal evidence different from current facts to prove signals are presented rather than recomputed.

Local logs: `/tmp/1402-goal-tests.log`, `/tmp/1402-usecase-tests.log`, `/tmp/1402-contracts-tests.log`, `/tmp/1402-vue-tests.log`, `/tmp/1402-vue-surface.log`, `/tmp/1402-goal-typecheck.log`, `/tmp/1402-goal-typecheck-final.log`, `/tmp/1402-contracts-typecheck.log`, `/tmp/1402-vue-typecheck.log`, `/tmp/1402-eslint.log`, `/tmp/1402-governance.log`. Dependency bootstrap/generated Prisma client preparation did not change tracked generated files or mutate a database.

### Post-rebase integration acceptance

The implementation was rebased from the GOAL-1401 baseline onto batch `f6adc856fdc`, which already contains the independently reviewed GOAL-1301 route-driven KR Inspect surface and retirement of standalone `KeyResultDetailView`. Locale conflicts were merged by retaining both owner namespaces (`goal.inspect` and `goal.reviewSnapshot`). The shared surface test retains GOAL-1301 ProductDialogShell/trajectory invariants while asserting GOAL-1402's shared Review snapshot. `GoalReviewSignals.spec.ts` no longer imports or revives the retired standalone KR page. The integrated App-Vue matrix passed 44/44, proving Review signals coexist with KR deep-link/Inspect behavior.

## Remaining caveats

- Database integration was not executed: `packages/test-utils/src/setup/database.ts:177` runs Prisma `db push --accept-data-loss`. No destructive guard bypass or database change occurred. Repository write tests use doubles; PowerSync read mapping is real, its SQL execution was inspected rather than run against a live DB.
- Separate live preview/save requests may have different clocks or record histories. Equality is guaranteed for the same facts/window/clock, as tested; this ticket does not introduce a preview reservation or change GOAL-1401 windows.
- GOAL-1402 did not add an authenticated browser E2E or golden screenshot. Product-wide browser/visual acceptance remains in the later E2E/visual closure; this ticket itself is accepted.

## Exact changed files

- `docs/plan/active/2026-09-29-product-vnext-execution-master-plan.md`
- `docs/plan/archive/2026-09-30-pvc-goal-1402-implementation.md`
- `packages/app-vue/src/locales/en-US/goal.ts`
- `packages/app-vue/src/locales/zh-CN/goal.ts`
- `packages/app-vue/src/modules/goal/components/GoalReviewSnapshot.vue`
- `packages/app-vue/src/modules/goal/views/GoalDeepLinks.characterization.spec.ts`
- `packages/app-vue/src/modules/goal/views/GoalReviewCreationView.vue`
- `packages/app-vue/src/modules/goal/views/GoalReviewDetailView.vue`
- `packages/app-vue/src/modules/goal/views/GoalReviewSignals.spec.ts`
- `packages/app-vue/src/shared/components/product-surface-polish.surface.spec.ts`
- `packages/contracts/src/mocks/goal.mock.ts`
- `packages/contracts/src/modules/goal/api/goal-review-signals.spec.ts`
- `packages/contracts/src/modules/goal/portable-v3.ts`
- `packages/contracts/src/modules/goal/value-objects/goal-review-context.ts`
- `packages/contracts/src/modules/goal/value-objects/index.ts`
- `packages/goal/src/domain-client/entities/goal-review.ts`
- `packages/goal/src/infrastructure-client/adapters/goal-review-window.spec.ts`
- `packages/goal/src/server/application/goal-portability.ts`
- `packages/goal/src/server/application/goal-review-portability.spec.ts`
- `packages/goal/src/server/application/services/__tests__/goal-workspace-query.service.spec.ts`
- `packages/goal/src/server/application/services/goal-review-context-builder.spec.ts`
- `packages/goal/src/server/application/services/goal-review-context-builder.ts`
- `packages/goal/src/server/application/services/goal-review-signal-analyzer.spec.ts`
- `packages/goal/src/server/application/services/goal-review-signal-analyzer.ts`
- `packages/goal/src/server/application/services/review-window-resolver.spec.ts`
- `packages/goal/src/server/application/use-cases/commands/__tests__/add-goal-review.test.ts`
- `packages/goal/src/server/application/use-cases/commands/__tests__/review-window-continuity.test.ts`
- `packages/goal/src/server/domain/aggregates/goal-management.spec.ts`
- `packages/goal/src/server/domain/entities/goal-review.ts`
- `packages/goal/src/server/infrastructure/adapters/powersync/mappers/powersync-goal.mapper.ts`
- `packages/goal/src/server/infrastructure/adapters/prisma/goal-prisma.repository.integration.test.ts`
- `packages/goal/src/server/infrastructure/adapters/prisma/mappers/goal-review-signals.spec.ts`
- `packages/goal/src/server/infrastructure/adapters/prisma/mappers/prisma-goal-mapper.additional.spec.ts`
- `packages/goal/src/server/infrastructure/adapters/prisma/mappers/prisma-goal-mapper.ts`
