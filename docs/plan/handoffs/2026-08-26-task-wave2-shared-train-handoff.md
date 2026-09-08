---
tags:
  - plan
  - handoff
  - core-vnext
  - task
  - wave2
  - contract-train
  - schema-train
description: Shared Contract/Schema Train proposal for TASK-2201..2204; shared deltas are not independently owned by the Task feature lane.
created: 2026-08-26
updated: 2026-08-26
---

# Task Wave 2 — Shared Contract / Schema Train Handoff

Historical authority record: `docs/plan/archive/2026-08-25-core-vnext-orchestration.md`; this handoff is not active.

This handoff exists because Wave 2 has a single-writer rule for `packages/contracts/**`, Prisma schema and the root PowerSync schema. The Task feature branch contains a working **proposal implementation** of these shared changes so the Task domain could be characterized and tested end-to-end, but the Contract/Schema Trains own the canonical landing of the equivalent changes.

Do not interpret a clean Git merge as permission to bypass those trains.

## Source lane

- Feature branch: `core-vnext/task-domain`
- Base: `9982e1918447e8710b31f6036c338d8dc51616e0`
- Task delivery: `TASK-2201..TASK-2204`
- Domain handoff: `docs/plan/handoffs/2026-08-26-task-wave2-domain-handoff.md`

## Contract Train proposal

Task-owned public semantics to canonicalize under `packages/contracts/src/modules/task/**`:

### Occurrence

Persisted status becomes:

```text
Pending | InProgress | Completed | Missed | Skipped
```

- retire persisted `Expired`;
- expose `isOverdue` as a derived read-model property;
- add explicit mark-missed mutation;
- keep correction/uncomplete behavior.

### Task Plan

Canonical plan lifecycle/status:

```text
Active | Paused | Closed
```

Canonical plan outcome:

```text
Open | Succeeded | Failed | Abandoned
```

Add the Task Plan completion-policy contract used by the domain evaluator. Expose plan outcome/closure/archive/abandon metadata through TaskTemplate DTOs and command schemas.

### Retired public project-management model

Delete Task public contracts/RPC/event surfaces for:

```text
TaskFolder
TaskDependency
DependencyType
DependencyStatus
Subtask hierarchy / parentTaskId
blockingReason / dependencyStatus / isBlocked
DAG / graph / critical-path queries
dynamic numeric priority score
check-expired mutation
```

Keep `importance` as the simple user-authored priority concept.

### IPC/RPC registry

`packages/contracts/src/electron/ipc-channels.ts` and the Task RPC map must remove the retired dependency/folder/expiration channels and add only the new Task outcome/plan commands required by the canonical Task contract.

This file is a known shared hotspot with the in-progress Goal Wave 2 lane. The Contract Train must merge both domains' intentional channel changes semantically; do not choose one branch's whole file.

## Schema Train proposal — Prisma

Apply the Task semantic reset in:

```text
packages/database/prisma/schema/task.prisma
packages/database/prisma/schema/account.prisma
```

### Remove

- `TaskFolder` model + Account relation;
- `TaskDependency` model + Account/TaskTemplate relations;
- `TaskTemplate.priority` numeric score;
- `TaskTemplate.folderId` / `parentTaskId` and hierarchy relations/indexes;
- blocking/dependency-state columns;
- `TaskInstance.priority` numeric score;
- obsolete `recurrenceRuleDayOfMonth` / `recurrenceRuleMonthOfYear` placeholder columns;
- TaskStatistic `distributionByFolder`;
- persisted `instanceExpired` statistic.

### Add / rename semantic state

TaskTemplate adds:

```text
outcome
completion_policy
closed_at
archived_at
abandoned_reason
```

TaskStatistic replaces expired fact count with:

```text
instance_missed
```

### Occurrence idempotency

Keep / enforce:

```prisma
occurrenceKey String? @map("occurrence_key")
@@unique([templateId, occurrenceKey])
```

The deterministic business identity is `templateId:local-date`.

No production data preservation is required for the retired Task project-management schema in this wave; a destructive dev/test reset is preferred over compatibility aliases.

## Schema Train proposal — PowerSync

Root `packages/powersync-schema/src/index.ts` must mirror the Task Prisma semantics:

- remove `task_folders` and `task_dependencies` tables;
- remove Task hierarchy/blocking/dynamic-score columns;
- add plan outcome/lifecycle metadata columns;
- replace `instance_expired` with `instance_missed`;
- remove Task folder statistics;
- add physical `task_instances.occurrence_key`.

`occurrence_key` is mandatory for Desktop correctness because Task PowerSync mappers/repositories persist and query it for no-duplicate regeneration.

### Cross-domain safety finding fixed in the feature lane

During final shared-train audit, an earlier broad Task cleanup was found to have accidentally removed unrelated PowerSync columns from Goal, Schedule, AI provider config and Repository resources. Repair commit `38c6d709f` restored all five non-Task fields.

The Task shared proposal must therefore **not** remove or alter these unrelated columns:

```text
goals.priority
goals.folder_id
schedules.priority
ai_provider_configs.priority
resources.folder_id
```

Goal may later retire its own fields through its own authorized train; that must not happen as a side effect of Task integration.

## Generated output rule

The Task feature lane does not hand-edit or commit generated Prisma client output. After the Schema Train lands the canonical source schema:

1. perform the allowed destructive dev/test reset if needed;
2. regenerate Prisma via the canonical workspace command;
3. reconcile PowerSync schema artifacts;
4. rerun Task + Goal + Routine/Notification cross-domain schema boot checks.

## Integration order

Use the orchestration single-writer order:

```text
Contract Train canonical Task patch
  -> Schema Train canonical Task patch + regeneration
  -> merge/rebase Task feature implementation
  -> resolve shared files to the train-owned canonical versions
```

Do not restore retired Task fields to make old UI compile. UI migration is downstream work.

## Validation evidence for the proposed semantics

On the feature branch after `TASK-2204`:

- Task suite: `69 files / 686 tests` green;
- Contracts suite: `63 files / 504 tests` green;
- restart/outbox/rollback focused gate: `4 files / 12 tests` green;
- Task typecheck green;
- PowerSync schema typecheck green;
- Prisma validate green;
- recurrence fixtures cover Daily/Weekly/Monthly/Yearly, COUNT, end date, spring/fall DST and duplicate prevention.
