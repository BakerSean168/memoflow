---
tags:
  - plan
  - handoff
  - core-vnext
  - scheduling
  - contract-train
  - schema-train
  - orchestration-train
description: SCHED-1101..1105 shared-train handoff, now resolved by the Wave 1 integration train.
created: 2026-08-25T20:03:00+08:00
updated: 2026-08-25T21:25:00+08:00
---

# Core vNext Scheduling Foundation — Shared Train Handoff

> **RESOLVED IN WAVE 1 INTEGRATION.** The sections below preserve the original Worker handoff request for traceability; they are no longer pending work.
>
> Closed by the integration train:
> - canonical types -> `packages/contracts/src/modules/schedule/scheduling.ts`;
> - first-class `scheduling_key / owner / handler / payload_version / source_revision` -> Prisma + PowerSync;
> - durable `SchedulingReconcileOperation` appended inside the successful owner transaction;
> - `ScheduleOrchestrationModule` exposes one `SchedulingPort` + one `ScheduledHandlerRegistry`; neutral execution goes registry-first with the legacy router as temporary fallback.
>
> The metadata envelope remains only as a compatibility carrier for the existing `ScheduleTask` aggregate/worker and is a W3 deletion target after Goal/Task/Routine projector cutover. It is not a new public contract.

> Historical execution truth is archived at `docs/plan/archive/2026-08-25-core-vnext-orchestration.md`; this handoff is not an active execution queue.
> This file is a handoff only. It does not create a second active plan.

## Lane / base

- Worker lane: Scheduling Foundation (`SCHED-1101`..`SCHED-1105`)
- Branch: `core-vnext/scheduling`
- Base revision: `43bf4ef722edb7b74e3364ff6459684687665534`
- Lane-owned implementation: `packages/schedule/**`
- Intentionally untouched shared hotspots: `packages/contracts/**`, `packages/database/**`, `packages/powersync-schema/**`, `packages/schedule-orchestration/**`, `apps/api/src/server.ts`, `apps/desktop/src/main/main.ts`

## What the lane already provides

The Scheduling lane implements the target seam without feature migration:

```text
Business projector
  -> SchedulingOwner + ScheduledIntent[]
  -> SchedulingPort.reconcile(owner, desired)
  -> LegacyScheduleTaskSchedulingAdapter
  -> existing ScheduleTask repository / queue / claim / lease / retry / restart recovery
  -> scheduling envelope handlerKey
  -> ScheduledHandlerRegistry
  -> ScheduledHandler
```

The lane-local neutral implementation surface lives in `packages/schedule/src/scheduling/**`. It does not import the `ScheduleTask` aggregate and is intentionally **not** added as a new `@memoflow/schedule` public subpath: canonical public ownership belongs to Contract Train. The existing engine adapter remains internal to `@memoflow/schedule` infrastructure.

New neutral tasks use `SourceModule.Custom` only as legacy persistence metadata. New execution dispatch reads the scheduling envelope and `handlerKey`; it never switches on `SourceModule`. A legacy fallback can still be supplied for Goal/Task/Reminder rows until their later migration.

## Contract Train handoff — SCHED-1101

Do not redesign the lane-local types. Canonicalize them into shared contracts under the existing `@memoflow/contracts` public surface, then make the lane implementation import those canonical definitions. Do not add a parallel `@memoflow/schedule/scheduling` public contract family.

### Requested shared files

Suggested ownership-preserving target:

```text
packages/contracts/src/modules/schedule/scheduling.ts
packages/contracts/src/modules/schedule/index.ts
```

Canonicalize these exact concepts currently implemented in:

```text
packages/schedule/src/scheduling/contracts.ts
packages/schedule/src/scheduling/validation.ts
packages/schedule/src/scheduling/key.ts
```

Required shapes/semantics:

- `SchedulingOwner { identityId, type, id }`
- `ScheduledIntent { schedulingKey, handlerKey, runAt: Instant, payloadVersion, payload, sourceRevision?, retryPolicy?, priority?, timeoutMs?, observability? }`
- `SchedulingPort.reconcile(owner, desired)` and `removeOwner(owner)`
- `SchedulingReconcileReceipt` with success/failure status and created/updated/deleted/unchanged counts
- `ScheduledHandler`, `ScheduledHandlerResult`, `ScheduledHandlerRegistration`
- payload version is a positive integer and is validated before handler execution
- handler key is a stable lowercase dotted/dashed key
- owner strings and scheduling keys reject empty/edge-whitespace/control-character values
- `buildSchedulingKey(...)` remains collision-free; the lane uses length-prefixed canonical segments

Receipt failure semantics currently align with ADR-042 vocabulary at the operation boundary:

```text
INVALID_OWNER
INVALID_INTENT
DUPLICATE_SCHEDULING_KEY
PERSISTED_KEY_COLLISION
TRANSACTION_FAILED
```

Handler failure semantics:

```text
UNKNOWN_HANDLER                  -> dead_letter, non-retryable
UNSUPPORTED_PAYLOAD_VERSION      -> dead_letter, non-retryable
PAYLOAD_VALIDATION_FAILED        -> dead_letter, non-retryable
HANDLER_EXECUTION_FAILED         -> retryable
```

### Follow-up after Contract Train lands

Scheduling lane should replace local definitions with imports/re-exports from the canonical contract package without changing runtime behavior. Do not introduce a second compatibility type family or expand the `@memoflow/schedule` public export whitelist just to host contracts.

## Schema Train handoff — SCHED-1103

The lane deliberately did not modify Prisma or PowerSync shared schema. Until this train lands, idempotency is protected by:

1. exact scheduling-envelope collision checks;
2. deterministic `ScheduleTask` id derived from `(identityId, ownerType, ownerId, schedulingKey)`;
3. owner-level transactional reconcile.

Add first-class nullable migration columns to `schedule_tasks` while legacy projectors still coexist:

```text
scheduling_key   TEXT NULL
owner_type       TEXT NULL
owner_id         TEXT NULL
handler_key      TEXT NULL
payload_version  INTEGER NULL
source_revision  TEXT NULL
```

Recommended Prisma shape (names illustrative; Schema Train owns final mapping syntax):

```prisma
schedulingKey  String? @map("scheduling_key")
ownerType      String? @map("owner_type")
ownerId        String? @map("owner_id")
handlerKey     String? @map("handler_key")
payloadVersion Int?    @map("payload_version")
sourceRevision String? @map("source_revision")

@@unique([identityId, ownerType, ownerId, schedulingKey], map: "schedule_tasks_owner_scheduling_key_unique")
@@index([identityId, ownerType, ownerId], map: "schedule_tasks_owner_lookup_idx")
```

PowerSync shared schema/mapping must receive the same columns in the same train so API/Desktop parity remains exact.

### Migration / backfill rule

Do not reinterpret legacy `SourceModule` rows as new handler-dispatch rows. Goal/Task/Reminder projector migration is explicitly out of scope for this wave.

Therefore:

- existing legacy rows may keep the new columns `NULL` until their owning projector migrates;
- new neutral scheduling rows must populate all identity/owner/key/handler/version columns;
- when an old projector is migrated later, derive its stable key from business occurrence identity, not from random `ScheduleTask.id`;
- if a deterministic legacy backfill is required before feature migration, use it only as migration metadata and never as a new execution-dispatch mechanism.

After the schema lands, update `LegacyScheduleTaskSchedulingAdapter` to read/write the first-class columns while retaining the metadata envelope only for downgrade/migration observability if still required. The unique constraint becomes the authoritative cross-process duplicate barrier; deterministic task ids remain defense in depth.

## Orchestration Train handoff — SCHED-1105

The lane deliberately did not edit the current Goal/Task/Reminder orchestration module or API/Desktop composition roots.

### Required composition hook

Use the lane-owned factories:

```ts
createScheduleTaskSchedulingPort(scheduleTaskRepository)
createHandlerRegistryScheduleTaskSourceExecutor({
  registry,
  legacyFallback,
})
```

and the neutral registry:

```ts
new ScheduledHandlerRegistry()
```

Suggested orchestration assembly:

```text
scheduleTaskRepository
  -> SchedulingPort

legacy ScheduleExecutionRouter (temporary only for unmigrated rows)
  -> legacyFallback

ScheduledHandlerRegistry
  + legacyFallback
  -> createHandlerRegistryScheduleTaskSourceExecutor(...)
  -> scheduler runtime sourceExecutor
```

The wrapper decides new-vs-legacy by presence of the neutral scheduling envelope, not by `SourceModule`. Thus the existing `SourceModule` switch remains only inside the legacy fallback and is not extended for new handlers.

### Shared files expected to change under Orchestration Train ownership

```text
packages/schedule-orchestration/src/infrastructure-server/schedule-orchestration.module.ts
packages/schedule-orchestration/src/ports/projection.ts
apps/api/src/server.ts
apps/desktop/src/main/main.ts
related API/Desktop composition/surface tests
```

Recommended API/Desktop invariant:

```text
create schedule repository set exactly once
  -> pass SAME scheduleTaskRepository to SchedulingPort + legacy projectors
  -> build ONE handler registry
  -> build scheduling-aware source executor with existing legacy router fallback
  -> pass SAME source executor to existing schedule runtime
```

Do not create a second schedule repository set.

No feature handlers need to be registered in this wave. The hook can expose the registry/registration seam for W2 feature migrations while leaving current Goal/Task/Reminder projectors and sources untouched.

## Durable reconcile receipt — required Schema Train closure

ADR-061 §6 is explicit: the owner transaction must `record ProjectionOperation / receipt` before commit. The lane-owned adapter currently returns a structured `SchedulingReconcileReceipt` only after commit and throws `SchedulingReconcileError` with a failed receipt on rollback, but that method result is **not** a substitute for the durable repair record required by ADR-061/ADR-042.

This Worker intentionally does not add a shared receipt table or canonical receipt schema because that would violate Contract/Schema Train single-writer ownership. Contract + Schema Train must provide the canonical ADR-042-compatible projection/receipt persistence, and Scheduling integration must append that durable record **inside the same owner transaction** as desired-key upserts and stale-key deletes. Until that train lands, SCHED-1104's lane-owned atomic state replacement is implemented and verified, while its shared durable-receipt substep remains an explicit integration blocker rather than being reported as complete.

## Merge / integration requirements

Expected train order remains the Master Plan order:

```text
Contract Train
-> Schema Train
-> Scheduling feature branch
-> Orchestration Train shared composition hook
```

Before integration, rerun:

```text
pnpm nx typecheck schedule
pnpm nx test schedule
pnpm nx lint schedule
pnpm nx build schedule
pnpm nx test schedule-orchestration
pnpm nx typecheck schedule-orchestration
API/Desktop schedule composition tests
root affected governance
```

No merge is performed by this Worker.
