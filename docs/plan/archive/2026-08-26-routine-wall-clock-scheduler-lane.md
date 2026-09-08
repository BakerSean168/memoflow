# ROUTINE-3401 — Routine Wall-Clock Scheduled Handler Lane

> **Archived 2026-08-29:** ROUTINE-3401 and ROUTINE-3402 are implemented and integrated; canonical follow-up remains in the Core vNext umbrella plan.

## Status

ROUTINE-3401 and ROUTINE-3402 implementation complete on the Core vNext continuation lane.
Historical canonical orchestration record: `docs/plan/archive/2026-08-25-core-vnext-orchestration.md`. This lane is archived and must not be resumed as active work.

## Objective

Project each Routine's next **canonical durable wall-clock occurrence** (IANA timezone) as a
one-shot `ScheduledIntent`; execute it through a **registered** `ScheduledHandler` plus the
existing `ReminderOccurrence`-style occurrence fence (lease / idempotency / fencing /
same-transaction commit); durably enqueue a `notification.requested` outbox message; publish a
post-commit event so the projection runtime reconciles the **next** one-shot.

Surfaces satisfied:

- Fixture F: Routine 23:30 wall-clock + snooze → next eligible durable invocation without duplication.
- Only the Scheduler provides durable wake-up (Elapsed/ActiveUsage stay `local-runtime`).
- Occurrence fence preserves ReminderOccurrence idempotency / fencing / next-trigger correctness;
  a crash/retry replay never emits a duplicate notification.

## Existing assets (reused, not rewritten)

- `packages/reminder/src/server/domain/routine/trigger.ts` — `WallClockTrigger` (`timingOwner:'scheduler'`),
  `requiresDurableScheduleProjection`, `nextWallClockOccurrence`, `RoutineTemporaryOverride`
  (`snoozeUntil`/`suppressUntil`), `temporaryOverrideAllowsExecution`.
- `packages/time/src/recurrence/recurrence-engine.port.ts` — `RecurrenceEnginePort.next` (IANA).
- `packages/contracts/schedule` — `SchedulingOwner`, `ScheduledIntent`, `buildSchedulingKey`,
  `ScheduledHandlerRegistration` / `ScheduledInvocationContext` (through `@memoflow/schedule`).
- `packages/schedule-orchestration` — `ScheduledHandlerRegistry`, module seam, runtime contribution
  pattern (goal-projection-runtime), `createHandlerRegistryScheduleTaskSourceExecutor`.
- `@memoflow/utils/domain` — shared `eventBus`, `createTypedEventPublisher`/`createTypedEventSubscriber`.

## New surfaces

### `packages/reminder` (Routine lane owns projection + execution truth)

- `server/domain/routine/next-eligible-occurrence.ts`
  - `computeRoutineNextEligibleOccurrence({ engine, trigger, after, temporaryOverride })` →
    `{ occurrenceAt, occurrenceKey } | null`.
  - Walks `engine.next(...)` skipping candidates inside an active snooze/suppress window
    (expired overrides are neutral per `temporaryOverrideAllowsExecution`).
- `server/infrastructure/routine-schedule/routine-schedule-contract.ts`
  - `ROUTINE_WALLCLOCK_HANDLER_KEY = 'routine.wallclock.fire'`, payload version 1.
  - `RoutineWallClockOccurrencePayload` + `buildRoutineWallClockPayload`/`parseRoutineWallClockPayload`.
  - occurrence key `` `routine:${routineId}:oc:${occurrenceAtMs}` `` (canonical; one per instant),
    scheduling key `buildSchedulingKey('routine.wallclock', routineId, occurrenceKey)`,
    owner type `'routine.routine'`.
- `server/infrastructure/routine-schedule/routine-schedule-projection-source.ts`
  - `RoutineScheduleProjectionSource` interface: `buildRoutineOwner`, `buildRoutinePlan`,
    `listRoutineRefs?`.
  - `createRoutineScheduleProjectionSource({ reader, recurrenceEngine, now? })` — reader supplies
    `{ definition, temporaryOverride }` (definition from W2 domain model; snooze = runtime state
    injected in tests, production default null until W4).
  - Gates: `definition.enabled`, scheduler-owned trigger, occurrence strictly after `now`.
  - `createRoutineScheduleProjectionEventHandlers(projector)`: `routine:occurrence-committed` →
    re-project that routine (post-commit next one-shot).
- `server/domain/ports/routine-occurrence-store.port.ts`, `routine-notification-writer.port.ts`
  - Durable occurrence row with lease/fencing/idempotency (mirrors ReminderReliableOperation).
  - Notification writer writes `notification.requested` with idempotency key derived from
    `occurrenceKey`.
- `server/infrastructure/routine-schedule/routine-schedule-execution-source.ts`
  - `RoutineScheduleExecutionSource.executeRoutineOccurrence(input)`.
  - Transaction shape (single commit): revalidate effective state → claim/fence → write history +
    advance trigger (next eligible) + `notification.requested` outbox → terminal status under
    commit-time fencing → publish `routine:occurrence-committed` after commit.
- `server/infrastructure/routine-schedule/routine-wall-clock-scheduled-handler.ts`
  - `createRoutineWallClockScheduledHandler({ executionSource })` —
    `ScheduledHandlerRegistration` (validate payload; map outcome to succeeded/skipped/
    dead_letter; thrown error → registry retryable).
- In-memory `RoutineOccurrenceStore` for tests; Prisma adapter deferred behind the same port
  (production wiring once W3 routine CRUD exists; no schema change in this phase).

### `packages/schedule-orchestration`

- `projectors/routine-projector.ts` — `createRoutineProjector({ source, schedulingPort })`.
- `runtime/routine-projection-runtime.ts` — subscribes `routine:occurrence-committed`, startup
  reconcile via `listRoutineRefs?` (mirrors goal runtime).
- `ports/projection.ts` + `module.ts` — optional `routineProjection` and `execution.routineSource`;
  when present, register the routine handler on the registry and add the routine runtime.

## Tests

- `next-eligible-occurrence.spec.ts` — Fixture F IANA 23:30 resolution; snooze skip; expiry neutral.
- `routine-schedule-projection-source.test.ts` — plan build; disabled/Elapsed/ActiveUsage → `[]`;
  snooze → next eligible; `listRoutineRefs`.
- `routine-schedule-execution-source.test.ts` — claim idempotency, stale fencing, replay no-dup
  notification, next-trigger advance, publish-on-commit.
- `routine-wall-clock-scheduled-handler.test.ts` — payload validation, outcome mapping, registry
  lookup via `ScheduledHandlerRegistry`.
- `schedule-orchestration` `__tests__/routine-projection-runtime.test.ts` — start reconcile +
  post-commit reprojection (mirrors goal runtime test).

## Ordering / ownership

1. Pure occurrence computation (unit-tested first — no infra).
2. Contract + projection source.
3. Execution source + fence store.
4. Handler.
5. Seam exports.
6. schedule-orchestration wiring + runtime.
7. Tests across both packages; focused `lint`/`typecheck`/`test`.

## Residuals

- Production routine CRUD (later Wave 4/5 tickets) remains separate from the wall-clock authority
  cutover; first-class Routine definitions are still not a replacement source for legacy
  `ReminderTemplate` CRUD in this phase.
- The legacy `ReminderSchedulerService` domain class remains as compatibility code for later cleanup,
  but no production composition root starts it as a clock authority.
- `createReminderTriggerCronRuntime` keeps its exported name temporarily for forensic tooling, but it
  now wraps only the read-only due-set shadow and cannot execute the retired write path.

## Phase status (2026-08-26)

Implementation complete and committed: domain occurrence gate, projection source, occurrence
fence store (in-memory) + notification writer, execution source, registered handler, narrow
seams (`schedule-projection/routine`, `schedule-execution/routine` + full-seam exports), and the
schedule-orchestration module wiring (`routineProjection` / `execution.routineSource` optional
seams). Tests: `packages/reminder` full suite 478/478 (18 new on the routine lane, plus 5 on the
domain occurrence gate); `packages/schedule-orchestration` 18/18 (3 new runtime tests). Both
package `tsc` outputs are unchanged relative to the pre-existing baselines (reminder 246
pre-existing path-mapping errors; schedule-orchestration dist-based module-resolution errors) —
no new type errors from the routine lane.

## ROUTINE-3402 closure (2026-08-27)

The dual wall-clock authority has been removed from production composition:

- `apps/api/src/runtime/compose-reminder.ts` no longer creates or starts the legacy Reminder cron.
- Legacy `ReminderTemplate` wall-clock timing continues through the already-existing
  Reminder → `ScheduleTask` projection/execution seam; the shared Scheduler is therefore the only
  production wake-up authority.
- `createReminderTriggerCronJob` is retained only as a fail-safe read-only shadow diagnostic. It may
  read `findByNextTriggerBefore`, compare against a Scheduler due-set reader, and emit structured
  mismatch diagnostics; it has no `ReminderSchedulerService`, `ReminderTriggerService`, transaction,
  reliable-writer, history-write, next-trigger advance, claim, or notification-dispatch dependency.
- The shadow comparator reports legacy-only rows, Scheduler-only rows, timing mismatches, and duplicate
  projection identities. Both sides are deterministically ordered by due time plus identity/source key
  before sampling, avoiding false mismatches at the comparison limit.
- `createReminderSchedulerDueSetReader` filters the shared Scheduler due set to `SourceModule.Reminder`
  before applying the comparison limit, so unrelated Goal/Task/Routine work cannot hide Reminder rows.
- A production surface test prevents either legacy cron factory from being wired back into API startup.
- A due-set parity matrix (`packages/schedule-orchestration/__tests__/reminder-due-set-parity.test.ts`)
  drives the real shadow runtime + real Scheduler due-set reader against a shared in-memory world and
  asserts equivalent due sets for the former cron and the Scheduler across restart, snooze, pause,
  and two-worker (concurrent fence) scenarios, plus deterministic limit truncation and a drift-detection
  case proving the comparison is not vacuous.

Verification evidence on the recovered batch-3 base:

- `@memoflow/reminder`: 66 files / **490 tests passed**.
- `@memoflow/schedule-orchestration`: 10 files / **33 tests passed**.
- `@memoflow/schedule`: 45 files / **399 tests passed**.
- `reminder`, `schedule-orchestration`, `schedule`, and `api` typecheck passed together with their Nx
  dependency graph.
- Existing Routine execution tests continue to cover lease takeover/restart recovery, stale fencing,
  concurrent double-dispatch with no duplicate notification, snooze/suppress skips, and disabled
  projection; Scheduler runtime tests cover lease/runtime restart and pause/disabled execution gates.

Acceptance result: **only Scheduler wakes durable wall-clock Reminder/Routine work in production**;
legacy cron behavior is observation-only and is not part of host startup.
