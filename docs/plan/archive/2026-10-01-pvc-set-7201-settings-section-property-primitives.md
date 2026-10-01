# PVC-SET-7201 — Settings section/property primitives

Status: Implemented / validated
Date: 2026-10-01

## Scope

Reduce the Settings scene's default "Card ocean" without changing Settings information architecture or moving capability ownership. Establish a small presentation-only grammar that can be reused by later owner-section migration work.

## Implementation

- Added shared presentation primitives under `components/shared/settings`:
  - `SettingsSection` for lightweight section framing and optional header actions;
  - `SettingsPropertyRow` for responsive label/description/control alignment;
  - `SettingsStatusBlock` for loading/error/info/success states;
  - `SettingsObjectCard` for genuinely bounded complex objects rather than simple preferences;
  - `SettingsDangerZone` for destructive operations;
  - `SettingsDialogShell` for consistent Settings-owned dialogs.
- Kept all primitives presentation-only. They accept text, slots, layout/test metadata, and standard Dialog composition only; they do not import Settings, Account, Auth, Repository, AI, Notification, or persistence services.
- Migrated Appearance from a heavy Card to `SettingsSection + SettingsPropertyRow` while retaining the canonical theme Select and compatibility test IDs.
- Migrated Locale controls to one lightweight section with property rows and the existing standard Select controls for language, timezone, date style, time style, and week start.
- Migrated preference loading and error presentation to `SettingsStatusBlock` while retaining `UserPreferenceSettingsSection` as the canonical presentation/regional persistence owner.
- Migrated reset presentation to `SettingsDangerZone`, removed the remaining native reset `<select>`, and preserved the existing all/presentation/regional reset command contract.
- Used the same grammar in Account for local Profile lock and cloud logout. Lock is a lightweight section header action; logout remains an explicit destructive zone. Profile editing, local PIN, cloud Auth, and session ownership are unchanged.
- Preserved the existing narrow Settings navigation and standalone Settings scene composition.
- Preserved legacy E2E automation selectors such as `appearance-settings-card` even though the backing presentation is no longer a Card.

## Validation

- Settings presentation / owner-focused regression:
  - `SettingsPresentationPrimitives.spec.ts`
  - `SettingsResetSection.spec.ts`
  - `UserPreferenceSettingsSection.spec.ts`
  - `AccountProfileSection.spec.ts`
  - 4 files / 15 tests PASS.
- Settings scene/navigation regression:
  - `UserSettingsView.contract.spec.ts`
  - `settingsPanelAdaptation.spec.ts`
  - `AccountSettingsSection.spec.ts`
  - 3 files / 11 tests PASS.
- Canonical Web Settings persistence E2E:
  - theme selection -> presentation preference PATCH -> document theme -> reload -> persisted theme;
  - 1/1 PASS on the final working tree.
- App-Vue typecheck, including 28 dependent targets: PASS.
- Targeted ESLint: PASS.
- Targeted Prettier check: PASS.
- Test inventory: 1292 files, PASS.
- Repository governance: PASS.
- `git diff --check`: PASS.

## Desktop shell regression note

The Electron shell theme/language matrix was attempted twice. The first launch failed because the host had no X display. A second run under `xvfb-run` completed the full Desktop production build but Electron exited before `firstWindow` became available. This is a host/runtime launch failure rather than an assertion failure in the Settings UI. The final browser owner-persistence E2E and component regressions cover the changed Settings surfaces; no Desktop-only Settings owner semantics were changed by this ticket.

## Review notes

The key boundary remains ownership versus presentation. `UserPreferenceSettingsSection` still owns canonical presentation/regional load, patch, and reset state. `AccountProfileSection` still owns Profile/Auth/PIN interactions. The new shared primitives do not know how those owners load or mutate data.

Simple preferences now render as lightweight sections and rows by default. Rounded/raised containers remain legal only for bounded complex objects, while destructive actions use a dedicated danger-zone grammar. This gives PVC-SET-7202 a stable presentation layer for Notification/Data/AI/Knowledge migration without centralizing their capability APIs.
