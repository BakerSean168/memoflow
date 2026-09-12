---
tags:
  - plan
  - active
  - goal
  - product
  - domain
  - ui
  - ai
  - relation
  - migration
description: Goal vNext 产品模型、KR Measurement V3、Task/Knowledge Context、AI Plan 与 Linear-style UI 的一次性收敛实施计划
created: 2026-09-08T17:55:00+08:00
updated: 2026-09-12T12:13:00+08:00
status: active
---

# Goal vNext Model Convergence — Active Plan

> **System-wide execution-order notice (2026-09-09):** 本文继续作为模块内部 ticket/验收细节真值；跨模块执行顺序、共享 schema 单写者与 destructive cutover gate 由 [`2026-09-09-system-wide-vnext-model-convergence-implementation.md`](./2026-09-09-system-wide-vnext-model-convergence-implementation.md) 统一协调。
>
> **ADR-111 zero-legacy-data override:** 本文中所有仅用于保存当前旧数据/旧备份/旧客户端的 migration、backfill、compatibility reader/adapter、dual-read/write、redirect window、before/after old-data parity 要求均已被 ADR-111 supersede。领域目标与行为验收继续有效；实施时直接切 current consumers、删除旧 surface、reset/reseed persistence。

## ADR-111 execution rewrite

The target Goal/KR model is unchanged, but legacy-data preservation work is deleted from scope:

- `GOAL-7202`: replace lifecycle/text fields directly; do not copy old description/motivation/feasibility rows into Knowledge;
- `GOAL-7203`: replace `dueDate` with Goal Target semantics for new state; no old dueDate backfill;
- `GOAL-7204`: install KR V3 directly; no V2 percentage/current-value preservation fixture;
- `GOAL-7210`: delete old schema/contracts/adapters immediately after current consumers compile on the canonical model;
- Section 18 data-migration containment is superseded; rollback is source rollback + DB reset/reseed.

Any deeper “migration preserves old values/content” wording below is historical planning rationale, not executable acceptance criteria.

## 1. Executive decision

原 `Goal Target Date Semantics` 小计划扩展为一次完整但边界明确的 **Goal vNext Model Convergence**。

原因：在真正开始 `dueDate -> targetDate` 代码迁移前，产品讨论已经同时确定了一组彼此耦合的领域决策。如果分五六次独立迁移，会反复修改 Goal/KR contract、DB、PowerSync、AI draft 与 UI。

本计划一次冻结并实施：

```text
Goal core
  name + summary
  Planned / InProgress / Completed / Abandoned
  startDate + Target Timeframe

Key Result Measurement V3
  initial / current / target
  hidden tracking base
  optional KR target timeframe

Goal Context
  Task goal-level / KR-level links
  Goal <-> Knowledge Note relations
  GoalWorkspaceReadModel

AI
  GoalPlanDraft V2
  Goal + KR + Task + Knowledge preview/apply

UI
  Linear-inspired property chips
  KR milestone-like compact rows
  Goal Workspace detail
```

该计划不是重新打开 Core vNext 全局重构；仅收敛 Goal 及其明确跨模块接口。

## 2. Authoritative design package

本计划必须按以下文档实施，不从聊天记录猜测：

1. [ADR-067 — Goal Product Model / Lifecycle / Target Timeframe](../../architecture/adr/ADR-067-goal-vnext-product-model-and-lifecycle.md)
2. [ADR-068 — KR Measurement V3](../../architecture/adr/ADR-068-key-result-measurement-v3.md)
3. [ADR-069 — Goal Workspace / Cross-module Context](../../architecture/adr/ADR-069-goal-workspace-cross-module-context.md)
4. [ADR-070 — AI GoalPlanDraft V2](../../architecture/adr/ADR-070-ai-goal-plan-orchestration.md)
5. [Goal vNext Workspace & Create UI](../../product/goal-vnext-workspace-and-create-ui.md)
6. [Current System Map](../../analysis/2026-09-08-goal-vnext-current-system-map.md)
7. [Linear Reference Study](../../analysis/2026-09-08-goal-vnext-linear-reference-study.md)
8. [ADR-090 — Stable KnowledgeDocument Identity](../../architecture/adr/ADR-090-stable-knowledge-document-identity.md) — Goal/Knowledge durable relation 的外部硬依赖
9. [Knowledge Repository vNext](../../product/knowledge-repository-vnext.md) — Knowledge owner/read-model 边界

旧 ADR-052 至 ADR-056 仍保留历史决策；被新 ADR 修订的部分以 ADR-067 至 ADR-070 为目标真值。实施完成前，当前代码事实仍以 current-system map 与实际源码/测试为准。

## 3. Current-system baseline

已核实当前生产代码：

### Goal

```text
UI: name / description / startDate / dueDate / labels / KRs
Domain/DTO residual: description / motivation / feasibilityAnalysis
Status: Active / Completed / Abandoned
Time end: dueDate
```

### KR

```text
startingValue
currentValue
targetValue
progressBaselineValue
aggregationMethod
unit
weight
```

当前 progress calculator 已是单一算术 authority，但用户字段语义仍需要从 V2 收敛到 `initial/current/target`。

### Task link

```text
TaskGoalLink
- goalId required
- keyResultId required
- contribution optional
```

Task query 已可按 `goalId` 过滤。

### Relation

通用 Relation 已支持 `note/goal/task/...` 与 forward/reverse lookup，但当前 ownership 暂驻 Goal package；Prisma 有实现，PowerSync 没有完整 parity。

### AI

ADR-052 durable Mastra workflow/HITL 架构可复用；GoalPlanDraft schema 仍有旧产品字段，需要升级。

## 4. Target model

### 4.1 Goal Aggregate

```text
Goal
│
├── id / identityId
├── name
├── summary?
│
├── status
│   ├── Planned
│   ├── InProgress
│   ├── Completed
│   └── Abandoned
│
├── startDate?: Ymd
├── target?: GoalTimeframe
│   ├── day
│   ├── month
│   ├── quarter
│   ├── half-year
│   └── year
│
├── keyResults[]
├── reminderConfig?
├── reviews[]
│
└── system
    ├── completedAt?
    ├── archivedAt?
    ├── sortOrder
    ├── version
    ├── createdAt
    ├── updatedAt
    └── deletedAt?
```

### 4.2 Key Result

```text
KeyResult
├── title
├── description?
├── initialValue
├── currentValue
├── targetValue
├── unit?
├── aggregationMethod
├── weight
├── target?: GoalTimeframe
├── trackingBaseValue   // internal only
└── sortOrder
```

### 4.3 External Context

```text
TaskGoalLink
├── goalId
├── keyResultId?
└── contribution?

Goal --related--> Knowledge Note

Shared Labels
```

### 4.4 Goal Workspace

```text
GoalWorkspaceReadModel
= Goal authoritative read model
+ Task context summary/preview
+ Knowledge context summary/preview
+ Recent Goal Records
+ Recent Reviews
```

## 5. Product invariants

以下是 protected contracts，不得为了方便突破：

1. `Goal = Direction + Measurement` 的 aggregate ownership 不变；
2. Task 仍拥有 Task/Plan/Occurrence 与 TaskGoalLink；
3. Knowledge Note 仍由 Repository/Knowledge owner 管理；
4. Shared Label 仍是独立 owner；
5. Goal 不保存 `taskIds[]` / `noteIds[]`；
6. AI 只经 owner application ports 写入；
7. Task `dueDate / isOverdue` 不被 Goal Target 重命名波及；
8. Goal target passage 不自动改 status；
9. Goal overall progress 不自动完成 Goal；
10. `archivedAt` 与 business status 分离；
11. Goal Record source correlation / Task contribution idempotency 保持；
12. Scheduler 继续是单一 temporal execution authority；
13. HTTP/IPC 与 Prisma/PowerSync 必须保持 parity；
14. 不保留长期 old/new dual public contract。
15. Goal/Task durable Knowledge relation 只允许指向 stable `KnowledgeDocumentId`；禁止把 path-derived `KnowledgeNoteProjection.id` 固化进 Relation。

## 6. Explicit non-goals

本计划不做：

- Goal Folder / hierarchy 恢复；
- Goal Priority、Focus、Comparison 恢复；
- Task DAG / Critical Path 恢复；
- Linear Lead/Members/Teams/Dependencies 复制；
- Task 多 Goal many-to-many；
- 自动根据日期/KR/Task 推断 Goal status；
- GoalStatus.Draft / GoalStatus.Backlog；
- AI 专用 Goal/Task/Note 数据模型；
- 把 Goal Detail 变成第二个 Task execution workspace；
- unrelated Routine/Reminder/Scheduler redesign。

## 7. Dependency graph

```text
GOAL-7201 Design freeze/current map
       │
       ├──────────────┬─────────────────┐
       ▼              ▼                 ▼
GOAL-7202        GOAL-7203          GOAL-7204
Core identity    Target/time        KR Measurement V3
+lifecycle       semantics          + KR target
       │              │                 │
       └───────┬──────┴────────┬────────┘
               ▼               ▼
          GOAL-7205       GOAL-7206
          Task links      Relation/Knowledge
               │               │
               └───────┬───────┘
                       ▼
                  GOAL-7207
                  Goal Workspace
                       │
                 ┌─────┴─────┐
                 ▼           ▼
            GOAL-7208   GOAL-7209
            AI Plan V2   UI convergence
                 └─────┬─────┘
                       ▼
                  GOAL-7210
                  Migration cleanup
                       │
                       ▼
                  GOAL-7211
                  Review/CI/archive
```

## 8. Phase 0 — Decision freeze and evidence

### GOAL-7201 — Freeze Goal vNext design package

**Status:** DONE for planning branch; implementation has not started.

**Goal:** Convert the agreed product/domain discussion into repository-authoritative design documents before changing contracts or schema.

**Why now:** The original target-date-only plan became too narrow; code changes before model freeze would create repeated migrations.

**Scope:**

- current-system inventory;
- Linear reference/adopt-adapt-reject study;
- Goal model/lifecycle/timeframe ADR;
- KR Measurement V3 ADR;
- Goal Workspace/Task/Knowledge ADR;
- AI GoalPlanDraft V2 ADR;
- UI North Star;
- umbrella active plan.

**Out of scope:** production code changes.

**Acceptance:**

- design docs exist and cross-link;
- current vs target state clearly labeled;
- old ADRs are forward-referenced rather than silently rewritten;
- active plan is the single current Goal implementation plan.

## 9. Phase 1 — Goal core contract and planning semantics

### GOAL-7202 — Converge Goal identity and lifecycle

**Status:** DONE on `chatgpt/goal-7202-lifecycle`; integration evidence below.

**Goal:** Goal public/domain model becomes `name + summary` with `Planned/InProgress/Completed/Abandoned`.

**Why now:** All later UI/AI/read models depend on stable Goal identity and status.

**Scope:**

- Goal domain aggregate/value objects;
- public Goal create/update/read contracts;
- explicit lifecycle command/use-case seams;
- HTTP/IPC/client parity;
- Prisma/PowerSync model mappings;
- Data Portability export/import;
- App-Vue Goal surfaces and Calendar projection;
- deletion of retired automatic status-rule surfaces.

**Protected contracts:** version/optimistic concurrency、Completed `completedAt` behavior、archive independence、Task contribution path.

**Implementation:**

1. Goal root identity is exactly `name + summary`; `summary` is nullable/optional and bounded to 500 characters. Root `description/motivation/feasibilityAnalysis` are removed from contracts, domain, Prisma, PowerSync, portability and UI. Key Result `description` is intentionally untouched.
2. Goal status is exactly `Planned | InProgress | Completed | Abandoned`; new Goals default to `Planned`. There is no `Active` alias or compatibility enum.
3. ADR-067 transitions are explicit: `Planned -> InProgress|Abandoned`; `InProgress -> Planned|Completed|Abandoned`; `Completed -> InProgress`; `Abandoned -> Planned|InProgress`. Entering Completed sets `completedAt`; reopening Completed clears it. `Planned -> Completed` fails closed.
4. Status mutations are exposed only through version-checked `plan/activate/complete/abandon` business actions. `POST /:id/plan` and `goal:plan` IPC complete the previously missing InProgress -> Planned seam. The unused generic `BatchUpdateGoalStatus` contract was deleted so callers cannot bypass the aggregate transition matrix.
5. Idempotent `plan/activate/abandon` calls remain true no-ops but still honor expected-version and archive/deleted guards. Completion retains its protected durable completion-receipt behavior. Archive remains orthogonal to business status.
6. Retired automatic Goal status rules (`StatusRule`, built-in auto-status rules and `useAutoStatusRules`) were removed. Reminder/Schedule runtime eligibility is `InProgress` only; time/KR/progress/reminder/task side effects never infer a Goal status transition. Calendar date editing stays available for unarchived `Planned` and `InProgress` Goals without mutating lifecycle.
7. ADR-111 zero-legacy-data policy is applied as a direct source/schema cutover: no backfill, no dual DTO and no migration preserving unused historical Goal text. Rollback is source rollback plus DB reset/reseed.
8. The existing AI GoalPlanDraft V1 still owns a `description` field until GOAL-7210; its apply adapter now explicitly projects `draft.goal.description -> CreateGoalReq.summary` and cannot write any retired Goal root fields.

**Acceptance evidence:** Goal full suite 83 files / 457 tests PASS; transport parity 21/21 includes HTTP `/plan` and IPC `goal:plan`; Contracts full suite 81 / 540 PASS with a new strict four-state/retired-field anti-resurrection lock; Data Portability full suite 36 / 148 PASS including PowerSync round trip; PowerSync schema 1 / 6 PASS + typecheck; App-Vue Goal + Calendar focused suite 15 / 44 PASS, App-Vue typecheck PASS and production build PASS; AI Goal apply workflow 2 / 12 PASS and AI build PASS; Goal build PASS. React Native `app-react:typecheck` PASS; Dashboard 5 files / 24 tests + typecheck/build PASS; Web Goal MSW 3/3 + Web typecheck PASS; Desktop Dashboard 2/2 + Desktop typecheck PASS; Schedule Goal handler 3/3 PASS; Notification integration 3 files / 35 tests PASS; Task Goal binding/settlement 2 files / 5 tests plus transaction runner 5/5 PASS against the real PostgreSQL test database; API Label -> Goal integration 1/1 PASS. Prisma generate + validate PASS and generated/schema scans contain zero retired Goal root persistence fields. Full-repository scans contain zero `GoalStatus.Active`, direct Prisma Goal `Active` rows, generic status-write contracts, automatic Goal status-rule surfaces, or retired Goal root identity access; the one explicit AI Draft V1 `description -> summary` adapter is owned by GOAL-7210. Authored production ESLint PASS with 0 warnings/errors; the broader changed-file lint has 0 errors and only pre-existing test-fixture warnings. Test inventory regenerated/current at 1245 files; docs-check PASS; full governance-check PASS; local-Docker Goal browser suite 6/6 PASS (create/edit/lifecycle/delete/detail/system-view+Label filter); `git diff --check` PASS.

**Dependencies:** GOAL-7201.

**Risks:** zero-data direct cutover intentionally does not preserve legacy Goal long-text rows. If useful data exists before deployment, stop and reassess ADR-111 rather than adding a compatibility path silently.

### GOAL-7203 — Replace Goal dueDate with Target Timeframe

**Status:** DONE on `chatgpt/goal-7203-target-timeframe`; integration evidence below.

**Goal:** Goal uses `startDate?: Ymd` and `target?: GoalTimeframe`; Task due semantics stay untouched.

**Why now:** Core planning semantics must stabilize before UI/AI contracts.

**Scope:**

- GoalTimeframe contract/value object/helper;
- Day/Month/Quarter/Half-year/Year validation;
- startDate Product Time migration;
- `dueDate` removal;
- target sort/filter/derived `isPastTarget`;
- reminder projection boundary;
- persistence/PowerSync/portability.

**Implementation:**

1. `GoalTimeframe` is the sole Goal target contract with exact `day | month | quarter | halfYear | year` variants, deterministic start/end boundaries, locale-aware precision-preserving labels, target-end comparison and `isPastGoalTarget`. Calendar math is Ymd-based and never guesses from the host JS timezone.
2. Goal root planning time is `startDate: Ymd | null` plus `target: GoalTimeframe | null`. Prisma/PowerSync normalize target storage to the reversible pair `target_kind + target_end_date`; partial pairs and non-canonical end dates fail closed. ADR-111 applies a direct schema/source cutover, so there is no legacy Goal `due_date` backfill or dual-read path.
3. Reminder and Schedule use `goalTimeframeEndBoundary(target)` only as a derived execution boundary. Day targets keep exact-date wording; Month/Quarter/Half-year/Year targets use period-end wording. Passing the target boundary never mutates Goal lifecycle.
4. Vue/Web/Desktop and React/Mobile consume the same target contract. The current simple edit surface may replace a target with an exact day; when an existing Month/Quarter/Half-year/Year target is not touched it preserves and displays the original precision. The full precision picker/property-chip UI remains GOAL-7209 rather than being pulled into this contract ticket.
5. AI GoalPlanDraft V1 still owns epoch `startDate/dueDate` until its GOAL-7210 retirement. Its apply adapter now requires an explicit user timezone and projects those legacy instants to Goal Ymd plus a day `GoalTimeframe`, so no ambient timezone conversion leaks into the new Goal model.
6. Data Portability exports/imports `startDate + target`; Dashboard/Calendar projections use target semantics; Goal `overdue/due` presentation is replaced by `past target/target` while Task due/overdue vocabulary remains owned by Task.
7. `core-vnext-architecture-lock` now has an owner-scoped `goal-legacy-due-time` rule that rejects `dueDate`, `isOverdue`, `GoalDueDateNotSetError` and `due_date` only on canonical Goal surfaces. The lock explicitly permits Task due semantics and the temporary AI Draft V1 compatibility contract.

**Acceptance evidence:** Contracts full suite 82 files / 565 tests PASS, including 25 GoalTimeframe tests; Goal full suite 84 / 465 PASS; Data Portability 36 / 148 PASS; PowerSync schema 6/6 PASS; Goal planning/reminder/schedule focused 3 files / 27 tests PASS; App-Vue Goal/Schedule focused suite PASS and GoalDialog precision-preservation/replacement behavior 4/4 PASS; AI Goal apply 10/10 PASS; Dashboard 5 / 24 PASS; Task due/overdue focused suite 3 files / 119 tests PASS. Contracts/Goal/Data Portability/PowerSync/AI/Dashboard/React/App-Vue/Web typechecks PASS; App-Vue production build PASS. Prisma generate + validate PASS and generated/schema scan contains no Goal due field. Governance tools 19 files / 137 tests PASS with the owner-scoped anti-resurrection lock. Authored production ESLint PASS on 54 changed production files with 0 warnings/errors; test inventory regenerated/current at 1247 files; `docs:check` PASS; full `governance:check` PASS; `git diff --check` PASS at closure.

**Acceptance:** Goal exposes one target concept; Q4/Month/Year preserve displayed precision; passing target never mutates status; Task due tests remain green.

**Dependencies:** GOAL-7201, GOAL-7202.

**Risks:** ADR-111 intentionally discards legacy Goal due rows during environment cutover. AI Draft V1 still needs explicit timezone projection until GOAL-7210; do not add an ambient-Date compatibility path.

## 10. Phase 2 — KR Measurement V3

### GOAL-7204 — Replace KR baseline semantics with Initial/Current/Target

**Status:** DONE — direct canonical cutover completed 2026-09-12 under ADR-111.

**Goal:** User-facing KR model becomes `initial/current/target`; records use hidden tracking base.

**Why now:** AI/UI/task context all depend on stable KR semantics.

**Scope:**

- KeyResultInput / progress DTO;
- progress calculator;
- Goal aggregate KR methods;
- GoalRecord aggregation;
- Review snapshots;
- Prisma/PowerSync mapping;
- current Vue/React KR editor;
- optional KR Target Timeframe.

**Implementation:**

1. lock V2 progress fixtures for increasing/decreasing/Sum/Average/Max/Min/Last;
2. introduce `initialValue` and `trackingBaseValue`;
3. implement one formula `(current-initial)/(target-initial)`;
4. map V2 `progressBaselineValue -> initialValue` or `0`; map `startingValue -> trackingBaseValue`;
5. update Sum/sample aggregation to use trackingBase only;
6. add KR target using ADR-067 GoalTimeframe;
7. update Task contribution tests;
8. remove V2 public fields and add architecture lock.

**Acceptance:** V2 migration preserves percentage/current; Initial defaults 0 and is editable; decreasing targets work; tracking base never leaks into normal UI.

**Dependencies:** GOAL-7201, GOAL-7203 GoalTimeframe contract.

**Risks:** mixing progress baseline and aggregation seed is a data-corruption risk; migration fixtures must prove both independently.

**Closure evidence:** canonical contracts/domain/persistence/UI use `initial/current/target + hidden trackingBaseValue`; Goal 84 files / 469 tests, Contracts 82/565, Data Portability 36/148, AI 79/427, PowerSync 1/6, Task V3 integration 3 files / 10 tests, Vue Goal/KR dialogs 2 files / 10 tests PASS. Goal build, App-Vue production build, API build and Migrator build PASS; Contracts/Data Portability/Vue/React/AI/Task/PowerSync/Desktop typechecks PASS. Architecture lock rejects canonical V2 field resurrection and client tracking-base leakage while explicitly permitting temporary AI Draft V1 until GOAL-7210.

## 11. Phase 3 — Context ownership and relation parity

### GOAL-7205 — Allow Goal-level Task links and add reverse Task context queries

**Status:** DONE on `chatgpt/goal-7205-task-links`; integrated implementation/runtime evidence below.

**Goal:** Task can relate to a Goal without being forced into a KR, while contribution remains KR-scoped.

**Scope:**

- `TaskGoalLink.keyResultId` optional;
- domain validation `contribution -> keyResultId required`;
- current singular task goalBinding ownership preserved;
- query/filter by Goal and Goal+KR;
- Goal delete binding checks;
- Task UI/AI contract.

**Implementation:**

1. characterize current ADR-056 link/contribution settlement;
2. relax link schema/domain to optional KR;
3. keep contribution validation fail-closed;
4. add owner read queries/ports for Goal-level and KR-level contexts;
5. update outbox/settlement tests to prove goal-only link emits no contribution;
6. update DB constraint `task-goal-binding` to the new invariant.

**Acceptance:** three valid states exist: goal-only、goal+KR、goal+KR+contribution; no contribution can exist without KR.

**Closure evidence:** Task full unit suite 73 files / 686 tests PASS and Task PostgreSQL integration 6 files / 31 tests PASS; Contracts 83/570 and AI 79/428 PASS; App-Vue Goal/KR Task editor 10/10 PASS; PowerSync Goal-context adapter 4/4 and Prisma Goal-context integration 2/2 PASS; HTTP/controller/Electron/domain-client parity 4 files / 52 tests PASS. Contracts/Task/AI/App-Vue/API/Migrator/Desktop type/build gates PASS; App-Vue production build PASS; Governance tools 19/139 PASS, production lint 21 files with 0 warnings/errors, test inventory 1249 current, docs-check and full governance-check PASS. Local-Docker Phase A using the canonical local-compose runtime environment passes 2/2: Goal-only and Goal+KR link-only Tasks complete without changing KR progress, while Goal+KR+EachCompletion retains apply/replay/uncomplete/reapply idempotency. Live PostgreSQL uses `memoflow.task-goal-binding/v3`; the Goal-only row persists `key_result_id/contribution = NULL`, the Goal+KR link-only row persists contribution fields `NULL`, and both completed context-only Tasks have zero `task_goal_outbox` rows. Existing contributed bindings survived the in-place v2 -> v3 constraint reconciliation.

**Dependencies:** GOAL-7204 for final KR contract.

### GOAL-7206 — Promote Relation to shared capability and implement Goal Knowledge links

**Goal:** Goal can link reusable Knowledge Documents through a shared Relation owner on both Prisma and PowerSync lanes, using ADR-090 stable `KnowledgeDocumentId`.

**Scope:**

- move generic relation ownership out of `packages/goal` into `packages/relation`;
- preserve SubjectRef/Relation semantics during extraction;
- Prisma adapter parity;
- add PowerSync adapter/schema/repository;
- typed GoalKnowledge facade;
- `Goal --related--> KnowledgeDocumentRef` canonical product relation；禁止 path-derived projection id；
- deletion/unlink rules;
- Repository/Knowledge note resolution.

**Implementation:**

1. add surface locks around current Relation contract before moving ownership;
2. add a hard characterization lock that no durable Goal relation persists `KnowledgeNoteProjection.id` / relativePath as target identity;
3. create shared relation package/module without changing serialized semantics;
4. move Prisma adapter and tests;
5. implement PowerSync lane and round-trip tests;
6. consume Repository/Knowledge stable `KnowledgeDocumentRef` from ADR-090;
7. add typed goal-knowledge application intents;
8. add cleanup on Goal delete without deleting KnowledgeDocument;
9. add reverse KnowledgeDocument -> Goals query;
10. remove generic Relation ownership from Goal package.

**Acceptance:** Web/Desktop can create/read/delete Goal Knowledge relations offline/online; KnowledgeDocument survives unlink/Goal delete and rename/move keeps the relation resolvable; no Goal.noteIds/Note.goalId/path-derived relation dual truth.

**Dependencies:** GOAL-7201; GOAL-7202 migration consumes Goal Brief path once available; **hard external gate: ADR-090 stable KnowledgeDocument identity must be implemented before durable relation persistence is enabled.**

**Risks:** current Relation is Prisma-only; parity must land before UI declares Knowledge a core Goal property. Repository projection ids are path-derived today, so using them before ADR-090 would create rename-broken links.

## 12. Phase 4 — Goal Workspace read composition

### GOAL-7207 — Build GoalWorkspaceReadModel

**Goal:** One query returns Goal authoritative state plus Task/Knowledge context summary without moving ownership into Goal.

**Scope:**

- GoalWorkspace contract;
- GoalWorkspaceQueryService;
- TaskContextReadPort;
- Knowledge/Relation read ports;
- preview + counts;
- paginated full task/note queries;
- HTTP/IPC parity;
- React/Vue client adapters.

**Implementation:**

1. define no-duplicate-authority DTO shape;
2. inject Task/Knowledge/Relation read ports at host composition;
3. implement Task summary and preview;
4. implement Knowledge summary and preview;
5. compose recent GoalRecord/Review from Goal owner;
6. add pagination/deep-link contracts for full lists;
7. test missing external context, offline, empty, permission, deleted-reference behavior;
8. add HTTP/IPC parity fixture.

**Acceptance:** Goal Detail can answer “what is connected to this Goal?” without Goal querying concrete Task/Knowledge repositories.

**Dependencies:** GOAL-7205, GOAL-7206.

## 13. Phase 5 — AI multi-entity planning

### GOAL-7208 — Upgrade GoalPlanDraft and ApplyGoalPlanService

**Goal:** AI can propose and safely apply Goal + KR + Task + Knowledge context in one reviewed durable workflow.

**Scope:**

- GoalPlanDraft V2 schemas;
- draft refs and deterministic ID map;
- existing-note search/reuse;
- knowledge create/link intents;
- task goal/KR links;
- owner application port orchestration;
- apply receipts/idempotency/partial retry;
- Web/Desktop review UI contract.

**Implementation:**

1. characterize existing ADR-052 durable workflow/review/apply path;
2. update planner structured output to ADR-067/068 fields;
3. add TaskDraft/KnowledgeDraft and stable draftRef validation;
4. integrate existing Knowledge search/capture ports instead of new storage;
5. resolve/create labels;
6. create Goal+KRs and build ref map;
7. create/link Notes through Relation;
8. create Tasks through Task port;
9. persist per-step apply receipts with stable idempotency keys;
10. support retry from partial apply without duplicate entities;
11. route success to Goal Workspace.

**Acceptance:** user can delete/edit any proposed item before approve; successful apply surfaces all created/linked entities in Workspace; partial apply is resumable and never duplicates Goal/KR/Task/Note.

**Dependencies:** GOAL-7202~7207.

**Risks:** distributed multi-owner mutation cannot pretend to be one DB transaction; durable idempotent step receipts are mandatory.

## 14. Phase 6 — Linear-style UI convergence

### GOAL-7209 — Implement Goal property-chip create/edit and Workspace detail

**Goal:** Replace form-heavy Goal UI with the accepted compact product model.

**Scope:**

- Vue/Web/Desktop primary Goal surface;
- React/Mobile parity;
- property chips;
- Target picker;
- KR Initial/Current/Target editor;
- Task/Knowledge previews;
- AI Create preview entry;
- Past Target presentation.

**Implementation:**

1. add component-level characterization of current create/edit flow;
2. replace large Description/dates/label rows with Name+Summary+property chips;
3. implement Target timeframe popover and precise display;
4. implement status chip and manual transitions;
5. implement KR compact list/editor per ADR-068;
6. implement Notes chip and Workspace Knowledge section;
7. implement Task summary/preview/deep links;
8. integrate AI review preview;
9. add keyboard/focus/accessibility states;
10. port same semantic contract to React/Mobile without cloning desktop layout.

**Acceptance:** UI follows `docs/product/goal-vnext-workspace-and-create-ui.md`; no retired Linear enterprise attributes appear.

**Dependencies:** GOAL-7202~7208; can develop components in parallel behind new contracts after those contracts freeze.

## 15. Phase 7 — Direct cleanup and truth convergence

### GOAL-7210 — Remove legacy Goal/KR tracks and finalize cutover

**Goal:** After all consumers move, final repository truth contains only new Goal vNext model.

**Scope:**

- Prisma schema/migrations;
- PowerSync schema;
- portable import/export;
- fixtures/seeds;
- AI compatibility adapters;
- docs/examples;
- generated Prisma artifacts;
- obsolete indexes/columns/errors/method names.

**Legacy names to eliminate from Goal production truth:**

```text
Goal.dueDate
goals.due_date
GoalStatus.Active
Goal.description
Goal.motivation
Goal.feasibilityAnalysis
KeyResult.startingValue (public/domain user concept)
progressBaselineValue
GoalDueDateNotSetError
isOverdue for Goal
```

**Protected names that must remain elsewhere:**

```text
Task dueDate
Task isOverdue
Task/occurrence deadlines
Scheduler endDate/nextRun
Recurrence UNTIL
```

**Acceptance:** code search + architecture lock proves no forbidden Goal legacy public truth; migrations preserve values/knowledge; Task time semantics unchanged.

**Dependencies:** GOAL-7202~7209.

## 16. Phase 8 — Review, verification and archive

### GOAL-7211 — Five-layer review, CI and delivery closure

**Goal:** Prove the new model is vertically complete and does not reintroduce legacy dual tracks.

**Review layers:**

1. **Contract correctness** — exact status/timeframe/KR/task-link/relation schemas;
2. **Vertical completeness** — UI -> HTTP/IPC -> application -> domain -> Prisma/PowerSync -> readback;
3. **Behavioral completeness** — create/edit/reopen/archive/delete/target passage/offline/partial AI apply/retry/unlink;
4. **Engineering quality** — ownership, no duplicate algorithms, idempotency, typing, migration, observability;
5. **Plan integrity** — ADR/product docs/current docs/code/tests all agree.

**Required verification matrix:**

- Goal domain/contract tests;
- KR progress fixtures including increasing/decreasing/midstream creation;
- TaskGoalLink goal-only / KR / contribution cases;
- Relation Prisma + PowerSync round trips;
- GoalWorkspace HTTP/IPC parity;
- Knowledge link/unlink/delete preservation;
- AI GoalPlanDraft structured validation;
- AI partial apply retry/idempotency;
- Vue create/edit/detail;
- React/Mobile semantic parity;
- portability import/export;
- reminder target-boundary behavior;
- affected typecheck/lint/build;
- governance architecture locks;
- full required repository CI.

**Acceptance:**

- no unresolved P0/P1 review finding;
- required CI green on exact delivery head;
- current product docs updated from old implementation truth to new truth;
- plan archived only after merge/delivery evidence exists.

## 17. Implementation order and parallelism

Safe parallelism after GOAL-7201:

```text
Lane A: GOAL-7202 Goal identity/lifecycle
Lane B: GOAL-7203 Goal Target Timeframe
Lane C: GOAL-7204 KR Measurement V3 (after timeframe contract stub/freeze for KR target)
```

After core contracts converge:

```text
Lane D: GOAL-7205 Task link
Lane E: GOAL-7206 Relation/Knowledge
```

Then GOAL-7207 is the integration read-model seam. GOAL-7208 and GOAL-7209 may overlap only after Workspace and core contracts are stable.

Do not run multiple writers against the same Goal contract/schema migration files without explicit worktree ownership.

## 18. Rollback containment (ADR-111 supersedes data migration)

During implementation:

- each vertical ticket uses its own migration boundary and regression tests;
- no long-lived public old/new dual fields;
- migrations may use internal one-time staging tables/columns/scripts if needed for lossless conversion;
- before dropping legacy text fields, non-empty motivation/feasibility/description must be accounted for;
- relation package extraction first freezes serialized shape, then moves ownership;
- AI workflow must be able to keep old production workflow disabled/unchanged until new draft apply path passes end-to-end acceptance;
- UI cutover only after underlying contracts support both API and Desktop lanes.

If a phase cannot preserve a protected contract, stop that phase and record a blocking decision rather than weakening the invariant.

## 19. Documentation truth policy

Until implementation merges:

- ADR-067 至 ADR-070 = accepted target design;
- this active plan = implementation order;
- current-system map + current source/tests = implemented truth;
- existing `docs/product/modules/goal.md` remains current-product description with a target-design notice.

After implementation:

- update `docs/product/modules/goal.md` and `docs/product/goal-task-vnext.md` to new current truth;
- mark superseded portions of ADR-052/053/055/056 accordingly;
- archive this plan with exact review/CI/merge evidence.

## 20. Current plan state

```text
GOAL-7201  DONE — design package written and active plan expanded
GOAL-7202  DONE — identity/lifecycle direct cutover
GOAL-7203  DONE — Product Time + GoalTimeframe direct cutover
GOAL-7204  DONE — KR Measurement V3 + optional KR timeframe direct cutover
GOAL-7205  PLANNED
GOAL-7206  PLANNED
GOAL-7207  PLANNED
GOAL-7208  PLANNED
GOAL-7209  PLANNED
GOAL-7210  PLANNED
GOAL-7211  PLANNED
```

GOAL-7201 itself only froze the design package; GOAL-7202/7203/7204 are now implemented production truth.
