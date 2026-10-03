# PVC-UI-2101 — Legal surface/header variants

Date: 2026-10-01

## Status

Accepted / frozen on top of canonical Product vNext batch `9e3721ea0fe`.

This ticket closes the header grammar that was preserved during the repository reconciliation. The production primitive and owner migrations were already present in the canonical tree, but the previous convergence snapshot report was intentionally not treated as acceptance evidence because it predated the final reconciliation. This pass re-validates the current repository state and freezes the contract explicitly.

## Contract

The legal product-surface header families are now one exported runtime/type contract:

- `collection`
- `entity`
- `calendar`
- `document`
- `settings`
- `diagnostic`

`PRODUCT_SURFACE_HEADER_FAMILIES` is the canonical runtime list and `ProductSurfaceHeaderFamily` is derived from it. This prevents the type union, tests, and future tooling from drifting independently.

`ProductSurfaceHeader` remains presentation-only. It owns the shared surface, border, elevation, blur and family-specific geometry while preserving owner slots, actions, routing and domain behavior. It intentionally does not force one literal height across all families.

`ModuleHeader` remains the slotted composition owner for leading/actions/subnav and delegates only its visual chrome to `ProductSurfaceHeader`. Its default family is `entity`.

## Accepted owner mappings

Current canonical owners use the shared contract as follows:

- Goal page toolbar -> `collection`
- Task page toolbar -> `collection`
- Routine list toolbar -> `collection`
- Notification list toolbar -> `collection`
- Goal detail toolbar -> default `entity` through `ModuleHeader`
- Task detail toolbar -> default `entity` through `ModuleHeader`
- Schedule Planner toolbar -> `calendar`
- Knowledge document workspace toolbar -> `document`
- narrow Settings scene header -> `settings`
- SSE Monitor -> `diagnostic`

This exceeds the ticket requirement to prove the grammar on at least two real surfaces.

## Deliberate exclusions

This ticket does not mass-rewrite every literal `<header>` in the repository.

- `AIChatView` keeps its current AI-specific host header until PVC-AI-8201 composer/host cleanup.
- Product Governance surfaces remain on the gated GOV-7901/7902/7903 track.
- Internal section headers and split-pane dividers are not top-level product-surface headers and therefore are not forced through this family contract.

No capability ownership, query, mutation, persistence, routing or Product Time behavior moved.

## Validation

Fresh validation on `product/vnext-ui-2101`:

- focused App-Vue header/owner suite: **9 files / 48 tests passed**
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
- targeted Prettier check: **passed**
- `git diff --check`: **passed**

The ticket-close diff does not change rendered header classes or owner markup; it freezes the already-integrated family vocabulary and adds acceptance evidence. Therefore this pass does not claim a new pixel-diff/browser run. Existing rendered geometry remains covered by the current owner/component regressions, while UI-9001 remains the dedicated final screenshot matrix.

## Files changed in closure

- `packages/app-vue/src/shared/components/product-surface-header.types.ts`
- `packages/app-vue/src/shared/components/ProductSurfaceHeader.spec.ts`
- `packages/app-vue/src/shared/components/index.ts`
- `docs/plan/active/2026-09-29-product-vnext-execution-master-plan.md`
- this report

## Result

PVC-UI-2101 is closed. The next Phase 6 ticket is PVC-UI-2102 — Entity property/metadata grammar.
