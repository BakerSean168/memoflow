---
tags:
  - analysis
  - core-vnext
  - hardening
  - documentation
  - adr
  - acceptance
description: HARD-7104 documentation / ADR truth closure evidence for MemoFlow Core vNext
created: 2026-09-08T09:00:00+08:00
updated: 2026-09-08T09:00:00+08:00
---

# HARD-7104 — Documentation / ADR Truth Closure Evidence

## Decision

**Complete.** Core vNext documentation now describes the repository that actually exists after the post-v0.11 residual work. Historical migration text remains available in ADR/background sections, but current product docs, ADR status lines, feature map, reuse ledger and active-plan status no longer advertise retired contracts as current behavior.

## Implementation revisions covered

| Revision | Closure |
| --- | --- |
| `14b08b92955` | HARD-7103 A-J / host / local-Docker / schema acceptance evidence |
| `4a7b8f154e8` | Task classification converged on first-class Shared Label; AI-6101 and Mobile Task label parity closed |
| `e3e5ae29aef` | ROUTINE-5302 six-method curated Method Library |
| `2abcbd5591eb` | AI-6102 Routine command tools and AI-6103 Planner/Notification read tools |

## Truth corrections

### ADRs

- ADR-003 is now explicitly historical for implementation details; ADR-033/064 own the current event communication/runtime rules.
- ADR-053~057 are marked implemented: personal Goal/Task boundaries, Shared Labels, KR Measurement V2, Goal Link/Contribution, Occurrence/Plan lifecycle.
- ADR-058 is an active engineering policy; the final reuse ledger records actual dependency decisions.
- ADR-059~063 are marked implemented for Core vNext: Routine Coach runtime/surfaces, Planner/Scheduler split, SchedulingPort/HandlerRegistry, single Routine scheduler authority, Notification Fact/DeliveryPlan separation.
- ADR-064 remains implemented and is cross-referenced as the current EventBus backend decision.

### Product docs

- Goal docs no longer present GoalFolder, Focus Mode or MultiGoalComparison as current capability.
- Task docs no longer present TaskFolder, Dependency/DAG/CriticalPath, dynamic priority or `Expired` as current capability.
- Routine docs describe RoutineDefinition/ProfileMembership, WallClock/ActiveUsage/Protocol, Temporary Override and Method Library as current truth; ControlMode/scanner are historical only.
- Notification docs distinguish durable NotificationRequested, Fact, policy/DeliveryPlan and channel delivery attempts. `notification:dispatch_*` is documented only as Notification-owned delivery event, not a producer bypass.
- AI docs include current Goal/Task workflow contracts, approved Routine commands and read-only Planner/Notification tools, plus the no-raw-Scheduler boundary.
- Feature map and module indexes point to the physical `schedule` / `scheduler`, Routine method/command, AI tools/ports and Shared Label surfaces that exist today.

### Reuse ledger

Final Core vNext decisions are explicit:

- Emittery: adopted;
- rrule 2.8.1: adopted behind MemoFlow recurrence adapter;
- FullCalendar Standard: adopted for Planner;
- Schedule-X: reference only;
- pg-boss 12.30.0: PoC complete, **Keep custom** production decision; dev-only candidate retained;
- Goal/Task/Routine business semantics remain MemoFlow-owned.

## Product parity closure evidence

### Shared Label / AI-6101 / Mobile

- Task package regression: **71 files / 717 tests passed** after retiring Task `tags/color` and migrating tests to Shared Label semantics.
- App-Vue: **201 files / 773 tests passed**.
- Desktop: **61 files / 322 tests passed**.
- Contracts, AI, PowerSync Schema and API package regressions passed.
- Fresh PostgreSQL boot: **96 public tables / 23 Core vNext tables** with canonical schema checks.
- Legacy Task tag fixture: existing tags migrate to identity-scoped Labels/TaskLabels, existing normalized labels are reused, Task color is retired and a second migration run is idempotent.
- React/Mobile production-source audit found no GoalFolder/TaskFolder/Dependency/DAG/ValueType/raw Scheduler mutation surface; Task editor/list/detail now consume Shared Label `labels/labelIds`.

### ROUTINE-5302

- Curated catalog contains exactly six methods: Stand & Move, 20-20-20, Drink Water, Sleep Wind-down, 50/10 Protocol, Pomodoro.
- WallClock methods can prefill the existing Routine/Reminder configuration; Protocol methods remain ProtocolSession-owned.
- Method library / configuration-center / i18n focused checks passed **12/12**.
- Reminder full regression subsequently passed **74 files / 470 tests** after AI parity integration.

### AI-6102 / AI-6103

- Routine commands terminate at Reminder/Routine owner-domain ports; persistent configuration/session creation tools require Mastra approval.
- Planner tools read Calendar/Task product projections; Notification tool reads Notification Fact only.
- AI tool/adapter roots are governed against `@memoflow/scheduler`, ScheduledInvocation/ScheduleTask and raw worker mutation APIs.
- Focused behavior suite passed **14/14**; API/Desktop composition + API surface + tool wiring passed **20/20**.
- Full package regressions passed: Reminder **470/470**, API **329/329**, Desktop **322/322**, plus complete AI and PowerSync Schema suites.
- Final quality sequence passed: lint, typecheck, build, inventory, target-governance and `memoflow:governance-check`.
- HARD-7101 remains **22/22** and Core vNext architecture lock scans **1769 production source files with 0 violations**.

## Remaining gate

HARD-7104 does not itself archive the umbrella plan. The only remaining active ticket is **HARD-7105**: final five-layer review, focused repair for any P0/P1 finding, delivery/PR reconciliation, and plan archive once the accepted revision is integrated.
