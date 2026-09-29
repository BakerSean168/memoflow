# PVC-GOAL-1201 implementation plan

Status: implemented and validated on 2026-09-29.

Scope: measurement-aware manual Goal Record composer only. No preview arithmetic, provenance redesign, Task work, routes, or AI changes.

1. Characterize all five methods, finite signed inputs, submission lifecycle, canonical card exports, and receipt-driven store refresh with focused tests.
2. Reuse GOAL-1104's Goal-owned prompt/input-kind authority and canonical KR read model. Keep unit unchanged. Show signed quick deltas only for Sum; remove phantom manual `recordedAt`.
3. Keep one neutral GoalRecordCard implementation. Preserve public names as aliases.
4. Characterize Create/UpdateGoalRecordSchema finite-number behavior; minimally align domain create validation with update. Preserve internal recordedAt.
5. Run focused Vue and Goal record/progress tests, both typechecks, changed-file ESLint, diff checks, and governance checks.

Contract authority: shared Goal record Zod schemas; no new DTO or method vocabulary. Existing GoalMutationReceipt application owns immediate currentValue refresh; no extra fetch. The server's KeyResultProgress remains the only calculation authority.

## Implementation evidence

- Composer reads the canonical KR aggregation method/unit and reuses GOAL-1104's prompt/input-kind map. Sum uses the installed Lucide `Diff` (±) icon and signed quick deltas; sample methods use `Ruler` and no quick deltas.
- Blank and non-finite input cannot submit. Signed finite values, including manual zero and values above the former 10000 UI cap, submit unchanged. Pending submission prevents dismissal, edits, and duplicate submission; failures retain the draft.
- Manual create helper derives value/note from `CreateGoalRecordReq`; phantom `recordedAt` is removed. Internal/domain timestamps remain unchanged.
- Installed Zod 4 already rejects NaN and infinities in both public record schemas. Characterization tests preserve the schemas; domain create now uses the same finite-number rule as update.
- `components/cards/GoalRecordCard.vue` remains the single neutral implementation. Both public export names reference it; the duplicate root component was deleted.
- Real composable/store tests prove receipt application immediately updates canonical KR values and materialized Goal surfaces without refetch. Server creation tests cover Sum/Average/Max/Min/Last using signed and zero history facts.

## Validation

Commands run from repository root unless noted. Nx runs use `NX_DAEMON=false` after an initial local daemon connection failure.

- `pnpm nx run app-vue:test -- GoalRecordDialog.spec.ts GoalRecordCard.spec.ts useGoalRecords.spec.ts goalStore.spec.ts` — PASS, 4 files / 81 tests.
- `pnpm nx run goal:test -- goal-record.spec.ts key-result-measurement-v3.spec.ts goal-value-objects.spec.ts` — PASS, 3 files / 24 tests.
- From `packages/goal`: `node ../../node_modules/vitest/vitest.mjs run --config vitest.use-cases.config.ts create-goal-record.test.ts update-goal-record.test.ts delete-goal-record.test.ts` — PASS, 3 files / 17 tests. The use-case configuration is separate from the default domain suite.
- `pnpm nx run app-vue:typecheck` — PASS.
- `pnpm nx run goal:typecheck` — PASS. Both typechecks reported the existing Nx `time:build` flaky-task advisory.
- `node node_modules/eslint/bin/eslint.js <all changed TS/Vue files>` — PASS, zero errors; three pre-existing `no-explicit-any` warnings in the create-record use-case test.
- Prettier on edited component/composable/test files — PASS.
- `git diff --check` — PASS.
- `pnpm nx run memoflow:governance-check` — PASS.

No preview, Task, provenance, route, or AI changes. No commit or push.
