# PVC-KNOW-6102 — Web/Desktop workspace composition migration

Status: Implemented / validated
Date: 2026-10-01

## Scope

Migrate the Web knowledge projection workspace and Desktop Local Vault workspace onto the shared document presentation grammar introduced by PVC-KNOW-6101, while keeping host capability ownership distinct.

## Implementation

- Migrated `KnowledgeProjectionWorkspaceView` to `DocumentWorkspaceToolbar` and `DocumentWorkspaceState` for its document header, loading, connection-empty, and no-selection states.
- Kept the Web catalog on `KnowledgeNoteCatalog` and preserved its GitHub projection-only behavior, stable-reference adoption, lazy tree loading, cursor search, and provider/source semantics.
- Preserved narrow-panel catalog and context interaction through left/right `Sheet` surfaces; a component regression now exercises opening the catalog Sheet, selecting a note and closing it, then opening/closing the context Sheet.
- Migrated `LocalVaultWorkspaceView` to the same `DocumentWorkspaceToolbar`, `DocumentSourceStatus`, `DocumentCatalogSearch`, `DocumentCatalogRow`, and `DocumentWorkspaceState` grammar.
- Moved Desktop Vault-level actions (rescan, open root in Obsidian, change Vault, detach) into the source-status block, while the selected document toolbar owns the document-level “Open in Obsidian” action.
- Preserved Desktop-only Local Vault and Obsidian capabilities. No Web repository mutation, local-vault capability leakage, or in-app Markdown editor was introduced.
- Extended `DocumentCatalogRow` with an optional description slot so Desktop search-result excerpts remain visible after the shared-row migration instead of being silently dropped.
- Added a mounted `LocalVaultWorkspaceView` regression that validates binding/scan, shared source/catalog composition, document selection, preview, Obsidian handoff, and search-result excerpt behavior.
- Updated the generated test inventory for the new regression file.

## Validation

- Focused Knowledge/UI suite:
  - `DocumentPresentationPrimitives.spec.ts`
  - `KnowledgeNoteCatalog.spec.ts`
  - `KnowledgeProjectionWorkspaceView.spec.ts`
  - `LocalVaultWorkspaceView.spec.ts`
  - `notePanelAdaptation.spec.ts`
  - Result: 5 files / 27 tests PASS.
- App-Vue typecheck, including 28 dependency tasks: PASS.
- Targeted ESLint for all changed Vue/test files: PASS.
- Prettier applied to the complete batch.
- Test inventory regenerated and checked: 1291 files.
- Repository governance checks: PASS. The top-level wrapper exceeded the MCP 60-second command cap after the early/mid audit set had passed; the remaining governance audit scripts were then executed explicitly and all passed.
- `git diff --check`: PASS.

## Review notes

The migration deliberately converges presentation rather than ownership. Web still treats GitHub as a projected read/search/reference surface and continues to use provider-aware repository controls. Desktop still treats the Local Vault as a host-owned filesystem source and keeps all Vault/Obsidian actions local to that host. The shared primitives contain presentation only and do not acquire repository APIs, filesystem operations, or write authority.

The Desktop catalog remains stacked above content at narrow panel widths rather than adopting the Web projection Sheets, because it has no separate contextual side panel and its existing responsive split is a host-specific composition rather than a duplicated capability. Web narrow Catalog/Context Sheet behavior is explicitly regression-tested.
