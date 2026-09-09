---
tags: [analysis, vnext, characterization, baseline]
description: SYS-0001 executable characterization evidence before system-wide destructive convergence
created: 2026-09-09T08:48:00+08:00
updated: 2026-09-09T08:48:00+08:00
---

# System-wide vNext characterization baseline

This file is evidence, not a second execution plan. Cross-module order remains owned by `2026-09-09-system-wide-vnext-model-convergence-implementation.md`.

## Exact baseline

- implementation branch: `feat/system-wide-vnext-convergence`
- parent checkpoint before SYS-0001: `fec9319476fe9a7ac2dd0f8c4a05e41659ab0673`
- Pixel control plane: unavailable on `127.0.0.1:8320`; repository evidence remains canonical and no second writer is created.

## Characterization matrix

| Area                 | Current fact frozen before migration                                                                                                                                                                  | Executable evidence                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Product Time         | legacy engine calendar semantics still follow process timezone; explicit IANA wall-clock conversion is host-independent; current New York DST gap shifts forward and overlap picks earlier occurrence | `packages/time/src/__tests__/host-timezone-characterization.spec.ts`, recurrence conformance suite                                  |
| Account / Cloud Auth | Account closure is a durable coordinator operation; cloud sessions are revoked/disabled; raw Better Auth endpoints fail closed for closing/closed accounts                                            | `account-closure-coordinator.integration.spec.ts`, `express-auth-closure.integration.test.ts`, account closure consumer integration |
| Data Portability V2  | server-held disclosure is non-importable; portable user-data import is identity-scoped; legacy Editor rows are still V2 backup compatibility only                                                     | `import-server-held-disclosure-rejected.test.ts`, `portable-editor-backup-boundary.surface.spec.ts`, PowerSync round-trip tests     |
| Knowledge projection | GitHub/Vault projection remains the knowledge read truth and lease/checkpoint/reconciliation behavior is protected                                                                                    | `knowledge-repository-projection.service.spec.ts`, projection ledger integration, local Vault runtime tests                         |
| Dashboard            | `/dashboard` is compatibility redirect only; Home/Goal capsule and API/Desktop AI analytics are the remaining consumers that block package deletion                                                   | `dashboard-retirement-characterization.surface.spec.ts`, `TodayOverviewPanel.spec.ts`, `GoalCapsulePreview.spec.ts`                 |
| Product Governance   | Rule fields that must survive Rule -> Knowledge Standard migration are frozen before writing the migrator                                                                                             | `rule-migration-characterization.spec.ts`, Rule aggregate/revision suites                                                           |
| Editor               | runtime package/API/Electron/editor route stay deleted; only Prisma/PowerSync/Data Portability backup residue remains until V3 portability cutover                                                    | `legacy-editor-repository-runtime.surface.spec.ts`, `portable-editor-backup-boundary.surface.spec.ts`                               |

## Destructive-delete gate

Every legacy surface scheduled for deletion now has one of these two forms of evidence:

1. a behavior/migration characterization suite; or
2. a no-runtime/no-consumer architecture surface assertion.

`tools/governance/vnext-retirement-manifest.json` records the no-return locks. Entries are `staged` until their replacement ticket closes, preventing governance from blocking necessary migration work. Once a replacement is canonical, the corresponding entry is promoted to `active`; reintroducing that retired path then fails governance.

## TIME-1201 compatibility inventory

Before TimeContext introduction, the compatibility surface is explicitly recorded:

- `defaultTime` still has production consumers in Planner projection/owner-command routing, Routine trigger parsing and Goal schedule projection, in addition to Time's own helper exports;
- public `CalendarApi` and `FormatApi` still accept `Instant | number` broadly;
- Codec still exposes explicit JS `Date <-> Instant` infrastructure conversion;
- `FormatApi.dateToYmd` and free `formatDateToYMD` are legacy Date helpers;
- `TimeStyle.timeZone` is metadata for most Calendar/Format paths today, while the underlying Date/date-fns engine remains host-local.

These are migration inventory items, not target API endorsements. TIME-1202..1206 retire them in dependency order.
