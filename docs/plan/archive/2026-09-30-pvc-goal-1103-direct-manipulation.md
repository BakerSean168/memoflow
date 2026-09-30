---
tags:
  - plan
  - goal
status: implemented
created: 2026-09-30
description: PVC-GOAL-1103 KR direct manipulation implementation and validation evidence
---

# PVC-GOAL-1103 implementation report

Implemented / validated locally. ChatGPT Web owns final review and acceptance; acceptance remains pending. No commit or push was performed.

## Implementation

`GoalKeyResultDirectControls` composes Goal-owned title/description textareas, the existing Select/Popover primitives and `GoalTimeframePicker` into the compact KR summary. Title saves on blur or Enter; description saves on blur or Ctrl/Cmd+Enter. Escape resets the individual field. Title is trimmed and cannot become blank; description is trimmed and empty text becomes null. Existing contract length limits apply. Controls have accessible names, native keyboard behavior, visible focus and disabled/busy states.

Calculation options consume the GOAL-1104 presentation map for all five methods in both locales. Weight offers the existing 1–5 vocabulary. KR target timeframe is an override; clearing it restores the Goal target fallback without writing the inherited date into KR metadata.

Goal Detail owns the only metadata command adapter, calling the canonical `GoalService.updateKeyResult(goalId, keyResultId, patch + expectedVersion)`. Patches contain only the edited metadata property. A shared Goal-level busy gate prevents concurrent KR/Goal property writes from racing the aggregate version, including create/delete submissions. Successful commands apply `GoalMutationReceipt.readModel` directly to the workspace Goal before releasing the gate; subsequent commands therefore use the returned version. Failure retains canonical properties, resets text drafts and exposes the existing Goal mutation alert. Thrown transport errors also reset drafts and release the gate. Late replies for a different routed Goal are ignored.

Current remains the read-only trajectory button that opens the existing Goal Record composer. It never calls the KR metadata command. Initial/target numeric values and unit remain measurement presentation. Creation keeps `KeyResultDialog`; the normal KR Edit overflow item and its opener are removed after parity checks. Delete and create-bound-task remain; KR detail navigation remains in overflow using the existing route label. `KeyResultDetailView`, Task domain and Review behavior were not changed.

## Validation

Green evidence was collected before writing the master-plan execution marker.

| Gate | Result |
| --- | --- |
| Focused/direct-control/regression specs | PASS — 8 files, 143 tests |
| `pnpm nx run app-vue:typecheck` | PASS — including dependency targets |
| Changed-file `pnpm exec eslint` | PASS — four changed Vue/TypeScript files, no errors or warnings |
| `git diff --check` | PASS |
| `pnpm nx run memoflow:governance-check` | PASS |
| Isolated Chromium with production CSS | PASS — 800px and 360px |

Focused command:

```sh
pnpm nx run app-vue:test -- src/modules/goal/views/GoalDetailView.spec.ts src/modules/goal/components/GoalKeyResultDirectControls.spec.ts src/modules/goal/components/GoalKeyResultTrajectoryPlot.spec.ts src/modules/goal/components/GoalKeyResultEditors.spec.ts src/modules/goal/components/dialogs/KeyResultDialog.spec.ts src/modules/goal/components/dialogs/GoalRecordDialog.spec.ts src/modules/goal/utils/key-result-calculation-presentation.spec.ts src/modules/goal/views/KeyResultDetailView.spec.ts
```

Mounted tests cover title/description success, service/transport failures, Escape reset followed by blur, null/empty normalization, canonical payloads and expectedVersion for every editable property, failure feedback without displayed drift, five-method vocabulary in both locales, Current/check-in without metadata mutation, create/delete/bound-task/detail affordances, disabled controls and multiple-KR isolation/version sequencing. Real primitive mounts also prove Enter opens the method menu with canonical labels, native property buttons/textarea accessible names, weight selection and failed property rollback.

The isolated real-controls/trajectory browser fixture used production CSS and Chromium at 800px and 360px. It verified title Enter/Escape, method keyboard opening and actual option selection on success/failure, weight Space opening and Enter selection on failure, timeframe Enter opening, and Current Enter/Space emitting exactly once each. Both widths had no horizontal overflow or browser errors. Screenshots `/tmp/goal1103-800.png` and `/tmp/goal1103-360.png` were visually inspected. This was an isolated component check, not authenticated Goal Detail E2E. Temporary fixture sources were removed; no browser harness was added to the repository.

Governance caught a primitive-vendor type import during implementation. It was removed; the method handler now accepts unknown and narrows against the existing Goal vocabulary. Final governance, typecheck, lint and spec reruns passed.

## Exact changed files

- `packages/app-vue/src/modules/goal/components/GoalKeyResultDirectControls.vue`
- `packages/app-vue/src/modules/goal/components/GoalKeyResultDirectControls.spec.ts`
- `packages/app-vue/src/modules/goal/views/GoalDetailView.vue`
- `packages/app-vue/src/modules/goal/views/GoalDetailView.spec.ts`
- `docs/plan/active/2026-09-29-product-vnext-execution-master-plan.md`
- `docs/plan/archive/2026-09-30-pvc-goal-1103-direct-manipulation.md`
