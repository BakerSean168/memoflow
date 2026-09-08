---
tags:
  - plan
  - active
  - goal
  - product
  - domain
  - migration
description: Restore Goal target-date semantics and remove due-date terminology from the Goal domain only
created: 2026-09-08T22:00:00+09:00
updated: 2026-09-08T22:00:00+09:00
status: active
---

# Goal Target Date Semantics — Active Plan

## 1. Decision

Goal canonical time-window semantics must be:

```text
startDate?  = planned start of pursuing the goal
targetDate? = expected / intended achievement date
```

`targetDate` is **not a hard deadline** and must not imply automatic failure, abandonment, or completion when the date passes.

Task / Task occurrence deadline semantics remain separate and may continue to use `dueDate` / overdue where appropriate.

This plan corrects Goal domain language that was previously migrated from `targetDate` to `dueDate`.

## 2. Current-system evidence

Current `main` uses Goal `dueDate` end to end:

- domain aggregate: `GoalState.dueDate`, `Goal.dueDate`, `extendDueDate`, `shortenDueDate`, `isOverdue`;
- value object: `GoalTimeRange.dueDate`, `setDueDate`, `getDaysToDueDate`;
- public contracts: create/update/read DTOs expose `dueDate`; list sorting includes `dueDate`;
- persistence: Prisma `Goal.dueDate @map("due_date")` and due-date indexes;
- PowerSync / repository mappers persist the same concept;
- AI Goal draft contract emits `dueDate`;
- React/Vue surfaces display `Due date` / `截止日期` and Goal `Overdue`;
- product docs explicitly state `targetDate` was renamed to `dueDate`.

The current model therefore encodes deadline semantics deeper than UI copy.

## 3. Target outcome

A Goal created, edited, read, sorted, exported, synchronized, scheduled for reminders, and drafted by AI uses one canonical `targetDate` field across all product/domain contracts.

Passing the target date is a planning/review signal only. The Goal remains `Active` until explicit domain actions make it `Completed` or `Abandoned`.

Recommended derived presentation language:

```text
Past target / 已过目标日期
Days to target / 距目标日期
```

Do not use `Overdue / 逾期` for Goal.

## 4. Protected contracts

The implementation must preserve:

- Goal status model: `Active | Completed | Abandoned`;
- `archivedAt` as independent display/history state;
- Key Result Measurement V2 and its `targetValue` semantics;
- Goal Record and Goal Review behavior;
- Shared Label ownership and `labelIds` transport;
- Task -> Goal/KR link and contribution settlement;
- optimistic concurrency through `expectedVersion`;
- Goal reminder behavior and scheduling ownership boundary;
- Product Time `Instant` semantics;
- Web/Desktop/React public transport parity;
- data portability and PowerSync round-trip integrity.

## 5. Explicit non-goals

This plan does **not**:

- rename Task `dueDate` semantics;
- change Task occurrence overdue behavior;
- add Linear-style quarter/month/year target timeframes;
- change Goal status transitions or completion rules;
- change KR measurement or weighting;
- redesign Goal UI beyond terminology and required field wiring;
- introduce a permanent `targetDate + dueDate` dual contract.

## 6. Migration rule

Final canonical truth must contain only Goal `targetDate`.

A migration may temporarily read the old database column/value during upgrade, but no long-lived public DTO/domain dual field is allowed.

Preferred persistence convergence:

```text
goals.due_date -> goals.target_date
```

Existing date values must be preserved exactly.

## 7. Ticket plan

### GOAL-7201 — Characterize current Goal date behavior

**Goal:** Lock the existing behavior that must survive the rename while identifying deadline-specific semantics to retire.

**Implementation:**
1. inventory Goal `dueDate` references in domain, contracts, persistence, AI, UI, docs, tests;
2. add/adjust focused characterization tests for create/update/read/sort/reminder projection/export/import;
3. record current `isOverdue` behavior separately because its terminology is intentionally changing.

**Acceptance:** Complete inventory with no unidentified production Goal `dueDate` path.

### GOAL-7202 — Restore canonical domain and contract `targetDate`

**Goal:** Make `targetDate` the sole Goal time-end concept in domain and public contracts.

**Implementation:**
1. rename `GoalState.dueDate` -> `targetDate` and aggregate getter/mutations;
2. rename `GoalTimeRange` APIs and errors;
3. replace `GoalDueDateNotSetError` with target-date terminology;
4. change create/update/read/list/sort contracts to `targetDate`;
5. update Goal domain events and cross-module read models;
6. update AI Goal draft schema and adapters;
7. remove assertions that prohibit `targetDate` and replace them with anti-`dueDate` Goal locks.

**Acceptance:** Goal domain/contracts expose no canonical `dueDate` field.

### GOAL-7203 — Migrate persistence and synchronization

**Goal:** Preserve existing Goal dates while converging storage on `target_date`.

**Implementation:**
1. add Prisma migration renaming `goals.due_date` to `target_date`;
2. update indexes without data loss;
3. update Prisma mappers/repositories;
4. update PowerSync schema/mappers/repositories;
5. update data portability import/export;
6. regenerate Prisma artifacts through repository-supported generation commands.

**Acceptance:** Existing values round-trip unchanged; fresh schema and upgraded schema both pass Goal persistence tests.

### GOAL-7204 — Correct Goal product language and derived presentation

**Goal:** Remove deadline language from Goal while preserving planning signals.

**Implementation:**
1. replace Goal UI `Due date / 截止日期` with `Target date / 目标日期`;
2. rename Goal-specific `isOverdue` presentation to `isPastTargetDate` or equivalent derived predicate;
3. replace Goal `Overdue / 逾期` presentation with `Past target / 已过目标日期`;
4. rename `extendDueDate` / `shortenDueDate` / `getDaysToDueDate` APIs to target-date equivalents;
5. keep Task overdue language unchanged;
6. update Goal product docs, module docs, ADR references, and examples.

**Acceptance:** No user-visible Goal deadline/overdue wording remains; Task deadline wording is unaffected.

### GOAL-7205 — Full vertical verification and anti-regression locks

**Goal:** Prove the rename is complete across every host and prevent Goal `dueDate` resurrection.

**Verification:**
1. focused Goal domain/contract tests;
2. Prisma + PowerSync integration/round-trip tests;
3. AI Goal draft tests;
4. API/Desktop composition tests;
5. React/Vue Goal create/edit/list/detail tests;
6. data portability tests;
7. Goal reminder projection tests;
8. affected typecheck/lint/build;
9. governance architecture lock scanning production Goal surfaces for forbidden canonical `dueDate`;
10. repository CI and independent review.

**Acceptance:**
- no production Goal contract/domain/persistence/UI path exposes canonical `dueDate`;
- existing Goal date data is preserved;
- Goal passing target date does not change business status;
- Task `dueDate` and Task overdue tests remain green;
- no unresolved P0/P1 review finding;
- required CI is green before merge.

## 8. Review checklist

Review must explicitly verify:

1. **Contract correctness** — no Goal dual `dueDate/targetDate` public truth;
2. **Vertical completeness** — UI -> API/IPC -> application -> aggregate -> persistence -> readback all use `targetDate`;
3. **Behavioral correctness** — passing target date is derived presentation only, not a Goal state transition;
4. **Boundary correctness** — Task due/overdue semantics are not accidentally renamed;
5. **Migration safety** — stored dates survive upgrade and sync/export/import;
6. **Plan integrity** — docs and architecture locks match final code.

## 9. Completion condition

Archive this plan only after implementation, focused regression, independent code review, required CI, and merged delivery evidence are all complete.
