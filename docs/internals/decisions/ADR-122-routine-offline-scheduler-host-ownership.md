---
tags:
  - adr
  - routine
  - scheduler
  - desktop
  - powersync
description: Routine durable scheduling across Desktop local execution and the cloud Scheduler
created: 2026-10-30T00:00:00Z
updated: 2026-10-30T00:00:00Z
---

# ADR-122: Routine Offline Scheduler Host Ownership

**Status:** Accepted and implemented in part (#737; full Windows delivery acceptance remains with #731)  
**Date:** 2026-10-30  
**Related:** ADR-059, ADR-062, ADR-077, ADR-081, ADR-082, ADR-083, #731

## Context

Routine's domain projection, occurrence execution fence, and notification-requested envelope already have host-neutral contracts and Prisma adapters. Desktop owns a per-Profile PowerSync SQLite database and the single Scheduler runtime, but had not connected those Routine contracts. The API Scheduler must remain available for Web sessions while Desktop must continue local execution when cloud services are unavailable.

Desktop SQLite and cloud Postgres are separate transactional authorities during a network partition. A lease or fencing token written to one cannot fence a worker using the other database. No client protocol can guarantee globally exactly-once external notification side effects while both hosts are partitioned and allowed to execute.

## Decision

- Keep one Scheduler runtime per host and use the existing `ScheduledInvocation` / `InvocationAttempt` contract. Desktop registers the canonical Routine projection and WallClock plus scheduler-owned Elapsed handlers in its existing Scheduler composition. `profileRuntimeManager` identity gating prevents it from executing another local Profile's invocations.
- Keep the API Scheduler active for Web and cloud execution. `Elapsed(profile-activation)` and `ActiveUsage` remain in Routine's local activity runtime; only WallClock and Elapsed triggers with `timingOwner: 'scheduler'` enter the durable scheduler lane.
- Give every Routine occurrence and notification request the same canonical `(identityId, source='routine', occurrenceKey)` idempotency identity on both hosts. Desktop commits its occurrence receipt and local `NotificationRequested` outbox row in one SQLite transaction. PowerSync CRUD resolves an incoming duplicate against the canonical server idempotency key, advances a running server occurrence to an incoming terminal state, and never reopens a terminal occurrence from a stale running replay.
- Treat a partitioned overlap as at-least-once execution with idempotent durable convergence, not distributed exactly-once. The winning Postgres row remains the cloud canonical occurrence; each host's local outbox can independently produce a notification before reconciliation. This limitation is observable and must not be described as cross-device exactly-once.
- On reconnect, PowerSync carries Routine occurrence facts and Scheduler invocation state using their stable identities. Startup reconciliation rebuilds desired invocations from Routine truth; open `Elapsed(last-satisfied)` occurrences remain open and do not schedule another interval until the user resolves them.
- Profile lock/switch tears down the existing profile runtime and its Scheduler, so no separate Routine timer or second cron worker is introduced.

## Consequences

- Guest and signed-in Desktop Profiles can run durable Scheduler-owned Routine triggers against their local SQLite state without API, PowerSync, or Internet availability.
- Cloud scheduling remains available to Web. Stable idempotency prevents duplicate server occurrence history rows and makes delivery retries safe within each host.
- A cloud worker and an offline Desktop worker can both emit a local notification for the same occurrence before the partition heals. Eliminating that case requires a shared online ownership service and would make offline execution depend on that service; it is outside this decision.
- Full Windows installation, crash/restart, sleep/wake, profile lifecycle, and notification-surface acceptance is covered by #731 and cannot be inferred from unit or Linux SQLite tests.

## Non-goals

- A second Scheduler, cron, or interval runtime.
- Removing Web/API Routine scheduling.
- Replacing Routine definitions or historical occurrence data.
- Global exactly-once side effects across a network partition.
