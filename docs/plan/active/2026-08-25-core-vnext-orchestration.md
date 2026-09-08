---
tags:
  - plan
  - active
  - core-vnext
  - orchestration
  - goal
  - task
  - routine
  - planner
  - scheduler
  - notification
  - event-bus
  - parallel
description: MemoFlow Goal/Task/Routine/Planner/Scheduler/Notification/EventBus 的总重构编排计划，按依赖、共享热点和可并行 lane 组织，并为每个标准能力指定 Build/Borrow/Imitate 来源
created: 2026-08-25T19:18:00+08:00
updated: 2026-09-04T23:25:00+08:00
status: active
---

# MemoFlow Core vNext — Unified Refactor Orchestration

## 0. Executive decision

本计划成为以下工作的**唯一执行顺序真值**：

- Goal / Task vNext；
- Routine Coach vNext；
- Schedule / Planner 与 Scheduler 分层；
- Notification Fact / Delivery Policy；
- Runtime EventBus；
- shared time / recurrence / calendar UI；
- 与上述模块直接相关的 Desktop surfaces、AI contracts、Mobile parity。

已有子计划继续保留详细业务上下文，但**不得再按各自 Phase 编号独立推进**：

- `../archive/2026-08-25-goal-task-vnext-refactor.md`
- `../archive/2026-08-25-scheduling-notification-vnext-refactor.md`

本计划解决它们之间的交叉依赖和重复迁移问题。

## 0.1 v0.11 merge milestone closure — 2026-08-29

The integration milestone carried by PR #281 is **closed for merge** at the product boundary that has actually been implemented and production-verified. This is a scope freeze, not a claim that every long-horizon Wave 6/7 ticket is complete.

Included in the v0.11 merge milestone:

- Wave 0–2 contract/domain foundations and schema convergence;
- Wave 3 durable scheduling/notification/settlement verticals;
- Wave 4 Routine local runtime and FullCalendar Planner cutover;
- Web/Desktop primary Goal, Task, Routine, Planner, and Notification product surfaces implemented on the vNext contracts;
- production deployment rebuild, exact-digest runtime pinning, Production GitHub App install/connect/webhook acceptance, and transactional email recovery;
- current PR exact-head required CI, governance, Web flow, integration, coverage, performance, and delivery observation gates.

Explicitly **deferred post-v0.11** and therefore not merge blockers for this milestone:

- `ROUTINE-5302` method-library product catalog;
- `AI-6101~6103` AI parity/tooling;
- `MOBILE-6201/6202` React/mobile parity;
- `CLEAN-6301~6304` residual legacy/physical cleanup beyond the product-boundary locks already landed;
- `POC-6401` pg-boss build-vs-adopt experiment;
- remaining long-horizon `HARD-7101~7104` matrix/docs work that depends on those deferred surfaces.

The final merge-readiness review found **no unresolved P0/P1 inside the v0.11 milestone scope**. Evidence and the deferred ledger are recorded in `docs/analysis/2026-08-29-core-vnext-v011-merge-readiness.md`. The remaining Desktop GitHub installation live test is a **release acceptance gate on the newly built Windows package**, not an integration-branch merge gate.

## 0.2 Active-plan truth audit — 2026-09-04

This umbrella remains active **only for post-v0.11 residuals**. Wave 0–5 must not be restarted by future agents. The previous §19 checklist was stale because it left already-verified milestone work unchecked.

Verified complete in current `main`:

- Goal Direction/Measurement + KR Measurement V2; Task Action/Execution + occurrence/plan + Goal contribution separation;
- Routine Profile/Trigger/Protocol domain semantics and separated WallClock / ActiveUsage runtime;
- Emittery EventBus, standard recurrence adapter, stable `schedulingKey`, atomic reconcile, durable NotificationRequested and production DND/rate-limit policy;
- FullCalendar Planner, owner-aware edits, Web/Desktop Goal/Task/Routine/Notification product surfaces, InterventionWindow and FocusWindow;
- v0.11 milestone fixture/parity/governance evidence and current-main required CI.

Post-v0.11 residual truth — 2026-09-08:

- `ROUTINE-5302`: **DONE** — six-method curated Method Library is implemented; WallClock presets reuse existing Routine configuration and Protocol methods remain deterministic ProtocolSession-owned (`e3e5ae29aef`);
- `AI-6101`: **DONE** — Goal/Task drafts use current Shared Label / Measurement / recurrence / Goal Link / optional contribution semantics; retired Task `folderId/tags/color` are absent (`4a7b8f154e8`);
- `AI-6102/6103`: **DONE** — approved Routine command tools plus read-only Planner/Notification tools are wired in both API/Desktop; governance forbids raw Scheduler access (`2abcbd5591eb`);
- `MOBILE-6201/6202`: **DONE by parity audit + focused repair** — React/mobile consumes current Goal/Task/Notification contracts, Task Shared Label editing is wired, and no Folder/Dependency/ValueType/raw Scheduler mutation surface remains;
- `CLEAN-6301~6304`: **DONE** — owner-domain direct `ScheduleTask.create(...)`, `SourceModule` execution fallback, raw product worker mutation surfaces, Reminder scanner/ControlMode and obsolete product duplicates are removed; `packages/schedule` owns Planner/Calendar while `packages/scheduler` owns the Temporal Engine;
- `POC-6401`: **DONE / Keep custom** — pg-boss 12.30.0 remains a reproducible dev-only candidate, not production infrastructure;
- `HARD-7101~7104`: **DONE** — 22/22 failure matrix, production architecture locks, full A-J/host/local-Docker/schema acceptance and documentation/ADR truth closure are complete. `HARD-7105` is the only remaining umbrella ticket.

Execution priority is redefined in §20 below; historical Wave 0/1 text remains evidence only.

## 0.3 Historical implementation checkpoint — Wave 0 / Wave 1

Wave 0 evidence is frozen in [`Core vNext Wave 0 — Baseline / Acceptance / Shared-Train Evidence`](../../analysis/2026-08-25-core-vnext-wave-0-baseline-and-acceptance.md).

| Ticket group      | Status   | Canonical evidence / implementation                                                                                                      |
| ----------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `CORE-0001~0005`  | **DONE** | frozen map + A–J fixtures + train map + OSS gate; child plans rebased below                                                              |
| `EVT-1001`        | **DONE** | ADR-064, Emittery-backed runtime EventBus                                                                                                |
| `TIME-1101~1103`  | **DONE** | `RecurrenceEnginePort`, `rrule@2.8.1`, Task recurrence adapter, timezone/DST fixtures                                                    |
| `UI-1101`         | **DONE** | shared Date/Time/DateTime/Duration/ReminderOffset fields using existing shadcn/Reka primitives                                           |
| `LABEL-1101`      | **DONE** | canonical Label contracts + `@memoflow/label` + Prisma/PowerSync Goal/Task assignment persistence                                        |
| `SCHED-1101~1105` | **DONE** | canonical neutral contracts, first-class scheduling identity, atomic owner reconcile + durable receipt, HandlerRegistry composition hook |
| `NOTIF-1101/1102` | **DONE** | per-channel policy correctness + production DND/rate-limit path                                                                          |

**Wave 2 execution point (closed 2026-08-26):** `GOAL-2101~2103`, `TASK-2201~2205`, `ROUTINE-2301~2303`, and `NOTIF-2401/2402` are integrated and gate-verified.

**Historical execution point (2026-08-27):** Wave 3 vertical integration and both Wave 4 lanes had closed and Wave 5 was in progress. This is no longer the current queue. By the 2026-08-29 v0.11 closure, the primary Web/Desktop Goal, Task, Routine, Planner and Notification surfaces were complete; current work is residual-only as listed in §0.2 and §20.

**Wave 1 gate evidence (2026-08-25):**

- Event foundation: `utils` 144 tests, `patterns` 35 tests, contracts typecheck green.
- Time/recurrence: 31 tests + typecheck/build green; Storybook exposed and the integration train repaired an `rrule` ESM default-import bundling defect.
- Task recurrence consumer: 847 tests + typecheck green.
- Scheduling: 399 focused tests + 28 Prisma integration tests + typecheck green; orchestration 10 tests + typecheck green.
- Notification: 297 tests + typecheck green.
- Shared Label: 5 unit tests + 3 PostgreSQL integration tests + typecheck/build green; PowerSync transaction behavior is included in the unit suite.
- Shared date/time UI: 4 interaction/accessibility tests + `vue-tsc` + package build + production Storybook build green.
- Schema/tooling: Prisma schema valid, PowerSync schema build green, Nx `sync:check` green, test inventory green (`1085` files).
- Repository governance: `docs:check` and `governance:check` green after registering the new Label project/export and removing the obsolete UI-test exemption.

North Star：

```text
Business Domains
  Goal     = Outcome / Measurement
  Task     = Action / Execution
  Routine  = Behavior / Rhythm
        │
        ├─ domain events -> Runtime EventBus (fast path)
        ├─ durable integration events / Outbox (reliable side effects)
        ├─ calendar projection -> Planner
        └─ scheduling intent -> Scheduler
                                  │
                                  -> HandlerRegistry
                                  -> domain handler
                                  -> NotificationRequested
                                  -> Notification Fact / Delivery Plan
```

Routine 另有本地确定性运行路径：

```text
Activity / Idle / Context Sensors
          -> Local Routine Runtime
          -> RoutineOccurrence
          -> Intervention / Focus Surface
```

---

# 1. Outcome

本轮完成后，MemoFlow 核心个人生产力闭环应具备以下可观察行为：

```text
Goal
  -> 定义可衡量结果
  -> Task / Task Plan 执行
  -> optional Goal contribution settlement
  -> progress / review

Task
  -> Today / Upcoming 实例执行
  -> recurrence / outcome / plan lifecycle
  -> reminder projection
  -> Planner projection

Routine
  -> WallClock durable routine
  -> ActiveUsage / Natural Break local routine
  -> Protocol Session / Focus Window

Planner
  -> 聚合 Task / Goal / Routine / manual CalendarEntry
  -> source-aware edit routes back to owner domain

Scheduler
  -> neutral future invocation
  -> stable identity / reconcile / retry / recovery

Notification
  -> durable message fact
  -> per-channel preference / DND / rate-limit
  -> Desktop / InApp / future Push/Email delivery
```

用户不需要理解：

```text
ScheduleTask
SourceModule
worker lease
cron
TaskTemplate engineering model
GoalFolder
Task DAG
ReminderGroup ControlMode
Notification delivery internals
```

---

# 2. Constraints and implementation posture

## 2.1 Speed-first development posture

当前项目仍处于快速产品成型阶段。本轮优先目标是：

```text
尽快到达一套清晰、完整、可验证、后续不需要再次大规模拆边界的 vNext
```

因此：

- 无价值数据可以 reset 时，不为旧 schema 构建长期双写系统；
- 兼容 bridge 只用于降低同一批迁移风险，不成为永久 v1/v2 双轨；
- 标准能力优先 Borrow，不从零实现；
- 业务语义一次收敛，不先迁旧模型再迁新模型；
- UI 在 domain/contract 稳定后重建，不为旧 DTO 做新壳。

## 2.2 Protected assets

不得因“大重构”丢失：

- `@memoflow/time` Product Time contract；
- optimistic concurrency；
- Goal / Task transaction runners；
- Task -> Goal durable outbox / GoalRecord correlation；
- Schedule claim / lease / retry / restart recovery；
- ReminderOccurrence idempotency / fencing / transaction assets；
- NotificationDispatchOutbox / per-channel retry / DLQ；
- API / Desktop transport parity；
- Prisma / PowerSync identity isolation；
- Electron context isolation / preload least privilege；
- Result / failure contracts；
- existing runtime module composition pattern。

---

# 3. Build / Borrow / Imitate policy

Mandatory companion ledger:

- [`Core vNext — OSS / Standard Capability Reuse & Reference Ledger`](../../analysis/2026-08-25-core-vnext-reuse-and-reference-ledger.md)

Default decisions:

```text
Event Bus       -> Borrow Emittery (already implemented)
Product Time    -> Keep @memoflow/time + date-fns
Date UI         -> Borrow shadcn-vue / Reka UI / @internationalized/date
Planner UI      -> Prefer FullCalendar Standard Vue 3 after PoC
Recurrence      -> Prefer rrule adapter; ical.js only if interoperability needs it
Scheduler seam  -> Build MemoFlow contract; imitate Trigger.dev dedupe/timezone
Scheduler engine-> Keep current first; pg-boss PoC only after seam stable
Notification    -> Build existing domain; imitate Novu preference/workflow semantics
Routine         -> Build domain; imitate Workrave/Safe Eyes/Sane Break
Focus runtime   -> Build state machine; imitate Super Productivity
Plugin system   -> Defer; only registry/port seams now
```

No ticket may reimplement a standard capability before completing its Build/Borrow check.

---

# 4. Parallel execution model

## 4.1 Why “parallel” needs ownership

Naive parallelism is unsafe because many lanes touch the same files:

```text
@memoflow/contracts
packages/database
packages/schedule-orchestration
packages/ui-vue-shadcn
apps/desktop/src/main
apps/api/src/runtime
```

Therefore use **domain lanes + shared trains**.

## 4.2 Long-lived logical lanes

| Lane                | Owns                                       | Normally may edit                                                        |
| ------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| L-A Goal            | Goal/KR/Review                             | `packages/goal`, app-vue goal                                            |
| L-B Task            | Task/Plan/Occurrence/Contribution          | `packages/task`, app-vue task                                            |
| L-C Routine         | Routine/Profile/Protocol                   | `packages/reminder` -> routine-compatible code, app-vue reminder/routine |
| L-D Scheduling      | neutral scheduling + scheduler adapters    | `packages/schedule`, `packages/schedule-orchestration`                   |
| L-E Notification    | Fact/Policy/Delivery                       | `packages/notification`, app-vue notification                            |
| L-F Planner         | calendar read model / FullCalendar adapter | app-vue schedule, planner-specific client code                           |
| L-G Desktop Runtime | sensors/windows/local surfaces             | `apps/desktop/src/main`, desktop runtime adapters                        |
| L-H AI/Mobile       | AI drafts/tools + React mobile parity      | `packages/ai`, app-react/mobile                                          |

## 4.3 Shared trains — single writer per wave

### Contract Train

Owns:

```text
packages/contracts
public schema names
cross-module event maps
shared primitives
```

Rule: domain lane proposes a contract patch; only Contract Train lands it during that wave.

### Schema Train

Owns:

```text
packages/database Prisma schema/migrations/generated contracts
PowerSync schema mapping changes shared by multiple domains
```

Rule: one schema bundle per wave, generated after all domain proposals for that wave are frozen.

### Orchestration Train

Owns shared mutations to:

```text
packages/schedule-orchestration registry/runtime core
apps/api runtime composition shared files
apps/desktop composition shared files
```

Feature lanes add isolated projectors/handlers where possible; central registry changes go through this train.

### UI Core Train

Owns:

```text
packages/ui-vue-shadcn exports
shared DateField / LabelPicker / common primitives
```

Feature lanes consume only published primitives.

## 4.4 Worktree rule

For parallel execution:

```text
main worktree = review + integration only
one ticket/group = one isolated worktree/branch
```

Suggested names:

```text
core-vnext/w1-time
core-vnext/w1-scheduling
core-vnext/w1-notification
core-vnext/w2-goal
core-vnext/w2-task
core-vnext/w2-routine
core-vnext/w4-planner
core-vnext/w4-routine-local
```

Do not run two agents against the same mutable worktree.

---

# 5. Dependency graph

```text
W0 Baseline / Governance
        │
        ▼
W1 Shared Foundations
 ├─ EventBus stable [done]
 ├─ Time + recurrence adapters
 ├─ UI time primitives
 ├─ SchedulingPort + stable identity
 ├─ HandlerRegistry skeleton
 ├─ Notification P0 correctness
 └─ Shared Labels foundation
        │
        ▼
W2 Business Contract Stabilization
 ├─ Goal / KR / Review
 ├─ Task / Occurrence / Plan
 ├─ Routine / Profile / Trigger
 └─ Notification Fact / workflow contracts
        │
        ▼
W3 Vertical Integration
 ├─ Task -> Scheduler -> Notification
 ├─ Goal -> Scheduler -> Notification
 ├─ Routine WallClock -> Scheduler
 ├─ Task -> Goal settlement
 └─ durable projection repair
        │
        ├────────────────────┐
        ▼                    ▼
W4 Local Routine Runtime    W4 Planner Engine
        │                    │
        └─────────┬──────────┘
                  ▼
W5 Product UI Rebuild
 ├─ Goal
 ├─ Task
 ├─ Routine
 ├─ Planner
 └─ Notification
                  │
                  ▼
W6 AI / Mobile / Dead Surface Deletion
                  │
                  ▼
W7 Failure Matrix / Full Acceptance / Docs Closure
```

---

# 6. Wave 0 — Baseline, ownership and characterization

Goal: freeze current behavior and make later parallel work safe.

Parallelism: `CORE-0001`, `CORE-0002`, `CORE-0003`, `CORE-0004` may run in parallel; `CORE-0005` merges their output.

## CORE-0001 — Freeze Core vNext system map

**Lane:** Integration / architecture  
**Goal:** Produce one current-system map for Goal/Task/Routine/Schedule/Notification/EventBus.  
**Reuse/Reference:** existing ADR-033, ADR-053~064; no new code.

**Implementation:**

1. inventory cross-package imports among the six core packages;
2. inventory all `ScheduleTask.create` calls;
3. inventory all `NotificationPort` calls from scheduler execution;
4. inventory Reminder Cron and Schedule Queue startup paths;
5. inventory Task recurrence calculators and generation entry points;
6. inventory Planner custom Day/Week/Month components;
7. inventory current date/time UI components;
8. save machine-readable grep lists under analysis evidence or plan appendix.

**Acceptance:** every destructive ticket can point to current consumers and owner.

## CORE-0002 — Freeze acceptance scenario suite

**Lane:** test architecture  
**Goal:** Turn product discussions into reusable fixtures.  
**Reference:** Goal/Task vNext and Routine vNext product docs.

Create fixture scenarios:

```text
A. Graduation / second-class points 15-day plan
B. Running 100km EachCompletion
C. Weight 75 -> 70 Last measurement
D. One-time task 14:00 + reminder -30m
E. Goal due date -7d
F. Routine 23:30 wall-clock + snooze
G. Stand routine ActiveUsage 40m + natural idle break
H. 50/10 protocol with restart recovery
I. DND mixed-channel notification
J. Planner Task drag 14:00 -> 16:00 + failed command revert
```

**Acceptance:** fixture IDs are referenced by later unit/integration/E2E tests.

## CORE-0003 — Contract and schema hotspot map

**Lane:** Contract Train + Schema Train  
**Goal:** Prevent parallel agents from colliding on central files.

**Implementation:**

1. map all planned contract additions/removals by wave;
2. map Prisma model/column changes by wave;
3. identify migration-reset decision points;
4. define one contract bundle and one schema bundle per wave;
5. define generated-code ownership;
6. forbid feature lanes from independently regenerating shared schema during same wave.

**Acceptance:** every W1/W2 ticket declares whether it needs Contract/Schema Train.

## CORE-0004 — OSS/license decision verification

**Lane:** architecture  
**Goal:** Validate the reuse ledger before dependency addition.

Required checks:

```text
Emittery        direct use / existing
FullCalendar    Standard MIT only
Schedule-X      no Premium dependency
rrule           adapter candidate
ical.js         optional interoperability candidate
pg-boss         PoC only
Novu            semantic reference only
Workrave        GPL reference only
Safe Eyes       GPL reference only
Super Productivity MIT reference
```

**Acceptance:** no dependency added without explicit decision record.

## CORE-0005 — Rebase child plans onto umbrella order

**Depends:** CORE-0001~0004  
**Goal:** Existing child plans remain useful but cannot conflict in ordering.

**Implementation:**

1. add orchestration notice to both child Active Plans;
2. map each old phase to Core vNext ticket IDs;
3. remove wording that implies independent sequential execution;
4. update Active Plan index;
5. mark EventBus ADR-064 implemented foundation;
6. mark unresolved child items as delegated, not duplicated.

**Acceptance:** a future agent reading any child plan is directed here for actual order.

---

# 7. Wave 1 — Shared foundations

Goal: stabilize seams that all business lanes depend on.

Parallel lanes after W0:

```text
L1 Time/Recurrence
L2 Scheduling Foundation
L3 Notification P0
L4 Shared Labels
L5 UI Core
```

`EVT-1001` is already implemented and becomes a prerequisite, not new work.

## EVT-1001 — Runtime EventBus uses Emittery [DONE]

**Status:** implemented under ADR-064.  
**Borrow:** `emittery`.

Protected semantics:

```text
send()     fire-and-forget
 dispatch() awaited delivery scoped to one event
Outbox     durable fallback
reconcile  correctness repair
```

Gate before W3: root typecheck + utils/patterns tests remain green after merges.

## TIME-1101 — Preserve TimeFacade and define third-party conversion boundary

**Lane:** L1  
**Goal:** Prevent recurrence/calendar libraries from creating a second product time model.  
**Borrow:** existing `date-fns`, `@internationalized/date`; Temporal only at adapters.

**Implementation:**

1. add adapter-level conversion contract tests for `Instant <-> Date`;
2. add `Ymd/Hm <-> UI date value` tests;
3. define IANA timezone resolution input source;
4. define DST fixture set;
5. document no third-party date type in feature contracts;
6. add governance rule if a simple AST/import check is practical.

**Acceptance:** Task/Goal/Routine contracts remain `Instant/Ymd/Hm` based.

## TIME-1102 — Recurrence engine comparative spike

**Lane:** L1  
**Goal:** Select a mature recurrence engine instead of growing current daily scan.  
**Borrow candidates:** `rrule`, `ical.js`.

**Implementation steps:**

1. build MemoFlow-owned `RecurrenceEnginePort` test fixture without library types;
2. include Daily / Weekly / Monthly / Yearly;
3. include interval >1;
4. include BYDAY;
5. include COUNT finite plan;
6. include UNTIL/end date;
7. include leap day/month-end;
8. include timezone/DST cases where applicable;
9. implement temporary `rrule` adapter;
10. implement minimal `ical.js` comparison only for cases `rrule` cannot model cleanly;
11. record correctness, API complexity, license, bundle impact;
12. choose one engine for Task/Routine recurrence date generation.

**Default expected decision:** `rrule` for recurrence math; `ical.js` deferred to ICS interoperability.

**Acceptance:** explicit Build/Borrow verdict and passing fixture.

## TIME-1103 — Replace unsafe recurrence primitives behind adapter

**Depends:** TIME-1102  
**Lane:** L1 + Task lane consultation  
**Goal:** Stop using `afterDate + 86400000` and incomplete Monthly/Yearly placeholders as canonical recurrence behavior.

**Implementation:**

1. preserve current behavior with characterization tests;
2. introduce adapter without changing Task public contract;
3. route `getNextOccurrence` through adapter;
4. route finite occurrence generation through adapter;
5. preserve Task business exception filtering after generated dates;
6. verify month-end / DST / leap fixtures;
7. delete old duplicated calendar arithmetic only after parity/new intended semantics pass.

**Acceptance:** recurrence date generation has one engine boundary.

## UI-1101 — Shared Date/Time form composites

**Lane:** L5 UI Core  
**Borrow:** shadcn-vue Calendar/Popover/Input, Reka UI, `@internationalized/date`, `@memoflow/time`.

Build thin composites:

```text
DateField
TimeField
DateTimeField
DurationField
ReminderOffsetField
```

**Implementation:**

1. use existing Calendar primitive, no new calendar grid;
2. use keyboard-accessible Popover/Dialog primitives;
3. convert only through TimeFacade/UI adapter;
4. support empty/all-day state;
5. support locale labels;
6. add Storybook cases: empty/filled/disabled/error/narrow panel;
7. add accessibility interaction tests;
8. export through UI package once.

**Acceptance:** Goal/Task/Routine later consume the same primitives without sharing domain DTOs.

## LABEL-1101 — Shared Label contract + persistence

**Lane:** L4  
**Goal:** Establish the new classification foundation before deleting Folder/Category.  
**Reference:** existing Goal/Task vNext ADR-054; shadcn command/popover primitives for UI later.

**Implementation:**

1. Contract Train adds Label DTO/commands;
2. Schema Train adds Label / GoalLabel / TaskLabel;
3. unique normalized identity-scoped name;
4. Prisma + PowerSync adapters;
5. label list/search/create/update/delete;
6. Goal/Task mutation accepts `labelIds[]`;
7. read model resolves labels in batch;
8. AND filtering tests;
9. identity isolation tests.

**Acceptance:** same `#工作` can attach to Goal and Task.

**Wave 5 renderer transport extension (2026-08-27):**

- added a transport-neutral `@memoflow/label/client` seam exposing only current-user `listLabels` / `createLabel`; public `LabelClientDTO` deliberately omits `identityId` and `normalizedName`;
- API owns authenticated `/labels` GET/POST over `LabelService + PrismaLabelRepository`; Desktop owns authenticated `label:list` / `label:create` IPC over the same service with `PowerSyncLabelRepository`; Web/Desktop renderer DI both provide one `LABEL_SERVICE_KEY`;
- canonical Zod request schemas validate list/create before application calls and host auth injects identity, so renderer requests never carry ownership identity;
- focused verification: Label client `3/3`, API transport `2/2`, Desktop IPC `2/2`; Label build/typecheck/lint plus API/Desktop/Web/App-Vue typechecks are green. Test inventory is current at `1120` files.

## SCHED-1101 — Neutral Scheduling contracts

**Lane:** L2 + Contract Train  
**Build, imitate:** ADR-061; Trigger.dev schedule identity semantics.

Introduce:

```text
SchedulingOwner
ScheduledIntent
SchedulingPort
SchedulingReconcileReceipt
ScheduledHandler
ScheduledHandlerResult
```

**Implementation:**

1. contract shapes with no `ScheduleTask` import;
2. payload schema/version strategy;
3. stable string handler keys;
4. owner identity validation;
5. receipt/failure mapping to ADR-042;
6. contract tests;
7. package import boundaries.

**Acceptance:** a fake module can schedule without importing `@memoflow/schedule` aggregate.

## SCHED-1102 — Existing ScheduleTask engine adapter

**Depends:** SCHED-1101  
**Lane:** L2  
**Goal:** Reuse current reliable engine while replacing upper seam.

**Implementation:**

1. create `SchedulingPort` adapter around existing repository/runtime;
2. map neutral intent to legacy ScheduleTask internally;
3. preserve runAt/priority/retry semantics;
4. isolate SourceModule to compatibility metadata only;
5. mapper contract tests;
6. no feature migration yet.

**Acceptance:** neutral contract reaches existing queue and executes a test handler.

## SCHED-1103 — Stable schedulingKey persistence

**Depends:** SCHED-1102  
**Imitate:** Trigger.dev `deduplicationKey` invariant.

**Implementation:**

1. canonical key format utility/validation;
2. Schema Train adds stable key columns/index;
3. preflight duplicate/collision check;
4. deterministic backfill for existing projected rows if retained;
5. unique constraint scoped by identity/owner;
6. idempotent upsert tests;
7. 100 repeated reconcile test.

**Acceptance:** same desired state cannot create duplicate invocation rows.

## SCHED-1104 — Transactional owner reconcile

**Depends:** SCHED-1103  
**Reference:** desired-state controller pattern; current replaceSelection idea.

**Implementation:**

1. read existing owner set inside transaction;
2. upsert desired keys;
3. delete stale keys;
4. write operation receipt;
5. failure injection after each step;
6. PowerSync equivalent atomic/repair behavior;
7. concurrency test for two simultaneous reconciles.

**Acceptance:** no half-reconciled owner state after injected failures.

## SCHED-1105 — HandlerRegistry skeleton

**Depends:** SCHED-1101  
**Lane:** L2 / Orchestration Train  
**Reference:** plugin-ready registry pattern, not full plugin runtime.

**Implementation:**

1. typed handler registration API;
2. duplicate key fail-fast;
3. unknown key -> explicit dead-letter/failure;
4. payload validation before handler;
5. no feature package imports in core registry;
6. runtime composition registration hook;
7. test fake handler.

**Acceptance:** adding a handler does not modify `SourceModule` switch.

## NOTIF-1101 — Fix per-channel policy defect

**Lane:** L3  
**Imitate:** Novu channel preference semantics.

**Implementation:**

1. add failing mixed-channel test;
2. evaluate each channel separately;
3. record disabled/suppressed outcome;
4. preserve Notification read/unread fact;
5. do not enqueue disabled channels;
6. ensure existing dispatch outbox behavior stays intact.

**Acceptance:** `InApp allowed + Email disabled` never queues Email.

## NOTIF-1102 — Wire DND and rate-limit to real path

**Depends:** NOTIF-1101  
**Imitate:** Novu workflow preferences; retain MemoFlow runtime.

**Implementation:**

1. source DND context explicitly;
2. source rate usage explicitly;
3. evaluate per workflow/channel;
4. outcomes: suppressed/deferred/rate_limited;
5. reason code persistence;
6. critical workflow bypass only when explicit;
7. tests for DND off/on/end and rate reset.

**Acceptance:** policy definitions and actual production path are the same behavior.

### Wave 1 gate

Must pass before destructive W2 domain work:

```text
utils / patterns tests
contracts typecheck
schedule + schedule-orchestration tests/typecheck
notification tests/typecheck
label persistence integration
recurrence engine decision fixture
UI core Storybook/unit checks
root affected governance
```

---

# 8. Wave 2 — Business contract stabilization

Goal: make domain truth final **before** migrating projections and rebuilding UI.

Parallelism:

```text
L-A Goal
L-B Task
L-C Routine
L-E Notification Fact
```

Shared Contract/Schema Trains serialize only their central patches; feature implementation stays parallel.

## GOAL-2101 — Goal aggregate simplification

**Lane:** L-A  
**Imitate:** personal goal/OKR semantics from prior OSS study; Build MemoFlow domain.

Retire:

```text
GoalFolder
category
parentGoal
importance/dynamic priority
custom color business field
focus domain
comparison domain
```

**Implementation:**

1. characterize consumer list;
2. Contract Train removes/renames public fields in one bundle;
3. Schema Train removes/reset fields;
4. status -> Active/Completed/Abandoned;
5. archive becomes display/persistence attribute, not status;
6. dueDate naming convergence;
7. remove domain services that only serve retired features;
8. focused aggregate/application tests.

**Acceptance:** Goal answers only Direction + Measurement.

## GOAL-2102 — KR Measurement V2

**Lane:** L-A  
**Build:** MemoFlow measurement semantics.

**Implementation:**

1. remove `KeyResultValueType`;
2. define `startingValue`, optional progress baseline;
3. canonical progress calculator;
4. Sum/Average/Max/Min/Last aggregation;
5. directional progress tests;
6. clamp rules;
7. separate overall progress from Goal completion;
8. record edit/delete recalculation;
9. snapshots use same calculator.

**Acceptance fixtures:** graduation, running, weight.

## GOAL-2103 — Review simplification

**Depends:** GOAL-2102  
**Lane:** L-A

Retire type/rating/title; keep system context + reflection.

**Implementation:**

1. contract/schema simplification;
2. authoritative progress snapshot;
3. time-window deltas;
4. contribution/record summary query;
5. normalized trend view model;
6. no mixed-unit absolute chart.

**Acceptance:** review begins from system facts, not blank form taxonomy.

## TASK-2201 — Occurrence outcome model

**Lane:** L-B  
**Build; imitate:** Vikunja/Tasks.org personal recurrence behaviors.

Canonical state:

```text
Pending
InProgress
Completed
Missed
Skipped
```

Derived:

```text
isOverdue
```

**Implementation:**

1. characterize persisted Expired behavior;
2. remove Expired from canonical domain;
3. derive overdue from time + unresolved state;
4. add markMissed command;
5. preserve correction/uncomplete path;
6. define Skipped as waiver/not-applicable;
7. remove expiration service mutation after parity;
8. past-due completion fixture.

**Acceptance:** time passing never invents a real-world Missed fact.

## TASK-2202 — Task Plan lifecycle/outcome

**Depends:** TASK-2201  
**Lane:** L-B

Canonical:

```text
lifecycle Active | Paused | Closed
outcome   Open | Succeeded | Failed | Abandoned
```

**Implementation:**

1. finite scope evaluator;
2. strict success policy extension point;
3. Missed effect;
4. Skipped waiver scope effect;
5. user abandon command;
6. delete only for mistaken creation;
7. no automatic Failed while outcome is still unknown;
8. correction/re-evaluation tests.

**Acceptance:** 15-day plan facts match graduation fixture.

## TASK-2203 — Task domain simplification

**Lane:** L-B; can run in parallel with TASK-2201 on separate files after contract map.  
**Imitate:** Super Productivity / personal task apps; Build own aggregate.

Retire:

```text
TaskFolder
parent/child
Dependency/DAG/CriticalPath
blockingReason/dependencyStatus
persisted dynamic priority score
```

Keep:

```text
one-time/recurring
instances
simple user priority
checklist
reminder
labels
goal link
```

**Acceptance:** Task answers Action + Execution, not project scheduling graph.

## TASK-2204 — Recurrence adapter integration

**Depends:** TIME-1103, TASK-2201  
**Borrow:** selected recurrence engine.

**Implementation:**

1. convert Task recurrence config to engine input;
2. engine yields candidate dates;
3. Task domain applies plan status/exception filtering;
4. finite COUNT mapping;
5. end date mapping;
6. no duplicate existing occurrence;
7. timezone/local-day policy fixtures;
8. remove obsolete manual Monthly/Yearly placeholders.

**Acceptance:** recurrence date math is standard-library-backed; Task outcome stays domain-owned.

## TASK-2205 — Goal link and contribution V2

**Depends:** GOAL-2102, TASK-2202  
**Lane:** L-B + L-A contract review

**Implementation:**

1. link separated from contribution;
2. contribution optional;
3. triggers `EachCompletion | PlanCompletion`;
4. automatic contribution only supported aggregation cases;
5. PlanCompletion finite-plan validation;
6. settlement source type/id explicit;
7. replay idempotency;
8. correction/uncomplete revert;
9. duplicate delivery test.

**Acceptance:** link-only Task never changes KR; 15/15 plan can settle once.

## ROUTINE-2301 — RoutineDefinition + Profile + Membership

**Lane:** L-C  
**Imitate:** Workrave/Safe Eyes profile/runtime ideas; Build own domain.

**Implementation:**

1. introduce RoutineDefinition behind legacy adapter;
2. RoutineProfile;
3. ProfileMembership M:N;
4. remove ControlMode takeover semantics;
5. canonical effectiveEnabled formula;
6. profile off preserves member state;
7. profile on cannot revive disabled member;
8. schema and PowerSync parity.

**Acceptance:** same Drink Water routine can participate in Work/Gaming with independent membership enabled state.

## ROUTINE-2302 — Trigger model

**Depends:** ROUTINE-2301, TIME-1103  
**Build + Borrow recurrence dates where standard:**

```text
WallClock
Elapsed
ActiveUsage
```

Protocol remains separate.

**Implementation:**

1. WallClock with local time + recurrence + IANA zone;
2. Elapsed trigger config;
3. ActiveUsage trigger config;
4. TemporaryOverride/snooze contract;
5. legacy FixedTime mapping;
6. legacy Interval classification/migration;
7. next wall-clock occurrence uses selected recurrence adapter where applicable;
8. no ActiveUsage schedule projection.

**Acceptance:** trigger type itself expresses which runtime owns timing.

## ROUTINE-2303 — ProtocolDefinition / ProtocolSession domain

**Lane:** L-C  
**Imitate:** Super Productivity Focus Mode / Pomodoro / Flowtime.

**Implementation:**

1. phase vocabulary;
2. deterministic transition table;
3. start/pause/resume/end/cancel;
4. cycle policy;
5. break policy;
6. persistent session snapshot/version;
7. explicit termination reason;
8. table-driven transition tests;
9. no renderer-owned truth.

**Acceptance:** domain can represent 50/10 two-cycle session without Electron window.

## NOTIF-2401 — Notification Fact + DeliveryPlan contract

**Depends:** NOTIF-1101/1102  
**Lane:** L-E  
**Imitate:** Novu workflow/inbox separation.

**Implementation:**

1. workflowKey/topic;
2. Notification Fact identity/idempotency;
3. related entity/navigation;
4. importance/urgency;
5. delivery decisions per channel;
6. read/unread independent from delivery state;
7. suppressed/deferred reasons;
8. migration from old template/module preference concepts.

**Acceptance:** Inbox fact can exist while Desktop delivery is suppressed.

## NOTIF-2402 — Preference hierarchy

**Depends:** NOTIF-2401  
**Imitate directly:** Novu workflow capability -> global preference -> workflow-specific preference.

**Implementation:**

1. workflow channel capability/default;
2. user global channel settings;
3. workflow-specific overrides;
4. critical/read-only allowlist;
5. migration from existing preferences;
6. contract and policy tests;
7. no UI yet.

**Acceptance:** precedence table is deterministic and test-covered.

### Wave 2 gate — **CLOSED 2026-08-26**

- [x] domain contracts frozen enough for projector/UI work;
- [x] no old business field added back to support existing UI;
- [x] Goal/Task/Routine focused suites green;
- [x] schema boot and Prisma/PowerSync parity green;
- [x] recurrence acceptance matrix green.

| Ticket group                       | Status   | Closure evidence                                                                                                                                                                                            |
| ---------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOAL-2101~2103`                   | **DONE** | Goal = Direction + Measurement; `Active/Completed/Abandoned` + separate archive; KR Measurement V2; Review V2; Goal full suite `79 files / 425 tests`; Prisma integration `21 tests`                        |
| `TASK-2201~2205`                   | **DONE** | occurrence `Pending/InProgress/Completed/Missed/Skipped`; plan lifecycle/outcome; Folder/DAG/critical-path retirement; recurrence adapter; Goal link/contribution V2; Task suite `70 files / 690 tests`     |
| `ROUTINE-2301~2303`                | **DONE** | RoutineDefinition/Profile/Membership, trigger ownership, Protocol session state machine; reminder package `60 files / 455 tests`; vNext domain+persistence parity `39 tests`; integration `29 tests`        |
| `NOTIF-2401/2402`                  | **DONE** | Notification Fact/DeliveryPlan separation and deterministic workflow/global preference hierarchy; notification suite `42 files / 232 tests`                                                                 |
| Contract / Schema Train            | **DONE** | contracts `63 files / 469 tests`; Prisma generate/schema boot green; database `13 tests`; PowerSync schema `4 tests`; Data Portability `139 tests`                                                          |
| Time / recurrence                  | **DONE** | time `32 tests`; recurrence conformance matrix `11/11`; Task recurrence consumes `RecurrenceEnginePort`                                                                                                     |
| Performance budget                 | **DONE** | Task vNext owns a real perf suite: 20k-occurrence plan outcome evaluation plus 1000-date recurrence expansion; `task:test:perf` `2/2` green; retired priority-sort benchmark paths removed                  |
| Presentation / secondary consumers | **DONE** | App Vue `183 files / 713 tests`; React/mobile/web destructive contract cutover; Goal Compare, Goal Folder/Focus, Task Dependency/DAG/check-expired guards removed or inverted; Web `17 files / 71 tests`    |
| Reliability                        | **DONE** | Task transaction/outbox integration `27 tests`; Goal integration `21 tests`; Routine integration `29 tests`; API Task→Goal host-restart replay `1/1`; Goal Prisma/PowerSync rollback gates green            |
| Repository gate                    | **DONE** | affected test `35 projects + 6 dependent tasks`; typecheck `36 projects + 29 tasks`; lint `40 projects`; build `34 projects + 1 task`; governance green; test inventory `1066` files; test oracle `success` |

**W2 closure rule:** no compatibility surface may reintroduce Goal Folder/Focus/comparison, Task DAG/dependency/Expired occurrence status, old Goal Review fields, or message-string branching for typed business failures. Physical legacy columns may remain only behind already-approved persistence adapters until their dedicated schema deletion train.

---

# 9. Wave 3 — End-to-end vertical integration

Goal: connect stable domains through neutral infrastructure before rebuilding all surfaces.

Parallelism after SCHED foundation + W2 contracts:

```text
Task scheduling slice
Goal scheduling slice
Task->Goal settlement
NotificationRequested runtime
```

Routine wall-clock starts after NotificationRequested seam is available or uses a temporary durable adapter with same final contract.

## TASK-3101 — Task scheduling projector -> SchedulingPort

**Lane:** L-B + L-D  
**Depends:** TASK-2201/2204, SCHED-1104.

**Implementation:**

1. Task-owned projector reads authoritative Task/Occurrence;
2. calculates reminder runAt in Task domain/application seam;
3. emits neutral ScheduledIntent;
4. stable key from occurrence + reminder identity;
5. remove Task production import of `ScheduleTask`;
6. startup full reconcile;
7. lost event repair test;
8. API/Desktop parity.

**Acceptance:** fixture D schedules exactly one 13:30 invocation.

## TASK-3102 — `task.reminder.fire` handler

**Depends:** TASK-3101, SCHED-1105  
**Lane:** L-B + Orchestration Train

**Implementation:**

1. register handler;
2. validate payload schema;
3. re-read Task occurrence;
4. stale/completed/deleted -> skipped receipt;
5. valid due -> durable NotificationRequested;
6. business idempotency;
7. retryable technical failures;
8. remove central SourceModule Task execution path after parity.

**Acceptance:** Scheduler does not import Task domain; handler registration is composition-only.

## GOAL-3201 — Goal scheduling projector -> SchedulingPort

**Lane:** L-A + L-D  
**Depends:** GOAL-2101/2102, SCHED-1104.

**Implementation:**

1. keep RemainingDays etc. in Goal semantics;
2. resolve runAt using Product Time;
3. stable scheduling key;
4. full owner enumeration/startup reconcile;
5. no Shanghai fallback;
6. no Goal production `ScheduleTask` construction;
7. event-lost repair test.

**Acceptance:** fixture E produces one stable -7d invocation.

## GOAL-3202 — `goal.reminder.fire` handler

**Depends:** GOAL-3201, NOTIF-3301  
**Implementation:** same pattern as Task; re-read Active/completed/archived current truth.

**Acceptance:** completed Goal before due -> observable skipped result, no notification.

## NOTIF-3301 — Durable NotificationRequested outbox

**Lane:** L-E  
**Depends:** NOTIF-2401.

**Implementation:**

1. define durable integration message envelope;
2. writer usable from domain handlers;
3. idempotency key/correlation/causation;
4. consumer creates Notification Fact;
5. DeliveryPlan generated transactionally or with durable next step;
6. per-channel dispatch outboxes;
7. crash before/after Fact commit tests;
8. replay test.

**Acceptance:** business handler commit does not depend on external Desktop/Email success.

## NOTIF-3302 — Remove NotificationPort from scheduler router

**Depends:** TASK-3102, GOAL-3202, NOTIF-3301  
**Lane:** L-D + L-E

**Implementation:**

1. all migrated handlers write NotificationRequested;
2. remove execution result `notification` payload;
3. remove central finalize-notification path;
4. scheduler orchestration loses Notification domain/channel imports;
5. regression tests.

**Acceptance:** Scheduler only wakes handlers.

**Implementation evidence — 2026-08-27:**

- Task, Goal, Routine and the legacy Reminder compatibility source own their durable
  `NotificationRequested` write; execution outcomes no longer carry a `notification` draft.
- `schedule-orchestration` is notification-domain neutral: the execution router only dispatches by
  source/handler and has no `NotificationPort`, channel, requested-envelope or notification package
  runtime/build dependency.
- API and Desktop hosts no longer construct or inject `scheduleNotificationPort`; they inject the
  durable `NotificationRequestedWriterPort` into the business boundary that owns the side effect.
- Legacy Reminder compatibility execution uses an atomic commit port so Reminder state/history and
  `notification.requested` are committed in the same Prisma/PowerSync transaction. PowerSync writer
  rollback/retry behavior is covered explicitly.
- No production business module outside Notification emits new `notification.dispatch` rows; the
  Notification package retains legacy dispatch consumption only for backward-compatible draining.
- AC2 integration evidence: `notification-requested-writer.integration.test.ts` now consumes
  production-shaped `task.reminder` / `goal.reminder` envelopes through the durable
  `NotificationRequested` path and asserts the materialized Fact carries the workflowKey/topic/type/
  category/relatedEntity plus both suggested-channel policy decisions; integration suite **9/9**.
- AC4 anti-resurrection: new `schedule-notification-separation-audit.mjs` (wired into the root
  `governance-check` target) fails on `@memoflow/notification` imports, the removed legacy delivery
  symbols (`ScheduleNotificationPort`/`scheduleNotificationPort`/
  `createNotificationPrismaScheduleNotificationPort`), and `switch (...sourceModule)` execution dispatch
  in `schedule-orchestration/src` + `schedule/.../infrastructure/scheduling`; the retained
  domain-neutral if-cascade in `execution/router.ts` stays green (**24 files audited, 0 violations**).
- Verification: Notification **240/240**, Reminder **491/491**, Task **717/717**, Goal **445/445**,
  Schedule Orchestration **34/34**, Reminder integration **34/34**, targeted API/Desktop composition
  **67/67**; final typecheck passed for notification/reminder/task/goal/schedule-orchestration/api/desktop.

## ROUTINE-3401 — Reliable wall-clock handler path

**Lane:** L-C + L-D  
**Depends:** ROUTINE-2302, NOTIF-3301.

**Reuse:** existing ReminderOccurrence transaction assets; Scheduler wake-up.

**Implementation:**

1. canonical occurrence key;
2. project one-shot next occurrence;
3. scheduler handler enters existing occurrence idempotency fence;
4. transaction revalidates effective state;
5. write history/outcome;
6. advance next trigger;
7. write NotificationRequested or presentation intent as appropriate;
8. post-commit reconcile next one-shot;
9. crash/retry tests.

**Acceptance:** new path reliability >= legacy Reminder Cron path.

## ROUTINE-3402 — Shadow compare and remove dual wall-clock authority

**Depends:** ROUTINE-3401

**Implementation:**

1. legacy scanner switches to read-only due-set shadow;
2. compare old/new due set;
3. mismatch logs/fixtures;
4. two-worker/restart/snooze/pause cases;
5. once matrix clean, disable legacy side effects;
6. delete Cron runtime production startup;
7. retain occurrence transaction/receipts.

**Acceptance:** only Scheduler wakes durable wall-clock routines.

## SETTLE-3501 — Task -> Goal contribution final durable path

**Lane:** L-B + L-A  
**Depends:** TASK-2205.

**Implementation:**

1. explicit settlement source identity;
2. EachCompletion flow;
3. PlanCompletion flow;
4. Goal consumer idempotency;
5. revert/correction;
6. strict 15/15 failure no settlement;
7. waived occurrence behavior;
8. duplicate/replay tests.

**Acceptance:** graduation/running scenarios pass end-to-end.

## SCHED-3601 — Common projection repair runtime

**Lane:** L-D  
**Depends:** Task/Goal/Routine projectors.

**Implementation:**

1. listener registration before full reconcile;
2. incremental event fast path;
3. durable fallback path;
4. startup enumeration;
5. stable-key idempotency;
6. optional bounded periodic sweep only if needed;
7. metrics: repaired/unchanged/failed;
8. no business repo read from orchestration core.

**Acceptance:** intentionally lost event heals after restart for all three source modules.

**Implementation evidence (2026-08-27):**

- added one common `ProjectionRepairRuntime`; Task / Goal / Routine event runtimes are now incremental-only fast paths;
- composition order registers all available feature listeners before the startup durable sweep begins;
- startup sweep enumerates feature-owned durable refs, rebuilds each neutral plan, and converges through the existing transactional `SchedulingPort.reconcile()` stable-key boundary;
- source enumeration is mandatory at the projection seam; Desktop Task PowerSync now enumerates synchronized local template refs instead of silently returning `[]`;
- Routine Prisma enumeration includes disabled / non-wall-clock definitions so a lost disable/trigger-change event reconciles the prior owner to an empty desired set;
- repair failures are isolated per owner/source and exposed as cumulative `repaired / unchanged / failed` metrics through the orchestration module;
- no periodic sweep is enabled: incremental events + startup durable repair satisfy the current recovery contract; `sweep()` remains an explicit bounded maintenance seam if evidence later requires scheduling it;
- verification: schedule-orchestration `35/35`, Task `718/718`, Goal `445/445`, Reminder `491/491`, Routine Prisma integration `5/5`; API and Desktop Nx typecheck dependency chains green.

### Wave 3 primary vertical acceptance

Must demonstrate in executable integration tests:

```text
Task 14:00, -30m
 -> ScheduledIntent 13:30
 -> Scheduler wake
 -> task.reminder.fire
 -> NotificationRequested
 -> Notification Fact
 -> Desktop/InApp eligible plan
```

Then the same infrastructure handles Goal and Routine WallClock.

---

# 10. Wave 4A — Local Routine Runtime

May execute in parallel with Planner Wave 4B after Routine domain is stable.

## ROUTINE-4101 — ActivitySensorPort + Windows adapter

**Lane:** L-G + L-C  
**Imitate:** Safe Eyes platform IdleMonitor abstraction; Workrave behavior.

**Implementation:**

1. define standard `UserActive/UserIdle/UserResumed` events;
2. ActivitySensorPort;
3. IdleSensorPort;
4. Windows adapter first;
5. platform API hidden in desktop infrastructure;
6. fake sensor for tests;
7. subscription lifecycle cleanup;
8. app restart tests.

**Acceptance:** Routine domain/runtime never imports Win32/platform package.

**Implementation evidence (2026-08-27):**

- added platform-neutral `ActivitySensorPort` / `IdleSensorPort` and canonical `UserActive` / `UserIdle` / `UserResumed` events under the Routine runtime seam;
- added restart-safe activity normalization with listener-before-sample startup ordering plus deterministic `FakeIdleSensor` / `FakeActivitySensor`;
- added `WindowsIdleSensorAdapter` under Desktop main-process infrastructure; Electron `powerMonitor.getSystemIdleTime()` is polled only while subscribers exist, and final unsubscribe / dispose tears the timer down;
- Reminder runtime/domain contains no Electron, Win32, DBus, Wayland, or platform-specific import;
- focused tests cover initial active/idle state, idle/resume transition, cleanup, idempotent start/stop, app/profile restart, and Windows adapter polling lifecycle;
- verification: Routine activity runtime `4/4`, Windows adapter `2/2`, Reminder build green, Desktop Nx typecheck green;
- real Windows operator validation remains an environment gate because the current GCP implementation host is Linux; the adapter is isolated so that gate does not weaken deterministic CI coverage.

## ROUTINE-4102 — ActiveUsage accumulator + Natural Break

**Depends:** ROUTINE-4101  
**Imitate:** Workrave / Safe Eyes Smart Pause.

**Implementation:**

1. persist/runtime snapshot accumulator;
2. count active usage only;
3. idle threshold detection;
4. natural break credit;
5. reset semantics;
6. profile gate;
7. temporary suppression;
8. no duplicate occurrence after natural break;
9. deterministic fake-clock tests.

**Acceptance:** fixture G suppresses unnecessary stand reminder after sufficient idle rest.

**Implementation evidence (2026-08-27):**

- added Desktop-local `ActiveUsageRuntime` over the platform-neutral `ActivitySensorPort`; it owns only local accumulation/tick semantics and has no Scheduler/ScheduledIntent/ScheduleTask dependency;
- active accumulation stops at the actual last-input boundary (`UserIdle.at - idleDurationMs`) so the idle-detection window is not incorrectly counted as active usage;
- existing routine/profile/membership/temporary-override gates are reused; inactive profiles and live snooze/suppress intervals pause accumulation without resetting previously earned active time;
- coarse ticks split temporary-override time at the real gate reopen instant rather than sampling only the end-state boolean;
- Natural Break credit is idempotent per idle episode and only advances a routine generation when that routine has active-usage debt; qualifying idle resets the accumulator while duplicate resume events do not double-credit;
- accumulator snapshots are exportable/restorable and process downtime is never inferred as active usage; occurrence identity is stable per `routine:<id>:active-usage:<generation>`;
- Fixture G (`40m active -> due -> 6m idle -> Natural Break -> reset/no duplicate`) plus profile deactivation, suppression, idle-only time, and restart snapshot cases are green `5/5`;
- verification: focused ActiveUsage `5/5`, full Reminder `507/507`, Reminder Nx build green, Desktop Nx typecheck green, changed-file ESLint green; boundary audit confirms zero Scheduler import/reference in the ActiveUsage runtime.

## ROUTINE-4103 — Intervention state machine

**Depends:** ROUTINE-4102  
**Imitate:** Sane Break two-phase model.

Canonical:

```text
Due -> Gentle -> Grace -> Guided -> optional Strict
```

**Implementation:**

1. transition rules;
2. natural stop transition;
3. timeout escalation;
4. snooze/dismiss/complete interactions;
5. strict opt-in gate;
6. safe escape;
7. fake-clock tests.

**Implementation evidence (2026-08-27):**

- added a serializable `InterventionRuntime` keyed by canonical routine occurrence identity; renderer/Electron are not timing owners and later surfaces can reconstruct from `InterventionSnapshot`;
- deterministic deadline catch-up implements `Due -> Gentle -> Grace -> Guided`, while `Strict` is unreachable unless `strictEnabled=true`; coarse resume can cross multiple deadlines while recording the exact phase-boundary Instants;
- Strict always retains the explicit `safe-escape` command and terminal `Escaped` state; safe escape outside Strict is rejected;
- `complete`, `natural-stop`, `snooze`, and `dismiss` are explicit runtime commands from every presented phase; pre-due interactions and non-positive snooze durations are rejected before mutation;
- Natural Break and explicit completion converge on one terminal `Completed` truth with `completionReason`; a late competing interaction is idempotent `applied=false` and does not create a second completion history path;
- snooze records a concrete `snoozeUntil` in the intervention snapshot so the next composition slice can persist/apply the existing Routine TemporaryOverride without rewriting long-lived trigger config;
- snapshots can be restored after renderer/window restart and listeners emit only applied runtime transitions; no Electron/Scheduler dependency exists in the intervention state machine;
- focused intervention matrix is `6/6`, covering all presented phases x completion/natural-stop/snooze/dismiss plus opt-in Strict/safe escape, invalid transitions, coarse clock catch-up, terminal idempotency, and restore; full Reminder is `513/513`, Reminder Nx build and Desktop Nx typecheck are green.

## ROUTINE-4104 — InterventionWindow

**Depends:** ROUTINE-4103  
**Lane:** L-G

**Borrow:** Electron BrowserWindow + existing preload/context isolation patterns; UI primitives.

**Implementation:**

1. Main Process window owner;
2. one active intervention instance policy;
3. no-focus default;
4. multi-monitor placement;
5. minimal IPC contract;
6. Gentle and Guided rendering;
7. close maps to explicit interaction;
8. crash/reload reconstruction.

**Acceptance:** window is a projection of Runtime truth, not owner.

**Implementation evidence (2026-08-27):**

- added a dedicated `InterventionWindowProjection` and strict Zod command contract under Routine-owned Electron channels. The renderer can only `get` the current projection or send `complete`, positive-duration `snooze`, and `dismiss`; projection updates are Main -> renderer events and arbitrary Node/domain access is not exposed;
- the Desktop Reminder composition root now creates exactly one per-profile `InterventionRuntime` and returns it as a shared host seam. The InterventionWindow controller subscribes to that same runtime, so future ActiveUsage/WallClock occurrence coordinators can create/restore occurrences without creating a second intervention state machine;
- Main Process owns a single InterventionWindow instance per active profile. It catches up all active runtime occurrences from deadlines, chooses only one visible candidate using `Guided > Grace > Gentle` priority (then oldest due occurrence), and leaves non-visible active occurrences untouched; after the visible occurrence terminates, the next runtime occurrence is projected automatically;
- `Strict` is deliberately excluded from InterventionWindow capability. A regression test proves a Strict occurrence stays Strict and no ordinary intervention window is shown, preserving ADR-059's separate BreakOverlay boundary;
- the Electron host uses `BrowserWindow.showInactive()` so ambient reminders do not steal IDE/game/meeting focus, and uses `screen.getCursorScreenPoint()` + `screen.getDisplayNearestPoint()` to place the compact window inside the active display work area at the bottom-right margin. Guided reuses and expands the same BrowserWindow rather than opening a second surface;
- native window close is intercepted and routed back through the controller as the explicit Runtime `dismiss` command; the window never silently mutates or terminates intervention truth itself;
- renderer crash/reload keeps Main Process truth alive: `render-process-gone` reloads the dedicated renderer and `did-finish-load` re-pushes the retained projection. Controller/runtime reconstruction is separately covered by restoring an `InterventionSnapshot` and deriving the window projection from it;
- added an isolated `#/intervention-window` renderer bootstrap that does not initialize the full app-vue shell. Gentle/Grace/Guided presentation is projection-driven; the renderer's one-second timer only recomputes display countdown from `phaseDeadline` and never advances the domain phase;
- the window controller owns deadline wakeups in Main Process, including phase escalation without renderer ticks and future occurrence wakeups. Runtime `onChanged` also makes externally-created due occurrences surface automatically once the profile identity is bound;
- test infrastructure gained `BrowserWindow.showInactive`, renderer reload, cursor/display-nearest stubs so no-focus, multi-monitor placement, close semantics, and renderer recovery are verified as behavior rather than source-string assumptions;
- verification: focused ROUTINE-4104 Desktop matrix `47/47` plus contract `1/1`; full Desktop `51` files / `258` tests, full Contracts `65` files / `475` tests, full Reminder `72` files / `518` tests; Contracts/Desktop typecheck and Reminder build green; Desktop and Contracts lint have `0` errors (three pre-existing warnings each); Desktop production build green; Nx sync, test-target governance, docs, full governance, and test inventory are green at `1114` owned files (`65` Desktop primary: 51 unit / 9 IPC / 5 main).

## ROUTINE-4201 — ProtocolSession persistence/recovery

**Depends:** ROUTINE-2303  
**Imitate:** Super Productivity focus/break state separation.

**Implementation:**

1. persist active session snapshot;
2. deadline-based recovery rather than renderer tick count;
3. pause accounting;
4. phase transition receipt;
5. crash during focus/break tests;
6. completed/cancelled terminal behavior;
7. no duplicate phase transition.

**Implementation evidence (2026-08-27):**

- added durable `ProtocolSessionStore` with optimistic `expectedVersion` fencing plus Prisma and PowerSync adapters over the existing Wave 2 `routine_protocol_sessions` schema; no schema migration was required;
- added a protocol-session runtime that persists every command transition and emits versioned `ProtocolPhaseTransitionReceipt` values;
- restart recovery reads persisted `phaseDeadline` and calls the deterministic domain `advanceDuePhases()` path, including multi-phase catch-up to terminal completion; renderer tick counts are not an input;
- paused sessions remain paused across restart; resume reconstructs the deadline from persisted `pausedRemainingMs` and accumulated pause accounting;
- concurrent recovery uses bounded CAS retry: one runtime wins the version fence, the loser reloads and converges to `unchanged`, preventing duplicate durable phase transitions;
- terminal Completed/Cancelled sessions are excluded from recoverable scans;
- crash/restart fixture covers Focus, Break, multi-deadline completion, pause/resume, terminal receipt, and concurrent recovery;
- verification: protocol recovery + PowerSync `7/7`, Prisma real-database store `2/2`, full Reminder `502/502`, Reminder Nx build green, Desktop Nx typecheck green, changed-file ESLint green.

## ROUTINE-4202 — FocusWindow

**Depends:** ROUTINE-4201  
**Lane:** L-G

**Implementation:**

1. Main Process owns lifecycle;
2. phase/cycle/countdown projection;
3. pause/resume/end commands;
4. collapse/drag/optional always-on-top;
5. restore after restart;
6. hiding window != ending session;
7. taskbar integration only through adapter.

**Implementation evidence (2026-08-27):**

- added a Main Process `FocusWindowController` over the durable `ProtocolSessionStore` / `ProtocolSessionRuntime`; renderer/window state is projection-only and never owns protocol transitions;
- projection includes protocol/phase/cycle/version plus `phaseDeadline`, `pausedRemainingMs`, and derived `remainingMs`; phase/cycle transitions still come from the deterministic durable runtime;
- dedicated frameless `ElectronFocusWindowHost` owns BrowserWindow lifecycle, drag surface, collapse, always-on-top, and native close interception; native close/hide does not mutate or terminate the ProtocolSession;
- hiding keeps the Main Process phase-deadline timer alive, and explicit reopen/phase-boundary recovery calls `show()` again, so presentation visibility cannot suspend protocol semantics;
- pause/resume/end are isolated `RoutineChannels` IPC commands and all route through ProtocolSessionRuntime; FocusWindow channels are separate from legacy ReminderChannels and are explicitly preload-whitelisted;
- renderer boots through a dedicated `#/focus-window` early path without initializing the full main app/router; its 1s countdown only computes `phaseDeadline - Date.now()` and never issues phase-transition commands;
- profile activation restores the latest recoverable session for that profile identity from PowerSync, while profile module teardown destroys the window/controller;
- optional Electron taskbar progress adapter derives progress from the same projection and stores no business state;
- focused Main Process + host + IPC + renderer tests are `8/8`, including restart catch-up, hide/reopen, pause/resume/end, collapse/always-on-top, native-close-as-hide, taskbar and renderer deadline projection;
- formal verification: contracts/reminder typechecks green, Desktop Nx typecheck green, full Desktop `244/244`, Desktop production build green, changed TypeScript/Vue ESLint green.

## ROUTINE-4203 — Protocol break satisfies ambient routine

**Depends:** ROUTINE-4102, ROUTINE-4201

**Implementation:**

1. map break phase to satisfaction facts;
2. Stand/Eye/Movement compatibility rules;
3. ambient accumulator reset/credit;
4. no immediate duplicate intervention after break;
5. completion history correlation.

**Acceptance:** fixture H completes 50/10 and does not immediately show stand/eye reminder.

**Implementation evidence (2026-08-27):**

- introduced a first-class `ProtocolBreakCompletionFact` rather than impersonating protocol rest as OS Idle; facts carry stable `factId`, session/protocol/phase/cycle correlation, Product Time Instants, measured break duration, and explicit break capabilities;
- Stand / Eye / Movement compatibility is an explicit runtime contract (`stand`, `screen-rest`, `movement`) with each Ambient routine supplying its own `minimumBreakMs`; no routine-name heuristic or hard-coded medical timing is used;
- `ActiveUsageRuntime.markSatisfied()` now returns a generation/occurrence receipt and treats satisfaction as an authoritative reset boundary: it rebases the local clock to the satisfaction Instant instead of counting the protocol-break interval as active usage;
- the bridge credits only registered ActiveUsage routines that have real accumulated debt, resets their generation, clears threshold state, and records correlated history linking `breakFactId/sessionId/phaseKey` to the exact Ambient occurrence generation it satisfied;
- stable break facts are replay-deduplicated in the runtime/history seam; duplicate consumption does not advance the Ambient generation twice;
- Fixture H uses the real 50/10 `ProtocolSession`: after 50m focus all three Ambient routines are due, the 10m ShortBreak credits Stand/Eye/Movement, resets them, and the next active second does not immediately re-trigger an intervention;
- a dedicated regression covers `35m active + 10m protocol break`: the break is never miscounted as the final 5m of active usage before reset, even if the OS activity sensor still reports active;
- focused ActiveUsage + break-credit suite is `10/10`; full Reminder is `518/518`; Reminder Nx build and Desktop Nx typecheck are green.

---

# 11. Wave 4B — Planner engine and owner-aware edits

## PLAN-4301 — FullCalendar Standard Vue PoC

**Lane:** L-F  
**Borrow:** FullCalendar Standard only.

Validate in an isolated page/story:

```text
Day
Week TimeGrid
Month
List/Agenda
custom event content
now indicator
select
editable drag
resize
failed mutation revert
read-only event
narrow panel
light/dark theme
```

**Implementation:**

1. install only Standard MIT package(s) required by FullCalendar v7 docs;
2. keep Temporal polyfill local to adapter if required;
3. render MemoFlow CalendarEventProjection fixture;
4. eventDrop -> fake owner command;
5. failure -> `revert()`;
6. eventResize equivalent;
7. bundle/startup measurement;
8. accessibility smoke;
9. compare to current custom components.

**Acceptance:** PoC meets core Planner needs without Premium plugin.

**Implementation evidence (2026-08-27):**

- validated `@fullcalendar/vue3@7.0.2` Standard (MIT) with `temporal-polyfill@1.0.4`; both remain dev-only PoC dependencies and no Premium/Scheduler/resource package is present;
- isolated `CalendarEventProjection`-shaped fixture covers Schedule/Task/Goal/Routine ownership, custom event content, per-event move/resize/read-only capabilities, revision, and owner-command targets;
- Standard-only adapter provides Day / Week TimeGrid / Month / List, select, now indicator, `eventDrop`, `eventResize`, and failed-owner-command `revert()` semantics;
- component tests use semantic role/ARIA assertions rather than FullCalendar private/generated CSS classes; targeted adapter/surface suite is `7/7`;
- real Chromium production-preview smoke switched all four views, rendered custom events, applied light/dark + narrow modes, found accessible names on all observed buttons, and produced no page error; local measurements were 119.3 ms app-mount marker and 182.6 ms first observed interactive toolbar;
- isolated Vite build was ~396.64 kB JS raw / ~121.3 kB gzip and ~5.92 kB CSS raw / ~1.6 kB gzip; these are engineering baselines, not product SLAs;
- current custom Month + Week renderers are ~436 LOC before surrounding Planner glue, while Standard supplies the additional Day/List + interaction primitives behind one neutral adapter;
- two raw headless Playwright pointer gestures did not trigger FullCalendar `eventDrop`; this is recorded rather than misreported. Adapter-level owner routing/revert is deterministic and green, but production migration must add a stable real-Planner drag/resize E2E before old custom surfaces are deleted;
- formal verification: isolated PoC tests `7/7`, `app-vue:typecheck` green with 26 dependent targets, production `app-vue:vite:build` green, changed TypeScript/Vue ESLint green, and production-route import audit empty;
- decision: **GO** to PLAN-4302 / PLAN-4401 with FullCalendar Standard; keep the current production Planner route untouched in this ticket.

**Fallback:** if PoC fails hard on panel/responsiveness/a11y, record evidence before considering Schedule-X Premium or keeping custom layout.

## PLAN-4302 — Planner unified read projection

**Depends:** PLAN-4301  
**Build:** MemoFlow ownership contract.

Canonical projection:

```text
sourceType
sourceId
start/end
allDay
title
display metadata
editableCapabilities
ownerCommandTarget
revision
```

Adapters:

```text
manual CalendarEntry
TaskOccurrence
Goal milestone/deadline
Routine wall-clock occurrence
```

**Acceptance:** no ScheduledInvocation row is rendered in normal Planner.

**Implementation evidence (2026-08-27):**

- added canonical `CalendarEventProjection` under `@memoflow/contracts/schedule` with explicit `identityId`, stable `sourceType/sourceId`, display metadata, edit capabilities, owner command target, revision, and source-correlated owner-target unions;
- time truth remains Product Time at the contract boundary: timed facts use `Instant`, all-day facts use `Ymd`; the projection does not expose `Date`, ISO-string-as-domain-time, Scheduler runAt, or cron/handler fields;
- added owner adapters for manual `CalendarEntry`, `TaskOccurrence`, Goal start/deadline facts, and Routine wall-clock occurrences; Task all-day/time-point/time-range semantics are derived through an injected Product Time port rather than local `Date` arithmetic;
- added `projectPlannerReadModel(...)` as the neutral aggregation boundary. Its legal inputs are owner-domain read facts only; raw `ScheduleTask`, `ScheduledInvocationContext`, `SchedulingPort`, retry/lease/dead-letter state are not accepted;
- current production `useCalendarView` now constructs Schedule/Task data through the canonical projection and exposes `projections` for PLAN-4303/4304; the existing custom Day/Week/Month renderer is temporarily fed through a compatibility mapper so this ticket does not prematurely replace the rendering engine;
- Goal/Routine adapters are canonical and covered, while their live client feeds are intentionally not fabricated in this ticket; later Planner source-integration/UI work can supply those facts without changing the projection contract;
- the PLAN-4301 FullCalendar PoC no longer owns a duplicate Planner model and now consumes the canonical PLAN-4302 contract directly;
- removed `DevScheduleDebugPanel` / `scheduleTasks` from the normal Planner route/data return; the diagnostic component may remain for a future ops/dev-only entry but raw Scheduler rows are no longer mounted by the product Planner;
- focused Planner/projection/compatibility/PoC suite is `21/21`; full app-vue suite is `727/727`; contracts build, app-vue typecheck, and app-vue build are green.

## PLAN-4303 — Source-aware command routing

**Depends:** PLAN-4302

**Implementation:**

1. CalendarEntry drag -> Planner command;
2. Task drag -> Task command;
3. Goal editable date -> Goal command;
4. Routine wall-clock edit -> Routine command;
5. read-only projections block drag;
6. optimistic UI only where revision/rollback safe;
7. FullCalendar revert on failure/conflict;
8. concurrency conflict surface.

**Acceptance:** Planner never directly writes Scheduler invocation persistence.

**Implementation evidence (2026-08-27):**

- added one canonical `PlannerOwnerCommandRouter` over owner-domain client commands: CalendarEntry -> `ScheduleClientPort.updateSchedule`, Task occurrence -> `TaskClientPort.rescheduleInstance`, Goal start/deadline -> `GoalClientPort.updateGoal`, and Routine wall-clock -> an explicit `RoutinePlannerOwnerCommandPort`; no Planner command path imports Scheduler orchestration, `ScheduleTask`, `SchedulingPort`, or invocation persistence;
- Task occurrence movement is now a real owner command rather than Scheduler metadata mutation: `TaskInstance.reschedule()` preserves template ownership, requires Pending/InProgress state, advances aggregate revision, emits `task:rescheduled`, and causes the existing Task scheduling projector to reconcile the new due time through `SchedulingPort`;
- HTTP and Electron expose the same validated reschedule invocation contract with `expectedVersion`; Prisma already fenced Task instance updates and the PowerSync repository now uses the same identity + previous-version CAS semantics, including collision/conflict handling and transport-level `CONFLICT` results;
- Planner range conversion remains on Product Time; AllDay / TimePoint / same-day TimeRange are mapped explicitly and cross-day Task ranges are rejected rather than silently corrupting `TaskTimeConfig`;
- source projection capabilities are enforced before command dispatch. Routine wall-clock projections remain read-only by default and become movable only when the Routine source supplies both editable capability and its owner command port, so Planner never fabricates a missing Routine mutation API;
- FullCalendar `eventDrop` / `eventResize` now use the canonical router through one optimistic mutation adapter; every conflict, validation failure, unsupported/read-only result, or malformed FullCalendar event calls `revert()`, while successful owner mutations retain the visual change;
- removed the PoC-local duplicate owner-mutation protocol: the Standard FullCalendar PoC now exercises the same source-aware router that the production cutover will consume in `PLAN-4304`;
- verification: contracts `474/474`, Task `727/727`, app-vue `737/737`; Task and app-vue dependency-chain typechecks are green. Task/app-vue project lint have zero errors (repository-existing warnings remain); the contracts project lint still has one pre-existing module-boundary error outside this change in `notification-requested.spec.ts`.

## PLAN-4304 — Retire custom calendar layout code after parity

**Depends:** PLAN-4301~4303

**Implementation:**

1. map old Day/Week/Month behaviors;
2. replace route with new adapter;
3. migrate tests to product semantics rather than DOM geometry where possible;
4. preserve required data-test selectors or explicitly migrate them;
5. delete duplicate date-layout calculations;
6. delete old debug/product mixed cards;
7. keep ops Scheduler console separate.

**Acceptance:** one Planner rendering engine remains.

**Implementation evidence (2026-08-27):**

- production `/schedule` now mounts `PlannerCalendar` as the single Day/Week/Month layout engine; FullCalendar owns visible-range calculation, period navigation, selection, event layout, drag, and resize while MemoFlow keeps its external toolbar and product panels;
- promoted `@fullcalendar/vue3@7.0.2` and `temporal-polyfill@1.0.4` from PoC-only dev dependencies to runtime dependencies because the production Planner now imports them directly; no Premium/Scheduler/resource package was introduced;
- loaded the FullCalendar v7 MIT `classic` theme plugin and theme CSS in production. Real-browser parity exposed that `skeleton.css` alone does not materialize an interactive resize handle even when `durationEditable` is true; the corrected theme integration produces the real resize affordance without private Scheduler APIs;
- `datesSet` is now the canonical Planner read-window source and feeds owner projections back through `fetchForRange`; view changes and previous/next/today navigation drive the FullCalendar API instead of custom date-layout arithmetic;
- the canonical `CalendarEventProjection` plus `PlannerOwnerCommandRouter` from PLAN-4302/4303 are consumed directly by production `eventDrop`/`eventResize`; applied commands retain the visual mutation, while conflict/failed/read-only/invalid/unsupported outcomes call FullCalendar `revert()` and UI-facing outcomes use stable codes rather than raw infrastructure error messages;
- retired the duplicate custom `DayViewCalendar`, `WeekViewCalendar`, `MonthViewCalendar`, their geometry-specific Storybook/tests, the old PoC-local FullCalendar renderer/adapter/model, and product-facing Scheduler/statistics/task cards that mixed raw scheduling infrastructure into Planner; keep-boundary tests now prevent reintroduction of custom calendar geometry;
- `DevScheduleDebugPanel` remains available only as a separate diagnostics component and is explicitly barred from the normal Planner route by a boundary test, preserving the product Planner / ops Scheduler-console split;
- retained a small isolated browser parity harness that imports the production `PlannerCalendar` rather than a second rendering implementation. Headless Chromium proves a real pointer drag changes visual position and reaches an applied owner outcome, a real resize changes event height and reaches applied, and a rejected owner mutation visually returns to its original position;
- verification: full app-vue `190` files / `725` tests green; app-vue typecheck green; app-vue lint has `0` errors (13 pre-existing warnings); production app-vue Vite build green; Chromium parity green; Nx `sync:check`, test-target governance, regenerated test inventory, `docs:check`, and full `governance:check` are green at `1108` owned test files. The inventory governance baseline was updated from 54 to 60 Desktop primary tests because earlier Wave 4A added six already-committed Desktop runtime/window tests.

---

# 12. Wave 5 — Product surface rebuild

Start only when relevant W2 domain and W3 integration contracts are stable.

Parallel feature lanes are encouraged because UI modules are mostly isolated.

## UI-5101 — Shared LabelPicker / LabelFilterPopover

**Depends:** LABEL-1101  
**Borrow:** shadcn Command + Popover.

**Implementation:** existing search/create/multi-select/narrow summary; no custom combobox engine.

**Implementation evidence (2026-08-27):**

- added a domain-neutral controlled `LabelPickerOption { id, name, color? }` presentation contract rather than importing Goal/Task/Label DTOs into shared UI; selected IDs stay caller-owned and unknown selected IDs are preserved in counts instead of being silently rewritten;
- both public controls reuse one internal `LabelCommandPanel` built directly on the existing shadcn/Reka `Command`, `CommandInput`, `CommandItem`, `Popover`, `Button`, and `Badge` primitives. Search filtering and multiple-selection semantics are delegated to Reka; there is no local combobox/search engine;
- `LabelPicker` provides searchable multi-select, optional color dots, compact/narrow summary, `+N` overflow, accessible combobox trigger state, and a normalized `create(name)` intent only for non-empty names that do not exactly match an existing label;
- label creation remains an intent emitted to the owning feature. `LABEL-1101` currently supplies domain/application persistence but no renderer transport; this shared component deliberately does not compensate by touching persistence or inferring a global catalog from Goal/Task DTOs. Goal/Task product lanes must inject a legitimate catalog/create seam;
- `LabelFilterPopover` reuses the same Command panel with creation disabled, exposes selected-count feedback, an explicit AND-semantics hint (`Matches all selected labels`), compact mode, and a semantic Clear action;
- tests exercise the actual Reka input path (`setValue('health')`) and prove the Command engine filters items, verify controlled multiple selection/deduplication, exact-match creation suppression, normalized create intent, compact summary behavior, filter semantics, and clear behavior;
- exported only `LabelPicker`, `LabelFilterPopover`, and the small option type from shared components; the internal Command panel remains private so Goal and Task cannot fork its interaction protocol;
- verification: focused `3` files / `7` tests green; full app-vue `193` files / `732` tests green; app-vue typecheck and production Vite build green; app-vue lint has `0` errors (13 pre-existing warnings); Nx sync, test-target governance, inventory governance, docs, and full governance are green. Test inventory is current at `1117` owned files (`970` unit / `29` integration / `3` smoke / `9` boundary-ipc / `5` boundary-main / `63` e2e / `1` perf / `37` governance).

## GOAL-5101 — Goal list/editor rebuild

**Depends:** GOAL-2101/2102, UI-1101, UI-5101

**Reference:** `docs/product/goal-task-vnext.md`.

Build new surface, do not hide old controls one-by-one.

List:

```text
Active/Completed/All
Labels
progress rows
KR completed count
due date
```

Editor:

```text
title/description/start/due/labels/KRs
```

Delete old Folder/Focus/Compare/Search product surfaces when parity reached.

**Implementation evidence (2026-08-27):**

- rebuilt the production Goal list around `GoalProgressRow`: each row owns the Goal title, canonical aggregate progress percentage/bar, attached labels, start/due range, completed/total KR count, and a display-only overdue badge derived from `Active + dueDate`; the old card-grid `GoalCard.vue` is deleted and no production Goal source references it;
- reduced the Goal toolbar to the three vNext system views `Active / Completed / All`, the shared compact `LabelFilterPopover`, and the single primary create action. Search/Refresh/Folder/Focus/Compare controls are absent from the production list surface rather than hidden conditionally;
- added `labelIdsAll` to Goal renderer state and sends it directly through `GoalClientPort.listGoals(...)`; selected labels are deduplicated and filtering remains repository-owned AND semantics instead of post-filtering one paginated client page. The old `searchGoals` fork is not used by the list fetch path, so label filters cannot be bypassed by a parallel search request;
- added the shared identity-scoped `useLabelCatalog` Query seam over `LabelClientPort`: renderer list/create requests stay current-user-only while identity appears only in the Query cache key; a successful create patches only that identity's catalog. Goal and Task can reuse the same seam without importing persistence or host auth details;
- rebuilt the Goal editor around Direction + Measurement only: title, description, start date, due date, shared `LabelPicker`, and an in-dialog KR draft collection. Motivation/feasibility/taxonomy fields are no longer production form controls;
- the KR draft editor keeps one `+ Add key result` entry with default title/current/target/unit fields and a collapsible advanced section for progress baseline, calculation method, and 1–5 progress weight. New KRs use `startingValue = currentValue`; decreasing/non-positive targets require a distinct `progressBaselineValue`, matching the canonical domain calculator rather than duplicating a UI-only percentage formula;
- creation persists `labelIds + initialKeyResults` in one Goal aggregate command and editing persists `labelIds + keyResults` in one update command. Goal lifecycle status remains a separate domain command; the editor does not invent a `status` field that is absent from `UpdateGoalReq`;
- the default Web Goal Playwright oracle was migrated from the retired card/search UI to the vNext product fixture. Real Chromium verifies aggregate Goal+Label+KR creation, progress-row edit/delete/detail, absence of legacy GoalCard/Search/Refresh, `Active/Completed/All`, keyboard-driven Label filtering, and toolbar/filter stability while the business panel is resized;
- verification: focused Goal/shared regressions `12` files / `31` tests green; full app-vue `196` files / `739` tests green; app-vue typecheck and production Vite build green; app-vue lint has `0` errors (13 pre-existing warnings); Web Goal vNext Playwright `5/5` green in Chromium; Nx sync, test-target governance, docs, and full governance are green. Test inventory is current at `1123` owned files (`976` unit / `29` integration / `3` smoke / `9` boundary-ipc / `5` boundary-main / `63` e2e / `1` perf / `37` governance).

## GOAL-5102 — Goal detail / record / review surface

**Depends:** GOAL-2102/2103, SETTLE-3501

Use:

- canonical KR calculator;
- linked Task summaries;
- activity timeline;
- inline/drawer review;
- aggregation-aware record labels;
- no duplicate ProgressBreakdown route.

## TASK-5201 — Task Today/Upcoming execution home

**Depends:** TASK-2201/2203/2204, UI-5101

**Imitate:** Super Productivity / personal task apps.

Default is occurrence list, not template management.

## TASK-5202 — Unified Task editor

**Depends:** TASK-2204/2205, UI-1101

Fields:

```text
title
date/time
repeat
labels
goal link
optional contribution
more: description/reminder/priority/checklist
```

Use `ReminderOffsetField` and `RecurrenceEditor`; do not duplicate time controls.

## TASK-5203 — Task detail + repeating plan management

**Depends:** TASK-2201/2202

Show:

```text
occurrence status
overdue derived badge
repeat position
goal metadata
complete/missed/skip correction
link to plan settings
```

## ROUTINE-5301 — Routine configuration center

**Depends:** ROUTINE-2301/2302

**Imitate:** Workrave/Safe Eyes method organization, but use MemoFlow AI-native product language.

UI owns configuration only; daily execution happens through surfaces.

## ROUTINE-5302 — Method library initial set

**Depends:** ROUTINE-5301, Routine runtime slices

Initial methods should be small and verifiable:

```text
Stand & Move
20-20-20
Drink Water
Sleep Wind-down
50/10 Protocol
Pomodoro
```

Each method record specifies:

```text
method type
recommended parameters
which parameters editable
runtime requirement
intervention default
source/reference note
```

Do not add dozens of health methods before the execution model is proven.

**Implementation — COMPLETE (2026-09-08):** `@memoflow/reminder/method-library` ships the six records above with runtime requirement, editable/recommended parameters, intervention default and source note. WallClock methods prefill the existing Routine configuration center; 50/10 and Pomodoro remain ProtocolSession-owned. Commit: `e3e5ae29aef`.

## NOTIF-5401 — Notification Center refresh

**Depends:** NOTIF-2401/3301

**Imitate:** Novu Inbox information hierarchy; keep current Vue components where structurally useful.

Display:

- Fact/read state;
- related entity/navigation;
- workflow/category;
- meaningful delivery status only when user-actionable;
- no worker internals.

## NOTIF-5402 — Preferences UI hierarchy

**Depends:** NOTIF-2402

UI:

```text
Global channels
Workflow/category groups
Per-workflow overrides
Critical/read-only explanation
```

Use existing switch/form primitives.

## PLAN-5501 — Planner production UI

**Depends:** PLAN-4301~4304

Use FullCalendar adapter, MemoFlow toolbar/theme, source filters, owner-aware drag/resize, conflict surface.

Do not expose Scheduler jobs.

### Wave 5 gate

Each feature must have:

- loading/empty/error states;
- keyboard navigation;
- narrow panel behavior;
- product wording review;
- no retired field in DTO/form;
- visual/E2E scenario against product fixture.

---

# 13. Wave 6 — AI, Mobile, dead-surface deletion and physical convergence

## AI-6101 — Goal/Task AI draft schema alignment

**Lane:** L-H  
**Depends:** Goal/Task final contracts.

Remove old fields and make AI propose:

```text
labels
KR Measurement V2
Task recurrence
Goal link
optional contribution
```

AI is not allowed to invent unsupported auto-settlement types.

**Implementation — COMPLETE (2026-09-08):** Shared Label is now the single Goal/Task classification path. AI drafts propose Label names, host LabelService resolves/creates canonical identity-scoped Labels, then Goal/Task owner mutation receives real IDs. Task draft no longer exposes retired folder/tag/color fields. Commit: `4a7b8f154e8`.

## AI-6102 — Routine AI command/draft tools

**Depends:** Routine contracts/runtime.

Natural language -> structured drafts:

```text
activate profile
create routine
temporary override
start protocol
pause/resume/end session
```

Persistent config changes require product-defined confirmation; timer truth stays deterministic.

**Implementation — COMPLETE (2026-09-08):** Mastra tools cover Routine create, Profile gate activation/deactivation, temporary override, Protocol start/pause/resume/end. Persistent configuration/new-session tools require approval; commands terminate at a Reminder-owned `RoutineCoachCommandPort`. PowerSync temporary-override parity prevents API/Desktop divergence. Commit: `2abcbd5591eb`.

## AI-6103 — Planner/Notification AI read tools

Read-only first:

- today schedule summary;
- unread notification summary;
- conflicts/upcoming tasks.

Do not give model direct ScheduledInvocation mutation tools.

**Implementation — COMPLETE (2026-09-08):** `planner_today_summary`, `planner_conflicts`, `planner_upcoming_tasks`, and `notification_unread_summary` read owner-domain Calendar/Task/Notification Fact projections only. HARD-7102 now fails if AI tools/adapters import `@memoflow/scheduler` or touch raw ScheduleTask/ScheduledInvocation mutation APIs. Commit: `2abcbd5591eb`.

## MOBILE-6201 — React/Mobile Goal/Task parity

**Depends:** Goal/Task web contracts stable.

Reuse same public contracts, not Vue component implementation.

Delete old Folder/Dependency/ValueType UI from mobile.

**Acceptance — COMPLETE (2026-09-08):** production-source parity audit found no GoalFolder/TaskFolder/Dependency/DAG/ValueType/raw Scheduler mutation surface. Task React/Mobile editor/list/detail now load, create/select and persist Shared Labels through the same public contract as Web/Desktop.

## MOBILE-6202 — Mobile Notification parity

Notification Fact/preferences share contract; device channel adapter may differ.

Routine ActiveUsage desktop-only capabilities must expose capability state rather than fake support on mobile.

**Acceptance — COMPLETE (2026-09-08):** React/Mobile Notification list/detail/preferences consume Notification Fact contracts; no Desktop-only ActiveUsage/Protocol implementation is faked in the mobile product surface.

## CLEAN-6301 — Retire legacy Goal/Task surfaces

Delete verified dead:

```text
GoalFolder
FocusMode UI/domain if retired
MultiGoalComparison
ProgressBreakdown standalone
TaskDependencyGraph
DAG/CriticalPath
Dependency demos
TaskFolder
old translations/routes/stories
```

`rg` residual audit mandatory.

**Implementation evidence — tranche A (2026-09-06): standalone ProgressBreakdown retired**

- verified `ProgressBreakdownPanel` had no production page consumer and the standalone HTTP/IPC/client query duplicated KR-native progress already present in `GoalAggregate` (`overallProgress`, key results, records/reviews);
- deleted the standalone ProgressBreakdown contract/value-object, `GET /:id/progress-breakdown`, Electron channel, client methods/adapters, query use case, aggregate method, Vue orphan component, module-index entries, and their positive legacy surface locks;
- Goal progress semantics remain intact through `GoalAggregate` and KR progress fields; `GoalDetailView` still renders `overallProgress` plus per-KR progress, so this tranche removes only the duplicate read model rather than product progress capability;
- added/updated anti-resurrection ownership evidence so Goal HTTP/IPC surfaces must not reintroduce `progress-breakdown` / `PROGRESS_BREAKDOWN`;
- verification: Goal typecheck green; Goal **80/80 files, 439/439 tests** green; Contracts **67/67 files, 482/482 tests** green; App-Vue typecheck green; focused Goal entry and product-time boundary tests **6/6** green; Goal/Contracts/App-Vue lint **0 errors** (pre-existing warnings remain); `git diff --check` green.

**Implementation evidence — tranche B (2026-09-07): remaining Goal/Task legacy surfaces retired; `CLEAN-6301` complete**

- retired GoalFolder/FocusMode/FocusSession/TaskFolder/TaskDependency/Subtask branded IDs and obsolete PowerSync/API/Desktop table mappings; canonical Prisma/PowerSync schemas already had no such live models;
- removed Task graph/folder cache identity and graph-only invalidation (`folderId`, `taskTemplateQueryKeys.graph*`, `projection: 'graphs'`, `task_dependencies`), leaving list/detail cache semantics intact;
- removed stale Goal/Task fixtures that still modeled Folder/Focus/Dependency repositories or graph/priority/dependency application methods, while retaining anti-resurrection tests that require the retired concepts to stay absent;
- retired Goal Focus/DAG and Task Dependency/DAG/CriticalPath/drag-to-dependency Web E2E suites, the dedicated `TaskDAGPage`, dependency-only helper methods, obsolete audit entries and their locale domains; surviving Core Product E2E uses the current `task-plan-card`;
- pre-vNext UI analysis documents now explicitly mark Folder/Focus/Comparison/Dependency/DAG/CriticalPath descriptions as historical snapshots, with current product/module docs as truth;
- production residual audit (excluding tests/docs/generated code) is zero for GoalFolder/FocusMode/FocusSession/MultiGoalComparison/TaskFolder/TaskDependency/DAG/CriticalPath and retired ghost tables; remaining mentions are architectural retirement records or anti-resurrection assertions;
- verification: Goal/Task/App-Vue/API/Desktop typechecks green; Goal **80/80 files, 439/439 tests**; Task **72/72 files, 732/732 tests**; Contracts **67/67 files, 482/482 tests**; App-Vue focused **10 files / 70 tests**; API focused **2 files / 8 tests**; Desktop focused **2 files / 13 tests**; six-project lint **0 errors** (pre-existing warnings remain); `git diff --check` green.

`CLEAN-6301` is complete. Goal and Task now expose only their vNext owner-domain/product contracts; retired Folder/Focus/Comparison/Dependency/DAG/CriticalPath paths have no ordinary runtime surface.


## CLEAN-6302 — Retire legacy Reminder naming/control paths

After compatibility consumers are gone:

- ControlMode;
- groupId one-to-many semantics;
- legacy trigger scanner;
- duplicate smart frequency auto mutation;
- responseTime overloaded snooze semantics;
- obsolete routes/components.

Physical package rename `reminder -> routine` is a separate final decision; do not mix with behavior migration if it adds churn.


**Implementation evidence — tranche A (2026-09-07): `ControlMode` + legacy scanner retired**

- removed legacy `ControlMode` from Reminder contracts, group DTOs, response schemas, domain/server/client aggregates, events, HTTP route, Electron IPC channel, RPC map, client ports/adapters/composables, Prisma and PowerSync persistence, data-portability import/export, and the React/Mobile detail surface;
- removed the retired Reminder trigger cron, its runtime wrapper, lifecycle/parity tests, Reminder package `node-cron` dependency, and the Scheduler-side due-set shadow reader/parity fixtures that existed only to compare the old scanner with Scheduler;
- kept Scheduler as the sole production wall-clock authority and retained ordinary due-query repositories used by Dashboard/Scheduler; no Reminder cron compatibility runtime remains;
- retained an anti-resurrection route assertion that `/groups/:id/control-mode` must stay absent;
- production residual audit is zero for `ControlMode`, `groupControlMode`, `control_mode`, retired control-mode mutation channels/methods, Reminder trigger cron factories, and Scheduler due-set shadow readers (excluding historical docs and anti-resurrection tests);
- verification: Reminder **71/71 files, 509/509 tests**; Contracts **67/67 files, 482/482 tests**; Schedule Orchestration **32/32 files, 139/139 tests**; Data Portability **9/9 files, 34/34 tests**; App-Vue Reminder **11 files / 31 tests**; contracts/reminder/app-vue/data-portability/api/desktop/app-react typechecks green; seven-project lint plus App-React lint have **0 errors**; full `governance:check` and `git diff --check` green.

`CLEAN-6302` remains open for the membership, smart-frequency, snooze-response, and final obsolete-surface tranches; physical `reminder -> routine` rename remains out of scope here.


**Implementation evidence — tranche B1 (2026-09-07): canonical Routine/Profile/M:N membership persistence made live**

- added MemoFlow-owned `RoutineProfileStore` as the single domain persistence seam for `RoutineDefinition`, `RoutineProfile`, and `ProfileMembership`, with Prisma and PowerSync implementations sharing the same domain objects rather than leaking adapter row types;
- both stores support definition/profile upsert/query/delete, M:N membership query/upsert/delete, and atomic full-edge replacement for one Routine; replacement rejects cross-owner and duplicate Profile edges before mutation;
- made `routineProfileStore` a required fail-closed Reminder module dependency and wired it through API Prisma and Desktop PowerSync composition roots, so vNext profile state is no longer a parity-only/read-only schema;
- added the temporary `LegacyRoutineCutoverService`: legacy create/move commands project into the canonical store while ordinary Routine edits update only the `RoutineDefinition` and therefore cannot collapse a future multi-Profile membership set;
- deterministic create replay now repairs an interrupted canonical projection before closure policy/re-mutation. Repair only synthesizes the legacy Profile edge when no canonical memberships exist; if `Work + Gaming` (or any other M:N set) already exists, replay preserves it unchanged;
- legacy group create/update/toggle/delete project to/remove the canonical `RoutineProfile`; template create/update/enable/pause/toggle/delete and batch operations keep the canonical `RoutineDefinition` current. Legacy single-group assignment remains the temporary command shim until the next transport/UI cutover tranche;
- persistence evidence: real in-memory SQLite PowerSync tests prove one Routine can belong to `Work + Gaming`, transactional edge replacement, and ownership/duplicate rejection; real PostgreSQL Prisma integration proves the same M:N round-trip and transactional replacement;
- verification: Reminder **73/73 unit files, 519/519 tests**; Reminder integration **5/5 files, 33/33 tests**; Contracts **67/67 files, 482/482 tests**; Reminder package build green; Reminder/API/Desktop/App-Vue/Contracts typechecks green; Reminder/API/Desktop/Contracts lint have **0 errors** (pre-existing warnings remain); Nx sync and `git diff --check` green.

`CLEAN-6302B1` is the persistence-live checkpoint above; its temporary single-group command bridge is retired by B2 below and must not be restored.

**Implementation evidence — tranche B2 (2026-09-07): single `groupId` ownership retired; canonical M:N ProfileMembership is end-to-end authority**

- cut ReminderTemplate public contracts from `groupId`/`groupName`/`groupEnabled`/`controlledByGroup` to `profileIds[]` commands and `profileMemberships[]` read models; lifecycle authority is now `global | profile | routine`;
- replaced the legacy move-to-one-group command with full membership replacement (`PUT /templates/:id/profiles`) across HTTP, Electron IPC, client ports/adapters/services and Vue composables; no compatibility alias for `/move` or `TEMPLATE_MOVE_TO_GROUP` remains;
- changed create/update, effective-state calculation, Profile statistics, Profile deletion guards, Profile bulk enable/pause and UI filtering to canonical `RoutineProfileStore` M:N membership reads. Profile bulk control mutates only `ProfileMembership.enabled` and never rewrites the Routine self switch;
- physically removed `ReminderTemplate.reminderGroupId` / `reminder_group_id` and the Prisma `ReminderGroup.templates` relation; Prisma Client was regenerated and the PowerSync schema/mappers/repositories no longer carry a single owner column or `findByGroupId` query;
- narrowed the legacy cutover seam to independent Template→RoutineDefinition and Group→RoutineProfile projection only. It can no longer synthesize, heal or replace a legacy single membership;
- upgraded data portability to preserve `routineDefinition` plus `profileMemberships[{ profileRef, enabled }]`; Prisma/PowerSync import reconstructs `routine_profiles`, `routine_definitions`, and `routine_profile_memberships`, so multi-Profile membership-local state survives backup/restore without `reminder_group_id`;
- made Reminder schedule projection re-read canonical global/Profile/membership eligibility rather than trusting the non-persisted aggregate `effectiveEnabled` cache, and added `reminder:template-eligibility-changed` for immediate re-projection after membership, membership-local state, Profile gate, or global gate changes;
- migrated Web and React/Mobile presentation to multi-Profile membership semantics. Create/Edit can select multiple Profiles, Profile filtering uses membership edges, and the membership dialog supports add/remove-many without collapsing existing membership sets; governance-required accessible names are present on the new controls;
- anti-resurrection audit is zero for live Reminder-template `reminder_group_id`, `reminderGroupId`, `moveTemplateToGroup`, `moveToGroup`, `reminder:template-moved`, and template-repository `findByGroupId`; remaining `groupId`/`findByGroupId` hits belong to the unrelated Editor workspace group/tab domain or explicit negative assertions;
- verification: Reminder **72/72 files, 493/493 tests** plus PostgreSQL integration **5/5 files, 33/33 tests**; Data Portability **32/32 files, 139/139 tests** including canonical M:N PowerSync round-trip; App-Vue **201/201 files, 773/773 tests**; Contracts **67/67 files, 482/482 tests**; API **62/62 files, 327/327 tests**; Desktop **61/61 files, 322/322 tests**; Schedule Orchestration **9/9 files, 34/34 tests**; PowerSync Schema **1/1 file, 4/4 tests**; Database **9/9 files, 30/30 tests**; ten-project typecheck and lint green (lint: 0 errors, existing warnings remain); `governance:check`, `docs:check`, `test:targets:check`, and `git diff --check` green.

`CLEAN-6302B` is complete. `CLEAN-6302C1` below retires duplicate Smart Frequency authority; the next Reminder cleanup tranche is `CLEAN-6302C2`, which replaces overloaded snooze `responseTime` with an explicit snooze duration semantic. Final obsolete route/component residual cleanup follows before `CLEAN-6302` can close.

**Implementation evidence — CLEAN-6302C1 (2026-09-07): duplicate Smart Frequency write authority retired**

- kept only two intentional frequency capabilities: read-only `frequency-analysis`, which computes transient `ResponseMetrics` from response history, and the explicit `frequency-adjustment` command, which changes the Routine interval only when the user submits a new interval;
- removed persisted/background suggestion state from `ReminderTemplate`: `responseMetrics`, `frequencyAdjustment`, `smartFrequencyEnabled`, plus `updateResponseMetrics`, `apply/confirm/rejectFrequencyAdjustment`, `toggleSmartFrequency`, `needsFrequencyAdjustment`, and `calculateSuggestedAdjustment`;
- removed `FrequencyAdjustment` suggestion VO/contracts and the pseudo reject command/event (`/frequency-adjustment/reject`, `rejectFrequencyAdjustment`, `reminder:frequency-adjustment-rejected`); the only frequency write event left is `reminder:frequency-adjusted`, emitted after the explicit command persists successfully;
- removed the obsolete global auto-mode preference (`globalSmartFrequency` / `globalSmartFrequencyEnabled`) while retaining the real `globalReminderEnabled` master gate;
- physically removed Smart Frequency columns from Prisma and PowerSync (`click/ignore/avg-response metrics`, persisted adjustment/suggestion columns, per-Routine smart flag, global smart flag), regenerated Prisma Client, and removed those fields from Prisma/PowerSync mappers, repositories, CRUD normalization, and data-portability import/export;
- fixed a production persistence defect exposed by the cleanup: Prisma `UserReminderPreferenceRepository.save()` had been writing the obsolete `globalSmartFrequency` field instead of `globalReminderEnabled`. It now persists the master gate on both create and update; a PostgreSQL integration test verifies `false` survives save + reload;
- anti-resurrection audit is zero for live `globalSmartFrequency`, `smartFrequencyEnabled`, auto/suggestion mutation methods, rejected-adjustment route/event, and retired Smart Frequency persistence columns; remaining hits are explicit negative assertions only. `ResponseMetrics` remains transient analysis data and `FrequencyAdjustmentResultSchema` remains the response shape of the explicit interval command;
- verification: Contracts **67/67 files, 482/482 tests**; Data Portability **32/32 files, 139/139 tests**; Reminder **72/72 files, 471/471 tests**; PostgreSQL Reminder integration **6/6 files, 34/34 tests**; API **62/62 files, 327/327 tests**; Desktop **61/61 files, 322/322 tests**; App-Vue **201/201 files, 773/773 tests**; PowerSync Schema **1/1 file, 4/4 tests**; Database **9/9 files, 30/30 tests**; nine-project typecheck and lint green (lint: 0 errors; existing warnings remain); `governance:check`, `docs:check`, `test:targets:check`, and `git diff --check` green.

`CLEAN-6302C1` is complete. `CLEAN-6302C2` below completes the Snooze/response-latency semantic split.

**Implementation evidence — CLEAN-6302C2 (2026-09-07): response latency and Snooze duration separated; canonical Routine override owns Snooze**

- `responseTime` now has one meaning only: measured user response latency in non-negative integer seconds for response analytics. `snoozeDurationSeconds` is a distinct positive-integer duration accepted only for `SNOOZED`; the shared `RecordReminderResponseSchema` rejects missing Snooze duration, Snooze duration on non-Snooze actions, negative/fractional response latency, and non-positive Snooze duration;
- removed the `Date`-as-duration model from `ReminderResponse`. Domain state, DTOs, analytics events, HTTP validation, Prisma, PowerSync, and Data Portability all carry the two durations as independent scalar seconds;
- fixed both persistence unit defects exposed by the split: Prisma no longer divides an already-second-valued `responseTime` by 1000 on save, and PowerSync no longer reconstructs response seconds as a millisecond `Date`;
- added `snooze_duration_seconds` to Prisma/PowerSync response persistence, regenerated Prisma Client, and upgraded backup/restore to preserve numeric `responseTime` plus `snoozeDurationSeconds`. A real PowerSync round trip locks `responseTime=7` and `snoozeDurationSeconds=900`;
- deleted the legacy Prisma Snooze rescheduler that directly mutated raw `ScheduleTask` rows by `sourceModule='reminder'`. API Snooze now writes the existing canonical `RoutineTemporaryOverride` via `createSnoozeOverride()` and publishes `routine:override-changed`, causing Schedule Orchestration to immediately re-project the Routine without rewriting long-lived trigger configuration;
- Snooze is fail-closed when a host has no canonical override writer, and a durable override write failure returns `SERVICE_UNAVAILABLE` rather than reporting a false Snooze success. The current response record and override write are still two durable writes rather than one transaction: if the override write fails after the response row is saved, the failure is visible but the response audit row remains. This tranche intentionally records that non-atomicity instead of claiming stronger guarantees;
- hard residual audit is zero in production for `ReminderSnoozeRescheduler`, `snoozeRescheduler`, `ReminderResponseDurationSeconds`, `toReminderResponseDurationSeconds`, Prisma `/1000` response conversion, Date-based response-duration restoration, and raw Reminder Snooze `scheduleTask.updateMany` / `sourceModule:'reminder'` paths;
- verification: Contracts **68/68 files, 486/486 tests**; Reminder **73/73 files, 466/466 tests**; Data Portability **32/32 files, 139/139 tests**; PostgreSQL Reminder integration **7/7 files, 35/35 tests**; API **62/62 files, 327/327 tests**; Desktop **61/61 files, 322/322 tests**; Schedule Orchestration **9/9 files, 34/34 tests**; ten-project typecheck green; ten-project lint **0 errors** (pre-existing warnings remain, no C2-added warning remains); `governance:check`, `docs:check`, `test:targets:check`, rebuilt `test:inventory:check`, and `git diff --check` green.

`CLEAN-6302C2` is complete. `CLEAN-6302D` is now the sole remaining Reminder cleanup tranche: remove/lock any obsolete Reminder routes/components and prove the final live residual surface before closing `CLEAN-6302`.

**Implementation evidence — CLEAN-6302D (2026-09-07): obsolete Reminder product/transport surfaces retired; `CLEAN-6302` closed**

- removed the duplicate/broken per-user list family end-to-end: `getUserTemplates()`, `getUserReminderGroups()`, `TEMPLATE_GET_BY_USER`, and `GROUP_GET_BY_USER`. React/Mobile now consumes the canonical template list contract, while HTTP no longer carries client methods that targeted nonexistent `/templates/mine` / `/groups/mine` paths;
- fixed the live Web Profile toggle transport from the stale `/groups/:id/toggle-status` path to the canonical server `/groups/:id/toggle` route and updated the Web mock accordingly. The existing IPC key `GROUP_TOGGLE_STATUS` is intentionally retained as a live transport identifier: it is not a second command path or state authority and a cosmetic IPC rename would add migration churn without changing semantics;
- retired HTTP-only one-way `POST /templates/:id/enable` and `POST /templates/:id/pause`; the single product action is `POST /templates/:id/toggle`. Route tests now lock the removed paths out rather than preserving compatibility aliases;
- retired the unconsumed legacy Profile batch command (`POST /groups/:id/batch`, `BatchGroupTemplates*`, `batchGroupTemplates`, and `setProfileMembershipsEnabled`). Canonical M:N `ProfileMembership.enabled` remains valid domain state, and Profile gating continues through the current Profile command path rather than a bulk compatibility surface;
- removed the stale Web `toggle-control-mode` mock left behind after CLEAN-6302A and narrowed `@memoflow/app-vue` Reminder exports by deleting the unused Reminder component barrel. `GridTemplateItem`, `ReminderTemplateCard`, `GroupDialog`, `TemplateDialog`, and `TemplateMoveDialog` remain internally reachable from the real Reminder view; only their accidental package-public export was removed;
- intentionally retained live capabilities that are not legacy duplication: `recordResponse`, read-only `frequency-analysis`, explicit user `frequency-adjustment`, ReminderHistory persistence/lifecycle presentation, and the existing history/response observability reads. CLEAN-6302D removes proven broken/duplicate/unconsumed surfaces rather than deleting useful read capability;
- hard production residual audit is zero for the retired per-user methods/channels and `/mine` paths, one-way enable/pause routes, batch group command/schema/domain helper, stale control-mode mock, and Reminder component wildcard export. Remaining textual hits are negative anti-resurrection assertions plus the intentionally live `GROUP_TOGGLE_STATUS` IPC key described above;
- verification: Reminder **73/73 files, 469/469 tests**; Contracts **68/68 files, 483/483 tests**; App-Vue **201/201 files, 773/773 tests**; API **62/62 files, 327/327 tests**; Desktop **61/61 files, 322/322 tests**; six-project typecheck green; six-project lint **0 errors** (pre-existing warnings remain); `governance:check`, `docs:check`, `target-baseline-check`, governance tests **29/29**, `test:targets:check`, `test:inventory:check` (**1172 files**), and `git diff --check` green.

`CLEAN-6302` is complete. No Reminder compatibility shim or physical package rename is required for closure; the ordered scheduling-convergence lane now advances to `CLEAN-6304`.



## CLEAN-6303 — Internalize raw ScheduleTask product surfaces

No ordinary user API/UI should create worker jobs directly.

Keep internal diagnostics/ops API only if genuinely used.

**Implementation evidence (2026-09-06):**

- raw `ScheduleTask` worker jobs are now Scheduler-owned persistence across every ordinary product transport: HTTP publishes only `GET /tasks`, `GET /tasks/due`, and `GET /tasks/:id`; Electron IPC exposes only list/detail/due/source diagnostics; the schedule RPC map keeps only the read query;
- removed product-client worker mutations from `ScheduleClientPort`, task API ports, HTTP/IPC adapters, and the React/Mobile Schedule surface. Mobile now renders worker status/health as diagnostics only; users change Task/Routine/Planner owner objects instead of pausing/completing/cancelling worker rows;
- retained CalendarEntry product commands and the audited W7 rebuild timeline/replay/audit operation surface because these are owner/ops capabilities rather than raw worker CRUD;
- retained Scheduler-internal create/update/pause/resume/complete/cancel/batch use cases and the legacy internal `SchedulingPort` adapter, so temporal execution capability remains intact behind the ownership boundary;
- anti-resurrection surface tests now assert that raw worker mutation HTTP routes, IPC channels, RPC names, and client methods do not exist; production residual grep finds no retired raw-worker mutation capability outside Scheduler internals;
- verification: `schedule` 45/45 files, 399/399 tests; `contracts` 67/67 files, 485/485 tests; schedule/app-react/app-vue/api/desktop typechecks green; app-vue production build green through the Desktop dependency chain; schedule/contracts/app-react lint have 0 errors (only pre-existing unrelated test warnings remain); `git diff --check` green.

## CLEAN-6304 — Scheduler physical package split decision — COMPLETE (2026-09-07)

**Decision:** perform the physical split now. Semantic ownership was already stable after CLEAN-6301/6302/6303, so deferring the move would only preserve misleading package ownership.

```text
packages/schedule   = Planner / Calendar
packages/scheduler  = Temporal Engine
```

**Implementation evidence — CLEAN-6304 (2026-09-07):**

- created first-class `@memoflow/scheduler` package and moved Scheduler-owned `ScheduleTask`, `ScheduleExecution`, worker repositories, lease implementation, queue/runtime, SchedulingPort adapter, Handler Registry, read-only diagnostics client/API/Electron transports, and related tests into it;
- reduced `@memoflow/schedule` to Calendar/Planner ownership: CalendarEntry, conflict detection/resolution, Calendar HTTP/IPC/client surfaces, rebuild worker/domain-event publisher and audited rebuild timeline/replay remain there;
- extracted the cross-boundary lease protocol to `@memoflow/patterns/lease` (`LeaseCoordinatorPort`, `LeaseGuard`, `LeaseLostError`), so Calendar reliability code depends only on a shared abstraction while Scheduler keeps the concrete `ScheduleLeaseCoordinator` and persistence adapters;
- API/Desktop composition now creates separate Calendar and Scheduler repository sets and sibling module handles. Schedule orchestration receives only Scheduler `scheduleTaskRepository`/source execution seams; Calendar receives the shared lease coordinator through the abstract port;
- Web/Mobile React worker diagnostics now use an explicit `SchedulerClientPort`; Calendar continues through `ScheduleClientPort`. The stale App-Vue raw-ScheduleTask composable/state was removed because normal Planner views did not consume it;
- no compatibility product mutation surface was restored: raw worker operations remain internal, external worker diagnostics stay read-only, and existing HTTP/IPC contract names remain stable;
- introduced `scope:scheduler` governance, target-baseline classification, root integration/coverage lane inclusion, clean-boundary CI inclusion, package export/public-surface governance, and regenerated the test inventory;
- real DB proof survived the split: Scheduler integration 1/1 file, 4/4 tests; Schedule integration 2/2 files, 24/24 tests (PostgreSQL CAS/outbox/lease/replay + PowerSync); Account cross-domain integration 4/4 files, 18/18 tests;
- unit/regression proof: Scheduler 31/31 files, 273/273 tests; Schedule 20/20 files, 129/129 tests; API 62/62 files, 323/323 tests; Desktop 61/61 files, 322/322 tests; Schedule Orchestration 34/34 tests; Goal 439/439; Task 732/732; Notification 242/242; App-Vue 201/201 files, 773/773 tests;
- 11-project typecheck is green; 11-project lint has 0 errors (pre-existing warnings only); governance, docs, test-target governance and the 1179-file test inventory are green.

`CLEAN-6304` is complete. Scheduling convergence now advances to `POC-6401`; the PoC must compare pg-boss against this clean SchedulingPort/Scheduler boundary without changing feature code.

## POC-6401 — pg-boss build-vs-adopt experiment — COMPLETE (2026-09-07)

**Outcome: `Keep custom`.** pg-boss 12.30.0 is a technically viable PostgreSQL cloud adapter, but the evidence does not justify production adoption for current vNext.

**PoC evidence:**

- isolated dev-only `PgBossSchedulingPocAdapter` implements the existing `SchedulingPort`; no Goal/Task/Routine/Reminder feature code or production host wiring changed;
- real PostgreSQL PoC is green: 1 file, 10/10 tests; strict PoC TypeScript check is green;
- passed owner complete-set reconcile, same-owner concurrent reconcile via PostgreSQL advisory lock, transaction rollback, transaction-aware enqueue through a caller-owned Prisma transaction, two-instance claim correctness, retry/deferred backoff, DLQ/redrive, heartbeat/touch, expiration supervision, restart recovery, and terminal `schedulingKey` collision fail-close;
- pg-boss can therefore provide the generic cloud queue mechanics behind SchedulingPort if a future trigger warrants migration;
- retry semantics are not exact: MemoFlow uses millisecond delays + arbitrary `backoffMultiplier`, while pg-boss uses second-level delay + boolean exponential backoff;
- MemoFlow would still own complete-set diffing, owner locking, terminal-key policy, durable reconcile receipt/audit semantics, Handler Registry and product-facing diagnostics mapping;
- Desktop's canonical store remains PowerSync and cannot use pg-boss directly. A cloud-only Hybrid would retain the local custom engine and add a second execution engine rather than simplify the whole system;
- measured current implementation surface: ~757 LOC cloud-specific Prisma, ~834 LOC Desktop PowerSync, ~1903 LOC shared runtime/queue/reconcile/lease; PoC wrapper ~380 LOC. The cloud-only replacement cannot delete the Desktop/shared majority;
- measured DB surface: current custom Scheduler persistence uses 4 tables / 13 indexes; pg-boss PoC installs 12 tables / 27 indexes / 5 functions / 26 types, additive under Hybrid;
- pg-boss stays `devDependency` only so the evidence remains reproducible. It is not exported by `@memoflow/scheduler` and is not a production dependency.

Canonical evidence: `docs/analysis/2026-09-07-pg-boss-build-vs-adopt-evidence.md`.

**Revisit only on evidence:** cloud multi-worker/reliability pressure, measurable custom-queue ops burden, a Desktop persistence move compatible with PostgreSQL/PGlite, or an intentional retry-contract narrowing.

`POC-6401` is complete. Scheduling convergence is closed for current vNext; proceed to Wave 7 hardening/closure.

---

# 14. Wave 7 — Hardening and closure

## HARD-7101 — Cross-domain failure matrix — COMPLETE (2026-09-07)

Must test:

```text
event handler failure -> outbox fallback
projection event lost -> reconcile repair
reconcile transaction crash
scheduler worker crash
lease expiry
same schedulingKey duplicate
stale invocation
handler business skip
handler technical retry
NotificationRequested replay
channel disabled
DND
rate limit
device offline
Desktop restart
API restart
Routine local runtime restart
Protocol session restart
clock/timezone/DST
Task outcome correction
Goal settlement replay/revert
Planner command failure -> visual revert
```

**Implementation evidence — HARD-7101 (2026-09-07):**

- added canonical `tools/test/hard-7101-failure-matrix.json` with exactly 22 required scenarios and behavior-test bindings;
- added `tools/test/hard-7101-failure-matrix.mjs`: `--check` fail-closes on missing files/titles/scenarios and `--run` executes the focused unit/integration/Electron evidence;
- added a real PostgreSQL Scheduler crash/lease-expiry integration case proving a claimed invocation can be taken over after host-lease expiry while retaining the same logical invocation identity;
- made the Notification device-offline retry/recovery evidence explicit rather than relying on a generic transport-failure label;
- hardened Linux Electron restart acceptance with Xvfb + temporary D-Bus/GNOME Secret Service and a test-only Playwright preload that removes Playwright's `password-store=basic`/`use-mock-keychain` defaults without touching MemoFlow product startup or weakening safeStorage fail-closed behavior;
- full failure-matrix runner passed **22/22 scenarios**; focused Scheduler Prisma integration passed **1 file, 5/5 tests**; Desktop persistent-guest restart E2E passed **1/1** under the real Secret Service path;
- root governance now runs the cheap matrix `--check`, so scenario/test drift fails before the expensive full execution gate.

Canonical evidence: `docs/analysis/2026-09-07-hard-7101-cross-domain-failure-matrix-evidence.md`.

`HARD-7101` is complete. Final closure advances to `HARD-7102`.

## HARD-7102 — Architecture governance locks — COMPLETE (2026-09-07)

Add/extend checks:

```text
Goal/Task/Routine packages cannot import ScheduleTask aggregate
Scheduler core cannot import Goal/Task/Routine/Notification domain
SourceModule cannot drive execution switch
no hardcoded Timezone.Shanghai fallback
no production Reminder trigger scanner
Notification multichannel path must use delivery planning
third-party recurrence/calendar DTOs cannot enter contracts
UI cannot edit ScheduledInvocation directly
```

**Implementation evidence — HARD-7102 (2026-09-07):**

- removed the final Goal/Task `ScheduleTask` execution-source compatibility seams and their direct `@memoflow/scheduler` dependencies; owner domains retain neutral projections + handler-key registrations only;
- deleted the production Reminder scanner/runtime facade (`ReminderSchedulerService`, cron contribution, `getPendingReminders`) while preserving read-only upcoming-reminder queries;
- deleted the cross-domain `notification.dispatch` bypass; shared delivery now enters only through `notification.requested -> CreateNotificationUseCase -> NotificationPolicy / DeliveryPlan -> internal durable dispatch`;
- removed stale Web raw-Scheduler mutation mocks and kept Scheduler HTTP/Electron/Web worker surfaces diagnostics-only;
- removed the implicit `Asia/Shanghai` default from `ScheduleConfig.createDefault()` so execution timezone is explicit;
- added `core-vnext-architecture-lock-audit.mjs` with negative/positive fixtures for all eight required HARD-7102 rules plus raw-worker transport sublocks; audit passes across **1765 production source files** and is part of root governance;
- full regression is green across Contracts `483/483`, Goal `438/438`, Task `730/730`, Reminder `461/461`, Notification `242/242`, Scheduler `273/273`, Schedule Orchestration `34/34`, Schedule `129/129`, App Vue `773/773`, API `323/323`, Desktop `322/322`, and Web `71/71`;
- real PostgreSQL integration is green: Goal `21/21`, Task `31/31`, Reminder `28/28`, Notification `35/35` (serial file mode avoids shared-TRUNCATE setup deadlock), Scheduler `5/5`; relevant typecheck/lint/governance gates are green with zero lint errors.

Canonical evidence: `docs/analysis/2026-09-07-hard-7102-core-vnext-architecture-governance-evidence.md`.

`HARD-7102` is complete. Final closure advances to `HARD-7103`.

## HARD-7103 — Full product acceptance journeys — COMPLETE (2026-09-07)

Run fixtures A-J through:

- focused package tests;
- API integration;
- Desktop integration;
- Web E2E;
- local Docker product journey;
- production-like schema boot.

**Implementation evidence — HARD-7103 (2026-09-07):**

- added one canonical A-J acceptance manifest/runner. All ten frozen fixtures have focused executable evidence; host layers are explicit about covered vs architecturally N/A scenarios instead of fabricating a 10 x 5 matrix;
- grouped focused acceptance passed **15 files / 81 tests** across Task/Goal/Schedule Orchestration/Routine/Notification/Planner, including real PostgreSQL evidence for finite-plan settlement and persisted Routine snooze;
- API host acceptance passed Fixture B **1/1** with Task -> Goal outbox delivery across API host restart and replay idempotency;
- Desktop host acceptance passed Fixtures G/H **2 files / 5 tests** for Electron idle input and persisted 50/10 protocol projection after restart;
- Web Chromium acceptance passed Fixtures B/J **2/2**; Fixture J performs a real FullCalendar 14:00 -> 16:00 drag, sends the real Task owner reschedule request, forces `409 CONFLICT`, and verifies visual rollback;
- current-revision local Docker acceptance passed **7/7** Product Phase A-E tests with image provenance validation plus a unique browser-request token proven in current container logs;
- production-like fresh-schema boot passed through canonical `database:prisma-push`: pgvector, **96** public tables, **23** Core vNext tables, scheduling/membership uniqueness fences, and the Task Goal-binding v2 CHECK are verified before the temporary database is dropped;
- acceptance caught and repaired real deployment residuals: local-compose env layering depended on caller cwd; `Dockerfile.api` omitted the physically split Scheduler package from isolated workspace closure; the hand-written Task Goal-binding CHECK still encoded retired trigger names and did not model link-only bindings;
- Task Goal-binding schema reconciliation is now versioned `memoflow.task-goal-binding/v2`: fresh databases create it, existing legacy constraints are transactionally replaced with persisted trigger migration, and subsequent migrator runs are idempotent. Focused database constraint tests are **4/4**;
- stale Phase A-E acceptance assumptions were migrated to current Goal/Task/AI surfaces (inline KR editor, `goal-progress-row`, explicit Plans surface, due-date wording, link-only-by-default Goal binding, current GoalPlanDraft fields) without restoring retired compatibility UI.

Canonical evidence: `docs/analysis/2026-09-07-hard-7103-full-product-acceptance-evidence.md`.

`HARD-7103` is complete. Final closure advances to `HARD-7104`.

## HARD-7104 — Documentation / ADR closure — COMPLETE (2026-09-08)

Update:

- ADR-003 historical status vs ADR-033/064;
- ADR-053~064 implementation status;
- module product docs;
- module file indexes;
- feature map;
- Active Plan status;
- migration notes;
- reuse ledger final decisions;
- actual validation evidence.

**Implementation evidence — HARD-7104 (2026-09-08):**

- ADR-003 is explicitly historical for implementation details; ADR-053~064 now report their real implemented/ongoing-policy status;
- Goal/Task/Routine/Notification/AI module docs, module indexes, feature map and Routine vNext checkpoint describe current production boundaries rather than migration-era surfaces;
- reuse ledger records final Emittery/rrule/FullCalendar/pg-boss decisions; pg-boss remains `Keep custom` / dev-only candidate;
- post-v0.11 Product parity is closed: ROUTINE-5302, AI-6101~6103 and MOBILE-6201/6202 all have implementation/acceptance evidence;
- final pre-doc quality sequence passed lint, typecheck, build, inventory, target-governance and full `memoflow:governance-check`; HARD-7101 remains 22/22 and architecture lock scans 1769 production files with zero violations.

Canonical evidence: `docs/analysis/2026-09-08-hard-7104-documentation-truth-closure.md`.

`HARD-7104` is complete. Final closure advances to `HARD-7105`.

## HARD-7105 — Final batch review and focused repair

Review five layers:

1. contract correctness;
2. vertical completeness;
3. behavioral completeness;
4. engineering quality;
5. plan integrity.

P0/P1 findings create focused repair passes before plan archive.

---

# 15. Concrete parallel batch schedule

This is the recommended execution sequence for multiple Agents.

## Batch A — Foundation, maximum parallelism

Start together after W0:

| Worktree                     | Tickets         | Shared train dependency                 |
| ---------------------------- | --------------- | --------------------------------------- |
| `core-vnext/time`            | TIME-1101/1102  | none until dependency proposal          |
| `core-vnext/ui-core`         | UI-1101         | UI Core Train only                      |
| `core-vnext/labels`          | LABEL-1101      | Contract + Schema Train                 |
| `core-vnext/scheduling`      | SCHED-1101~1105 | Contract + Schema + Orchestration Train |
| `core-vnext/notification-p0` | NOTIF-1101/1102 | notification-local                      |

Merge order inside Batch A:

```text
Contract Train
 -> Schema Train
 -> Time/Label/Scheduling feature branches
 -> Notification
 -> UI Core
 -> root validation
```

## Batch B — Business domains

Start together after W1 gate:

| Worktree                       | Tickets           |
| ------------------------------ | ----------------- |
| `core-vnext/goal-domain`       | GOAL-2101~2103    |
| `core-vnext/task-domain`       | TASK-2201~2204    |
| `core-vnext/routine-domain`    | ROUTINE-2301~2303 |
| `core-vnext/notification-fact` | NOTIF-2401/2402   |

TASK-2205 waits for Goal KR + Task Plan contracts.

## Batch C — Vertical integrations

Parallel:

```text
Task scheduling
Goal scheduling
NotificationRequested runtime
Task->Goal settlement
```

Then:

```text
Routine wall-clock
shadow cutover
common projection repair
```

## Batch D — Independent product engines

Parallel:

```text
Routine local runtime + windows
Planner FullCalendar adapter
Goal UI
Task UI primitives/queries
Notification UI groundwork
```

Goal/Task final page merge waits on relevant contracts, but Storybook/product skeleton work can begin earlier using fixture DTOs.

## Batch E — Product completion

Parallel:

```text
Goal surface
Task surface
Routine surface
Planner surface
Notification surface
AI alignment
Mobile parity
```

## Batch F — Deletion / hardening

Use fewer workers because shared files become dominant:

```text
legacy deletion
physical split decision
pg-boss PoC
failure matrix
governance
full E2E
```

---

# 16. Merge and review protocol

Every ticket/branch must report:

```text
1. Base revision
2. Intended protected contracts
3. Files changed
4. Build/Borrow/Imitate source
5. Focused tests run
6. Wider tests run
7. Known not-run checks
8. Contract/schema train dependency
9. Residual TODOs explicitly outside ticket
```

Merge rules:

- no branch merges with unrelated formatting churn;
- generated Prisma output only from Schema Train;
- package lock changes only when dependency ticket requires them;
- dependency addition carries license/adapter evidence;
- destructive deletion follows consumer inventory and parity test;
- no “temporary” dual path without deletion ticket and gate.

---

# 17. Verification command matrix

Actual target names must be confirmed with `nx show project` at execution time.

Core focused commands:

```bash
pnpm nx run utils:test
pnpm nx run patterns:test
pnpm nx run contracts:typecheck
pnpm nx run time:test
pnpm nx run goal:test
pnpm nx run task:test
pnpm nx run reminder:test
pnpm nx run schedule:test
pnpm nx run schedule-orchestration:test
pnpm nx run notification:test
```

Host / UI:

```bash
pnpm nx run api:typecheck
pnpm nx run api:test
pnpm nx run api:test:smoke
pnpm nx run desktop:typecheck
pnpm nx run app-vue:typecheck
pnpm nx run app-vue:test
pnpm nx run app-react:typecheck
pnpm nx run app-react:test
```

Repository gates:

```bash
pnpm typecheck
pnpm test:affected
pnpm lint:affected
pnpm docs:check
pnpm governance:check
```

Final:

```text
Prisma integration
PowerSync parity
Web E2E A-J applicable journeys
Desktop local-runtime journeys
local Docker boot/product journey
production-like schema boot
required CI
```

---

# 18. Risk ledger

| Risk                                                    | Impact                                | Mitigation                                             |
| ------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------ |
| old Task migrated to SchedulingPort before Task vNext   | double migration                      | W2 Task contract freezes before W3 projector migration |
| recurrence library leaks into domain                    | vendor lock / inconsistent time types | `RecurrenceEnginePort` + MemoFlow fixtures             |
| FullCalendar becomes source of truth                    | domain bypass                         | adapter projection + owner command + revert            |
| parallel branches collide on contracts/schema           | merge churn / semantic split          | Contract/Schema Trains single writer                   |
| Reminder Cron removed too early                         | missed routines                       | new handler reliability + shadow due-set compare first |
| Notification policy change suppresses expected messages | product behavior regression           | mixed-channel telemetry/tests + workflow defaults      |
| Routine sensor logic over-expands cross-platform scope  | schedule slip                         | Windows adapter first, stable Port from day one        |
| Plugin ambition reappears                               | scope explosion                       | registries only; runtime/install marketplace deferred  |
| pg-boss adoption distracts from business refactor       | unnecessary infrastructure rewrite    | PoC W6 only after SchedulingPort migration             |
| UI rebuild before contracts stable                      | repeated rewrites                     | W5 hard gate on domain contract readiness              |

---

# 19. Definition of Done

> **Long-horizon closure:** the checklist below remains the full Core vNext end-state, not the v0.11 merge gate. Items assigned to post-v0.11 above intentionally remain unchecked until their follow-up implementation lands.

Core vNext can close only when all of the following hold:

## Business

- [x] Goal = Direction + Measurement, retired project-management concepts gone;
- [x] KR Measurement V2 is canonical;
- [x] Task = Action + Execution, occurrence/plan semantics correct;
- [x] Task Goal link and contribution are separated;
- [x] Routine Profile/Trigger/Protocol semantics implemented;
- [x] WallClock and ActiveUsage runtimes are correctly separated.

## Infrastructure

- [x] EventBus = Emittery fast path; no bus-global drain;
- [x] standard recurrence engine selected and adapterized;
- [x] Goal/Task/Routine no longer construct/own legacy ScheduleTask projection paths — production residual grep now finds `ScheduleTask.create(...)` only inside the Scheduler package itself;
- [x] stable schedulingKey + atomic reconcile;
- [x] HandlerRegistry fully replaces the SourceModule execution switch — the legacy `schedule-orchestration` execution fallback has been removed; remaining `sourceModule` fields are Scheduler metadata, not handler routing authority;
- [x] wall-clock Routine has one scheduler authority;
- [x] durable NotificationRequested pipeline exists;
- [x] Notification Fact and Delivery outcome separated;
- [x] per-channel preference/DND/rate-limit works.

## Product surfaces

- [x] Planner uses a maintained calendar engine (FullCalendar Standard);
- [x] Planner edits route to owner domains;
- [x] Goal/Task/Routine/Notification primary Web/Desktop vNext UI implemented;
- [x] Routine InterventionWindow and FocusWindow validated;
- [x] Mobile/AI contracts have no retired fields and parity gaps — AI-6101~6103 and MOBILE-6201/6202 are complete; Shared Label is single-track and AI has no raw Scheduler capability.

## Reuse discipline

- [x] no custom calendar grid/date picker recurrence engine was unnecessarily rebuilt;
- [x] dependency/license ledger has final decisions for every residual candidate — POC-6401 selected `Keep custom`; pg-boss remains a dev-only candidate;
- [x] GPL/AGPL references were not copied into incompatible product code;
- [x] third-party DTOs/types stay behind adapters for completed v0.11 scope.

## Quality

- [x] fixtures A-J pass where applicable to the v0.11 milestone;
- [x] final cross-domain failure matrix passes — governed manifest/checker + full executable runner passed 22/22 scenarios;
- [x] API/Desktop/PowerSync/Prisma parity passes for the completed primary product scope;
- [x] full governance/docs checks green for the completed milestone and current main;
- [x] residual grep proves completed convergence paths are single-track — raw ScheduleTask product mutations, SourceModule execution fallback, Goal/Task legacy surfaces, Reminder ControlMode/scanner/duplicate state, Task string tags/color and AI raw Scheduler access are gone;
- [ ] final residual batch review has no P0/P1 unresolved finding.

---

# 20. Immediate next implementation batch

Do **not** restart Wave 0–5, Product parity, CLEAN convergence, or dependency PoCs. All of those lanes are closed. The only executable residual is:

```text
A. Product parity          DONE — ROUTINE-5302, AI-6101~6103, MOBILE-6201/6202
B. Scheduling convergence DONE — CLEAN-6301~6304; POC-6401 = Keep custom
C. Final closure
   HARD-7101              DONE — 22/22 executable failure matrix
   HARD-7102              DONE — architecture locks / anti-resurrection
   HARD-7103              DONE — A-J + host + local-Docker + schema acceptance
   HARD-7104              DONE — ADR/docs/reuse/plan truth closure
   HARD-7105              NEXT — five-layer final review, focused repair, delivery reconciliation, archive
```

HARD-7105 must not mark the plan complete until any P0/P1 finding is repaired and independently rechecked, the loose delivery/PR state is reconciled, and the final accepted revision has a clean governed workspace.
