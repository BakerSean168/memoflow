---
tags: [product, module-index, data-portability]
description: Data Portability V3-only implementation and documentation entry points
created: 2026-09-09T00:31:00+08:00
updated: 2026-09-18T00:00:00+00:00
---

# Data Portability 文件索引

## Current production

- [`packages/contracts/src/modules/data-portability/dtos/portable-v3.dto.ts`](../../../packages/contracts/src/modules/data-portability/dtos/portable-v3.dto.ts) — V3 envelope/reference contract
- [`packages/contracts/src/modules/data-portability/api/portable-v3.dto.ts`](../../../packages/contracts/src/modules/data-portability/api/portable-v3.dto.ts) — V3 transport request/response contract
- [`packages/contracts/src/modules/data-portability/rules/import-safety.ts`](../../../packages/contracts/src/modules/data-portability/rules/import-safety.ts) — V3 safety parser and banned-key policy
- [`packages/data-portability/src/server/application/portable-capability.ts`](../../../packages/data-portability/src/server/application/portable-capability.ts) — registry-facing owner capability seam
- [`packages/data-portability/src/server/application/portable-capability-coordinator.ts`](../../../packages/data-portability/src/server/application/portable-capability-coordinator.ts) — V3 orchestration, preflight and receipt
- [`packages/data-portability/src/server/application/portable-reference-registry.ts`](../../../packages/data-portability/src/server/application/portable-reference-registry.ts) — operation-local stable refs
- [`packages/data-portability/src/server/infrastructure/data-portability.module.ts`](../../../packages/data-portability/src/server/infrastructure/data-portability.module.ts) — V3-only module composition
- [`packages/data-portability/src/api/routes.ts`](../../../packages/data-portability/src/api/routes.ts) — HTTP export/dry-run/apply surface
- [`packages/data-portability/src/electron/index.ts`](../../../packages/data-portability/src/electron/index.ts) — Desktop V3 IPC surface
- [`packages/data-portability/src/server/application/use-cases/export-server-held-data-disclosure.use-case.ts`](../../../packages/data-portability/src/server/application/use-cases/export-server-held-data-disclosure.use-case.ts) — separate disclosure-only export
- [`apps/api/src/runtime/compose-data-portability.ts`](../../../apps/api/src/runtime/compose-data-portability.ts) — API capability composition
- [`apps/desktop/src/main/runtime/compose-data-portability.ts`](../../../apps/desktop/src/main/runtime/compose-data-portability.ts) — Desktop capability composition

## Evidence and decisions

- [`docs/analysis/2026-09-18-port-1611-v3-only-cutover-evidence.md`](../../analysis/2026-09-18-port-1611-v3-only-cutover-evidence.md)
- [`docs/analysis/2026-09-09-data-portability-current-system-map.md`](../../analysis/2026-09-09-data-portability-current-system-map.md)
- [`docs/architecture/adr/ADR-106-owner-driven-data-portability-v3.md`](../../architecture/adr/ADR-106-owner-driven-data-portability-v3.md)
- [`docs/architecture/adr/ADR-111-zero-legacy-data-destructive-cutover-policy.md`](../../architecture/adr/ADR-111-zero-legacy-data-destructive-cutover-policy.md)
- [`docs/plan/active/2026-09-09-system-wide-vnext-model-convergence-implementation.md`](../../plan/active/2026-09-09-system-wide-vnext-model-convergence-implementation.md)
