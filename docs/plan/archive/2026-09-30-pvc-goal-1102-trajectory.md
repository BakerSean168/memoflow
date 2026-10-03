---
tags:
  - plan
  - goal
status: completed
created: 2026-09-30
description: PVC-GOAL-1102 compact read-only KR trajectory implementation
---

# PVC-GOAL-1102 implementation report

Extend the Goal-owned trajectory plot with a compact read-only presentation, preserving its editor mode and geometry. Goal Detail will show labeled Initial/Current/Target values with the actual KR unit, canonical calculation labels, weight and effective target timeframe (KR override, then Goal target). The Current button will emit the existing quick check-in action. Keep KR title deep links and existing overflow actions; Task metadata follows the measurement surface.

No new inline editing, mutation contracts, calculation maps or aggregation math. Use native buttons, visible labels and focus rings; static values never render disabled inputs.

Verify multiple KRs, both locales and all five methods, unit/no-unit, timeframe override/inheritance/unset, direction geometry, quick check-in and refresh, secondary Task navigation, preserved detail navigation and absence of new edit controls. Run focused specs, `app-vue:typecheck`, changed-file ESLint, `git diff --check` and `memoflow:governance-check`. Record completion in the master plan only after green evidence.

## Implementation evidence

Implemented and validated on 2026-09-30. Goal Detail now presents each KR as a compact trajectory summary with labeled Initial/Current/Target values, the actual unit (no invented unit when absent), the Goal-owned calculation label, raw weight and effective target timeframe. The KR timeframe overrides the Goal timeframe; absent values show the existing localized Not set copy.

`GoalKeyResultTrajectoryPlot` owns both presentations. The default editor and all geometry remain unchanged; read-only mode renders semantic value labels and a single native Current button. The accessible name includes the KR title, current value and unit. It emits only the existing check-in action; the existing Record dialog and saved refresh remain authoritative. No aggregation math, method map, new inline editing or new mutation behavior was added.

KR titles retain `key-result-detail` navigation. `KeyResultDetailView` and its deep-link behavior remain available for GOAL-1301. Existing overflow actions remain intact. Linked Task count/navigation follows the measurement surface as secondary metadata.

## Validation

All required gates passed before the master-plan execution marker was written.

| Check                                                  | Evidence                                                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Focused app-vue specs                                  | PASS: 6 files / 114 tests                                                                                   |
| `pnpm nx run app-vue:typecheck`                        | PASS, including dependency builds                                                                           |
| Changed-file `pnpm exec eslint`                        | PASS, zero errors/warnings after the project graph was available                                            |
| `git diff --check`                                     | PASS                                                                                                        |
| `pnpm nx run memoflow:governance-check`                | PASS                                                                                                        |
| Isolated owner-plot Chromium check with production CSS | PASS: 800px and 360px, no label/chart overlap or horizontal overflow; native Enter and Space each emit once |

Focused command:

```sh
pnpm nx run app-vue:test -- src/modules/goal/views/GoalDetailView.spec.ts src/modules/goal/components/GoalKeyResultTrajectoryPlot.spec.ts src/modules/goal/components/GoalKeyResultEditors.spec.ts src/modules/goal/views/KeyResultDetailView.spec.ts src/modules/goal/utils/key-result-calculation-presentation.spec.ts src/modules/goal/components/dialogs/GoalRecordDialog.spec.ts
```

Changed-file ESLint covers `GoalDetailView.vue`, `GoalDetailView.spec.ts`, `GoalKeyResultTrajectoryPlot.vue` and `GoalKeyResultTrajectoryPlot.spec.ts`.

The focused suite verifies five simultaneous KRs in both locales, all canonical method labels, unit/no-unit, weight, KR timeframe override/Goal inheritance/unset, increasing/decreasing/flat/negative/overshoot geometry, editor parity, quick check-in activation and refresh, linked Task metadata/navigation, retained detail links, and absence of new value-editing controls.

The browser fixture caught long-unit overlap in the first fixed-height implementation. Read-only labels now participate in normal layout: typical plots stay 128px tall, while the narrow long-unit case expands to 152px. Screenshots were visually inspected at `/tmp/pvc-goal-1102-800.png` and `/tmp/pvc-goal-1102-360.png`. This is an isolated real owner-plot check, not an authenticated Goal Detail E2E run or a committed golden screenshot baseline. Temporary browser fixture files were removed; no visual-harness infrastructure was added.

No commit or push was performed.
