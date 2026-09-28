# Routine durable Elapsed scheduler FT

Date: 2026-09-28
Status: implementation complete; dev end-to-end accepted
Branch: `ui/remote-dev-vite83`
Execution: current worktree only; no new branch/worktree.

## Goal

Split Routine timing ownership by business semantics:

```text
WallClock                       -> Scheduler
Elapsed(last-satisfied)         -> Scheduler
Elapsed(routine-activation)     -> Scheduler
Elapsed(profile-activation)     -> local runtime
ActiveUsage                     -> local runtime + ActivitySensor
```

## Scope

- Derive Elapsed timing owner from anchor semantics; persisted stale `timingOwner` is normalized by the domain factory.
- Add durable Routine `activatedAt`: create enabled -> now, disable -> null, re-enable -> now; ordinary edits never reset it.
- Add `routine.elapsed.fire` Scheduler projection/execution with canonical RoutineOccurrence + NotificationRequested.
- Suppress new Elapsed scheduling while a business occurrence remains Open; completion/skip triggers schedule reconcile.
- Desktop local runtime loads only `Elapsed(profile-activation)`; ActiveUsage stays sensor-owned.
- Web/Desktop capability UI follows derived timing ownership.

## Acceptance

1. `last-satisfied + 50 min` schedules on API/Web without Desktop.
2. Completing it anchors the next run to completion time.
3. `routine-activation` uses durable activation time and ordinary edits do not reset it.
4. Disable/re-enable resets that activation anchor.
5. `profile-activation` remains local-only and never gets a durable Scheduler intent.
6. ActiveUsage remains local and OS-idle-sensor based.
7. WallClock and Notification behavior remain unchanged.

## Implemented

- Elapsed ownership is now derived from anchor semantics instead of trusting a broad persisted `timingOwner`:
  - `last-satisfied` and `routine-activation` normalize to `scheduler`;
  - `profile-activation` normalizes to `local-runtime`.
- RoutineDefinition owns a durable `activatedAt` boundary:
  - enabled creation/backfill -> activation timestamp;
  - ordinary edits preserve it;
  - disable clears it;
  - re-enable resets it once.
- Prisma, PowerSync, portability and generated Prisma surfaces carry `activatedAt`.
- `routine.elapsed.fire` is a first-class neutral Scheduler handler with a separate business `dueAt` and actual Scheduler `scheduledFor`.
- Durable Elapsed projection uses RoutineOccurrence truth:
  - Open occurrence -> no second invocation;
  - last-satisfied completion -> new anchor at resolvedAt;
  - routine-activation -> cadence generation advances from durable activation.
- Scheduler execution commits canonical RoutineOccurrence + NotificationRequested and then lets projection converge.
- terminal Routine responses (complete/skip) emit schedule-changed so the next durable Elapsed invocation is rebuilt immediately.
- Desktop local registration now arms only `Elapsed(profile-activation)`; scheduler-owned Elapsed can never run in both cloud and Desktop timers.
- ActiveUsage remains Desktop local and continues to consume the OS idle/activity sensor.
- Web UI no longer marks scheduler-owned Elapsed as Desktop-required; local profile Elapsed and ActiveUsage still show the capability hint.
- Legacy persisted Elapsed JSON with `timingOwner: local-runtime` is normalized from its anchor at read time, avoiding a destructive data migration.

## Verification

Passed:

- `packages/reminder`: full suite, 33 files / 176 tests.
- `packages/reminder`: `tsc --noEmit`.
- `reminder:build`, including Prisma generation and declaration emit.
- `schedule-orchestration:build` with declaration emit.
- Routine projection runtime: 4 tests.
- API Routine / PowerSync focused tests: 7 tests.
- API production typecheck.
- Desktop Routine vertical runtime: 8 tests.
- App Vue Routine + i18n: 12 tests and `vue-tsc`.
- Database durable-activation schema/migration: 2 tests plus Prisma schema validation.
- PowerSync schema: 11 tests.

Dev end-to-end acceptance:

1. The existing Web-created 50-minute `last-satisfied` Routine was read from its legacy persisted trigger JSON and normalized to scheduler ownership.
2. Startup projection created a `routine.elapsed.fire` invocation using the durable activation anchor.
3. The Scheduler handler executed successfully.
4. A canonical Elapsed RoutineOccurrence was committed.
5. A durable `notification.requested` message was written and dispatched.
6. A `routine.intervention` Notification Fact was created unread in the Notification system.
7. Because the occurrence is still Open, the Scheduler desired set is now empty by design; completing/skipping it will re-anchor/reconcile the next invocation.

Known unrelated branch blockers:

- full Desktop typecheck still has pre-existing Goal `startDate` mock drift and Repository live-projection interface errors;
- schedule-orchestration test-inclusive typecheck still sees a pre-existing Goal reminder test payload `startDate` mismatch.

The production builds for the changed Reminder/Schedule Orchestration path succeed despite those unrelated test-surface errors.
