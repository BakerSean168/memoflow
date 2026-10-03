# PVC-UI-2103 — Overlay/state recipes

Date: 2026-10-01

## Status

Accepted / frozen on top of canonical Product vNext batch `de609567b52`.

This ticket re-validates the overlay/state presentation primitives preserved during repository reconciliation and closes the one real gap left by that reconciliation: the shared `property` popover recipe existed, but the newer ROUTINE-5103 component decomposition had restored raw `PopoverContent` markup, leaving the recipe without a real owner consumer.

## Accepted recipes

### ProductPopoverSurface

- `compact-menu` — compact chooser/menu surface.
- `property` — canonical property editor surface.

Proving owners:

- Goal KR weight -> `compact-menu`.
- Routine elapsed duration -> `property`.
- Routine active duration -> `property`.
- Routine natural-break duration -> `property`.

The Routine migration is presentation-only: NumberField models, minima/steps, localization and Routine trigger ownership remain in the Routine components.

### ProductDialogShell

Accepted explicit recipes:

- `form`
- `inspect`
- `config`
- `workspace`

Explicit size/height overrides remain available. The shared shell does not own submit/cancel/dirty/busy or domain commands.

Representative proving owners include Task occurrence inspect, Goal KR inspect, Goal/Task/Routine workspace editors and Schedule configuration.

### ProductSheetSurface

The narrow edge-sheet recipe remains shared by the Knowledge projection workspace for Catalog and Context panels. Host-side content and capability ownership remain unchanged.

### ProductSurfaceState

Accepted families:

- `collection`
- `workspace`
- `dialog`

Accepted states:

- `loading`
- `error`
- `empty`

The primitive owns presentation and accessibility semantics only. Retry/actions remain owner slots.

Representative proving owners remain Knowledge workspace, Notification collection and Task AI dialog.

## Reconciliation repair

ROUTINE-5103 replaced the old monolithic Routine editor with `ElapsedTriggerEditor` and `ActiveUsageTriggerEditor`. During repository reconciliation the newer Routine implementation correctly won conflicts, but that also reintroduced three literal `PopoverContent class="w-56 space-y-2 p-3"` surfaces.

This ticket replaces those three duplicate presentation recipes with `ProductPopoverSurface recipe="property"` and removes the owner-local `PopoverContent` import. No model construction, trigger DTO logic, save command or validation behavior moved.

The shared overlay/state contract test now locks this adoption so the `property` recipe cannot silently become dead code again.

## Validation

Fresh validation on `product/vnext-ui-2103`:

- focused overlay/state + owner suite: **7 files / 55 tests passed**
  - ProductOverlayStateRecipes
  - ProductDialogShell
  - Document presentation primitives
  - Knowledge projection workspace
  - Notification Center
  - Routine editor runtime
  - Routine form surface contract
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

No new browser/pixel-diff claim is made. The production visual change is intentionally a no-op in geometry: the shared `property` recipe is the exact `w-56 space-y-2 p-3` class set previously duplicated in Routine.

## Files changed

- `packages/app-vue/src/modules/routine/components/ElapsedTriggerEditor.vue`
- `packages/app-vue/src/modules/routine/components/ActiveUsageTriggerEditor.vue`
- `packages/app-vue/src/shared/components/ProductOverlayStateRecipes.spec.ts`
- `docs/plan/active/2026-09-29-product-vnext-execution-master-plan.md`
- this report

## Result

PVC-UI-2103 is closed. The next Phase 6 ticket is PVC-UI-2104 — Semantic elevation/status/source tones.
