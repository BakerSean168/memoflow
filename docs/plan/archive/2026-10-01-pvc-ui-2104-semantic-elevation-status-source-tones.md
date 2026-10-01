# PVC-UI-2104 — Semantic elevation/status/source tones

Date: 2026-10-01

## Status

Accepted / frozen on top of canonical Product vNext batch `b2d034c356d`.

Implementation was delegated to Codex Team `gpt-6.1-sol` at medium reasoning effort in the isolated `product/vnext-ui-2104` worktree. ChatGPT Web independently reviewed the diff and reran acceptance gates before merge.

## Accepted semantic vocabulary

The existing product vocabulary remains authoritative:

- `semantic-tone.ts`
  - tones: `primary`, `info`, `success`, `warning`, `destructive`, `muted`
  - surface/status/border presentation helpers
- `semantic-elevation.ts`
  - `inset`
  - `raised`
  - `floating`
  - `floating-interactive`

No parallel token system or feature-local replacement abstraction was added.

## Production changes

### AI sidebar verification state

The recent-Knowledge email-verification degrade previously used the raw palette pair:

`text-amber-950 dark:text-amber-100`

It now uses the existing semantic warning status recipe:

`semanticToneStatusClass('warning')`

The existing `role="status"`, localized copy, and Knowledge error/degrade behavior are unchanged.

### AI composer context chips

Attachment and explicit-context chips previously repeated a literal inset border shadow. Both now use:

`semanticElevationClass('inset')`

This deliberately standardizes the inset border opacity to the shared recipe. File removal, entity removal, attachment/context identity, composer routing and submit behavior are unchanged.

## Audited surfaces that required no production churn

### Notification

Notification presentation already uses semantic tone helpers. Acceptance tests now lock:

- category/type -> semantic tone fallback behavior;
- toast priority:
  - LOW -> muted
  - NORMAL -> info
  - HIGH -> warning
  - URGENT -> destructive
  - unknown -> info fallback;
- urgent pulse behavior;
- notification click and close actions remain independent.

### Schedule

Planner source presentation already owns semantic source identity:

- Schedule -> primary
- Task -> info
- Goal -> warning
- Routine -> success

Source identity remains separate from derived display/conflict tone. Existing Planner tests already lock this boundary, so no Schedule production file changed.

### Settings

`SettingsStatusBlock` already maps loading/error/info/success onto the shared semantic status vocabulary while preserving `role` and `aria-busy`. Acceptance adds explicit coverage for all four states; no production change was required.

### Routine

Active Routine production surfaces use product semantic tokens rather than legacy raw feature palette classes. Tokenized surface/border HSL recipes remain local where they describe geometry rather than a reusable semantic status/elevation contract. No Routine production churn was justified.

### Specialized interaction shadows

AI welcome-card hover lift and similar interaction-specific shadows remain local. They encode interaction motion/feedback rather than a stable product elevation role, so this ticket intentionally does not mass-replace them.

## Validation

Codex implementation validation:

- representative focused App-Vue suite: **13 files / 86 tests passed**
- App-Vue typecheck: **passed**
- targeted ESLint: **passed**
- targeted Prettier: **passed**
- `git diff --check`: **passed**

Independent ChatGPT acceptance:

- changed-contract suite: **5 files / 43 tests passed**
- `app-vue:typecheck --skip-nx-cache`: **passed**, including 28 dependency tasks
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
- targeted ESLint / Prettier: **passed**
- `git diff --check`: **passed**

Nx reported its existing flaky-task advisory during the uncached typecheck run, but the run completed successfully with exit code 0.

## Visual evidence boundary

No new browser/pixel-diff claim is made for this ticket. The production changes are narrow semantic-token convergence, but they do change presentation slightly:

- sidebar verification becomes the canonical warning status surface;
- composer chip inset opacity moves from the feature-local literal to the shared inset recipe.

Cross-product screenshot/pixel coverage remains part of the final visual-regression matrix rather than being invented ad hoc here.

## Files changed

Production:

- `packages/app-vue/src/modules/ai/components/AIConversationSidebar.vue`
- `packages/app-vue/src/modules/ai/components/AIFooterComposer.vue`

Contract/regression tests:

- `packages/app-vue/src/modules/ai/components/AIConversationSidebar.email-verification.spec.ts`
- `packages/app-vue/src/modules/ai/components/AIFooterComposer.spec.ts`
- `packages/app-vue/src/modules/ai/components/AIMessagePanel.spec.ts`
- `packages/app-vue/src/modules/notification/components/notificationSemanticControls.spec.ts`
- `packages/app-vue/src/components/shared/settings/SettingsPresentationPrimitives.spec.ts`

Acceptance metadata:

- `docs/plan/active/2026-09-29-product-vnext-execution-master-plan.md`
- `docs/plan/active/2026-09-29-product-vnext-convergence.md`
- this report

## Result

PVC-UI-2104 is closed. The next Phase 6 ticket is PVC-SHELL-8201 — Capsule host shell.
