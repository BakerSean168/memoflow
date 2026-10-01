# PVC-UI-2102 — Entity property/metadata grammar

Date: 2026-10-01

## Status

Accepted / frozen on top of canonical Product vNext batch `0817ddcd51b`.

This ticket closes the entity identity/property presentation grammar that was preserved during repository reconciliation. The production primitives and Goal/Task migrations were already present in the canonical tree; this pass re-validates the reconciled result, resolves the stale candidate name in the active plans, and repairs one test fixture that still modeled the pre-`ProductPopoverSurface` Goal KR popover.

## Accepted primitives

- `ProductEntityIdentity`
- `ProductMetadataRow`
- `ProductPropertyChip`
- `ProductMoreProperties`

`ProductPropertyChip` is the accepted existing name. No parallel `ProductMetadataChip` alias/component is introduced.

These components remain presentation-only:

- identity owns only compact identity-stack spacing;
- metadata row owns only the canonical label/value grid;
- property chip owns only compact editable/value-chip chrome and accessible active state;
- more-properties owns only the shared circular overflow trigger/menu shell.

Goal and Task continue to own all domain decisions, queries, routing and mutations.

## Proving owner surfaces

### Goal detail

The canonical Goal workspace uses:

- `ProductEntityIdentity` for title/summary identity;
- `ProductMetadataRow` for properties, Task context and optional metadata;
- `ProductMoreProperties` for the optional-property/action reveal shell.

Goal keeps its own Task creation/navigation, reminders, labels, Knowledge links, Review actions and mutations.

### Task detail

The canonical Task workspace uses:

- `ProductEntityIdentity`;
- `ProductMetadataRow`;
- `ProductPropertyChip`;
- `ProductMoreProperties`.

Task keeps its own Goal binding, schedule/recurrence/importance, labels, reminders and Plan mutation request construction.

A source-level contract now locks both proving surfaces to the same presentation grammar while asserting that the shared primitives do not import Goal or Task owner modules.

## Reconciliation test repair

Fresh validation initially exposed three Goal KR weight tests that could no longer reach the weight options. Production behavior was correct: `GoalKeyResultDirectControls` had already migrated from raw `PopoverContent` to the shared `ProductPopoverSurface`, but `GoalDetailView.spec.ts` still stubbed only the old primitive.

The test fixture now stubs `ProductPopoverSurface` with the same slot-preserving stub. This restores the existing KR direct-edit tests without changing production code or owner semantics.

## Validation

Fresh validation on `product/vnext-ui-2102`:

- focused App-Vue entity/property suite: **7 files / 65 tests passed**
  - shared entity metadata primitives
  - ProductPropertyChip
  - GoalDetailView
  - TaskDetailView
  - Goal vNext convergence
  - Task vNext surface
  - shared product-surface polish
- `app-vue:typecheck --skip-nx-cache`: **passed**
- test inventory: **1335 files**
  - unit 1154
  - integration 34
  - smoke 3
  - boundary-ipc 8
  - boundary-main 8
  - e2e 63
  - perf 2
  - governance 63
- `memoflow:governance-check --skip-nx-cache`: **passed**
- targeted ESLint: **passed**
- targeted Prettier: **passed**
- `git diff --check`: **passed**

The production entity/property components and owner markup were not visually changed in this closeout. No new browser/pixel-diff claim is made; final cross-product visual coverage remains UI-9001.

## Files changed in closure

- `packages/app-vue/src/shared/components/ProductEntityMetadataPrimitives.spec.ts`
- `packages/app-vue/src/modules/goal/views/GoalDetailView.spec.ts`
- `docs/plan/active/2026-09-29-product-vnext-execution-master-plan.md`
- `docs/plan/active/2026-09-29-product-vnext-convergence.md`
- this report

## Result

PVC-UI-2102 is closed. The next Phase 6 ticket is PVC-UI-2103 — Overlay/state recipes.
