---
tags:
  - product
  - module-index
  - label
description: Label foundation 当前生产文件与 vNext 文档索引
created: 2026-09-09T00:00:00+08:00
updated: 2026-09-09T00:00:00+08:00
---

# Label Foundation 文件索引

## Current production truth

| Area                | Path                                                                        |
| ------------------- | --------------------------------------------------------------------------- |
| domain label        | `packages/label/src/domain/label.ts`                                        |
| current repository  | `packages/label/src/domain/label-repository.ts`                             |
| application service | `packages/label/src/application/label-service.ts`                           |
| Prisma adapter      | `packages/label/src/infrastructure/prisma/prisma-label.repository.ts`       |
| PowerSync adapter   | `packages/label/src/infrastructure/powersync/powersync-label.repository.ts` |
| client              | `packages/label/src/client/**`                                              |
| contracts           | `packages/contracts/src/modules/label/index.ts`                             |
| schema              | `packages/database/prisma/schema/label.prisma`                              |
| API host            | `apps/api/src/modules/label/**`                                             |
| Desktop host        | `apps/desktop/src/main/modules/label/**`                                    |

## Target convergence docs

- `docs/analysis/2026-09-09-label-vnext-current-system-map.md`
- `docs/analysis/2026-09-09-time-label-reference-and-reuse-ledger.md`
- `docs/architecture/time-label-vnext-foundations.md`
- `docs/architecture/adr/ADR-102-label-registry-and-owner-assignment-boundary.md`
- `docs/architecture/adr/ADR-103-label-identity-normalization-time-and-color-contract.md`
- `docs/plan/active/2026-09-09-time-label-vnext-model-convergence.md`

这些 target docs 尚未表示 assignment ownership 已经迁移。
