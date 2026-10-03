# PVC-SET-7202 Wave A — Notification/Data owner-section migration

Date: 2026-10-01

## Scope

This wave migrates the Notification and Data settings owner sections onto the Settings presentation grammar introduced by PVC-SET-7201. It intentionally does not move owner APIs or persistence semantics, and it does not include the remaining AI/Knowledge migration.

## Implementation

- Notification browser/device/delivery groups now use `SettingsSection` and `SettingsPropertyRow` instead of heavy Cards.
- Notification preference errors use `SettingsStatusBlock`; module channel controls remain flat property rows rather than bounded object cards.
- Existing notification test IDs, server preference ownership, browser permission behavior, and Desktop device preference ownership are preserved.
- Desktop user-files settings now use `SettingsSection`, `SettingsPropertyRow`, and semantic `SettingsStatusBlock` feedback.
- Data transfer actions now use the same section/property-row grammar while preserving preference portability, full Data Portability, and server-held disclosure ownership.
- Raw success palette classes were removed from the migrated Data surface; no native select was introduced.

## Validation

- `NotificationSettings.spec.ts`: 7/7 PASS.
- `SettingAdvancedActions.spec.ts` + notification/data surface contracts: 8/8 PASS.
- Settings scene/navigation contracts: 9/9 PASS.
- App-Vue typecheck including 28 dependent tasks: PASS.
- Targeted ESLint and Prettier: PASS.
- Test inventory: 1292 files.
- Repository governance: PASS.
- `git diff --check`: PASS.
- Residual scan for native `<select>` and raw green/cyan/purple/amber utility palette in the migrated wave: clean.

## Remaining PVC-SET-7202 work

- migrate AI provider connection/onboarding presentation to shared object-card/dialog grammar;
- migrate Knowledge connection/object-card/disconnect dialog presentation;
- run the combined Settings regression and close PVC-SET-7202 only after those two owner sections are green.
