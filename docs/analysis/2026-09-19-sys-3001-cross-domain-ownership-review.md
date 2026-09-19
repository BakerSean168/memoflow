---
tags: [analysis, architecture, convergence, ownership, vnext]
description: SYS-3001 post-CLEAN-2601 cross-domain ownership, residue, and exception review
created: 2026-09-19T00:00:00Z
updated: 2026-09-19T00:00:00Z
---

# SYS-3001 — Cross-domain ownership and residue review

Date: 2026-09-19
Scope: post-CLEAN-2601 canonical convergence only
Starting head: `95ac4f7dc28e5e0c64c062c6962e99983dd378ac`
Worker branch: `delegated/sys-3001-ownership-review-luna`

This review does not reopen an accepted owner model, start SYS-3002, or alter
the schema. It checks the actual source, package manifests, build/type path
maps, Prisma/PowerSync surfaces, and current tests against the canonical
system-wide plan, ADR-067..111, the governance/architecture standards, and the
CLEAN-2601 evidence. Where documentation and code differed, code was treated
as truth.

## Review method and result

The review checked:

- production imports and package dependency declarations for forbidden
  cross-owner edges;
- `tsup` and `tsconfig` references that could recreate a deleted seam;
- exact retired identifiers in production source, excluding tests, historical
  evidence, migrations, and negative anti-resurrection fixtures;
- Prisma/PowerSync ownership and the post-CLEAN-2601 deleted persistence
  surface;
- cross-owner projections, host composition, portability capabilities, and
  account-closure consumers for owner, reason, and retirement metadata.

The new executable check is
`tools/governance/cross-domain-ownership-audit.mjs`. Its checked-in manifest
locks the production edges and validates the exception ledger. It deliberately
does not forbid current Knowledge/GitHub `repository` identity, `repositoryId`,
or AI's stable `fetchResource` protocol key: those are active current
contracts, not the deleted local Repository/Folder/Resource model.

## Re-run ownership matrix

| Concern | Canonical owner | Observed post-CLEAN-2601 boundary | Review disposition |
| --- | --- | --- | --- |
| Cloud credentials, sessions, provider identity | Better Auth / Cloud Auth | Account uses a structural revocation port; host supplies cloud behavior | No forbidden production import; documented structural-port exception |
| Product account/profile/lifecycle | Account | Account owns profile, closure, and closure event publication | Clean after removing stale production package declarations |
| Presentation, regional, and timezone preferences | Setting / Preferences | Typed preference namespaces and Product Time ports remain separate from Account | No duplicate `Account.settings` surface; retired vocabulary scan clean |
| Product time and recurrence math | Product Time | Owner packages use `@memoflow/time`; no host-time fallback was introduced | Clean; existing time governance remains authoritative |
| Label identity and assignments | Label Registry plus Goal/Task links | Owner commands/read projections remain narrow | No cross-owner persistence model found |
| Goal direction and measurement | Goal | Goal exports schedule/read projections and owns progress facts | Removed stale Goal → Schedule/Task package declarations; projection ports remain |
| Task action plan | TaskPlan | Task owns plans, links, and scheduling intent | Removed stale Task → Schedule declaration; current plan language retained |
| Task happened execution | TaskOccurrence | Task owns occurrence persistence and command lifecycle | No `TaskInstance` type/import; current UX wording was not renamed speculatively |
| Routine behavior and intervention | RoutineDefinition/Profile | Routine package owns routine projections/execution | Removed stale Routine → Schedule declaration; active Routine vocabulary retained |
| Planner/calendar projection | Schedule / Planner | Owner projection ports feed schedule orchestration | Schedule orchestration remains an explicit permanent composition exception |
| Durable wake-up/invocation | Scheduler | Scheduler owns `ScheduledInvocation` and attempts only | Notification no longer declares Scheduler as a production dependency |
| Notification fact/inbox | Notification | Notification owns fact, preference, interaction, and requested flow | No legacy template/channel authority; test-only Scheduler edge moved to devDependencies |
| Notification delivery policy/runtime | Notification delivery | Delivery decisions/outbox/runtime remain inside Notification | No direct owner import or duplicate delivery model found |
| Knowledge content and stable identity | Vault/Git plus Knowledge projection | Current external GitHub repository and `KnowledgeDocumentId` contracts remain | Retired local persistence removed by CLEAN-2601; active repository vocabulary explicitly preserved |
| AI runtime/context/workflow | Mastra / AI | AI consumes narrow contract/read ports and host adapters | Removed unused AI → Repository/Setting production declarations; no owner package import |
| Data portability orchestration | Data Portability | Host registers ten owner capabilities; server disclosure uses one dedicated DB source | Removed all direct owner package declarations and `tsup` references |
| Home overview composition | UI composition plus owner read models | No Dashboard bounded context or cross-domain activity ledger | No reintroduced Dashboard/ActivityLedger source token |
| Governance rule/revision reference state | Governance | `Rule`/`RuleRevision` remains the permanent reference feature | No deletion or duplicate rule authority |
| Host/module construction | `apps/api`, `apps/desktop` | Composition roots wire owners and adapters | Permanent host-composition exception, explicitly documented |

## Severity and root-cause ledger

Severity uses the SYS-3001 scope: P1 means an architecture boundary or
portable persistence seam could be reintroduced; P2 means verified residue or
governance drift with no current runtime authority; P3 means historical or
intentional vocabulary that is not a defect.

| ID | Severity | Finding and evidence | Root cause | Disposition |
| --- | --- | --- | --- | --- |
| OWN-001 | P1 | `packages/data-portability/package.json` declared Goal, Task, Knowledge, Schedule, AI, Notification, and Setting as production dependencies; `tsup.config.ts` repeated those owner references. No source import used them, but the manifest/build seam made portability look persistence-shaped and allowed owner coupling to return. | V3 capability migration removed runtime consumers but left the earlier all-module dependency scaffold. | Repaired: removed the seven production declarations and all seven build references. The new audit fails if any return. |
| OWN-002 | P2 | Account declared Cloud Auth, Routine, Notification, and Knowledge packages in production; only the structural account port is used by production. Closure integration tests legitimately import the public consumer modules. | Host-composed test consumers were classified as runtime dependencies and unused Cloud Auth path aliases survived cleanup. | Repaired: removed Cloud Auth and moved the three test-only consumers to `devDependencies`; removed stale account path aliases. |
| OWN-003 | P2 | AI declared Repository and Setting in production but has only narrow contract/read ports and host adapters. | Old AI owner wiring was left in the package manifest after the owner-port convergence. | Repaired: removed both production declarations. |
| OWN-004 | P2 | Goal/Task/Routine each retained a production Schedule declaration and build external despite no production import. | Legacy package/build scaffolding survived the schedule projection cutover. | Repaired: removed declarations and `tsup` references. |
| OWN-005 | P2 | Notification retained PowerSync Schema and Scheduler as production dependencies; only integration/surface tests use them. | Infrastructure/test imports were not classified as test-only after notification fact/delivery separation. | Repaired: moved both to `devDependencies` and removed the stale PowerSync `tsconfig` path. |
| OWN-006 | P2 | `app-react` declared Repository/Scheduler without source imports; `app-vue` declared Cloud Auth without source imports. | App package dependency lists were broader than the actual current host/UI boundaries. | Repaired: removed the three unused declarations. Active app owner imports remain unchanged. |
| OWN-007 | P2 | `schedule-orchestration` declared Schedule and retained Schedule `tsconfig`/DTS path maps although it composes Goal, Task, Routine, and Scheduler ports directly. | The neutral orchestration package retained an unused legacy package edge in build configuration. | Repaired: removed the dependency and both path-map blocks; Goal/Task/Routine/Scheduler composition remains intact. |
| OWN-008 | P2 | App-vue locale files contained unreferenced local Repository/Folder/Resource CRUD strings (`fileTreePanel`, resource details/create flows, old AI knowledge folder flow, folder menu actions, resource-management copy, and `reindexResource`). | UI surface retirement removed components but did not remove their locale seams. | Repaired: removed only keys proven unreferenced; active Knowledge projection strings and stable `fetchResource` protocol wording remain. |
| OWN-009 | P2 | Exact retired production identifiers (`TaskTemplate`, `TaskInstance`, `ReminderTemplate`, `ReminderGroup`, `ScheduleTask`, `ScheduleExecution`, `NotificationTemplate`, `NotificationChannel`, `UserSetting`, `ActivityLedger`, `DashboardData`) were checked across app/package source. | No verified current production occurrence; historical names are confined to intentional evidence, tests, migrations, and governance locks. | No code repair required. The executable vocabulary lock prevents reintroduction without flagging current negative fixtures only when they enter production source. |
| OWN-010 | P2 | Prisma/PowerSync duplicate authorities and CLEAN-2601 deleted persistence families were rechecked against the final schema/evidence. | None found after accepted CLEAN-2601. | No schema change. Governance and existing anti-resurrection locks remain the control. |
| OWN-011 | P2 | Forbidden production imports between the reviewed owner packages were rechecked after the manifest repairs. | None found. Remaining cross-domain references are contracts, explicit ports, projections, host composition, or tests. | No further repair; exceptions are listed below. |
| OWN-012 | P3 / accepted | Current Knowledge uses external GitHub repository identity and routes; Task UX/docs use template/instance language around current TaskPlan/TaskOccurrence behavior. | These are active product/protocol terms, not retired persistence types. | Preserved. Renaming them would reopen accepted architecture or change valid current terminology. |

No unresolved P0, P1, or P2 ownership/residue defect remains in the reviewed
scope.

## Repairs made

- Removed stale production owner dependencies and build/path references from
  Account, AI, Data Portability, Goal, Task, Routine, Notification,
  `app-react`, `app-vue`, and `schedule-orchestration`.
- Classified Account and Notification integration-only package edges as
  dev-only dependencies.
- Removed verified dead locale seams for the retired local
  Repository/Folder/Resource UI while preserving active Knowledge/GitHub
  projection keys and the `fetchResource` tool protocol label.
- Added `cross-domain-ownership-manifest.json` and the corresponding audit,
  pure library, and fixture tests. Governance now machine-checks production
  dependency/import/configuration residue, exact retired identifiers, and
  exception metadata.
- Regenerated `pnpm-lock.yaml` from the package manifests. No schema,
  migration, compatibility alias, backfill, redirect, or dual-read/write path
  was added.

## Surviving exceptions

Every exception below has an owner, reason, retirement policy, and permanent
architecture justification in the executable manifest. `permanent` means the
exception is an intentional boundary, not an untracked TODO.

| Exception | Owner | Reason | Retire-by | Architecture justification |
| --- | --- | --- | --- | --- |
| Host composition roots | `apps/api`, `apps/desktop` | Wire owner modules and adapters at the application boundary | permanent | Host-composer architecture keeps construction outside feature owners |
| Schedule orchestration projection | `@memoflow/schedule-orchestration` | Compose Goal/Task/Routine projections with neutral Scheduler invocation | permanent | ADR-060/061 and ADR-081..083; no product persistence truth is owned here |
| Portability disclosure source | `@memoflow/data-portability` | Read server-held disclosure data through its dedicated infrastructure port | permanent | ADR-106; owner capability registry remains the V3 portable data path |
| Account closure structural consumers | `@memoflow/account`, `apps/api` | Publish lifecycle cleanup ports and inject Routine/Notification/Knowledge consumers | permanent | Account remains lifecycle owner without importing consumer implementations |
| AI owner read contracts | `@memoflow/ai` | Consume narrow Goal/Task/Planner/Knowledge/Notification contract projections | permanent | Canonical matrix and ADR-108 allow read projections, not persistence/command imports |
| External Knowledge repository identity | `@memoflow/repository` | Preserve GitHub repository identity/routes for current Knowledge projection | permanent | Accepted Knowledge architecture; not deleted local Repository/Folder/Resource persistence |
| Integration-test composition | Account/Notification integration tests | Verify cross-owner public server consumers and Scheduler-to-fact behavior | permanent | Test-only composition is isolated in `devDependencies`; production locks do not permit it |

## Governance and verification record

The new check is wired into `memoflow:governance-check`; its manifest is also
covered by the governance-tool test target. The exact minimum-gate results for
this commit are recorded here after the final run:

| Gate | Result |
| --- | --- |
| Governance (`pnpm nx run memoflow:governance-check --skip-nx-cache`) | passed; ownership audit reported 10 owner locks, 11 vocabulary locks, and 7 exceptions |
| Docs (`pnpm docs:check`) | passed |
| Repository-wide typecheck (`pnpm typecheck`) | passed; 37 projects / 31 tasks |
| Affected unit tests | passed; 9 projects |
| Affected integration tests | passed; 5 projects, 119 tests |
| Affected production builds | passed; 9 projects / 20 tasks including dependencies |
| Test inventory/check | passed; 1,184 files: 1,017 unit, 34 integration, 3 smoke, 8 boundary-ipc, 6 boundary-main, 57 e2e, 1 perf, 58 governance |
| Diffcheck (`git diff --check`) | passed |
| Direct ownership audit | passed: 10 owner locks, 11 vocabulary locks, 7 exceptions |

The final commit SHA is reported with the implementation handoff. No push,
PR, merge, or SYS-3002 work is part of this review.
