# PVC-KNOW-6101 — Shared document presentation primitives

Status: Implemented / validated
Date: 2026-10-01

## Scope

Establish a shared presentation grammar for document workspaces without merging Web/Desktop capability ownership. The batch is intentionally limited to reusable document presentation primitives plus the existing Web Knowledge catalog as the proving surface. Full Web/Desktop workspace composition migration remains PVC-KNOW-6102.

## Implementation

- Added `DocumentWorkspaceToolbar` as the compact one-line document header shell used by future Web/Desktop composition.
- Added `DocumentCatalogSearch` with shared search/clear/submit behavior and Product input styling.
- Added `DocumentCatalogRow` with one selected-state grammar for document rows while keeping callers responsible for document identity and activation.
- Added `DocumentWorkspaceState` for explicit loading/error/empty presentation semantics.
- Added `DocumentSourceStatus` for source identity, count, sync state, attention state, and host-specific action slots.
- Exported the primitives through the live Repository component surface.
- Migrated `KnowledgeNoteCatalog` to the new source/search/row/state primitives as the proving surface.
- Replaced the remaining native repository-connection `<select>` with the standard shadcn/Reka `Select` family.
- Preserved Web projection ownership, lazy tree loading, cursor search pagination, stable document IDs, and typed connection selection events. No local-vault capability or built-in document editing was added.
- Updated the existing workspace integration test to assert the catalog's typed `connection-change` event path rather than relying on native-select DOM semantics.

## Validation

- Focused Knowledge suite:
  - `DocumentPresentationPrimitives.spec.ts`
  - `KnowledgeNoteCatalog.spec.ts`
  - `KnowledgeProjectionWorkspaceView.spec.ts`
  - Result: 3 files / 21 tests PASS.
- New primitive coverage verifies toolbar slot geometry, search model/submit/clear events, selected catalog-row semantics, loading/error/empty accessibility state, source-status presentation, and the no-native-select Knowledge catalog contract.
- App-Vue `typecheck` with dependency builds and `vue-tsc --noEmit`: PASS.
- Targeted ESLint for all changed Knowledge presentation/test files: PASS.
- Prettier applied to the complete KNOW-6101 surface.
- Test inventory regenerated successfully: 1290 files.
- Repository governance check: PASS.
- `git diff --check`: PASS.
- Visual/behavior regression is covered at the primitive/catalog/workspace component level in this foundation batch; live Web/Desktop composition acceptance remains PVC-KNOW-6102.
- No other worktree or concurrent thread was modified.

## Review notes

The primitives intentionally accept presentation data and slots only. They do not own repository APIs, local-vault operations, projection loading, or document mutation. This preserves the audit requirement of presentation convergence without capability convergence. PVC-KNOW-6102 can now migrate `KnowledgeProjectionWorkspaceView` and `LocalVaultWorkspaceView` onto the same primitives while leaving Web projection-only and Desktop local-vault/Obsidian behavior distinct.
