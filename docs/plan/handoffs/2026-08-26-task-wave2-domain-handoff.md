---
tags:
  - plan
  - handoff
  - core-vnext
  - task
  - wave2
description: TASK-2201..2204 delivery and integration handoff for the Core vNext Task domain lane.
created: 2026-08-26
updated: 2026-08-26
---

# Core vNext Task Domain — Wave 2 Handoff

> Historical execution truth is archived at `docs/plan/archive/2026-08-25-core-vnext-orchestration.md`; this handoff is not an active execution queue.
> This file records the completed Task lane and integration constraints; it is not a second active plan.

## Lane / base / delivered commits

- Branch: `core-vnext/task-domain`
- Worktree: `/home/dev/projects/memoflow-core-vnext-task-domain`
- Exact Wave 2 base: `9982e1918447e8710b31f6036c338d8dc51616e0`
- Delivered commits:
  - `bc5b2f1f8` — `TASK-2201` occurrence outcome model
  - `c350e70c2` — `TASK-2202` Task Plan lifecycle/outcome
  - `313f4598b` — `TASK-2203` Task domain simplification
  - `eaf292de9` — `TASK-2204` recurrence adapter integration

The worktree is clean after these commits.

## Canonical Task semantics after Wave 2

### Occurrence facts

Persisted occurrence state is exactly:

```text
Pending | InProgress | Completed | Missed | Skipped
```

`Overdue` is derived from current time plus the occurrence due/window boundary. It is not a persisted state and must not be reintroduced as one.

- `Missed` is an explicit confirmed outcome, not a clock side effect.
- `Skipped` is an explicit waiver / not-applicable outcome.
- A past-due Pending occurrence remains correctable/completable.

### Task Plan lifecycle/outcome

Plan lifecycle and outcome are separate:

```text
lifecycle: Active | Paused | Closed
outcome:   Open | Succeeded | Failed | Abandoned
```

- `Failed` is derived/evaluated from finite-plan completion policy when success is no longer possible.
- `Abandoned` is explicit user intent.
- archive/delete do not impersonate plan outcome.
- outcome transition and Goal settlement stay inside the Task write transaction/outbox boundary.

### Retired project-management surface

The Task domain no longer contains or exposes the old project scheduling graph concepts:

- TaskFolder;
- parent/child task hierarchy;
- TaskDependency / dependency types;
- blockingReason / dependencyStatus / isBlocked;
- DAG / graph / critical path queries;
- dynamic numeric priority scoring / priority calculator.

`importance` remains the simple user-authored priority concept. Do not restore deleted fields merely to keep old UI or client code compiling.

### Recurrence

Task recurrence date math is now behind a MemoFlow-owned adapter over the selected `@memoflow/time` recurrence engine.

The adapter maps:

- Daily / Weekly / Monthly / Yearly;
- interval;
- weekday selection;
- inclusive end date;
- finite COUNT;
- local timezone/local-day behavior;
- spring-forward and fall-back DST fixtures.

Task domain still owns plan status, existing-occurrence filtering and business outcomes. The recurrence library only yields candidate dates.

Recurring Task plans require a real calendar anchor. The old `1970-01-01` unanchored fallback was removed because it silently consumed finite COUNT before the actual plan date.

## Occurrence identity / duplicate protection

Canonical occurrence identity is deterministic by Task plan + local calendar day:

```text
templateId:YYYY-MM-DD
```

Protection exists at multiple layers:

1. Task aggregate filters existing occurrences before producing new candidates;
2. explicit generation and reactivation rehydrate existing persisted occurrences before regeneration;
3. Prisma keeps `@@unique([templateId, occurrenceKey])`;
4. PowerSync now physically stores `occurrence_key` and checks identity + template + occurrence key before inserting.

The PowerSync `occurrence_key` column is required. It was missing from the root PowerSync schema before `TASK-2204` even though mapper/repository code expected it.

## Product Time corrections included in TASK-2204

The lane removed recurrence-adjacent fixed-24-hour calendar arithmetic where DST changes the answer:

- AllDay due uses calendar `endOfDay`;
- TimePoint / TimeRange due combines local Ymd + Hm through Product Time;
- generation cursor advances by calendar day;
- refill horizon and remaining-day calculations use Product Time calendar functions;
- default recurrence end-date offset uses calendar addition.

The remaining fixed-millisecond windows in dashboard/completion analytics are not recurrence date math and were intentionally left outside this ticket.

## Shared Contract/Schema Train proposal

Task Wave 2 carries tested proposal deltas for shared surfaces needed to retire the old Task model. Per the orchestration single-writer rule, the Contract/Schema Trains own their canonical landing; the Task feature lane does not independently own those shared files. See `docs/plan/handoffs/2026-08-26-task-wave2-shared-train-handoff.md`.

Proposal surfaces:

```text
packages/contracts/src/modules/task/**
packages/contracts/src/electron/ipc-channels.ts
packages/database/prisma/schema/task.prisma
packages/database/prisma/schema/account.prisma
packages/powersync-schema/src/index.ts
```

Schema deletions are intentionally destructive for the current development dataset. Do not add compatibility columns/models for TaskFolder, TaskDependency, hierarchy, dynamic priority or obsolete Monthly/Yearly placeholder columns. Shared train integration must take the Task semantics, not blindly take the feature branch's whole shared file.

Generated Prisma client files are not part of the Task branch commit and must be regenerated only by the Schema Train when required.

## Validation evidence

Final Task lane evidence after `TASK-2204`:

- Task suite: `69 files / 686 tests` green;
- Contracts suite: `63 files / 504 tests` green;
- restart/outbox/rollback focused gate: `4 files / 12 tests` green;
- explicit persisted-pending Task->Goal event replay after restart is covered;
- Task TypeScript typecheck green;
- PowerSync schema TypeScript typecheck green;
- Prisma schema validate green;
- `git diff --check` green.

Recurrence focused fixtures include Daily, Weekly, Monthly, Yearly, COUNT, inclusive end date, New York spring DST, New York fall DST and no-duplicate regeneration.

## Integration preflight against current main

At handoff time current main is `543eb1b7f` (post-base infra port convergence).

- post-base main files intersecting Task Wave 2 files: **none**;
- `git merge-tree --write-tree main core-vnext/task-domain` succeeds without a merge conflict in the current preflight;
- therefore the current main-only port convergence change is not a Task merge blocker. This is only a Git preflight: Contract/Schema Train ownership still applies.

The only currently observed path overlap with the still-dirty Goal Wave 2 lane is:

```text
packages/contracts/src/electron/ipc-channels.ts
```

The Contract Train must preserve both domains' intentional channel changes instead of choosing one side wholesale.

## Next dependency boundary

Do **not** start `TASK-2205` from this branch yet.

`TASK-2205` depends on `GOAL-2102` plus `TASK-2202`, and Goal's KR Measurement V2/shared-contract work is still in progress at this handoff. It must be based on the canonical Goal KR V2 contract after that train lands.

Do **not** open Wave 3 Task scheduling merely because `TASK-2204` is done. The orchestration document places Wave 3 after the Wave 2 gate. Once the gate is satisfied, create a new isolated worktree/branch for `TASK-3101`; do not append Wave 3 work to `core-vnext/task-domain`.
