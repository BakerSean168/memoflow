---
tags:
  - analysis
  - core-vnext
  - baseline
  - acceptance
  - contract-train
  - schema-train
description: Core vNext Wave 0 frozen system map, acceptance fixtures, shared-train ownership map, and OSS/license gate evidence.
created: 2026-08-25T21:20:00+08:00
updated: 2026-08-25T21:20:00+08:00
---

# Core vNext Wave 0 — Baseline / Acceptance / Shared-Train Evidence

The completed orchestration record is archived at [`2026-08-25-core-vnext-orchestration.md`](../plan/archive/2026-08-25-core-vnext-orchestration.md).
This document closes `CORE-0001~0004` and supplies the evidence consumed by `CORE-0005`.

## 1. Frozen baseline

Baseline revision before Wave 1 implementation:

```text
43bf4ef722edb7b74e3364ff6459684687665534
refactor(core): establish vNext orchestration baseline (#276)
```

The baseline intentionally includes ADR-053~064 and the umbrella plan but does **not** include the Wave 1 worker branches. All destructive Wave 2 work must compare residual legacy surfaces against this revision rather than against memory.

### 1.1 Legacy hotspot counts at the frozen revision

The following counts were produced with `git grep -l <pattern> 43bf4ef72 -- packages apps`, excluding no source category; generated Prisma references therefore contribute to the totals and are useful as a reminder that Schema Train regeneration has a broad blast radius.

| Legacy / hotspot | Files at baseline | Wave 2 owner |
| --- | ---: | --- |
| `GoalFolder` | 118 | Goal lane + Contract/Schema Train |
| `TaskFolder` | 64 | Task lane + Contract/Schema Train |
| `TaskDependency` | 103 | Task lane + Contract/Schema Train |
| `CriticalPath` | 13 | Task lane |
| `SourceModule` | 60 | Scheduling migration / W3 |
| `ScheduleTask.create` | 17 | Goal/Task/Routine projectors + schedule compatibility layer |
| `createReminderTriggerCronRuntime` | 7 | Routine wall-clock cutover / W3 |
| `KeyResultValueType` | 13 | Goal lane + Contract/Schema Train |

These are **consumer-map counts, not deletion goals by themselves**. A later residual grep may legitimately keep historical ADR/test migration fixtures, but production authority must converge to one path.

### 1.2 Cross-module ownership at baseline

Production cross-package coupling is concentrated at the scheduling edge:

```text
Goal     -> @memoflow/schedule (projection + execution source)
Task     -> @memoflow/schedule (projection + execution source)
Reminder -> @memoflow/schedule (projection + execution source)
Schedule -> owns ScheduleTask engine
Notification -> no direct business-domain import
```

The important baseline production files are:

```text
packages/goal/src/server/infrastructure/schedule-projection-source.ts
packages/goal/src/schedule-execution/index.ts
packages/task/src/server/infrastructure/schedule-projection-source.ts
packages/task/src/schedule-execution/index.ts
packages/reminder/src/server/infrastructure/schedule-projection-source.ts
packages/reminder/src/schedule-execution/index.ts
packages/schedule-orchestration/src/execution/router.ts
packages/schedule-orchestration/src/ports/execution.ts
```

At the end of Wave 1, the new neutral seam is canonical in `@memoflow/contracts/schedule`, but Goal/Task/Reminder still use the legacy sources until W3. **Do not extend those legacy sources with new vNext behavior.**

### 1.3 `ScheduleTask.create` authority map

Ignoring generated code and test fixtures, the baseline has four meaningful production creation classes:

```text
Goal projector
  packages/goal/src/server/infrastructure/schedule-projection-source.ts

Task projector
  packages/task/src/server/infrastructure/schedule-projection-source.ts

Reminder projector
  packages/reminder/src/server/infrastructure/schedule-projection-source.ts

Manual/internal Schedule command
  packages/schedule/src/server/application/use-cases/commands/create-schedule-task.use-case.ts
```

Wave 1 additionally introduces one compatibility-only construction point inside:

```text
packages/schedule/src/server/infrastructure/scheduling/legacy-schedule-task-scheduling.adapter.ts
```

That adapter is allowed because `ScheduleTask` is hidden behind `SchedulingPort`; business packages must not copy this pattern.

### 1.4 Scheduler -> Notification coupling at baseline

The legacy orchestration execution path still owns a direct `ScheduleNotificationPort` dependency:

```text
packages/schedule-orchestration/src/ports/execution.ts
packages/schedule-orchestration/src/execution/router.ts
apps/api/src/runtime/compose-notification.ts
apps/desktop/src/main/runtime/compose-notification.ts
```

This is protected legacy behavior until `NOTIF-3301` plus feature handlers are available. New `ScheduledHandler` implementations must target durable `NotificationRequested`; they must **not** add another direct Notification call to Scheduler core.

### 1.5 Reminder dual timing authority at baseline

Durable Reminder timing currently has two paths:

```text
Reminder schedule projection -> Schedule queue
Reminder trigger cron runtime -> minute scan / Reminder trigger
```

Cron composition evidence:

```text
packages/reminder/src/server/infrastructure/cron/reminder-trigger-cron-job.ts
packages/reminder/src/server/infrastructure/runtime/reminder-trigger-cron.runtime.ts
apps/api/src/runtime/compose-reminder.ts
```

The cron path remains a migration source only. ADR-062 requires one Scheduler authority for durable WallClock timing; ActiveUsage / Elapsed / Protocol local timing is not projected to Scheduler.

### 1.6 Task recurrence entry points at baseline

Authoritative generation flows through:

```text
TaskTemplate.generateInstances
TaskTemplate.getNextOccurrence
TaskInstanceGenerationService.generateInstances
CreateTaskTemplateUseCase
ActivateTaskTemplateUseCase
GenerateTaskInstancesUseCase
UpdateTaskTemplateUseCase
TaskInstanceMaintenanceRuntime
```

Baseline calendar arithmetic also appears in Task instance/maintenance policy as `86400000` day math. Wave 1 has already moved recurrence candidate-date math behind `RecurrenceEnginePort`; W2 `TASK-2201/2204` owns outcome/overdue semantics and the remaining domain filtering.

### 1.7 Planner UI at baseline

The custom Planner rendering surface is:

```text
packages/app-vue/src/modules/schedule/components/DayViewCalendar.vue
packages/app-vue/src/modules/schedule/components/WeekViewCalendar.vue
packages/app-vue/src/modules/schedule/components/MonthViewCalendar.vue
packages/app-vue/src/modules/schedule/components/DayDetailSheet.vue
packages/app-vue/src/modules/schedule/components/CreateScheduleDialog.vue
packages/app-vue/src/modules/schedule/components/ScheduleTaskDetailDialog.vue
packages/app-vue/src/modules/schedule/views/ScheduleCalendarView.vue
```

Wave 1 shared date/time fields live under `@memoflow/ui-vue-shadcn`; they do not make the custom Planner calendar canonical. `PLAN-5101~5105` owns the later FullCalendar adapter and edit routing.

### 1.8 Date/time UI at baseline

Existing product surfaces still contain native `type="date"` / `type="time"` inputs in AI/Goal/Task forms. Wave 1 provides reusable replacements:

```text
DateField
TimeField
DateTimeField
DurationField
ReminderOffsetField
```

All calendar-value conversion goes through `@memoflow/time`; feature contracts stay on `Instant / Ymd / Hm`.

---

## 2. Frozen acceptance fixtures A–J

These IDs are stable test vocabulary. Later tickets should cite the fixture ID in test names or comments when the behavior is covered.

| ID | Scenario | Canonical facts / expected behavior | Primary later owner |
| --- | --- | --- | --- |
| A | Graduation / second-class points, finite 15-day plan | 15 planned occurrences; completion/missed/skipped remain facts; Plan closes only under explicit outcome policy; PlanCompletion can settle once | Task + Goal settlement |
| B | Running 100 km, `EachCompletion` | Each completed run contributes the configured measurement once; replay is idempotent; uncomplete reverses the same source contribution | Task + Goal |
| C | Weight 75 -> 70, `Last` measurement | Latest measurement owns current KR value; progress direction handles decreasing target; edit/delete recalculates from the same canonical calculator | Goal |
| D | One-time Task at 14:00, reminder -30m | Exactly one stable neutral invocation at 13:30; repeated reconcile does not duplicate; completing/deleting before fire yields skipped handler result | Task + Scheduler |
| E | Goal due date reminder -7d | Goal semantics choose the reminder; one stable invocation is reconciled; completed/abandoned Goal before due produces no user notification | Goal + Scheduler |
| F | Routine 23:30 WallClock + snooze | IANA-zone recurrence determines 23:30 occurrence; snooze creates/updates the next eligible durable invocation without duplicate occurrence | Routine + Scheduler |
| G | Stand Routine ActiveUsage 40m + natural idle break | ActiveUsage is owned by local runtime, not Scheduler; natural idle can satisfy/reset the work interval according to Routine policy | Routine + Desktop runtime |
| H | 50/10 protocol, restart recovery | Protocol session transition table survives restart from persisted snapshot/version; renderer is not state authority | Routine + Desktop runtime |
| I | DND mixed-channel Notification | Channel policy is evaluated independently; an allowed InApp fact can coexist with suppressed/deferred Email/Desktop outcome; DND/rate reason is observable | Notification |
| J | Planner Task drag 14:00 -> 16:00 + failed command | Planner routes edit to Task owner command; optimistic UI reverts on command failure; Planner never becomes Task source of truth | Planner + Task |

Wave 1 already covers the foundation portions of D (stable reconcile), I (per-channel policy), and recurrence/time primitives used by F. Full A–J closure belongs to W7.

---

## 3. Contract / Schema / Orchestration / UI shared-train map

### 3.1 Single-writer invariant

Within one integration wave, feature lanes may propose changes to shared hotspots, but only the train owner writes the central bundle:

| Train | Canonical hotspots | Rule |
| --- | --- | --- |
| Contract Train | `packages/contracts/**` | One coherent contract bundle per wave; feature packages consume it, never create competing public types |
| Schema Train | `packages/database/prisma/schema/**`, `packages/powersync-schema/**`, generated Prisma client | Prisma and PowerSync change together; generated client is regenerated once after the merged schema bundle |
| Orchestration Train | `packages/schedule-orchestration/**`, API/Desktop composition roots | One composition owner; business lanes register handlers/projectors through exposed seams |
| UI Core Train | `packages/ui-vue-shadcn/**`, shared app composites | Shared accessible primitive/composite changes merge before feature pages duplicate them |

Generated Prisma files are **Schema Train output**, never an independent feature-lane source edit.

### 3.2 Wave-by-wave central changes

| Wave | Contract Train | Schema Train | Orchestration/UI notes |
| --- | --- | --- | --- |
| W1 | neutral scheduling; Label contracts | scheduling identity/receipt; Label joins | SchedulingPort/HandlerRegistry hook; shared date/time composites |
| W2 | Goal/KR; Task occurrence/plan; Routine; Notification Fact | destructive Goal/Task/Routine/Notification business schema bundle | Four domain lanes stay isolated; UI pages do not force old fields back |
| W3 | durable `NotificationRequested`, handler payloads, settlement source identity | integration outbox / projector metadata as required | Task/Goal/Routine handlers registered by composition; legacy SourceModule switches shrink |
| W4–W5 | Planner/Routine runtime contracts only as needed | runtime/session/calendar-entry persistence | Planner adapter + Desktop local runtime |
| W6–W7 | AI/Mobile parity cleanup | final legacy column deletion/reset | generated residual audit and docs closure |

### 3.3 Wave 2 collision rule

The next four feature worktrees may edit their own packages freely, but **must not independently land shared contract/schema mutations**. Each should produce a handoff patch/list for central changes. Integration applies Contract Train first, Schema Train second, then rebases/merges the four lane commits.

---

## 4. OSS / license gate

The mandatory reuse ledger remains [`2026-08-25-core-vnext-reuse-and-reference-ledger.md`](./2026-08-25-core-vnext-reuse-and-reference-ledger.md). Wave 0 verification confirms:

| Capability | Decision | License / guardrail | W1 status |
| --- | --- | --- | --- |
| Runtime EventBus | Borrow `emittery@2.0.0` | MIT | implemented ADR-064 |
| Recurrence | Borrow `rrule@2.8.1` behind MemoFlow port | BSD-3-Clause | selected + conformance fixture passes |
| UI calendar/date | Borrow existing `@internationalized/date@3.11.0`, Reka UI, shadcn-vue | Apache-2.0 / MIT / MIT | shared fields implemented |
| Planner | Prefer FullCalendar **Standard** Vue only | MIT Standard; no Premium dependency | not installed yet; W4 PoC/Planner lane |
| Schedule-X | Reference only for interactive v1 | drag/resize v4 Premium conflicts with target | not installed |
| `ical.js` | Deferred to ICS interoperability | MPL-2.0 | not added; no observed recurrence gap requires it |
| pg-boss | PoC only after business packages leave `ScheduleTask` | do not replace engine during seam migration | not installed |
| Novu | Semantic reference only | do not introduce second Notification source of truth | not integrated |
| Workrave / Safe Eyes | Behavioral/architecture reference only | GPL-3.0; **no code copying** | no dependency |
| Super Productivity | Primary Focus/Routine code-level reference | MIT | reference only |

No Wave 1 dependency violates the ledger. Third-party recurrence/UI types remain behind MemoFlow adapters and do not enter business contracts.

---

## 5. Wave 1 authority delta to carry into Wave 2

After Wave 1 integration, future workers must treat these as new canonical foundations:

```text
Runtime events
  -> Emittery-backed CrossPlatformEventBus

Product recurrence
  -> @memoflow/time RecurrenceEnginePort -> rrule adapter

Shared date/time UI
  -> @memoflow/ui-vue-shadcn date-time composites -> @memoflow/time conversion

Classification
  -> @memoflow/contracts/label + @memoflow/label + Label/GoalLabel/TaskLabel

Durable scheduling
  -> @memoflow/contracts/schedule SchedulingPort/ScheduledIntent
  -> first-class owner/schedulingKey/handlerKey columns
  -> owner-level transaction + durable reconcile receipt
  -> HandlerRegistry composition hook
  -> existing ScheduleTask engine hidden below adapter

Notification policy
  -> independent per-channel evaluation + production DND/rate-limit
```

Temporary compatibility paths that remain by design and **must shrink rather than grow**:

```text
Goal/Task/Reminder -> ScheduleTask projector
legacy SourceModule execution router
Reminder minute-scan cron authority
legacy Goal/Task tags/folders/DAG/business fields
legacy Notification template/preference model before Fact V2
```

This is the boundary at which Wave 2 can safely start four parallel business-domain lanes.
