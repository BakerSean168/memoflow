# Task vNext — Second-pass deep audit

Date: 2026-09-29  
Branch: `product/vnext-convergence`  
Status: second-pass discovery complete; Q1-Q6 product direction resolved; interactive KR record design proposed
Parent plan: [MemoFlow Product vNext Convergence](../plan/active/2026-09-29-product-vnext-convergence.md)

## 1. Executive decision

Task is **not** a module that needs to be redesigned from scratch.

The vNext domain model is substantially stronger than the current UI suggests:

```text
TaskPlan
  = action definition
  + schedule
  + lifecycle
  + outcome policy

TaskOccurrence
  = one execution opportunity
  + one reality fact

Task Plan Workspace
  = plan
  + Goal/KR context
  + occurrence summary
  + recent occurrences
  + linked Knowledge
```

The current Vue implementation has already moved in the right direction:

- the current Today / Upcoming surfaces are occurrence-first;
- Task create uses compact property chips;
- Task Plan has a real workspace route;
- Task Detail already uses direct inline editing;
- occurrence correction is explicit;
- Goal/KR links and Checklist ownership are modeled correctly;
- the workspace read model is already bounded for recent history.

The second-pass audit found that the largest remaining problems are **semantic and vertical-integration drift**, not cosmetic drift.

The most important defect is severe:

> The UI action labeled “结束计划 / End plan” currently calls **Archive**, while the domain explicitly defines Archive as display/visibility metadata that does not stop an active plan.

An archived Active recurring plan is still selected by occurrence materialization and is still considered Active by reminder delivery guards. This can therefore continue generating occurrences and firing reminders after the user believes they ended the plan.

Before broad Task UI convergence, lifecycle/outcome semantics must be repaired.

## 1.1 Decision closure / truth hierarchy

After the 2026-09-29 discussion, use the following hierarchy rather than treating all historical documents as equally current:

```text
Product behavior truth
  docs/product/task-vnext-plan-occurrence-workspace.md
  docs/product/goal-task-vnext.md

Architecture truth
  ADR-053  personal Goal/Task boundary
  ADR-056  Task -> Goal record/settlement
  ADR-057  occurrence/outcome/lifecycle
  ADR-068  KR Measurement V3 / Record semantics
  ADR-069  cross-owner context projection
  ADR-075  Task Workspace / Goal link

Evidence / why
  this second-pass audit

Execution order
  docs/plan/active/2026-09-29-product-vnext-convergence.md
```

Important status distinction:

- sections labeled **current fact** describe the code now;
- 2026-09-29 ADR amendments labeled **target-design / 待实施** are approved product/architecture direction, not claims that code already behaves that way;
- implementation tickets must migrate current contracts explicitly before deleting compatibility fields such as `completionPolicy`.

---

# 2. Evidence set

## Product / architecture truth

Reviewed:

- `docs/product/task-vnext-plan-occurrence-workspace.md`
- `docs/product/goal-task-vnext.md`
- `ADR-071-task-plan-occurrence-aggregate-boundary.md`
- `ADR-072-task-plan-schedule-algebra.md`
- `ADR-073-task-occurrence-result-and-checklist.md`
- `ADR-074-task-reminder-policy-persistence.md`
- `ADR-075-task-workspace-context-and-goal-link.md`
- Goal measurement ADR/contracts for Task → KR contribution restrictions.

## Vue surfaces

Reviewed:

- `TaskManagementView.vue`
- `TaskDetailView.vue`
- `TaskPageToolbar.vue`
- `TaskOccurrenceRow.vue`
- `TaskPlanRow.vue`
- `TaskPlanDialog.vue`
- `TaskPlanForm.vue`
- Task Plan form sections
- `QuickTaskDialog.vue`
- `DailyTodoWidget.vue`
- `TaskCapsulePreview.vue`
- Task list/workspace/mutation/query composables
- Task Goal-binding composable
- current Task unit/surface tests and relevant Web flows.

## Task owner/backend

Reviewed:

- Task contracts;
- TaskPlan aggregate / lifecycle policy / outcome evaluator;
- Task plan and occurrence routes/controllers;
- Task workspace query service;
- occurrence materialization runtime;
- Task reminder fire handler;
- Task → Goal outbox;
- Goal Task-progress consumer;
- Task HTTP/IPC adapters and client service;
- Prisma/PowerSync Task Plan repositories.

---

# 3. Protected contracts

The next Task convergence pass must preserve the following unless a ticket explicitly migrates them.

## 3.1 Plan / Occurrence ownership

```text
TaskPlan
  owns definition / schedule / lifecycle / completion policy

TaskOccurrence
  owns one execution fact / checklist snapshot / result
```

Do not collapse them back into a single mutable Task row.

## 3.2 Occurrence facts

Persisted occurrence states remain:

```text
Pending
InProgress
Completed
Missed
Skipped
```

`Overdue` remains derived.

Missing a click does not automatically mean Missed.

## 3.3 Plan lifecycle and outcome

These are separate axes:

```text
lifecycle: Active | Paused | Closed
outcome:   Open | Succeeded | Failed | Abandoned
archive:   visibility metadata
delete:    mistaken creation
```

## 3.4 Task workspace route

`/tasks/:id` remains a legitimate Task Plan owner workspace.

This is not analogous to a Key Result nested inside Goal. The plan has its own schedule, lifecycle, occurrence history, checklist definition, Reminder policy and cross-owner context.

## 3.5 Goal/KR boundary

Task may link to Goal/KR.

Automatic numeric contribution:

- is valid only for Sum KR;
- remains Task-owned settlement intent plus Goal-owned Record application;
- must not make Task own Goal progress.

## 3.6 Checklist history

Updating Plan checklist definitions only affects future occurrences. Existing occurrence checklist snapshots remain historical facts.

## 3.7 Product-time semantics

Task exact calendar/clock semantics remain Task-owned exact time semantics. Do not convert Task dates to GoalTimeframe merely for UI reuse.

---

# 4. Current user-path map

## 4.1 Main Task surface

Current route:

```text
/tasks

Today
Upcoming
Plans
```

Today / Upcoming render TaskOccurrence rows.

Plans renders TaskPlan rows.

## 4.2 Task Plan workspace

```text
/tasks/:id
```

Current capabilities:

- inline title;
- inline description;
- status/lifecycle actions;
- schedule;
- recurrence;
- importance;
- Goal/KR relation;
- labels;
- reminders;
- Checklist definition;
- execution summary;
- linked notes;
- recent occurrences and occurrence correction.

## 4.3 Task creation

Full create:

```text
TaskPlanDialog
 -> identity
 -> property chips
 -> description
 -> Checklist
```

Compact quick-create exists in two forms:

- inline Task Capsule create;
- standalone `QuickTaskDialog.vue`.

However, the standalone QuickTask route integration is currently broken; see T2-01.

---

# 5. Finding ledger

| ID | Severity | Finding | Root cause |
| --- | --- | --- | --- |
| T2-01 | P1 | Quick Task deep link is disconnected | half-retired route/dialog integration |
| T2-02 | P1 | Hidden occurrence status filter controls Plans result | filter state reused across different owner semantics |
| T2-03 | **P0** | “End plan” calls Archive and does not end the plan | UI lifecycle semantics diverged from canonical domain |
| T2-04 | P1 | Plan outcome is dropped from presentation; Abandon exists backend-only | UI still models old status-only Task |
| T2-05 | P1 | Configurable completion policy is a product-model residue and the default can leave finite missed plans Open | domain generalized beyond final product semantics |
| T2-06 | P1 | UI permits Task contribution to non-Sum KR that Goal rejects later | binding projection strips KR measurement semantics |
| T2-07 | P2 | Main Task occurrence surface reads full history | older list path bypasses bounded date-range query |
| T2-08 | P2 | Plan page/limit are phantom client semantics | client/server query contract drift |
| T2-09 | P2 | KR-scoped Task filter underuses server query and exposes raw IDs | incomplete cross-owner query projection |
| T2-10 | P2 | DailyTodoWidget remains legacy UI/behavior | older widget bypasses canonical occurrence surface |
| T2-11 | P2 | Direct-manipulation metadata grammar is only partially converged | Goal/Task copied local presentation recipes |
| T2-12 | Resolved | Task Home IA converges to Today / Plans; Upcoming moves to Schedule | historical product-doc drift |
| T2-13 | P2 | Archive is exposed in normal lifecycle UX even though it is only visibility metadata | visibility lifecycle leaked into business actions |
| T2-14 | P3 | Task workspace labels bounded history as generic “Occurrences” | read-model semantics not reflected in copy |
| T2-15 | P1 | Task → KR recording is fixed-delta/Sum-biased and cannot represent user-entered measurements across KR methods | contribution contract models only automatic positive fixed values |

---

# 6. Detailed findings

## T2-01 — Quick Task deep link is disconnected

**Severity:** P1 major

### Evidence

AI and Today Overview navigate to:

```text
/tasks?dialog=quick-task
```

`QuickTaskDialog.vue` exists and has isolated unit tests.

But `TaskManagementView.vue`:

- does not read `route.query.dialog`;
- does not mount `QuickTaskDialog`;
- only mounts `TaskPlanDialog`.

Repository-wide search found no current integration that maps `dialog=quick-task` to the standalone QuickTask dialog.

### Observed behavior

```text
AI / Today Overview
 -> /tasks?dialog=quick-task
 -> Task page opens
 -> no quick-create dialog
```

### Desired behavior

Depends on Product Decision Q1.

Either:

```text
shortcut
 -> real Quick Task
 -> title first
 -> today/all-day default
 -> save
```

or:

```text
shortcut
 -> canonical full TaskPlanDialog
```

but not a dead query contract.

### Impact

Two visible creation entry points have a broken primary action.

### Root cause

QuickTaskDialog survived component-level migration while route-level ownership was removed from TaskManagement.

### Repair direction

Do not patch the query watcher until Q1 is settled.

---

## T2-02 — Hidden occurrence filter controls Plans

**Severity:** P1 major

### Evidence

`TaskManagementView` owns one state:

```ts
statusFilter:
  'all' | TaskOccurrenceStatus
```

The status filter is hidden when:

```text
activeSurface === 'plans'
```

but `filteredPlans` still consumes it.

Current mapping:

```text
Completed            -> plan.status === Closed
Pending/InProgress   -> plan.status === Active
Missed/Skipped       -> no Plan can match
```

There is no surface-switch reset.

### Reproduction

```text
Today
 -> filter = Missed
 -> switch to Plans
 -> status control disappears
 -> Plans list becomes empty
 -> user cannot see/remove the active filter
```

### Impact

The visible list can be controlled by invisible, semantically invalid state.

### Root cause

Occurrence status and Plan lifecycle/outcome were treated as one generic “status”.

### Repair direction

Use separate surface state:

```text
Occurrence filter
  Pending / InProgress / Completed / Missed / Skipped / All

Plan filter
  lifecycle/outcome/archive semantics
```

Do not translate occurrence status into Plan status.

---

## T2-03 — “End plan” is Archive, but Archive does not end a Task Plan

**Severity:** **P0 blocker**

This should be fixed before broad Task UI polish.

### Evidence — UI

Task UI copy currently maps Archive to:

```text
zh-CN: 结束计划
en-US: End plan
```

Task Detail and TaskPlanRow invoke `archivePlanSafe`.

### Evidence — canonical domain

`task-plan-lifecycle.policy.ts` explicitly states:

```text
Archive is display/visibility metadata, not business lifecycle/outcome.
```

`archive()` only sets:

```text
archivedAt = now
```

It does not change:

```text
status
outcome
closedAt
```

Domain tests explicitly verify an archived Active plan remains Active and can still be paused/resumed.

### Evidence — recurring materialization

Both Prisma and PowerSync:

```text
findActiveRecurringPlansForMaterialization()
```

filter by:

```text
status = Active
deletedAt IS NULL
schedule.kind = Recurring
```

They do **not** exclude `archivedAt != null`.

Therefore an archived Active recurring plan remains eligible for occurrence materialization.

### Evidence — reminders

The Task reminder fire handler rejects non-Active plans.

An archived plan still has:

```text
status = Active
```

so Archive alone does not make it non-fireable.

### Evidence — Abandon is canonical but not yet operationally complete

The backend already exposes `AbandonTaskPlanUseCase`, and `TaskPlan.abandon()` correctly produces:

```text
status = Closed
outcome = Abandoned
closedAt = now
```

However, the current Abandon use case only mutates/saves the Plan.

By comparison, Pause explicitly deletes incomplete future occurrences from the effective date.

Current Abandon does **not**:

- delete/reconcile already-materialized incomplete future occurrences;
- emit a dedicated plan-abandoned event;
- participate in the Schedule projection event map, which currently knows pause/resume/delete but not abandon.

So simply wiring the UI from Archive to the existing Abandon command is not sufficient. The End Plan vertical slice must also close already-materialized execution/schedule projections.

### Additional frontend defect

`useTaskPlanMutations` treats Archive as a status mutation and optimistically patches:

```text
status = Closed
```

The server then returns the real domain value, which may still be Active/Paused plus `archivedAt`.

So even the optimistic UI expresses semantics that the server explicitly rejects.

### Impact

The user can click “End plan” while the plan remains Active.

For recurring plans this can continue:

- occurrence materialization;
- reminder eligibility;
- active-plan behavior.

This violates the primary meaning of the action.

### Root cause

A historical “archive/end” UI action was never migrated to the vNext split:

```text
Abandon = user intentionally stops
Archive = visibility/history metadata
```

### Required repair invariant

After the user chooses a product action meaning “stop/end this plan”:

```text
status != Active
future materialization stops
already-materialized incomplete future occurrences are reconciled/removed
future reminders are not fireable
Schedule projection no longer presents future execution for the ended plan
outcome represents explicit user intent when applicable
```

### Recommended direction

Normal active-plan UI:

```text
Pause
Abandon / End plan
Delete mistaken creation
```

Archive should not masquerade as End.

If Archive remains user-visible, it should be a history/visibility action for already-closed plans and needs a coherent restore/unarchive path.

---

## T2-04 — Plan outcome is missing from Task presentation

**Severity:** P1 major

### Evidence

`TaskPlanClientDTO` includes:

```text
status
outcome
completionPolicy
closedAt
archivedAt
abandonedReason
```

But `TaskPlanViewModel` / `mapTaskPlanDtoToViewModel()` effectively present only lifecycle-ish status and archive flags.

The UI shows generic labels such as:

```text
Active
Paused
Ended
```

The product contract requires meaningful outcomes:

```text
进行中
已成功
未达成
已放弃
```

### Backend capability exists

`abandonPlan(id, reason?)` exists through:

- contract;
- HTTP/IPC client;
- client service;
- server controller;
- use case;
- domain lifecycle.

But `useTaskPlanMutations` does not expose it and the Task UI has no Abandon action.

### Impact

The frontend cannot distinguish:

```text
Closed + Succeeded
Closed + Failed
Closed + Abandoned
```

and cannot express explicit abandonment even though the domain supports it.

### Root cause

Task domain migration completed beyond the frontend presentation migration.

### Repair direction

Introduce a canonical Task Plan presentation layer that derives:

```text
primary product state
secondary lifecycle state
archive visibility
```

without collapsing them into one string.

---

## T2-05 — Completion policy is a product-model residue

**Severity:** P1 major

### Evidence

Canonical contract:

```text
AllowCorrection
StrictNoBackfill
```

The Task outcome evaluator uses it.

For example:

```text
StrictNoBackfill + Missed
 -> Failed
```

The create/update API supports `completionPolicy`.

The current Vue Task create/detail flow does not expose or submit it.

### Impact

The domain exposes a policy choice that the product no longer needs. More importantly, the current default `AllowCorrection` can leave a finite Plan `Open` even after its scope has ended with an explicit Missed occurrence.

That does not match the resolved user model:

```text
Overdue -> unresolved
Missed -> explicit user-confirmed non-completion
Skipped -> explicit waiver
Completed -> explicit completion / correction
```

### Root cause

Task outcome semantics were generalized before the final product interaction was simplified.

### Resolved direction

Do **not** add a completion-policy selector to Task UI.

Converge toward one canonical product rule:

```text
finite plan
  any Pending/InProgress -> Open
  all required Completed/Skipped -> Succeeded
  scope ended + any explicit Missed -> Failed

infinite recurring plan
  -> Open until Abandoned
```

Missed/Skipped remain correctable to Completed, so a derived Failed plan can be re-evaluated after user correction.

Overdue alone must never create Missed/Failed.

---

## T2-06 — Task can configure invalid automatic contribution to non-Sum KR

**Severity:** P1 major

### Evidence — Goal contract

Goal measurement v3 only accepts automatic numeric Task contribution for:

```text
KeyResultCalculationMethod.Sum
```

For Average / Max / Min / Last:

- Task may link to the KR;
- Task must not automatically add a numeric contribution Record.

### Evidence — Task binding UI

`useTaskGoalBindingOptions.mapKeyResultOption()` currently strips:

- calculation/aggregation method;
- unit.

The Task-side `KeyResultBindingOption` contains only:

- id;
- title;
- weight;
- progress.

Therefore `KeyResultLinksSection` cannot know whether contribution is valid and lets contribution be configured generically.

### Evidence — delayed failure

When Task settlement reaches Goal:

`CreateGoalRecordUseCase` rejects a Task source when KR method is not Sum:

```text
Automatic Task contribution is supported only for Sum key results
```

This failure occurs after the Task configuration has already been accepted.

The Task→Goal outbox then owns retry/delivery behavior.

### Impact

The UI can create a durable configuration that only fails when a later Task completion attempts settlement.

This is a vertical-contract failure, not merely a form validation issue.

### Root cause

Task's Goal-binding read projection lacks the KR measurement semantics required to validate the interaction.

### Repair direction

Extend the **read/presentation projection**, not Task ownership:

```text
KeyResultBindingOption
  + calculationMethod
  + unit
```

Behavior after T2-15 convergence:

```text
Sum
 -> link-only
 -> fixed automatic delta
 -> prompt for completion-time delta

Average/Max/Min/Last
 -> link-only
 -> prompt for completion-time sample
 -> no blind fixed automatic contribution by default
```

Task still must not own Goal calculation rules. The prompt path is a user-authored Goal measurement transported durably through Task completion, not an automatic fixed contribution.

---

## T2-07 — Main Task occurrence surface reads full occurrence history

**Severity:** P2 normal

### Evidence

TaskManagement currently calls the generic occurrence list path and requests:

```text
page = 1
limit = 500
```

but the generic Web occurrence route/list use case does not implement meaningful paging for this path.

TaskManagement then derives Today/Upcoming client-side from the accumulated store.

Meanwhile, the codebase already contains a canonical bounded endpoint:

```text
/task-occurrences/by-date-range
```

and `useTaskOccurrences.fetchInstancesByDateRange()`.

Task Capsule and DailyTodoWidget already use the range path.

### Impact

Task Home cost grows with accumulated occurrence history.

The primary execution surface should not need the user's entire historical occurrence set to answer:

```text
what is due/overdue today?
what is coming next?
```

### Root cause

TaskManagement predates the bounded server-state range path.

### Repair direction

Use bounded owner queries per surface.

Upcoming needs Product Decision Q5 before exact query shape is frozen.

---

## T2-08 — Task Plan page/limit are phantom semantics

**Severity:** P2 normal

### Evidence

Client-side list params/cache keys contain:

```text
page
limit
```

Different callers use values such as 20/100/200/500.

But the Task Plan server list filter schema/repository supports:

```text
status
goalId
keyResultId
labelIdsAll
```

not actual page/limit pagination.

### Impact

Different query keys can cache effectively the same full server list.

The API communicates bounded behavior it does not implement.

### Root cause

Client pagination shape survived while server query was simplified.

### Repair direction

For the vNext management surface, implement real bounded pagination/cursor semantics or intentionally remove fake page/limit until that exists.

Given Product vNext scale goals, real bounded query is preferable.

---

## T2-09 — KR-scoped Task deep link is only partially server-scoped

**Severity:** P2 normal

### Evidence

The server Task Plan list filter supports:

```text
goalId
keyResultId
```

with keyResult scoped through its Goal.

TaskManagement currently sends `goalId` to the plan query, but applies `keyResultId` only in browser-side filtering.

The list query key also lacks canonical KR filter identity.

The visible scope label is currently shaped as:

```text
Goal <raw id> · KR <raw id>
```

### Impact

- unnecessary client filtering;
- weaker cache identity;
- implementation IDs leak into product UI;
- cross-owner context is less understandable.

### Repair direction

Add `keyResultId` to the canonical Task Plan list query projection and resolve display context to:

```text
Goal name
KR title
```

not raw IDs.

---

## T2-10 — DailyTodoWidget is still legacy Task UI

**Severity:** P2 normal

### Evidence

The Today Overview widget contains hard-coded Chinese strings such as:

- 今日待办;
- 查看全部;
- 今日暂无任务安排;
- 标记完成;
- 已跳过;
- 已错过;
- 全天.

It also uses raw emerald utility colors.

More importantly, it disables completion when an occurrence is Missed or Skipped.

ADR-073 and the canonical `TaskOccurrenceRow` support correction flows where historical occurrence facts can be corrected explicitly.

### Impact

The same occurrence can behave differently depending on which Task surface the user is looking at.

It also breaks locale and semantic-token convergence.

### Root cause

The Home widget predates the canonical Task occurrence presentation/actions.

### Repair direction

Reuse canonical occurrence presentation/action semantics.

A compact widget may expose fewer actions, but omitted correction must have an explicit path to the canonical occurrence interaction rather than being silently impossible.

---

## T2-11 — Task Detail direct manipulation is only partially converged

**Severity:** P2 normal

### Evidence

Good existing behavior:

- title inline edit;
- description inline edit;
- schedule/recurrence/importance direct property surfaces.

Remaining friction:

- Goal context badge navigates to Goal, while a separate Pencil icon edits the binding;
- Reminder badge opens a delete menu, while a separate Pencil icon opens advanced editing;
- Labels use a separate plus affordance;
- metadata badges copy the same local class recipe repeatedly;
- metadata rows duplicate the Goal detail two-column recipe.

### Impact

The user still encounters:

```text
property value + tiny edit glyph
```

instead of consistent direct manipulation.

The copied presentation classes are also a source of future Goal/Task drift.

### Root cause

Goal and Task converged visually through local implementation before shared grammar was frozen.

### Repair direction

After Goal reference closure:

- distinguish external navigation from editing intent;
- click the property representation itself when editing is the natural action;
- use a distinct external/open affordance when switching owner context;
- promote proven metadata row/chip grammar into shared primitives.

Do not create a universal EntityDetail component.

---

## T2-12 — Task Home information architecture has conflicting product truth

**Severity:** Product decision

### Older/cross-module document

`goal-task-vnext.md` describes Task Home approximately as:

```text
Today
Upcoming
All
Completed
Labels

...
Manage repeating tasks as a secondary entry
```

and describes Task Detail primarily from the concrete occurrence perspective.

### Newer focused document / current implementation

`task-vnext-plan-occurrence-workspace.md`, ADR-075 and current Vue implementation align around:

```text
Today
Upcoming
Plans

/tasks/:id = Task Plan Workspace
```

### Current code/tests

Tests explicitly characterize:

```text
Today / Upcoming / Plans
```

as the current surface.

### Assessment

This was a product-source conflict at discovery time. It is now resolved: `Today | Plans` is the Task Home IA; Upcoming is removed in favor of Schedule / Calendar, and occurrence details use compact Dialog/Sheet rather than a new route. The focused Task product documents now carry this target.

---

## T2-13 — Archive leaked into the primary Task lifecycle UX

**Severity:** P2 normal

### Evidence

The domain/repositories support restore behavior for archived/deleted state.

Normal Task client/API/UI does not expose an unarchive action.

Task Plan rows remain visible in the current all-plan list, with Archive simply disabled once `archivedAt` is set.

### Impact

Archive is neither:

- a correct “End” action;
- nor a complete visibility/history workflow.

### Root cause

Archive was historically used as lifecycle termination even after the domain separated those concepts.

### Repair direction

Resolved direction: remove Archive from the normal Task lifecycle UI. `End plan` maps to explicit Abandon. `archivedAt` remains secondary/internal metadata; a future dedicated Archives feature may expose restore semantics, but the vNext primary Task path does not require that feature.

---

## T2-14 — Workspace says “Occurrences” while query is intentionally recent/bounded

**Severity:** P3 polish / semantics

### Evidence

`useTaskPlanWorkspaceQuery` defaults:

```text
recentLimit = 5
```

Task Detail renders those results under a generic:

```text
Occurrences / 发生项
```

heading.

### Impact

The UI can imply complete history while rendering a bounded recent projection.

### Repair direction

Use product language such as:

```text
最近执行
Recent activity
```

and provide an explicit inspect/load-more path if full history becomes useful.

---

## T2-15 — Task → KR recording is fixed-delta/Sum-biased

**Severity:** P1 major

The current Task → Goal model assumes that a Task contribution can be decided completely when the Task Plan is configured:

```text
GoalContributionRule
  value: positive number
  trigger: EachCompletion | PlanCompletion
```

For `EachCompletion`, the Task completion event/outbox copies that fixed value into the Goal settlement event.

Goal then currently accepts source-correlated Task records only for `Sum` KRs.

### Why this is too narrow

KR Measurement V3 already has two different record semantics:

```text
Sum
  GoalRecord.value = delta

Average / Max / Min / Last
  GoalRecord.value = sample
```

A fixed automatic delta is appropriate for some Sum KRs, but not for measurements such as:

- body weight;
- response latency;
- daily score;
- duration;
- temperature;
- average study time;
- best/worst result;
- most recent value.

Those values often become known only when the Task is completed.

### A broader Goal-side drift is exposed

The existing `GoalRecordDialog.vue` is also Sum-biased despite Measurement V3 supporting all methods:

- UI always renders a Plus icon;
- input uses `min=0.1`;
- validation requires `value > 0`;
- quick values are rendered as `+1 / +2 / +5 / +10`;
- the field is named `changeAmount`.

So the Task limitation is not isolated. MemoFlow needs one canonical measurement-aware record composer.

### GoalRecord client projection also drops source semantics

The authoritative server GoalRecord already persists:

```text
sourceType
sourceId
recordedAt
```

but `GoalRecordClientDTOSchema` currently projects only:

```text
id
goalId
keyResultId
value
valueAfter
comment
createdAt
updatedAt
```

Therefore the current client cannot distinguish:

```text
Manual
TaskAutomatic
TaskUserMeasurement
```

or explain which Task produced a record.

At the same time, `UpdateGoalRecordUseCase` rejects **all** records with `sourceType/sourceId` as non-editable system facts. That rule is too coarse once a Task completion can carry a user-authored measurement.

The frontend also contains two separate `GoalRecordCard.vue` implementations; one renders every record with a Plus icon regardless of aggregation method. These should converge behind the same measurement-aware presentation grammar during T2-15 rather than receiving separate fixes.

There is one additional contract drift worth cleaning in the same pass: `useGoalRecords.createGoalRecord()` accepts a `recordedAt` field while `CreateGoalRecordSchema` does not expose it. The implementation plan should either make manual record time an explicit contract or remove the phantom client parameter; do not leave a field that is silently ignored/stripped.

### Proposed interaction

Task → KR binding should support three product modes:

```text
1. 仅关联
   Task completion does not create a GoalRecord.

2. 自动记录固定值
   No dialog on completion.
   Best for simple Sum deltas such as +1 / +5.
   Existing behavior becomes this explicit mode.

3. 完成时记录
   Clicking Complete opens a compact measurement dialog.
   User enters the value known at completion time.
   Works with Sum / Average / Max / Min / Last.
   May carry an optional suggested/default value so common cases are one-click but the value is still editable.
```

The UI should not expose aggregation mechanics as a technical setting. It adapts from the linked KR.

### Method-aware dialog semantics

```text
Sum
  label: 本次变化
  input: signed delta
  preview: current -> current + delta

Average
  label: 本次记录值
  preview: current average -> new average

Max
  label: 本次记录值
  preview: current max -> max(current history, input)

Min
  label: 本次记录值
  preview: current min -> min(current history, input)

Last
  label: 本次记录值
  preview: current -> input
```

For Max/Min, the dialog should explicitly say when the new sample is recorded but does not change the displayed current value.

### Preview surface

The proposed completion dialog should be visually compact:

```text
[Target icon]  更新关键结果
               每周平均专注时长 · Average

本次记录
[ 3.5 ] 小时

        Current      After        Target
           ●──────────● - - - - - ○
          2.8         3.1          4.0

记录后  +7.5%
[仅完成任务]                 [记录并完成]
```

The preview should follow the input live.

Reuse the visual grammar of `GoalKeyResultTrajectoryPlot`, but do **not** reuse that component directly: it edits Initial/Current/Target and has a different semantic contract.

Create a record-specific preview surface instead.

### Ownership boundary

The record composer/preview semantics belong to **Goal**, because Goal owns KR aggregation.

Task owns the completion command and the durable completion fact.

The preferred end-to-end flow is:

```text
Task row Complete
  -> Task reads linked KR record context
  -> measurement-aware dialog (when mode = Prompt)
  -> user enters value
  -> CompleteTaskOccurrence command carries optional Goal record intent
  -> Task completion + durable outbox intent commit together
  -> Goal consumes the outbox
  -> Goal creates the authoritative GoalRecord
  -> Goal recalculates currentValue using its own aggregation method
```

Do not implement this as two unrelated frontend writes:

```text
create GoalRecord
then complete Task
```

because that creates a dual-write failure window.

### Contract direction

The current fixed `GoalContributionRule` should evolve toward a discriminated progress rule, conceptually:

```ts
type TaskGoalProgressRule =
  | {
      mode: 'Fixed';
      trigger: 'EachCompletion' | 'PlanCompletion';
      value: number;
    }
  | {
      mode: 'Prompt';
      trigger: 'EachCompletion';
      suggestedValue?: number;
    };
```

The exact contract name is implementation-plan work.

Important semantics:

- fixed automatic values remain restricted to compatible automatic semantics;
- fixed Sum deltas should be finite/non-zero rather than globally positive, so decreasing Sum KRs can use values such as `-1`;
- prompted user measurements may feed any KR aggregation method;
- prompted values must be finite and may be signed;
- Task completion must remain possible when Goal context is unavailable;
- the dialog therefore needs an escape action such as `仅完成任务`;
- Task → Goal delivery stays durable/idempotent;
- uncomplete must revert the source-correlated GoalRecord;
- re-complete may record a new value after the prior source record is reverted;
- user-entered Task completion records need a correction path that can change the recorded value without forcing the user to falsify the Task completion state.

### Source linkage is not the same as record provenance

The current Goal model treats every source-correlated record as a non-editable system fact:

```text
sourceType = TASK_INSTANCE | TASK_TEMPLATE
sourceId   = occurrence/plan id
```

That rule is correct for automatic fixed contributions, but it becomes too coarse for `Prompt` mode.

A value typed by the user while completing a Task is still correlated to that Task occurrence for idempotency/revert, but the **measurement itself is user-authored**. If the user types `35` instead of `3.5`, they need a correction path without pretending the Task was not completed.

The implementation plan should therefore separate:

```text
source correlation
  = which Task fact this GoalRecord came from

record provenance
  = who/what authored the measurement
```

Conceptually:

```text
Manual
TaskAutomatic
TaskUserMeasurement
```

This does not have to be the final persisted enum name, but the invariant is required.

Recommended behavior:

```text
Manual
  -> editable through normal Goal record editing

TaskAutomatic
  -> source-correlated system fact
  -> not manually editable
  -> changes through Task correction/revert

TaskUserMeasurement
  -> source-correlated for idempotency/revert
  -> value/note correction allowed through a source-aware record correction command
  -> correction does not mutate Task completion state
```

Do not solve measurement typos by forcing:

```text
uncomplete Task
 -> re-complete Task
```

because Task completion and the user-entered measurement are two different facts.

### Authoritative preview

Do not duplicate Average/Max/Min/Last aggregation logic ad hoc in Task UI.

Goal should expose or share a canonical record-preview calculation based on a bounded context such as:

```text
aggregationMethod
recordCount
currentValue
targetValue
unit
progressPercentage
```

The UI may render the preview locally from this canonical Goal-owned calculation.

The final Goal write remains authoritative; the preview is explicitly a preview because concurrent Goal records can change the final result.

### Repair direction

Treat this as a cross-module Goal + Task vertical slice, not a Task form tweak.

It should supersede the narrower T2-06 repair rather than adding a second competing contribution system.

---

# 7. Good current behavior that should not be “fixed”

## 7.1 Task Plan route should remain

Do not remove `/tasks/:id` merely because Goal is reducing nested pages.

Task Plan is its own owner workspace.

## 7.2 Occurrence correction is explicit

Current canonical Task occurrence row already permits explicit correction rather than auto-Missed inference.

Protect this.

## 7.3 Full create dialog can remain a compound workspace

Task Plan configuration genuinely has:

- schedule;
- recurrence;
- Goal/KR contribution;
- reminders;
- checklist.

It does not need to be compressed into the same small surface as Quick Task.

The correct solution is a separate fast-capture path, if Q1 confirms it.

## 7.4 Task toolbar responsiveness is a useful reference

`TaskPageToolbar` already uses container-query-driven tiers and responsive primary action behavior.

This is useful input for future shared collection-toolbar grammar.

## 7.5 Task Workspace bounded recent context is correct

ADR-075's bounded `recentOccurrences` plus aggregate summary is a good pattern.

Do not replace it with full occurrence history simply because detail pages often do so.

---

# 8. Root-cause grouping

## RC-TASK-1 — Domain cutover exceeded UI cutover

Includes:

- T2-03;
- T2-04;
- T2-05;
- T2-13.

Invariant to restore:

```text
lifecycle
outcome
completion policy
archive
delete
```

must each have one product meaning.

## RC-TASK-2 — Surface-specific state was generalized too far

Includes:

- T2-02;
- part of T2-12.

Invariant:

```text
Occurrence filters operate on occurrence facts.
Plan filters operate on plan lifecycle/outcome/visibility.
```

## RC-TASK-3 — Cross-owner projection is too thin

Includes:

- T2-06;
- T2-09;
- T2-15.

Invariant:

Task may read enough Goal/KR presentation metadata to render and validate the interaction, without owning Goal state.

## RC-TASK-4 — Legacy query/UI paths survived newer bounded primitives

Includes:

- T2-07;
- T2-08;
- T2-10.

Invariant:

High-frequency surfaces should query only the data necessary for their bounded context.

## RC-TASK-5 — Direct-manipulation grammar is not yet institutionalized

Includes:

- T2-11;
- T2-14.

Repair only after Goal reference interaction is stable.

---

# 9. Resolved product decisions

## Q1 — Quick Task

**Decision: A — keep a true Quick Task path.**

```text
title
 -> today/all-day default
 -> create
 -> configure the Plan later only when needed
```

Used by:

- AI welcome/shortcut;
- Today Overview;
- Task Capsule;
- optional global command.

Full “New Task” continues to open `TaskPlanDialog`.

The broken `/tasks?dialog=quick-task` contract must therefore be repaired rather than retired.

---

## Q2 — Plans remains first-class

**Decision: A — keep Plans as a primary Task surface.**

After Q5, the intended top-level Task IA becomes:

```text
Today | Plans
```

Task Plan is now a real user-facing owner, not an internal template implementation detail.

---

## Q3 — Do not expose completion-policy configuration

**Decision: no user-facing completion-rule setting.**

Users should not have to understand:

```text
AllowCorrection
StrictNoBackfill
```

The product model is simpler:

```text
Overdue
  = still unresolved

User explicitly chooses:
  Completed  已完成 / 补完成
  Missed     未完成
  Skipped    跳过 / 豁免
```

A missed/skipped occurrence may still later be corrected to Completed; the current occurrence aggregate already supports completion from Missed/Skipped.

### Important domain consequence

The current default `AllowCorrection` evaluator does **not** fully match this product model: for a finite plan with a remaining Missed occurrence, it can keep the Plan outcome `Open` indefinitely.

The convergence pass should therefore remove completion policy from user configuration and move toward one canonical derived rule:

```text
infinite recurring plan
  -> Open until explicitly Abandoned

finite plan
  -> any unresolved Pending/InProgress => Open
  -> all required occurrences Completed/Skipped => Succeeded
  -> scope finished and any explicit Missed remains => Failed
```

Because Missed can later be corrected to Completed, a derived Failed plan can be re-evaluated to Succeeded.

The critical invariant remains:

> overdue alone never implies Missed or Failed.

---

## Q4 — Archive should not be a normal Task action

**Decision from reference review: keep Archive out of the primary Task UX.**

External reference pattern:

- Asana explicitly distinguishes project completion from archive and recommends completing before archiving: <https://help.asana.com/s/article/understanding-projects>;
- Linear uses Completed/Canceled as lifecycle states and auto-archives only closed/inactive work later: <https://linear.app/docs/configuring-workflows> and <https://linear.app/docs/delete-archive-issues>;
- Todoist uses Archive as “shelve/remove from active list and restore later,” while recurring Tasks use a separate `Complete forever` action to end recurrence: <https://www.todoist.com/help/todoist/features/introduction-to-projects-TLTjNftLM> and <https://www.todoist.com/help/articles/complete-a-task-with-a-recurring-date-dmI6SVqdP>.

MemoFlow should follow the same low-cognitive-load split:

```text
Open Plan
  Pause
  End plan
  Delete mistaken creation

End plan
  -> Abandon
  -> status = Closed
  -> outcome = Abandoned
  -> future materialization stops
  -> future reminders stop

Succeeded / Failed / Abandoned Plans
  -> remain available in Plan history/filtering
```

Do not show Archive beside normal Plan lifecycle actions.

`archivedAt` may remain as internal/legacy/automatic retention metadata. If MemoFlow later introduces an Archives view, Archive can become a secondary closed-history storage action with Restore, but that is not required for the vNext primary path.

This directly fixes the current dangerous “End plan = Archive” mismatch.

---

## Q5 — Remove Upcoming from Task Home

**Decision: remove the Upcoming Task surface.**

Future scheduled work already has a better owner:

```text
Schedule / Calendar
```

Task Home should answer:

```text
Today:
  what should I act on now?
  what is overdue and still unresolved?

Plans:
  how are my action plans configured and progressing?
```

Future calendar browsing belongs to Schedule rather than duplicating a second partial calendar inside Task.

Target Task Home:

```text
Today | Plans
```

Today may internally group:

```text
Overdue
Today
```

but should not materialize or query an unbounded future list.

---

## Q6 — Occurrence inspect uses Dialog/Sheet, not another route

**Decision: use the recommended compact inspect interaction.**

```text
Today row
 -> direct Complete / checklist / basic actions
 -> click row
 -> Occurrence Inspect Dialog / Sheet
 -> explicit “View plan”
 -> /tasks/:planId
```

No `TaskOccurrenceDetailView` route should be added by default.

This preserves Task Plan as an owner workspace while avoiding another deep navigation layer for individual execution facts.

---

## Q7 — Completion-time KR recording

**Direction accepted for design:** add an optional completion-time record mode so Task completion can capture a real KR measurement instead of only replaying a fixed Sum delta.

The detailed architecture is recorded in T2-15.

Product-level binding choices should converge toward:

```text
仅关联
自动记录固定值
完成时记录
```

with the last mode adapting automatically to the KR measurement method and showing a live before/after/target preview.

---

# 10. Proposed repair order after decisions

Do not begin with visual extraction.

## Pass A — Lifecycle correctness

Fix:

- T2-03;
- T2-04;
- T2-05;
- T2-13.

This is the correctness foundation.

## Pass B — Goal/KR binding correctness

Fix:

- T2-06;
- T2-09;
- T2-15.

Goal measurement semantics must be represented correctly before AI/Task drafts converge.

## Pass C — Task Home query/state model

Fix:

- T2-01 after Q1;
- T2-02;
- T2-07;
- T2-08;
- Task Home IA after Q2/Q5/Q6.

## Pass D — Secondary surfaces

Fix:

- T2-10;
- T2-14.

## Pass E — Product grammar convergence

Fix:

- T2-11;
- shared toolbar/metadata/overlay work only after Goal reference primitives are frozen.

---

# 11. Verification required by the future implementation plan

## Lifecycle

Must prove:

1. “End/Abandon” makes Plan Closed + Abandoned;
2. no future recurring materialization;
3. reminders for closed plan do not fire;
4. Delete remains mistaken creation;
5. Archive does not mutate lifecycle/outcome;
6. UI renders Succeeded / Failed / Abandoned distinctly;
7. optimistic cache never invents a server-invalid lifecycle state.

## Completion policy

Fixtures:

- finite one-time;
- finite recurring Count;
- finite recurring Until;
- AllowCorrection + Missed;
- StrictNoBackfill + Missed;
- later correction where policy permits;
- never-ending recurrence where final outcome remains Open.

## Goal contribution

Fixtures for:

- Sum + link only;
- Sum + EachCompletion;
- Sum + PlanCompletion;
- Average/Max/Min/Last + link only;
- non-Sum contribution attempt blocked before persistence;
- stale Goal/KR unavailable context.

## Task Home

Fixtures:

- Today;
- overdue;
- Upcoming bounded range;
- occurrence filter switching to Plans;
- Plan lifecycle/outcome filters;
- Goal filter;
- Goal + KR filter;
- empty/loading/error;
- large history not loaded into Today;
- Quick Task deep-link if retained.

## Secondary surfaces

- Task Capsule;
- Today Overview;
- AI quick task;
- zh-CN/en-US;
- narrow panel;
- keyboard/focus;
- dark/light.

---

# 12. Audit conclusion

Task's vNext **domain design is ahead of its UI**.

The correct next move is not to visually imitate Goal immediately.

The order should be:

```text
repair lifecycle/outcome truth
 -> repair Goal/KR contribution truth
 -> bound Task Home query/state
 -> resolve Task Home/Quick Task interaction decisions
 -> converge secondary surfaces
 -> finally extract shared Goal/Task visual grammar
```

Once these decisions are confirmed, this audit can be converted into a bounded execution plan under the parent Product vNext convergence plan.
