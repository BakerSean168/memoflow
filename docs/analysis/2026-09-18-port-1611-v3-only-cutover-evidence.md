# PORT-1611 — Data Portability V3-only cutover evidence

Date: 2026-09-18
Canonical base: `origin/feat/system-wide-vnext-convergence` at
`2685213e5210964a72970275d626da688e9d247a`

This document is the Stage A coverage proof and the closure record for
PORT-1611. It is intentionally based on the source currently registered at
the canonical base, not on examples in older ADRs.

## Preconditions

The dedicated worktree/branch was based on the latest remote branch. The
following prerequisite merges are ancestors of the base:

| prerequisite | merge | ancestry |
| --- | --- | --- |
| PORT-1610B | `b428856d737f2d2b9f212a6a29bd990e11ebd39e` | verified |
| HOME-1805 | `3e8a336d73c9c98e2f614e0f694d6056cf98f55f` | verified |
| AI-9612 / PR #378 | `c4e2fc0821f77435de09e1a5036bd7170d189441` | verified |

The pre-change `pnpm nx run data-portability:test` baseline passed: 36 test
files and 152 tests.

## Stage A — complete coverage ledger

The former V2 full-backup exporter is
`packages/data-portability/src/server/application/use-cases/export-user-data.use-case.ts`.
Its source branches and their owner destinations were reviewed before any
V1/V2 deletion.

| former V2 fact or branch | classification | V3 coverage or disposition |
| --- | --- | --- |
| `settings` projected from user preferences | surviving importable owner fact | `preferences@3`; `PreferencePortableCapability` in `packages/setting/src/server/preferences/preference-portability.ts`, using `PreferencePortablePayloadV3Schema` |
| `notificationPreference` delivery/workflow settings | surviving importable owner fact | `notification-delivery-preferences@3`; `NotificationDeliveryPreferencePortableCapability` in `packages/notification/src/server/application/notification-preference-portability.ts` |
| goals, key results, reviews and goal records | surviving importable owner fact | `goals@3`; `GoalPortableCapability` in `packages/goal/src/server/application/goal-portability.ts`, depends on `labels` |
| task plans, occurrences and checklist/goal references | surviving importable owner fact | `tasks@3`; `TaskPortableCapability` in `packages/task/src/server/application/task-portability.ts`, depends on `labels` and `goals` |
| canonical calendar entries and their title/description/location/attendees | surviving importable owner fact | `schedules@3`; `SchedulePortableCapability` in `packages/schedule/src/server/application/schedule-portability.ts` |
| AI conversation portable shell (name/status/reference) | surviving importable owner fact | `ai-conversations@3`; `AIConversationPortableCapability` in `packages/ai/src/server/application/ai-conversation-portability.ts` |
| repository/folder/resource projection | intentionally retired non-portable projection | no V3 capability; the persistence-shaped V2 projection is retired under ADR-106/ADR-111 |
| schedule `duration`/`priority` projection metadata | intentionally retired non-portable projection | canonical schedule range is owned by `schedules@3`; these old projection fields are not restored |
| AI persistence timestamps/transcript/runtime metadata | intentionally retired non-portable/runtime data | only the owner-defined AI V3 shell is portable |
| V2 `reminders` selector | intentionally retired/empty V2 branch | no V2 exporter branch produced data; canonical routine facts are `routines@3` |
| labels | surviving importable owner fact present in the current product | `labels@3`; `LabelPortableCapability` in `packages/label/src/application/label-portability.ts` |
| account profile | surviving importable owner fact present in the current product | `account-profile@3`; `AccountProfilePortableCapability` in `packages/account/src/server/application/account-portability.ts`, depends on `preferences` |
| routine definition/profile/membership, trigger, override and durable occurrence resolution facts | surviving importable owner fact present in the current product | `routines@3`; `RoutinePortableCapability` in `packages/reminder/src/server/application/routine-portability.ts` |
| notification fact/inbox lifecycle and typed interaction/presentation hints | surviving importable owner fact present in the current product | `notifications@3`; `NotificationPortableCapability` in `packages/notification/src/server/application/notification-portability.ts` |
| scheduler/outbox/audit, notification delivery/outbox/device state, runtime context, secrets, credentials, database ids and host identity | intentionally retired runtime/secret/credential/host data | no V3 capability; host identity and database ids are allocated by the destination, and import field blacklists remain enforced |
| server-held knowledge/repository disclosure and cached bytes | server-held disclosure-only | `server-held-data-disclosure` export path; `importMode: not-importable`, `includesImportableBusinessDataBackup: false`; never a V3 capability or import payload |

The conclusion at the deletion gate is **coverage complete**: every
surviving product fact is either owned by a registered V3 capability or is
explicitly disclosure-only/non-portable. No compatibility bridge, migration,
backfill or legacy reader is required or permitted by ADR-111.

## Registered capability parity

The API and Desktop composition roots register the same ten owner capabilities
in the same semantic order. Their source implementations currently declare
these exact keys, schema versions and dependencies:

| key | schema | dependencies |
| --- | ---: | --- |
| `account-profile` | 3 | `preferences` |
| `preferences` | 3 | none |
| `notification-delivery-preferences` | 3 | none |
| `routines` | 3 | none |
| `schedules` | 3 | none |
| `notifications` | 3 | none |
| `labels` | 3 | none |
| `goals` | 3 | `labels` |
| `tasks` | 3 | `labels`, `goals` |
| `ai-conversations` | 3 | none |

The registry resolves dependencies deterministically, so the effective order
for a complete export/import is `preferences`, `account-profile`,
`notification-delivery-preferences`, `routines`, `schedules`, `notifications`,
`labels`, `goals`, `tasks`, `ai-conversations`. API and Desktop must continue
to pass the same semantic set to the same V3 registry; no transport DTO may
reintroduce a persistence-shaped projection.

## Stage B/C closure record

The cutover was completed as one atomic change. The deleted production
inventory is:

- V1/V2 API and domain DTOs, old envelopes, export/import events and maps,
  V2 full-backup use cases, importers, persistence-shaped projectors and
  projection helpers;
- the Data Portability import-store ports and Prisma/PowerSync adapters,
  portable-runtime/sanitization seams, and their compatibility fixtures;
- `/import`, legacy RPC/event/IPC entries, old HTTP/IPC client DTOs and calls,
  and dead owner projection adapters that had no current consumer;
- the stale task surface fixture that referenced the deleted V2 DTO, rewritten
  to assert the current owner capability contract.

The retained production inventory is:

- the owner-defined `PortableCapability` contracts and the ten current V3
  capabilities listed above;
- the V3 envelope/registry/coordinator, exact capability/schema validation,
  deterministic dependency/reference resolution, dry-run/apply receipts,
  conflict handling, and host identity/secret/credential blacklists;
- API and Desktop V3 `/export`, `/dry-run`, `/apply` and equivalent IPC
  surfaces, with matching registry composition;
- the server-held disclosure path and its V1 disclosure envelope solely for
  disclosure export. Its transport explicitly reports
  `importMode: not-importable` and
  `includesImportableBusinessDataBackup: false`; it is not a V3 capability and
  no import/apply path parses it.

## Verification

The required product and host checks passed after the cutover:

| command/check | result |
| --- | --- |
| `pnpm nx run data-portability:test` | 16 files, 68 tests passed |
| `pnpm nx run data-portability:typecheck` | passed; 20 dependent targets passed |
| `pnpm nx run api:typecheck` | passed; 27 dependent targets passed |
| `pnpm nx run desktop:typecheck` | passed; 31 dependent targets passed |
| `pnpm nx run app-vue:test --skip-nx-cache` | 198 files, 789 tests passed |
| `pnpm nx run app-vue:typecheck` | passed; 28 dependent targets passed |
| `pnpm nx run web:test --skip-nx-cache` | 17 files, 71 tests passed |
| `pnpm nx run web:typecheck` | passed; 29 dependent targets passed |
| owner package capability tests (`contracts`, `account`, `setting`, `notification`, `reminder`, `schedule`, `label`, `goal`, `task`, `ai`) | passed; final AI run 88 files/404 tests, with all other owner package runs passing after the task fixture update |
| API composition parity tests | 2 files, 11 tests passed |
| Desktop V3 IPC portability test | 1 file, 4 tests passed |
| `pnpm docs:check` | passed |
| `pnpm governance:check` | passed |
| `pnpm test:inventory` | passed; 1,182 files indexed |
| `git diff --check` | passed |

The focused and package tests cover V3 export completeness, export/dry-run/apply
round trips with references, dry-run non-mutation, exact version mismatch,
unknown/missing capability and malformed payload rejection, deterministic
dependency/reference resolution, identity/secret exclusion, disclosure
non-importability, and unsupported V1/V2 backup input without a parser or
migrator.

## Residue scan

The production authority scan was deliberately scoped to Data Portability
names and paths, excluding tests/specs and allowing unrelated domain names:

```text
rg -n --glob '!**/__tests__/**' --glob '!**/*.spec.ts' --glob '!**/*.test.ts' \
  '(^|[^A-Za-z])(ExportUserData|ImportUserData|UserDataExportEnvelopeV2|PortableUserDataV2|ExportableModule|DataPortabilityEvent|updatedSingletons|data-portability:(import|export-v2)|data-portability/import|create(Prisma|PowerSync)DataPortability|DataPortabilityImportStore|PowerSyncDataPortability|PrismaDataPortability)([^A-Za-z]|$)' \
  packages apps
```

Result: **0 production Data Portability V1/V2 authority hits** and **0
retired V1/V2 source paths**. A separate focused scan reports only the
retained server-held disclosure V1 schema/source and the generic API path
prefix `/api/v1/data-portability`; neither is a user-data import/export
authority. Unrelated AI-provider V2 names and other domain
`schemaVersion: 2` values were not treated as residue.

## Residual non-blocking notes

- Nx reports existing flaky-task notices for shared generated/build targets
  (`contracts:build`, `database:prisma-generate`, and, in Desktop runs,
  `assets:build`); each requested target exited successfully in sequential
  verification.
- Vite emits existing `configLoader: 'native'` warnings.
- CLEAN-2601-owned legacy schema/tables were not touched.
