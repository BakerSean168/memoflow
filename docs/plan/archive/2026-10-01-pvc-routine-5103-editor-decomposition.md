# PVC-ROUTINE-5103 — Routine editor semantic decomposition

Date: 2026-10-01. Branch: `product/vnext-routine-5103`. Final baseline: `72903b4ce3b8`.

## Outcome

ROUTINE-5103 decomposes the large Routine editor only along stable trigger / ownership boundaries. It does not introduce a universal form schema, generic field renderer, or move Routine DTO ownership out of the parent editor.

`RoutineEditorDialog.vue` remains the composition and semantic owner for:

- trigger-type selection;
- reset / edit-state seeding;
- cross-field submit validation;
- `buildTrigger(): RoutineTriggerDto | null`;
- `scheduler` versus `local-runtime` timing-owner decisions;
- final save payload and Profile membership IDs;
- desktop-runtime capability feedback.

Four focused UI boundaries now own only their local editing grammar:

- `WallClockTriggerEditor.vue`: Product Time, exact-day Product Date, recurrence frequency/interval/weekdays and timezone controls.
- `ElapsedTriggerEditor.vue`: elapsed duration and elapsed anchor controls.
- `ActiveUsageTriggerEditor.vue`: active duration, natural-break credit and active-usage anchor controls.
- `ProfileScopeControl.vue`: Routine-to-Profile membership selection.
- `routine-editor.types.ts` contains only the small editor-local discriminants shared by parent and child controls.

The parent editor dropped the delegated control implementations and their local option/update helpers. It is now 446 lines; the extracted components are independently named after the stable semantics they edit. Line count is supporting evidence only: the architectural acceptance criterion is that Routine DTO construction and timing ownership remain centralized in the parent.

## Ownership and anti-abstraction lock

The final source audit confirms:

- child editors do not import or construct `RoutineTriggerDto`;
- child editors do not contain `timingOwner`, `buildTrigger`, save handlers, or owner commands;
- the parent no longer directly owns Product Date/Time/Timezone, NumberField, weekday, anchor, or membership-picker presentation;
- no `UniversalRoutineField`, `fieldSchema`, or equivalent schema-renderer abstraction was introduced;
- Product Time / WallClock semantics from ROUTINE-5101 remain unchanged.

`routine-form-ui.surface.spec.ts` now freezes this boundary explicitly instead of requiring all primitives to remain inside the monolithic parent.

## Runtime regression evidence

Existing mounted editor tests continue to exercise the real extracted controls through the parent:

- Product Time defaults and timezone round-trip;
- exact `Hm + Ymd + TimeZoneId` persistence;
- day-only ProductDatePicker behavior;
- invalid Hm normalization;
- recurrence interval minimum;
- all Elapsed anchor / timing-owner combinations;
- ActiveUsage anchors and natural-break semantics;
- busy-state blocking.

A new runtime case verifies that extracted ProfileScopeControl preserves membership IDs through the parent save payload, without moving membership ownership into the child.

Validation:

- focused architecture/runtime matrix: **2 files / 16 tests PASS**;
- full Routine App-Vue suite: **5 files / 27 tests PASS**;
- `app-vue:typecheck --skip-nx-cache`: PASS through real `vue-tsc`;
- changed-file ESLint: PASS;
- changed-file Prettier: PASS;
- test inventory: PASS, **1,295 files**;
- `memoflow:governance-check`: PASS;
- `git diff --check`: PASS.

The typecheck run emitted only existing workspace warnings / Nx flaky-task annotations for `time:build` and `contracts:build`; there were no TypeScript diagnostics.

## Browser / backend scope

No isolated browser harness was added for this structural refactor. Existing mounted component tests exercise the production child controls through `RoutineEditorDialog`, and the static surface test locks the architectural boundary.

The authenticated Routine browser lane was not used as acceptance evidence because its API bootstrap can reach test-database setup that executes `prisma db push --accept-data-loss`. No destructive guard was bypassed. No browser or live-backend E2E claim is made for ROUTINE-5103.

## Changed files

- `packages/app-vue/src/modules/routine/components/RoutineEditorDialog.vue`
- `packages/app-vue/src/modules/routine/components/RoutineEditorDialog.spec.ts`
- `packages/app-vue/src/modules/routine/components/WallClockTriggerEditor.vue`
- `packages/app-vue/src/modules/routine/components/ElapsedTriggerEditor.vue`
- `packages/app-vue/src/modules/routine/components/ActiveUsageTriggerEditor.vue`
- `packages/app-vue/src/modules/routine/components/ProfileScopeControl.vue`
- `packages/app-vue/src/modules/routine/components/routine-editor.types.ts`
- `packages/app-vue/src/modules/routine/routine-form-ui.surface.spec.ts`
- `docs/plan/archive/2026-10-01-pvc-routine-5103-editor-decomposition.md`
- `docs/plan/active/2026-09-29-product-vnext-execution-master-plan.md` (ROUTINE-5103 execution paragraph only)

**ROUTINE-5103 is accepted / frozen.**
