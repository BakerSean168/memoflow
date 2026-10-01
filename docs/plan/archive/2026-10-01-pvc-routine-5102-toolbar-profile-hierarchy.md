# PVC-ROUTINE-5102 — Routine toolbar / profile hierarchy

Date: 2026-10-01. Branch: `product/vnext-routine-5102`. Baseline: `122ef32104f2`.

## Outcome

ROUTINE-5102 converges the Routine configuration header without changing Routine/Profile ownership or command contracts.

- The left side remains the existing status filter.
- The right side now presents one compact Profile scope/gate control plus the existing Add Routine primary action.
- Profile selection and its durable enabled gate are visually grouped instead of rendering separate persistent labels and switches.
- The global paused state is represented by a small status indicator inside the Profile scope trigger rather than a separate persistent badge.
- Low-frequency Profile runtime/edit/delete/create operations remain inside the Profile menu.
- The Profile runtime action is no longer silently absent on hosts without local-runtime capability. It remains visible, disabled, and carries the existing “Desktop required” capability hint.
- The global enabled gate still calls `updatePreferences`; the selected Profile gate still calls `updateProfile`; the Profile runtime action still calls `setProfileActive`. No owner command or domain contract changed.
- Routine create/templates remain a separate primary action; its label/chevron collapse to the existing plus-only panel grammar below `@2xl/panel`.
- The active scope trigger uses only the current Profile name (or “All”), removing the redundant persistent `Context:` prefix.

## Changed files

Production:

- `packages/app-vue/src/modules/routine/views/RoutineConfigurationView.vue`

Tests:

- `packages/app-vue/src/modules/routine/views/RoutineConfigurationView.spec.ts`
- `packages/app-vue/src/modules/routine/routine-form-ui.surface.spec.ts`

Planning evidence:

- `docs/plan/archive/2026-10-01-pvc-routine-5102-toolbar-profile-hierarchy.md`
- `docs/plan/active/2026-09-29-product-vnext-execution-master-plan.md`

## Validation

The existing view characterization was extended to prove the new hierarchy and owner routing:

- compact `routine-profile-scope-control`;
- global gate routes to `updatePreferences({ globalEnabled, expectedVersion })`;
- selected Profile gate routes to `updateProfile(profileId, { enabled, expectedVersion })`;
- supported runtime action routes to `setProfileActive`;
- unsupported runtime action remains visible, disabled, and shows the host-capability hint;
- Add Routine remains outside the Profile scope control and uses the shared panel breakpoint grammar for icon-only narrow presentation;
- the selected scope label is compact (`Work`, not `Context: Work`);
- a selected Profile under global pause shows the compact in-trigger paused indicator and does not resurrect the retired standalone badge.

A stale surface assertion initially expected the retired `routine-global-paused-badge`. The surface contract was updated to freeze the new scope/gate/runtime hierarchy and explicitly reject the retired badge.

Final checks:

- Routine App-Vue suite: **5 files / 26 tests PASS** after final reviewer repair.
- `app-vue:typecheck --skip-nx-cache`: PASS through real `vue-tsc`; Nx emitted only the repository's existing flaky-task annotations for `time:build` / `contracts:build`.
- Changed-file ESLint: PASS.
- Changed-file Prettier: PASS.
- Test inventory: PASS, **1,295 files**.
- `memoflow:governance-check`: PASS.
- `git diff --check`: PASS.

## Browser / backend limitation

The existing authenticated Routine browser spec is collected by `apps/web/playwright.config.ts`, which starts the real API. That bootstrap reaches `ensureTestDatabase`, whose database setup can execute `prisma db push --accept-data-loss`. This lane was intentionally not run; no destructive guard was bypassed.

No browser or live-backend E2E claim is made for ROUTINE-5102. Acceptance is based on mounted component characterization, the static surface contract, typecheck, inventory and governance evidence.

## Final reviewer repair

After the first accepted implementation was integrated, ChatGPT Web performed a second compactness review. Two non-semantic refinements were added without changing Routine/Profile ownership: the scope trigger now renders only the Profile name / `All`, and Add Routine collapses to plus-only at the existing panel breakpoint while retaining its accessible label and dropdown semantics. Characterization also now locks the compact global-paused indicator explicitly; the DropdownMenu test harness was made deterministic by rendering menu slots structurally rather than depending on closed portal state.

Fresh post-repair evidence passed **5 files / 26 Routine tests**, `app-vue:typecheck --skip-nx-cache` through `vue-tsc`, changed-file ESLint/Prettier, the **1,295-file** inventory check, governance and `git diff --check`. No browser/live-backend claim was added.

**ROUTINE-5102 is accepted / frozen.**
