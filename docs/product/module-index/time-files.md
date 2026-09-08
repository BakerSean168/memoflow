---
tags:
  - product
  - module-index
  - time
description: Time foundation 当前生产文件与 vNext 文档索引
created: 2026-09-09T00:00:00+08:00
updated: 2026-09-09T00:00:00+08:00
---

# Time Foundation 文件索引

## Current production truth

| Area                       | Path                                                             |
| -------------------------- | ---------------------------------------------------------------- |
| facade                     | `packages/time/src/facade.ts`                                    |
| primitives re-export/types | `packages/time/src/types.ts`                                     |
| codec/brand                | `packages/time/src/codec/**`                                     |
| clock                      | `packages/time/src/clock/**`                                     |
| calendar                   | `packages/time/src/calendar/calendar.ts`                         |
| format                     | `packages/time/src/format/**`                                    |
| input                      | `packages/time/src/input/input.ts`                               |
| timezone                   | `packages/time/src/timezone/time-zone.ts`                        |
| engine                     | `packages/time/src/engine/date-fns-engine.ts`                    |
| recurrence                 | `packages/time/src/recurrence/**`                                |
| governance                 | `tools/governance/time-registry.json`                            |
| primitives                 | `packages/contracts/src/primitives/{instant,ymd,hm,duration}.ts` |

## Target convergence docs

- `docs/analysis/2026-09-09-time-vnext-current-system-map.md`
- `docs/analysis/2026-09-09-time-label-reference-and-reuse-ledger.md`
- `docs/architecture/time-label-vnext-foundations.md`
- `docs/architecture/adr/ADR-100-product-time-context-and-timezone-aware-calendar.md`
- `docs/architecture/adr/ADR-101-product-time-presentation-and-compatibility-surface.md`
- `docs/plan/active/2026-09-09-time-label-vnext-model-convergence.md`

这些 target docs 尚未表示生产代码已经完成第二轮收敛。
