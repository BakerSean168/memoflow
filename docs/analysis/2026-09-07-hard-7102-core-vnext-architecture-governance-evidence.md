---
tags:
  - memoflow
  - core-vnext
  - hardening
  - governance
  - scheduler
description: HARD-7102 architecture governance locks — residual removal, executable boundary audit, and verification evidence
created: 2026-09-07T18:40:00+08:00
updated: 2026-09-07T18:40:00+08:00
---

# HARD-7102 — Core vNext architecture governance evidence

## Decision

`HARD-7102` is complete. Core vNext architecture boundaries are now enforced by an executable production-source audit rather than remaining documentation-only rules.

The work did not add compatibility shims. It first removed the real residual paths found by the audit, then added anti-resurrection governance.

## Residuals removed before locking

### Goal / Task no longer own a `ScheduleTask` execution adapter

The old Goal/Task `schedule-execution-source` seams were private compatibility adapters over the Scheduler aggregate and had no remaining product consumer. They were removed instead of whitelisted:

- deleted Goal and Task `schedule-execution-source.ts` implementations and tests;
- removed Prisma / PowerSync factory exports and Electron/infrastructure re-exports;
- removed the direct `@memoflow/scheduler` dependency from both package manifests and the lockfile;
- retained the canonical handler-key + neutral projection surfaces (`ScheduledIntent` / scheduled-handler registration);
- converted ownership tests into anti-resurrection checks.

### Reminder trigger scanning is retired

The production `ReminderSchedulerService` / cron runtime facade was still able to scan due templates independently even though Scheduler is the sole wall-clock authority. The scanner was deleted:

- removed `reminder-scheduler-service.ts` and its unit test;
- removed the legacy Reminder cron runtime contribution and exports;
- removed `getPendingReminders()` from the trigger service;
- removed scanner-specific integration cases whose purpose was to validate the obsolete polling path.

`findByNextTriggerBefore()` intentionally remains on the Reminder repository because Dashboard uses it as a read-only upcoming-reminder query. It does not execute or claim reminders.

### Notification no longer accepts the cross-domain `notification.dispatch` bypass

Cross-domain producers now have exactly one durable entrance:

```text
notification.requested
  -> CreateNotificationUseCase
  -> NotificationPolicy / DeliveryPlan
  -> per-channel durable dispatchOutbox
  -> delivery worker
```

Removed:

- `NOTIFICATION_DISPATCH_MESSAGE_TYPE`;
- shared-outbox claiming of `notification.dispatch` in Prisma / PowerSync / in-memory adapters;
- runtime conversion from `notification.dispatch` directly into Notification/Channel objects;
- compatibility logic that could therefore bypass Notification policy planning.

The Notification-owned `dispatchOutbox()` remains. It is the canonical internal durable per-channel delivery mechanism after policy planning.

### Scheduler product surface remains diagnostics-only

Stale Web MSW mocks advertised raw worker mutation endpoints that the production Scheduler no longer exposes. Those fake create/batch/pause/resume/complete/cancel/metadata/delete endpoints were deleted. The Web Scheduler mock surface now contains only read-only diagnostics GETs.

### Scheduler timezone creation is explicit

`ScheduleConfig.createDefault()` no longer silently defaults to `Asia/Shanghai`; callers must supply an explicit validated timezone. `Timezone.Shanghai` remains a legal IANA value, and locale/account defaults are not treated as Scheduler execution fallback.

## Executable governance lock

Added:

- `tools/governance/lib/core-vnext-architecture-lock.mjs`;
- `tools/governance/core-vnext-architecture-lock-audit.mjs`;
- `tools/governance/__tests__/core-vnext-architecture-lock.test.mjs`;
- root `memoflow:governance-check` registration.

The gate fail-closes on all eight HARD-7102 rules:

1. Goal / Task / Routine production code cannot import the Scheduler aggregate/runtime package;
2. Scheduler core cannot import Goal / Task / Routine / Notification domains;
3. `SourceModule` cannot choose execution behavior (`switch` / feature branch); it is metadata/diagnostics only;
4. scheduling execution cannot silently fall back to `Timezone.Shanghai` / `Asia/Shanghai`;
5. Reminder cannot resurrect its own trigger scanner/runtime;
6. cross-domain Notification cannot bypass `NotificationRequested -> NotificationPolicy / DeliveryPlan`;
7. third-party recurrence/calendar imports or DTO types cannot enter `@memoflow/contracts`;
8. UI cannot import Scheduler internals or directly mutate scheduled invocation state.

The same audit additionally locks the already-canonical stricter surface:

- Scheduler HTTP and Electron transport are read-only diagnostics (no raw worker mutations);
- Web mocks cannot advertise raw Scheduler writes absent from production;
- the canonical NotificationRequested runtime and DeliveryPlan tokens are positive requirements, not merely absence checks.

Audit result:

```text
[core-vnext-architecture-lock-audit] passed (1765 production source files audited)
```

Governance fixtures: `5/5` passed, including negative fixtures for every required HARD-7102 boundary family and positive fixtures for legal read-only / handler-key behavior.

## Runtime verification

### Full unit / package suites

| Lane | Result |
| --- | --- |
| Contracts | 68/68 files, 483/483 tests |
| Goal | 79/79 files, 438/438 tests |
| Task | 71/71 files, 730/730 tests |
| Reminder | 72/72 files, 461/461 tests |
| Notification | 45/45 files, 242/242 tests |
| Scheduler | 31/31 files, 273/273 tests |
| Schedule Orchestration | 9/9 files, 34/34 tests |
| Schedule / Calendar | 20/20 files, 129/129 tests |
| App Vue | 201/201 files, 773/773 tests |
| API | 62/62 files, 323/323 tests |
| Desktop | 61/61 files, 322/322 tests |
| Web | 17/17 files, 71/71 tests |

App React has no project test target; its typecheck and lint gates are green.

### Real PostgreSQL integration

| Lane | Result |
| --- | --- |
| Goal integration | 4/4 files, 21/21 tests |
| Task integration | 6/6 files, 31/31 tests |
| Reminder integration | 7/7 files, 28/28 tests |
| Notification integration | 3/3 files, 35/35 tests |
| Scheduler integration | 1/1 file, 5/5 tests |

Notification's first parallel integration attempt hit a PostgreSQL `40P01` while multiple test files concurrently executed the shared `TRUNCATE ... CASCADE` setup. Re-running the same integration config with file parallelism disabled passed `35/35`; there was no Notification business assertion failure.

### Compile / lint / governance

- Contracts, Goal, Task, Reminder, Notification, Scheduler, App React, App Vue, Web, API and Desktop typechecks are green;
- relevant project lint is **0 errors**; repository-existing warnings remain;
- root governance is green after the HARD-7102 audit registration;
- test inventory is current at `1177` files;
- `git diff --check` is green.

During verification, an earlier Desktop Electron run had rebuilt `better-sqlite3` for Electron ABI 148. Node integration tests correctly failed to load that binary under Node ABI 137; `pnpm rebuild better-sqlite3` restored the Node test ABI before the package/integration verification above. This was an environment artifact, not a product assertion failure.

## Hard residual audit

Direct production-source searches are zero for:

- feature-domain imports from `@memoflow/scheduler`;
- Scheduler imports from Goal / Task / Reminder / Notification;
- SourceModule-driven execution switch/case;
- hardcoded Shanghai scheduling fallback;
- Reminder scanner symbols (`ReminderSchedulerService`, `cronContribution`, `getPendingReminders`, legacy runtime contribution);
- `notification.dispatch` / `NOTIFICATION_DISPATCH_MESSAGE_TYPE` bypass;
- third-party recurrence/calendar DTO/import leakage into contracts;
- UI Scheduler-internal imports or direct scheduled-invocation mutation;
- raw Scheduler mutation endpoints in Scheduler transport / Web worker mocks.

## Closure

HARD-7102 is closed. The final-closure chain advances to **HARD-7103 — Full product acceptance journeys**.
