---
tags: [plan, archive, routine, planner, home, governance]
description: Routine destructive-cutover adjacent surface repair: Home/Planner owner reads, Planner Goal command wiring, positive replacement locks
created: 2026-09-21T20:10:00+08:00
updated: 2026-09-22T08:55:00+09:00
---

# Routine Adjacent Surface Repair

## 0. Status

- **Status:** DONE
- **Branch:** `chatgpt/routine-adjacent-surface-repair`
- **Baseline:** `main@a0317498d17`
- **Root cause:** R4-2201C correctly retired legacy Reminder surfaces but left cross-owner replacement wiring incomplete.
- **Forbidden:** do not restore `/reminders`, ReminderTemplate/Group/Instance/Response, or raw Scheduler invocation reads.

## 1. Verified findings

### RAR-2601 — Home Routine projection missing (P1)

ADR-108 and the current feature map require Home to compose Task + Routine + Goal owner reads. `TodayOverviewPanel.vue` currently contains only Task and Goal after the legacy Reminder widget was removed.

### RAR-2602 — Planner Routine live feed is hard-coded empty (P1)

`useCalendarView.ts` retains canonical Routine projection support but assigns `plannerRoutineOccurrences.value = []`. The production Planner therefore never receives Routine WallClock occurrences.

### RAR-2603 — Planner Goal projection is editable but owner command is not wired (P1)

Goal date projections advertise `move`, and the owner router implements Goal mutation, but `ScheduleCalendarView.vue` only injects Schedule and Task owner commands. Dragging a legal Goal marker therefore returns `unsupported` and reverts.

### RAR-2604 — Retirement governance is negative-only (P2)

`vnext-retirement-audit` prevents retired paths from returning but cannot require the canonical replacement route/client/surface/projection to remain present.

### RAR-2606 — WallClock durable Profile/Membership gate + re-projection lost in cutover (P1)

Pre-cutover Reminder scheduling re-read canonical Profile/M:N membership eligibility and reprojected when eligibility changed. R4-2201C removed that lane without transferring the durable gate/change signal into canonical Routine scheduling. Current RoutineScheduleStateReader only reads definition + temporary override, and Routine CRUD lacks a schedule-dirty signal.

The repair restores only **durable cloud scheduling gates** (`RoutineDefinition.enabled`, `RoutineProfile.enabled`, `ProfileMembership.enabled`, temporary override). `profile active` stays host-local RuntimeContext and is not fabricated on the API host. PowerSync uploads publish post-commit dirty owners so Desktop-originated durable changes reproject without waiting for API restart.

## 2. Target architecture

```text
RoutineDefinition + TemporaryOverride + RecurrenceEnginePort
  -> RoutineUpcomingOccurrence owner read projection
       -> HTTP /routines/upcoming
       -> IPC routine:upcoming:get
       -> RoutineClientPort.getUpcomingOccurrences
            ├─ Home RoutineUpcomingWidget (today remaining)
            └─ Planner visible-range Routine markers

Planner Goal projection
  -> PlannerOwnerCommandRouter
  -> GoalClientPort.updateGoal

Retirement governance
  -> forbiddenPaths (old truth absent)
  + requiredPaths (replacement truth present)
```

## 3. Protected contracts

- `/reminders` stays retired and unmapped.
- Planner never reads `ScheduledInvocation` rows.
- Routine recurrence math remains delegated to `@memoflow/time` `RecurrenceEnginePort`.
- Routine Planner markers stay read-only until a canonical single-occurrence override/reschedule command exists.
- Goal move keeps Goal owner CAS/version semantics.
- Web/Desktop consume the same Routine client contract.

## 4. Repair tickets

### RAR-2601 — Owner-backed Routine upcoming read

Add typed contracts, owner query service, HTTP/IPC transport and client parity. Return bounded, sorted WallClock occurrences for an explicit `[start,end]` range.

### RAR-2602 — Home + Planner consumers

Add a Routine Home widget backed by the owner read. Replace the Planner empty marker assignment with the same client read. Add regression tests proving Home/Planner no longer depend on legacy Reminder.

### RAR-2603 — Planner Goal owner wiring

Inject `GOAL_SERVICE_KEY` into `ScheduleCalendarView` and supply `updateGoal` to `PlannerOwnerCommandRouter`; keep Routine projection read-only.

### RAR-2604 — Positive replacement governance

Extend retirement manifest/audit with optional `requiredPaths`. Lock the canonical Routine contracts/client/route/module/Home widget so destructive cleanup cannot pass by deleting both legacy and replacement surfaces.

### RAR-2606 — Durable WallClock eligibility + dirty-owner convergence

Restore the persistent Profile/Membership gate in RoutineScheduleSnapshot and re-check it at execution time. Publish `routine:schedule-changed` after API owner commands and after committed PowerSync CRUD uploads; do not use host-local profile-active state as cloud scheduling authority.

### RAR-2605 — Current-truth docs + closure

Update feature map, Routine module doc and Schedule module doc; run focused -> affected -> governance/docs/build validation, then archive this plan.

## 5. Acceptance

- Home shows owner-backed remaining Routine WallClock occurrences for today and links to `/routines`.
- Planner receives Routine occurrence projections for its visible range without raw Scheduler reads.
- Legal Goal date drag has an actual Goal owner command dependency.
- `vnext-retirement-audit` fails when an active entry's required replacement path is missing.
- Legacy Reminder surfaces remain absent.
- Durable WallClock projection/execution is suppressed when every persisted ProfileMembership path is disabled, and API/PowerSync mutations reproject the affected owner.

## 6. Closure evidence

### 6.1 Implementation

- `852ab9e324d` — restore adjacent Routine owner projections, Planner Goal owner command wiring, and positive replacement governance.
- `c586ee21317` — restore durable WallClock Profile/Membership eligibility and dirty-owner convergence.
- `fffabd10819` — refresh Test System V2 inventory after adding coverage.
- `923ae016a10` — move cross-project Routine ownership surface assertions back to the Routine owner package and make them formatting/cache safe.

### 6.2 Local verification

- focused owner/query/transport/Home/Planner/governance regression tests: green.
- Reminder unit: 28 files / 149 tests green.
- Reminder Prisma integration: 3 files / 16 tests green.
- Schedule Orchestration: 7 files / 33 tests green.
- API: 73 files / 342 tests green.
- App Vue: 211 files / 843 tests green.
- Desktop: 70 files / 355 tests green.
- Web: 17 files / 71 tests green.
- Goal cold unit: 86 files / 491 tests green.
- Goal/Reminder cold coverage targets: green.
- affected lint/typecheck/test, builds, `docs:check`, `governance:check`, and test inventory: green.

### 6.3 Remote exact-head CI

PR #394 implementation head `923ae016a1046d64334534bb2b487aec5f68b1ca` completed CI run `35667641468` with all 19 checks green, including Unit Tests, Coverage Oracle, Integration/Boundary/Performance Oracles, four Web Flow shards, Web Flow Oracle, and Delivery Observation.

Earlier CI runs surfaced two delivery-system gaps that were repaired before closure:

1. the new PowerSync test file required Test System V2 inventory refresh;
2. `packages/goal` contained a cross-project `fs.readFileSync` assertion over Routine source formatting, which bypassed Nx dependency/cache tracking and failed only on a cold CI runner. The Routine ownership assertions now live in `packages/reminder` and match semantics instead of exact whitespace.

### 6.4 Final architecture state

- legacy `/reminders` and ReminderTemplate/Group/Instance/Response remain retired;
- Home and Planner consume the canonical Routine owner read;
- Planner Goal movement reaches the Goal owner command;
- durable WallClock scheduling/read/execution share persisted Profile/Membership eligibility;
- API and PowerSync writes trigger Routine dirty-owner re-projection;
- host-local Profile active state is not promoted into cloud scheduling authority;
- retirement governance now protects both old-truth absence and required replacement presence.

The plan is archived after the implementation exact-head CI gate. The archive-only head must pass CI once more before PR #394 is merged.
