---
tags:
  - analysis
  - core-vnext
  - oss
  - reuse
  - planner
  - scheduler
  - recurrence
  - notification
  - routine
description: MemoFlow Core vNext 的 Build / Borrow / Integrate 决策台账，明确哪些能力直接复用成熟库、哪些只借鉴业务语义、哪些继续由 MemoFlow 持有
created: 2026-08-25T19:18:00+08:00
updated: 2026-09-08T09:00:00+08:00
---

# Core vNext — OSS / Standard Capability Reuse & Reference Ledger

## 1. Purpose

本文件是 `2026-08-25-core-vnext-orchestration.md` 的强制实施附件。

目标不是列一堆“参考项目”，而是为每一类能力明确：

```text
Build      = MemoFlow 自己实现，因为它是产品业务语义 / source of truth
Borrow     = 直接复用成熟 library / primitive，并通过 MemoFlow adapter 隔离
Imitate    = 学习成熟 OSS 的业务语义、状态机、测试矩阵、UI hierarchy；不复制其代码
Integrate  = 把外部系统作为运行时依赖；当前默认不采用，除非单独 gate 通过
```

实施规则：

1. 标准协议、日期算法、Calendar UI、async emitter 等问题优先 Borrow；
2. Goal/KR/Task/Routine 等 MemoFlow 独特业务语义必须 Build；
3. GPL/AGPL 项目默认只 Imitate，不复制代码；
4. 第三方 DTO 不进入 `@memoflow/contracts`；
5. 所有 Borrow 必须通过 MemoFlow-owned adapter + contract tests；
6. 所有 library 决策必须记录 license、维护状态、替换成本；
7. 不因为一个 OSS “功能很多”就引入第二套 source of truth。

---

## 2. Executive decision matrix

| Capability                               | Decision                            | Concrete source                                                                  | MemoFlow boundary                       | Why                                                                         |
| ---------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------- |
| Runtime-local event bus                  | **Borrow / implemented**            | `emittery`                                                                       | `CrossPlatformEventBus` adapter         | async-first、每次 delivery 独立 Promise；删除自研 global drain              |
| Product time facade                      | **Keep + Borrow underneath**        | existing `@memoflow/time` + `date-fns`                                           | `TimeFacade`                            | 已有统一 Instant/Ymd/Hm contract，不重写                                    |
| Zoned / calendar UI date value           | **Borrow / implemented W1**                          | existing `@internationalized/date`; optional `temporal-polyfill` at adapter edge | UI/time adapter                         | 不手写 calendar arithmetic / zoned date object                              |
| Date picker / calendar primitive         | **Borrow / implemented W1 composites**                          | existing shadcn-vue Calendar + Reka UI                                           | `@memoflow/ui-vue-shadcn`               | 已存在、可访问性 primitives 已接入                                          |
| Planner calendar rendering               | **Borrow / implemented**           | FullCalendar Standard Vue 3                                                      | `PlannerCalendarAdapter`                | MIT Standard、成熟 Day/Week/Month/List、drag/resize/revert                  |
| Planner candidate B                      | **Do not adopt for interactive v1** | Schedule-X v4                                                                    | spike only                              | v4 drag/resize 已进入 Premium，不符合低成本重构目标                         |
| Task/Routine recurrence math             | **Borrow / selected**                | `rrule@2.8.1`; `ical.js` deferred                                                 | `RecurrenceEnginePort`                  | fixture 已通过；RFC recurrence math 复用，IANA/Instant 仍由 TimeFacade 持有 |
| ICS import/export                        | **Borrow when needed**              | `ical.js`                                                                        | `ICalendarCodecPort`                    | RFC 5545 parser/serializer 是标准问题；当前不阻塞 vNext                     |
| Internal cron parsing                    | **Keep**                            | existing `cron-parser`                                                           | Scheduler infra only                    | 适合 internal cron，不允许成为 Task/Routine domain recurrence truth         |
| Scheduler upper contract                 | **Build**                           | Trigger.dev semantics as reference                                               | `SchedulingPort` / `ScheduledIntent`    | owner/schedulingKey/handlerKey 是 MemoFlow contract                         |
| Scheduler queue engine                   | **Keep custom / PoC complete**      | current engine; pg-boss 12.30.0 dev-only candidate                                                  | `SchedulingPort` infrastructure adapter | 先稳定上层，避免同时换 seam + engine                                        |
| Scheduling dedupe / timezone semantics   | **Imitate**                         | Trigger.dev                                                                      | stable `schedulingKey`, IANA timezone   | 成熟实践直接对应当前重复 schedule 问题                                      |
| Queue retry / DLQ / singleton semantics  | **Keep custom; imitate pg-boss**    | pg-boss                                                                          | scheduler adapter                       | Postgres queue 成熟，但当前不急于替换                                       |
| Notification Fact / workflow preferences | **Build semantics, imitate**        | Novu                                                                             | Notification domain                     | 保留 MemoFlow source of truth，学习 workflow/global/per-workflow preference |
| Notification UI                          | **Build from existing primitives**  | current MemoFlow + Novu Inbox hierarchy                                          | app-vue                                 | 不接入第二套 Inbox source of truth                                          |
| Routine Active/Idle/Natural Break        | **Build adapters, imitate**         | Workrave / Safe Eyes / Sane Break                                                | `ActivitySensorPort` / `IdleSensorPort` | 平台事实要本地实现；借成熟 state semantics，不复制 GPL code                 |
| Routine intervention phases              | **Imitate**                         | Sane Break / Workrave                                                            | Routine intervention state machine      | Gentle → natural stop → Guided/Strict                                       |
| Focus/Pomodoro/Flowtime                  | **Build state machine, imitate**    | Super Productivity                                                               | `ProtocolSession`                       | 业务状态自有；学习其 session/break separation、race fixes                   |
| Shared Goal/Task classification           | **Build / implemented W1**          | MemoFlow Label contract + persistence                                               | `@memoflow/label`                        | identity-scoped normalized Label; no second tag taxonomy                            |
| Goal / Task business model               | **Build, imitate**                  | Vikunja / Tasks.org / Super Productivity / Leantime etc.                         | Goal/Task bounded contexts              | 业务 source of truth 必须由 MemoFlow 持有                                   |
| UI forms / popup / menu / drawer         | **Borrow primitives**               | shadcn-vue / Reka UI / Vaul Vue                                                  | UI package                              | 禁止重复实现 accessibility primitives                                       |
| Plugin runtime                           | **Defer**                           | Cordis / other plugin kernels only as research                                   | registry seams only                     | 当前只做 plugin-ready registry，不做 installer/runtime/marketplace          |

---

## 2.1 Final implementation checkpoint — 2026-09-08

The candidate decisions above are now closed for Core vNext:

- **Emittery:** adopted and implemented as the runtime-local EventBus backend (ADR-064).
- **rrule 2.8.1:** adopted behind MemoFlow-owned recurrence adapter; timezone truth remains `@memoflow/time`.
- **FullCalendar Standard:** adopted for the Vue Planner; drag/resize is translated back to owner-domain commands.
- **Schedule-X:** reference only; not adopted for the interactive Planner.
- **pg-boss 12.30.0:** PoC completed under POC-6401. Decision is **Keep custom** for current vNext because the existing engine already satisfies API/Desktop/PowerSync/restart-recovery boundaries; pg-boss remains a reproducible dev-only cloud candidate, not production infrastructure.
- **Shared Label:** MemoFlow-owned business capability, fully implemented; third-party task taxonomies were not imported.
- **Routine methods / Protocol:** business state remains MemoFlow-owned; external products remain semantic/test references only.

No Core vNext ticket remains blocked on a third-party dependency decision.

---

## 3. Time system: what is reused, what is not

### 3.1 Keep `@memoflow/time` as the only product time facade

Current asset:

```text
packages/time
  Clock
  TimeFacade
  TimeEngine
  codec
  format
  input
  calendar
```

Decision:

- keep `Instant / Ymd / Hm` public vocabulary;
- keep `date-fns` engine initially;
- do not let FullCalendar / rrule / Temporal types leak into domain contracts;
- third-party date values are translated only at adapter boundaries.

### 3.2 UI date primitives

Directly reuse existing:

```text
@memoflow/ui-vue-shadcn Calendar
@memoflow/ui-vue-shadcn Popover
@memoflow/ui-vue-shadcn Input
@internationalized/date
reka-ui
```

Do **not** implement:

- calendar grid math;
- keyboard date navigation;
- ARIA grid semantics;
- locale month/day calculation;
- range-calendar selection from scratch.

MemoFlow only builds thin product composites such as:

```text
DateField
DateTimeField
TimeField
ReminderOffsetField
RecurrenceField
```

These composites translate product contracts to existing primitives.

### 3.3 Temporal

FullCalendar v7 and Schedule-X both use/encourage Temporal-style values. MemoFlow should **not** immediately rewrite `@memoflow/time` to Temporal.

Use a spike:

```text
TimeFacade Instant/Ymd/Hm
  <-> Planner adapter
  <-> Temporal.PlainDate / ZonedDateTime
```

`temporal-polyfill` may be adopted only at the Planner adapter boundary if FullCalendar needs it.

Exit condition for any wider Temporal migration:

- measurable simplification of timezone/DST code;
- parity fixtures pass;
- no third-party type leakage;
- no duplicate date abstractions in feature domains.

---

## 4. Recurrence: stop extending home-grown date scanning

### 4.1 Current problem

Current Task recurrence generation manually walks each local day and contains incomplete branches:

```text
Daily   -> modulo calendar days
Weekly  -> modulo weeks + weekday filter
Monthly -> true
Yearly  -> true
getNextOccurrence -> afterDate + ONE_DAY_MS
```

This is acceptable characterization evidence but not a good long-term recurrence engine.

### 4.2 Preferred Borrow candidate: `rrule`

Package:

```text
rrule
```

Use for:

- FREQ;
- INTERVAL;
- BYDAY;
- COUNT;
- UNTIL;
- monthly/yearly recurrence;
- next occurrence queries;
- finite scope generation.

Why candidate A:

- implements iCalendar recurrence rules;
- TypeScript-friendly;
- permissive BSD-3-Clause license;
- high ecosystem usage;
- narrow enough to hide behind an adapter.

Important constraint:

`rrule` has documented differences from strict RFC behavior. Therefore MemoFlow must own a recurrence conformance fixture and not treat library output as unquestionable business truth.

### 4.3 Candidate B: `ical.js`

Use when MemoFlow needs:

- full ICS / iCalendar parsing;
- VEVENT import/export;
- RRULE + EXDATE / RDATE interoperability;
- calendar integration.

License: MPL-2.0.

Do not adopt it merely to generate simple Task occurrences if `rrule` passes the MemoFlow fixture with a smaller adapter.

### 4.4 TIME-1102 spike verdict (2026-08-25)

**Decision: Borrow `rrule@2.8.1` behind MemoFlow-owned `RecurrenceEnginePort`. Defer `ical.js`.**

Conformance evidence executed in the repository covers:

```text
Daily
Weekly + BYDAY
Monthly
Yearly
INTERVAL > 1
COUNT
UNTIL
month-end (Jan 31)
leap day (Feb 29)
Asia/Tokyo wall clock
America/New_York spring/fall DST
next occurrence
```

The fixture passes through MemoFlow primitives only (`Instant / Ymd / Hm`); no `rrule` type appears in `@memoflow/contracts` or the Task adapter.

Candidate comparison recorded from the npm registry on 2026-08-25:

| Candidate | Version | License | Unpacked size | Registry modified | Verdict |
| --- | ---: | --- | ---: | --- | --- |
| `rrule` | 2.8.1 | BSD-3-Clause | 687,245 B | 2023-11-10 | **Selected for recurrence math** |
| `ical.js` | 2.2.1 | MPL-2.0 | 1,200,090 B | 2025-08-08 | Deferred to ICS/VEVENT interoperability |

Why `ical.js` was not added to the implementation spike: the mandatory MemoFlow recurrence fixture exposed no recurrence case that `rrule` could not model cleanly. Pulling a full ICS parser/serializer into this boundary would add API and package surface without solving an observed gap.

One important implementation finding changed the adapter shape: direct `rrule` `TZID` output was consistent in a bare Node/CJS probe but produced a host-offset-dependent result in the repository's ESM/Vitest execution mode. Therefore MemoFlow **does not delegate product timezone truth to `rrule`**. The selected adapter uses `rrule` in floating UTC-shaped calendar space for recurrence math, then converts wall-clock `Ymd/Hm` to/from `Instant` through the existing ADR-037 timezone boundary. This keeps DST/IANA semantics in one MemoFlow-owned place and makes replacing `rrule` later inexpensive.

Bundle/runtime impact is bounded: `rrule` is an external dependency of `@memoflow/time` rather than a type/API dependency of feature contracts. `@internationalized/date` remains an adapter-test/dev dependency for the internal UI conversion boundary; this worker does not add a new public package export. UI-1101 can promote that adapter through the repository public-surface train when it is actually consumed.

### 4.5 Domain remains MemoFlow-owned

Library computes **dates**, not Task outcome.

Still MemoFlow:

```text
TaskPlan lifecycle
TaskOccurrence Completed/Missed/Skipped
pause/resume
exceptions/waiver
completion policy
Plan Succeeded/Failed/Abandoned
Goal contribution settlement
```

Similarly Routine recurrence library does not own:

```text
Profile gates
snooze
Natural Break
ActiveUsage
Protocol Session
```

---

## 5. Planner: prefer FullCalendar Standard over rebuilding week/month layout

### 5.1 Candidate A — FullCalendar Standard

Target spike packages for current v7 line:

```text
@fullcalendar/vue3
# v7 connector is self-contained; install only documented standard plugins/features needed
# temporal-polyfill if required by selected date APIs
```

Required capabilities to validate:

```text
Day
Week / TimeGrid
Month / DayGrid
Agenda/List
now indicator
selection
editable event drag
resize
revert on failed owner command
custom event content
source-specific editable=false
keyboard/accessibility baseline
responsive embedding in MemoFlow panel
```

Adopt only **Standard** features.

Reasons:

- official Vue 3 connector;
- Standard code is MIT;
- event drag and resize provide callback + `revert()` semantics;
- mature ecosystem and long-lived calendar behavior;
- avoids maintaining custom Day/Week/Month layout math.

### 5.2 Candidate B — Schedule-X

Schedule-X remains useful as UI/architecture reference, especially its Temporal model and plugin architecture.

Do not choose it for MemoFlow Planner v1 because Schedule-X v4 moved drag-and-drop and resize to paid Premium packages. MemoFlow specifically needs drag/resize as core Planner interactions.

### 5.3 Adapter rule

FullCalendar never becomes owner of domain events.

```text
CalendarEventProjection
    -> PlannerCalendarAdapter
    -> FullCalendar EventInput

FullCalendar eventDrop
    -> ownerCommandTarget
    -> Task/Goal/Routine/CalendarEntry command
    -> success: projection refresh
    -> failure: info.revert()
```

Never:

```text
FullCalendar event object
 -> direct ScheduleTask mutation
```

---

## 6. Scheduler: learn from Trigger.dev, postpone engine replacement

### 6.1 Directly imitate Trigger.dev invariants

Trigger.dev requires a deduplication key for dynamically created schedules; repeated creation with the same key updates rather than duplicates. It also uses explicit IANA timezone semantics.

MemoFlow adopts the invariant as:

```text
schedulingKey = stable business identity
runAt = resolved Instant
handlerKey = runtime dispatch identity
owner = reconciliation scope
```

Examples:

```text
task-instance:{id}:reminder:30m-before-start
goal:{id}:remaining-days:7
routine:{id}:occurrence:{instant}
```

### 6.2 Final decision: keep the current Scheduler engine

Current MemoFlow already has:

- queue;
- lease;
- claim;
- retry;
- execution history;
- restart recovery;
- Prisma / PowerSync paths.

These capabilities remain the production engine after POC-6401; no queue-engine replacement is part of Core vNext closure.

First:

```text
Feature -> SchedulingPort -> existing ScheduleTask adapter
```

Business packages no longer own/import raw ScheduleTask execution behavior, and the pg-boss PoC has been completed. The current production decision is still **Keep custom**.

### 6.3 pg-boss PoC — complete, not adopted

Learn/compare:

- Postgres-backed queues;
- singleton / strict FIFO policies;
- retryLimit / retryDelay / exponential backoff;
- heartbeat and expiration;
- dead-letter + redrive;
- deferred jobs;
- transaction adapter possibilities.

POC-6401 compared pg-boss 12.30.0 against MemoFlow's actual API/Desktop/PowerSync/restart constraints. The PoC remains reproducible, but no production architecture change was justified; pg-boss is retained only as a dev candidate for a future evidence-driven reevaluation.

---

## 7. Notification: imitate Novu hierarchy, keep MemoFlow source of truth

Novu provides a mature separation between:

```text
Workflow channel capability/default
Subscriber global channel preferences
Subscriber per-workflow channel preferences
Critical/read-only workflow
Inbox fact
Channel delivery
```

MemoFlow should adopt these semantics as its own contracts:

```text
NotificationRequested
 -> Notification Fact
 -> DeliveryPlan[]
 -> per-channel Outbox
```

Do **not** integrate Novu service in this refactor because MemoFlow already has:

- Notification persistence;
- InApp/SSE;
- dispatch outbox;
- lease/fencing/retry;
- Electron delivery;
- preferences.

Adding Novu now would create a second notification source of truth and migration burden.

Borrow semantic names / test cases, not runtime ownership.

---

## 8. Routine Coach: imitate mature behavior, never copy GPL implementation

### 8.1 Workrave

Use as semantic/test reference for:

- microbreak vs rest break;
- active/idle interpretation;
- break warning;
- recovery after idle;
- runtime modes;
- Windows/Linux behavior matrix.

Workrave is GPL-3.0: **no source copying into MemoFlow** unless license strategy changes. Current use is architecture/product research only.

### 8.2 Safe Eyes

Use as semantic reference for:

- Smart Pause;
- platform-specific IdleMonitor abstraction;
- X11 / Wayland / GNOME adapter split;
- crediting idle duration;
- pre-break activity behavior;
- plugin-like capability boundaries.

Safe Eyes is GPL-3.0: reference behavior/tests, do not copy code.

### 8.3 Sane Break

Use as UX/state reference for:

```text
Phase 1 gentle unobtrusive reminder
 -> user naturally stops
 -> Phase 2 actual break
```

Also learn:

- idle pauses break timer;
- long idle resets timer/cycle;
- avoid giant Skip/Postpone affordances that train mindless dismissal.

### 8.4 Super Productivity

Super Productivity is MIT and actively maintained. Use it as the primary code-level reference for:

- Focus Mode state organization;
- Pomodoro cycle transitions;
- Flowtime break semantics;
- break/session separation;
- task tracking coordination;
- desktop taskbar/focus integration;
- race-condition test cases around break start/end and active task tracking.

Do not copy its Angular/NgRx architecture wholesale into Vue/DDD. Extract state-machine invariants and focused implementation patterns only.

---

## 9. Goal / Task OSS use policy

From previous research:

- Vikunja: recurring task/reminder semantics, user-focused task dates, API behaviors;
- Tasks.org: personal recurring task UX and completion model;
- Super Productivity: Today/focus/timeboxing and instance-oriented execution;
- Leantime: goal/project semantics reference;
- Loop / other habit apps: streak/occurrence semantics where relevant.

MemoFlow owns:

```text
Goal
KeyResult
GoalRecord
Task
TaskPlan
TaskOccurrence
TaskGoalLink
ContributionSettlement
```

Third-party projects are used for:

```text
state naming
interaction hierarchy
failure cases
migration tests
recurrence edge cases
information architecture
```

not as embedded business stores.

---

## 10. UI primitive reuse map

### Directly reuse existing MemoFlow dependency tree

```text
shadcn-vue
reka-ui
@internationalized/date
@vueuse/core
vaul-vue
vee-validate
zod
lucide
```

### New MemoFlow composites allowed

Thin composition only:

```text
DateField
DateTimeField
TimeField
DurationField
ReminderOffsetField
RecurrenceEditor
LabelPicker
EntityLinkPicker
ProgressRow
OccurrenceStatusBadge
```

### Do not build

```text
custom popover engine
custom focus trap
custom keyboard roving tabindex
custom calendar month grid
custom dropdown/menu positioning
custom modal stack
custom form validation framework
```

---

## 11. Build / Borrow gates by implementation ticket

Every ticket touching a standard capability must contain this checklist in its PR/worktree notes:

```text
[ ] Is this a MemoFlow-specific business rule?
[ ] Does a maintained standards/library solution exist?
[ ] License checked?
[ ] Maintenance/release activity checked?
[ ] Third-party type isolated behind adapter?
[ ] MemoFlow contract tests exist?
[ ] Failure/DST/timezone/offline cases tested?
[ ] Can this dependency be removed without rewriting the domain?
```

If the answer to “MemoFlow-specific business rule?” is no and a mature permissive library exists, default decision is **Borrow**, not Build.

---

## 12. Official references used by this ledger

### Time / recurrence

- RFC 5545: <https://www.rfc-editor.org/rfc/rfc5545>
- rrule: <https://github.com/jkbrzt/rrule>
- ical.js: <https://github.com/kewisch/ical.js>

### Planner

- FullCalendar Vue: <https://fullcalendar.io/docs/vue>
- FullCalendar dragging/resizing: <https://fullcalendar.io/docs/event-dragging-resizing>
- Schedule-X Vue: <https://schedule-x.dev/docs/frameworks/vue>
- Schedule-X v4 Premium split: <https://schedule-x.dev/blog/schedule-x-v4>

### Scheduler

- Trigger.dev Scheduled Tasks: <https://trigger.dev/product/scheduled-tasks>
- pg-boss: <https://github.com/timgit/pg-boss>

### Notification

- Novu Preferences: <https://docs.novu.co/platform/concepts/preferences>
- Novu Workflows: <https://docs.novu.co/platform/concepts/workflows>

### Routine / focus

- Workrave: <https://github.com/rcaelers/workrave>
- Safe Eyes: <https://github.com/slgobinath/SafeEyes>
- Sane Break: <https://github.com/AllanChain/sane-break>
- Super Productivity: <https://github.com/super-productivity/super-productivity>

### Runtime events

- Emittery: <https://github.com/sindresorhus/emittery>
