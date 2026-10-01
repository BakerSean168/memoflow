# PVC-SET-7202 Wave B — AI/Knowledge owner-section migration

Date: 2026-10-01

## Scope

This wave completes PVC-SET-7202 by migrating the remaining AI provider and Knowledge repository settings surfaces onto the Settings presentation grammar introduced by PVC-SET-7201. It preserves the existing AI and Repository capability-owner APIs and does not centralize persistence, authentication, provider, repository, or sync behavior.

## Implementation

- AI provider settings now use `SettingsSection`, `SettingsObjectCard`, and semantic `SettingsStatusBlock` presentation instead of heavy Cards.
- The AI provider onboarding/replacement workflow now uses `SettingsDialogShell` with a wide, bounded, scrollable body while preserving the existing picker → connection → model → review workflow and `useAI()` owner boundary.
- Provider add/probe/model selection/atomic commit, replacement, refresh, test, default-selection, and delete behavior remain owned by the existing AI composable/service contracts.
- Knowledge local-vault and GitHub repository settings now use `SettingsSection`, `SettingsObjectCard`, and semantic status blocks while preserving Desktop local-vault ownership and Repository service ownership.
- Knowledge disconnect confirmation now uses `SettingsDialogShell`; purge/retain semantics and repository sync/reconciliation/write-ledger behavior are unchanged.
- `SettingsDialogShell` gained presentation-only `size` and `bodyClass` props so larger configuration workflows can share the canonical shell without embedding capability logic.
- No native `<select>`, raw amber/emerald status palette, or direct `DialogContent`/heavy `Card` surface remains in the migrated AI/Knowledge owner sections.

## Validation

- Focused Settings presentation + AI onboarding + Knowledge repository tests: 3 files / 34 tests PASS.
- Combined Settings component + Settings scene/navigation regression: 12 files / 63 tests PASS.
- App-Vue typecheck including 28 dependent tasks: PASS.
- Targeted ESLint and Prettier: PASS.
- `git diff --check`: PASS.
- AI provider browser behavior regression: `provider-onboarding.spec.ts` P0 custom-provider add → atomic save → encrypted-key replacement → refresh/test path: 1/1 PASS in Chromium.
- Read-only Codex review was attempted but its local bubblewrap sandbox could not create the loopback namespace; manual source review confirmed the Wave B script/owner logic is unchanged apart from presentation imports.

## PVC-SET-7202 result

Wave A (Notification/Data) and Wave B (AI/Knowledge) together satisfy the ticket scope: the Settings scene now shares one section/property/status/object/dialog grammar while each capability continues to call its existing owner API. The ticket is ready to close; subsequent work belongs to Phase 6 shared UI grammar/shell-host convergence.
