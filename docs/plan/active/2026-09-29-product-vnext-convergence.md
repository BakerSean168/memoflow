# MemoFlow Product vNext Convergence — UI + Interaction + Logic Closure

Date: 2026-09-29  
Status: active planning / implementation branch opened  
Branch: `product/vnext-convergence`  
Base snapshot: `main@d3a32135709` (PR #398 merged)
Parent integration status: PR `#398` has landed on `main`; this branch has been rebased onto that merged baseline.

## 0. Executive decision

This is **not** another single-module polish pass.

The next optimization cycle treats the recent Goal/Task/Calendar/Repository work as the beginning of a new MemoFlow product language and completes the remaining product/interaction logic around it.

The convergence target is:

```text
direct manipulation
+ progressive disclosure
+ fewer navigation layers
+ compact property surfaces
+ deterministic data facts
+ owner-native Full / Quick Surfaces
+ AI semantic surface orchestration
+ shared product primitives only after real owner flows prove reuse
```

Goal is the first **reference implementation**, not the only scope.

The overall sequence is:

```text
freeze current integration baseline
        ↓
finish Goal KR -> Record -> Review vertical loop
        ↓
Task Quick Surface + canonical occurrence actions
        ↓
Schedule Dialog + owner Quick Surface composition
        ↓
Owner Native Edit Session / AI Surface Orchestrator
        ↓
converge Routine / Knowledge / Notification / Settings+Account / Shell
        ↓
parallel Governance retirement decision
        ↓
product-wide drift closure
        ↓
visual regression + interaction regression gate
```

The plan deliberately avoids premature “one universal entity component” abstractions. Shared primitives are promoted only after at least two real product surfaces demonstrate the same stable interaction grammar.

---

# 1. Target outcome

A user should experience MemoFlow as one coherent product even when moving between Goal, Task, Schedule, Routine, Knowledge, Notification, Settings/Account and AI. Product Governance has been retired by ADR-113 and is no longer a product module.

Observable outcomes:

1. routine actions do not force users into deeper detail pages when inline/direct manipulation is sufficient;
2. create/edit surfaces use compact property interactions instead of database-style forms;
3. deep information uses Popover / Dialog / Sheet according to information density, not a new route by default;
4. Goal/KR progress facts are modeled as event history and visualized as trajectories;
5. Review starts from system evidence and diagnosis, not blank textareas;
6. AI augments user decisions instead of silently becoming the source of truth;
7. module toolbars, metadata rows, chips, dialogs, loading/error/empty states share stable product grammar;
8. responsive behavior follows the business-panel container rather than viewport-only assumptions;
9. routes, API contracts and owner boundaries remain explicit even if a visual page is retired;
10. core surfaces have deterministic screenshot and interaction regression coverage;
11. AI opens and edits the same owner-native Goal/Task/Knowledge surfaces that users edit manually, rather than maintaining parallel product forms.

---

# 2. Current system facts

## 2.1 Branch state

PR #398 has merged into `main`.

This branch is now based on:

```text
main@d3a32135709
```

The previous UI integration head is already contained in this `main` history, including the final follow-up commit from that branch.

Therefore:

- `product/vnext-convergence` now directly owns the next product convergence cycle;
- no duplicate UI-integration commits should exist above `main`;
- future work should rebase from current `origin/main` when necessary rather than from the retired integration branch;
- the remaining branch diff should contain only Product vNext planning/implementation work.

## 2.2 Proven current primitives

The current code already provides useful foundations:

- `ProductDialogShell`
- `ProductPropertyChip`
- `ProductTemporalPickerSurface`
- `ProductDatePicker`
- `ProductTimeframePicker`
- `ProductDateTimePicker`
- `ProductAutoTextarea`
- `ResponsivePrimaryAction`
- `ResponsiveSegmentedFilter`
- shared Reka/shadcn primitive layer
- center fade/scale modal motion
- server-state stale-window cache helpers for high-frequency shell previews

These are protected until evidence shows a replacement is needed.

## 2.3 Known convergence debt

The current product contains several classes of drift:

- page-level toolbar geometry and visual recipes differ by module;
- Goal and Task detail have converged visually through duplication rather than shared grammar;
- KR, Record and Review still contain old-page / old-form interaction residue;
- some feature code still bypasses semantic color/elevation tokens;
- temporal surfaces are partly shared but DateTime presentation still has independent chrome;
- visual tests are largely structural/source assertions rather than deterministic rendered baselines;
- older Goal Review/KR pages do not match the newer Goal workspace;
- module-specific surfaces often implement the same low-level patterns independently.

This plan treats these as **root-cause families**, not a list of isolated CSS defects.

---

# 3. Product principles frozen for this cycle

## P1 — One owner workspace before deep navigation

A route exists because the user is switching product owner/context, not merely because an object has more fields.

Within one owner:

```text
inline
 -> popover
 -> dialog/sheet
 -> new route only when the task is truly a separate workspace
```

## P2 — Direct manipulation over edit modes

Avoid:

```text
View
 -> Edit button
 -> duplicated edit screen
 -> Save
```

Prefer:

```text
viewed property
 -> direct edit at the property
 -> commit / rollback
```

## P3 — Progressive disclosure

Default surfaces show the smallest sufficient context.

Low-frequency properties live behind More / Popover / Inspect surfaces.

## P4 — Facts before AI

Deterministic system facts, event history and owner state must remain visible without an LLM.

AI can:

- summarize;
- diagnose possible explanations;
- generate a draft;
- propose changes.

AI does not replace canonical owner data or silently commit high-impact changes.

## P5 — Product-time semantics remain explicit

Do not unify domain semantics merely to unify visuals.

Examples:

- Goal `GoalTimeframe` preserves semantic precision;
- Task/Schedule exact calendar values remain exact `Ymd/Instant`;
- shared temporal presentation must not erase these distinctions.

## P6 — Shared primitives follow proven grammar

No “EntityDetailMegaComponent”.

Extract shared components only when the interaction contract is stable and demonstrated in multiple surfaces.

---

# 4. Protected contracts

The following contracts are protected unless a ticket explicitly migrates them.

## 4.1 Routing / deep links

- existing Goal, Task, Schedule, Routine, Repository and Settings public routes;
- existing Goal KR/Review deep links during retirement;
- Settings surviving query-tab values;
- Task Goal/KR filter query semantics.

Retiring a page may redirect/map the route to a parent workspace + dialog state rather than breaking the URL.

## 4.2 Domain / API

- Goal/KR measurement contracts and calculation semantics;
- Goal Record as an independent event value;
- Goal Review persisted system context;
- Task Plan / Occurrence ownership;
- Routine owner model and host capability boundary;
- Knowledge stable `KnowledgeDocumentRef`;
- Notification fact/delivery ownership;
- `@memoflow/time` canonical product-time semantics.

## 4.3 UI/runtime

- unsaved-change and dirty-state guards;
- Dialog focus restoration / reduced motion;
- existing high-value test IDs until replacement tests exist;
- container-query behavior of AI/business columns;
- shell panel minimum widths;
- server-state identity isolation and cache invalidation semantics.

---

# 5. Phase 0 — Baseline and evidence

## Objective

Create a stable point from which product convergence can proceed on top of the merged UI baseline.

## Scope

- keep the branch rebased on the merged `main` baseline;
- capture current key product surfaces;
- inventory routes and tests that must survive Goal page retirement;
- establish a deterministic visual fixture strategy.

## Out of scope

- broad UI rewriting;
- shared-component extraction;
- module migration.

## Tickets

### PVC-0001 — Main-baseline closure contract

**Status:** completed on 2026-09-29.

**Goal:** Ensure this cycle starts from the merged UI baseline rather than a stale integration branch.

**Implementation:**

1. Fetch the merged `origin/main` after PR #398 completion.
2. Rebase `product/vnext-convergence` onto `main@d3a32135709`.
3. Verify the previous base `2b62c037a18` is contained in `main`.
4. Verify the remaining branch-only commits are Product vNext work only.
5. Force-update the remote branch with lease because the rebase rewrites its commit ancestry.

**Acceptance:** `origin/main` is an ancestor of `product/vnext-convergence`; no integration repair commit is duplicated above `main`.

### PVC-0002 — Product visual baseline matrix

**Goal:** Replace ad-hoc `tmp-*.png` evidence with repeatable fixtures.

**Surfaces:**

- Goal create;
- Goal detail with 0/1/multiple KR;
- Task list + Task detail;
- Schedule week/day + create;
- Routine configuration;
- Knowledge workspace;
- Notification center;
- AI chat/composer;
- module capsule previews.

**Matrix:**

- light + dark;
- zh-CN + en-US for representative locale-sensitive surfaces;
- business-panel widths near 520 / 700 / 900+ CSS px;
- at least one Desktop/Electron scale case after web baseline stabilizes.

**Acceptance:** Baselines can be regenerated from deterministic fixture data and compared in CI/review.

### PVC-0003 — Interaction route characterization

**Goal:** Characterize existing KR/Review routes before retiring their pages.

**Tests:**

- direct deep link opens correct Goal/KR or Review context;
- refresh preserves context;
- invalid object id has bounded not-found behavior;
- closing inspect returns to Goal without navigation loss.

---

# 6. Phase 1 — Goal reference implementation closure

## Objective

Complete the full Goal outcome loop before extracting product-wide grammar.

```text
Goal
 -> KR
 -> Record
 -> trajectory
 -> diagnosis facts
 -> Review
 -> adjustment
```

## Why first

Goal currently contains the richest mix of:

- identity;
- properties;
- nested outcome entities;
- measurement;
- event history;
- cross-module relations;
- review;
- AI assistance.

Once this loop is coherent, it becomes a credible reference for product-wide convergence.

---

## PVC-GOAL-1101 — Remove Reminder from Goal Create

**Goal:** Goal creation does not ask the user to configure reminders.

**Scope:**

- `GoalDialog.vue`;
- focused Goal dialog tests;
- create-mode visual baseline.

**Implementation:**

1. Remove `GoalReminderChip` from create-mode property row.
2. Keep reminder configuration available for existing Goal edit/detail paths.
3. Ensure create payload remains valid with `reminderConfig = null`.
4. Preserve reminder menu and custom DateTime picker in Goal Detail.
5. Update i18n/tests only where create copy/expectations change.

**Acceptance:** New Goal can be created with no reminder UI visible; post-create Goal Detail can still add reminders.

---

## PVC-GOAL-1102 — KR trajectory becomes the primary Goal-detail representation

**Goal:** A KR explains its current state without requiring navigation.

**Scope:**

- Goal Detail KR section;
- `GoalKeyResultTrajectoryPlot`;
- KR summary/inline surface.

**Implementation:**

1. Promote trajectory visualization into the Goal Detail KR surface.
2. Show Initial / Current / Target, unit, calculation method, weight and target timeframe around the trajectory.
3. Preserve compact density when multiple KR exist.
4. Use progressive disclosure for secondary metadata.
5. Keep linked Task context visible but subordinate to outcome state.
6. Remove primary dependency on the current progress-bar-only row.

**Acceptance:** A user can understand a KR’s baseline, current state, direction and target without opening another page.

---

## PVC-GOAL-1103 — KR direct manipulation

**Goal:** Routine KR edits require no explicit Edit action.

**Implementation:**

1. Title and description become inline-editable.
2. Calculation method opens an inline menu/popover.
3. Weight uses the existing compact popover.
4. Target timeframe uses shared temporal picker.
5. Current-state affordance leads to Record/check-in.
6. Keep low-frequency actions in `...`.
7. Remove `Edit` from the normal overflow menu once parity is proven.
8. Retain cancel/rollback behavior for failed owner mutations.

**Acceptance:** No standard “Edit Key Result” button/menu is needed for common changes.

---

## PVC-GOAL-1104 — Calculation-method user language

**Goal:** Expose all five supported methods with understandable product language.

**Mapping:**

| Contract | Product label | Record prompt |
| -------- | ------------- | ------------- |
| Sum      | 累计          | 本次增加      |
| Average  | 平均值        | 本次测量      |
| Max      | 最高值        | 本次测量      |
| Min      | 最低值        | 本次测量      |
| Last     | 最新值        | 当前值        |

**Implementation:**

1. Define a single presentation mapping.
2. Reuse it in create/edit, Goal Detail and Inspect Dialog.
3. Add one-sentence explanations/examples.
4. Do not expose `trackingBaseValue`.

**Acceptance:** No UI leaks raw `Sum/Average/Max/Min/Last` unless locale/copy explicitly chooses those labels.

---

## PVC-GOAL-1201 — Record becomes calculation-aware check-in

**Goal:** Record UX matches the actual aggregation semantics.

**Current defect:** Existing `GoalRecordDialog` presents increment semantics and `+1/+2/+5/+10` quick values for every calculation method.

**Implementation:**

1. Resolve the KR measurement/calculation method before rendering the dialog.
2. Render `本次增加` for Sum.
3. Render `当前值` for Last.
4. Render `本次测量` for Average/Max/Min.
5. Auto-display unit.
6. Make note optional and visually secondary.
7. Remove increment-only quick chips when semantically invalid.
8. After save, refresh/patch KR trajectory and recent progress.
9. Preserve owner optimistic/version semantics.

**Acceptance:** A Last/Min/Max/Average KR is never presented as an additive increment.

---

## PVC-GOAL-1202 — Quick check-in path

**Goal:** A Record can be added in seconds from the KR surface.

**Implementation:**

1. Provide a clear current-point/current-value affordance.
2. Open a compact check-in Dialog/Popover with value focus.
3. Preserve keyboard submit/cancel.
4. Update current state and trajectory without route navigation.
5. Expose failure inline/toast without discarding input.

**Acceptance:** Common Record creation requires no navigation and no “Edit KR” flow.

---

## PVC-GOAL-1301 — KR Inspect Dialog

**Goal:** Replace `KeyResultDetailView` with an inspect surface.

**Inspect content:**

- larger trajectory;
- full Record history;
- linked Task context;
- calculation explanation;
- source/contribution context;
- optional AI analysis.

**Implementation:**

1. Introduce a KR Inspect Dialog controlled by Goal Detail.
2. Keep routine edits direct inside the parent/inspect surface.
3. Route existing `key-result-detail` deep link into Goal Detail + inspect state.
4. Preserve not-found behavior.
5. Retire the standalone view after route compatibility is covered.

**Acceptance:** Clicking a KR never requires a separate Goal sub-page; old deep links still resolve the same KR.

---

## PVC-GOAL-1401 — Review window semantics

**Goal:** Default Review period means “since the last covered Review window”.

**Contract:**

If a prior Review exists:

```text
windowStart = previousReview.systemContext.windowEndAt
windowEnd   = now
```

If no prior Review exists:

```text
windowStart = now - 7 days
windowEnd   = now
```

User-selectable alternatives:

- 自上次复盘以来;
- 最近 7 天;
- 最近 30 天;
- 自定义.

**Implementation:**

1. Add/derive previous-review context in the owner service/use-case without making the UI guess from stale local lists.
2. Preserve existing explicit `windowDays` compatibility while introducing the default-resolution behavior.
3. Ensure adjacent windows do not create silent gaps because `reviewedAt` differs from `windowEndAt`.
4. Test first review, consecutive reviews, manual override and clock boundaries.

**Acceptance:** Consecutive default reviews form continuous coverage using persisted Review system context.

---

## PVC-GOAL-1402 — Review Snapshot and deterministic diagnosis

**Goal:** Review starts with evidence rather than blank fields.

**Facts:**

- overall start/end/delta;
- KR start/end/delta;
- trend;
- manual Record count;
- Task contribution count;
- review period.

**Deterministic signals may include:**

- no KR updates for a meaningful portion of the review window;
- trend moving away from target;
- Task activity with no corresponding KR movement;
- target reached/near target;
- material change concentrated in one KR.

**Rules:**

- signals must be explainable from owner data;
- no LLM is required to produce them;
- avoid pretending causal inference is certain.

**Acceptance:** Review remains useful with AI disabled.

---

## PVC-GOAL-1403 — Review Dialog

**Goal:** Create and inspect Review without a new page.

**Structure:**

```text
Large Review Dialog
├── period selector
├── Snapshot
├── KR trajectories
├── activity evidence
├── deterministic signals
├── optional AI analysis
├── Reflection
├── Challenges
├── Adjustments
└── save
```

**Implementation:**

1. Replace create-page entry with Goal Detail dialog state.
2. Replace review-detail route rendering with read-only Dialog state.
3. Preserve explicit save/cancel and unsaved-change behavior.
4. Keep the Goal visible behind the modal context.
5. Retire standalone create/detail views after route compatibility tests pass.

**Acceptance:** Starting, cancelling, saving and reading a Review never navigates away from Goal Detail.

---

## PVC-GOAL-1404 — Optional AI Review assistant

**Goal:** AI helps analyze and draft; it does not own Review truth.

**Capabilities:**

- `帮我分析本周期`;
- `使用这些内容生成复盘草稿`.

**Context:**

- Goal/KR current state;
- Record history in selected window;
- Task contributions;
- previous Review;
- authorized Knowledge context where supported.

**Guardrails:**

- system facts are rendered separately from AI prose;
- AI output is visibly a suggestion/draft;
- saving Review still requires user action;
- AI failure does not block manual Review.

**Acceptance:** Review is fully usable offline/from deterministic data except the explicit AI assist actions.

---

## PVC-GOAL-1501 — Goal route retirement migration

**Goal:** Remove page depth without breaking historical/deep links.

**Mappings:**

```text
/goals/:goalId/key-results/:keyResultId
 -> Goal Detail + KR Inspect

/goals/:goalId/review/create
 -> Goal Detail + Review create dialog

/goals/:goalId/review/:reviewId
 -> Goal Detail + Review read-only dialog
```

**Acceptance:** No standalone KR/Review view remains in the normal product flow; deep links remain functional.

---

## PVC-GOAL-1601 — Goal reference implementation acceptance

**Goal:** Freeze Goal as the first product reference surface.

**Required states:**

- create empty;
- create with KR;
- Goal with no KR;
- Goal with multiple KR;
- all five calculation methods;
- Record success/error;
- KR Inspect;
- first Review;
- subsequent Review;
- AI unavailable;
- expired target;
- narrow panel;
- dark/light;
- zh-CN/en-US.

**Acceptance evidence:**

- focused unit tests;
- integration/flow tests;
- visual baselines;
- typecheck/build;
- no console errors;
- diff hygiene.

---

# 7. Phase 2 — Promote proven shared product grammar

## Objective

Only after Goal closure, extract the patterns that are demonstrably reusable.

## Candidate primitives

### PVC-UI-2101 — Product module toolbar contract

Define legal toolbar variants rather than one hard-coded height:

- `module`: owner-level navigation/actions;
- `collection`: filters/views/create;
- `document`: high-density object/document controls.

Each variant owns:

- height/min-height;
- padding;
- border;
- background/backdrop;
- responsive compaction;
- action priority behavior.

### PVC-UI-2102 — Entity identity + metadata grammar

Accepted shared pieces:

- `ProductEntityIdentity`
- `ProductMetadataRow`
- `ProductPropertyChip` (accepted existing name; do not add a parallel `ProductMetadataChip`)
- `ProductMoreProperties`

Do not move domain decisions into these components.

### PVC-UI-2103 — Overlay surface recipes

Normalize:

- compact property Popover;
- inspect Dialog;
- workspace Dialog;
- destructive confirmation;
- Sheet use for edge-attached/narrow-host surfaces.

### PVC-UI-2104 — Semantic elevation/status tokens

Accepted: reuse the existing semantic tone/elevation vocabulary where product meaning is stable; keep specialized interaction effects local and avoid palette-wide churn. AI verification/composer gaps are closed, while Notification, Schedule, Settings and Routine retain their already-semantic production implementations.

### PVC-UI-2105 — Visual regression harness

Promote Phase-0 screenshots into CI/review gates for core surfaces.

---

# 8. Phase 3 — Task convergence

## Product target

Keep Task’s canonical Plan/Occurrence split, but simplify the user model to two primary Task surfaces:

```text
Today | Plans
```

Future temporal browsing belongs to Schedule / Calendar rather than a duplicated Upcoming surface.

Primary paths:

```text
Quick Task capture
Full Task create
Today execution + overdue correction
Occurrence Inspect Dialog/Sheet
Task Plan workspace
Checklist
Schedule handoff
Goal/KR link + completion-time record
```

Protected Task semantics:

- Overdue is derived and never auto-Missed;
- user explicitly chooses Completed / Missed / Skipped;
- no user-facing completion-policy configuration;
- Plan outcome remains derived;
- End Plan means Abandon, never Archive;
- Archive is not a normal Task action;
- TaskOccurrence gets no new detail route by default;
- Goal remains owner of KR aggregation and GoalRecord truth.

## Audit/implementation tickets

### PVC-TASK-3001 — Task second-pass surface/domain audit

**Status:** discovery complete.

Deliverable:

- [Task vNext second-pass deep audit](../../analysis/2026-09-29-task-vnext-second-pass-deep-audit.md);
- verified P0–P3 ledger;
- resolved Q1–Q6 product decisions;
- T2-15 completion-time KR record direction;
- canonical product docs and ADR-056/057/068/069/075 updated with the resolved Task decisions.

### PVC-TASK-3002 — Repair Task lifecycle/outcome truth

**Goal:** one product action has one domain meaning.

Implement before broader UI convergence:

- remove `Archive` from the normal “End plan” path;
- expose/use explicit Abandon for user-driven plan termination;
- ensure Abandon stops future occurrence materialization and reminders;
- reconcile/remove already-materialized incomplete future occurrences when ending a plan;
- add the missing abandonment projection/event path so Schedule does not retain future execution for an ended plan;
- present Succeeded / Failed / Abandoned distinctly;
- remove the invalid optimistic `archive -> Closed` frontend patch;
- keep Delete for mistaken creation;
- keep `archivedAt` secondary/internal rather than a normal lifecycle control.

ADR-057 has now been revised with the canonical outcome rule and a versioned compatibility path for persisted/portable `completionPolicy` data. Implementation must follow that migration; do not silently delete the field while old bundles/clients may still carry it.

Converge the hidden completion-policy model toward one product rule:

```text
Overdue -> unresolved
Completed / Missed / Skipped -> explicit occurrence facts

finite scope:
  unresolved occurrence -> Open
  all required completed/waived -> Succeeded
  scope ended + explicit Missed remains -> Failed

infinite recurring:
  -> Open until explicitly Abandoned
```

### PVC-TASK-3003 — Converge Task Home to Today | Plans

Retire the Task Upcoming surface.

Today:

- owns today + unresolved overdue occurrences;
- does not query/materialize unbounded future history;
- groups overdue separately when useful;
- uses occurrence-specific filters only.

Plans:

- remains first-class;
- uses Plan lifecycle/outcome filters, not hidden occurrence status state;
- resolves Goal/KR scope labels to product names, not raw IDs.

Future browsing deep-links/opens Schedule / Calendar.

### PVC-TASK-3004 — Restore canonical Quick Task

Repair the currently disconnected quick-create contract used by AI / Today Overview / shell surfaces.

Quick Task remains intentionally smaller than full Task create:

```text
title
 -> today/all-day default
 -> create
```

Full Plan configuration remains available after creation and through the normal New Task dialog.

### PVC-TASK-3101 — Align Task create/detail grammar

After lifecycle and owner behavior are correct, reuse only the primitives proven by Goal while preserving Task-owned Plan/Occurrence semantics.

Do not start this ticket by creating a universal Goal/Task detail component.

### PVC-TASK-3201 — Occurrence execution + inspect surface

Ensure complete/skip/missed/checklist actions remain quick and do not route through Plan editing.

Interaction:

```text
Today row
 -> direct actions
 -> click row -> compact Inspect Dialog/Sheet
 -> View plan -> /tasks/:planId
```

No `TaskOccurrenceDetailView` by default.

### PVC-TASK-3301 — Measurement-aware Task → KR recording

Replace the current fixed-delta-only mental model with three product modes:

```text
仅关联
自动记录固定值
完成时记录
```

Requirements:

- fixed automatic mode preserves the low-friction existing use case;
- fixed Sum deltas may be signed so decreasing KRs are supported;
- prompt mode works with Sum / Average / Max / Min / Last;
- Sum record input is a delta;
- Average/Max/Min/Last input is a sample;
- Goal owns preview/aggregation semantics;
- completion dialog shows a live Current → After → Target preview;
- Task completion plus Goal-record intent uses the durable Task → Goal outbox, not frontend dual writes;
- Task completion remains possible through an explicit “complete without record” escape path;
- uncomplete reverses the source-correlated GoalRecord;
- re-complete can create the replacement record value;
- source correlation and record provenance are separate: automatic Task records stay immutable system facts, while user-entered completion measurements remain source-correlated but have a Goal-owned correction path that does not mutate Task completion state;
- extend the GoalRecord client/read projection so source/provenance can be rendered and corrected intentionally instead of being hidden server-only metadata;
- converge the duplicate GoalRecord card/presentation implementations behind measurement-aware delta/sample language;
- resolve the current `recordedAt` client/schema drift explicitly rather than carrying a silently ignored field.

This ticket should also replace the current Sum-biased Goal record composer with a measurement-aware Goal-owned record input/preview primitive so manual Goal records and Task-completion records share one semantic implementation.

ADR-056/068/069/075 have now been amended to distinguish `automatic fixed contribution` from `user-authored completion measurement`, preserve Goal ownership, define provenance/correction semantics, and retire Upcoming in favor of Schedule. Contract implementation must follow those revised ADR boundaries.

### PVC-TASK-3401 — Canonical occurrence action coordinator + Task Quick Surface

**Why now:** second-pass remaining-module audit found that Task completion is initiated from Task Home/Detail, Task Capsule, Today Overview and Schedule. Once completion-time KR measurement exists, direct `completeOccurrence(id)` calls become interaction bypasses. The same surfaces also duplicate summary/list/row UI.

Converge all user-facing completion entry points onto one Task-owned interaction contract:

```text
request complete
 -> inspect completion requirements
 -> direct complete OR prompted KR measurement
 -> canonical completion command with optional measurement intent
```

Affected presentation entry points currently include:

- `TaskManagementView`;
- `TaskDetailView`;
- `TaskCapsulePreview`;
- `DailyTodoWidget`;
- Schedule `DayDetailSheet`;
- Schedule `TaskEventActionPanel`.

Do not make those hosts import `TaskCapsulePreview.vue`. Extract the owner layer:

```text
TaskOccurrenceQuickRow
 -> TaskOccurrenceCompactList
 -> TaskQuickSurface
```

Capsule/Home/Schedule then compose the owner Quick Surface according to host needs. The host may render the measurement dialog, but Task owns the decision and Goal owns aggregation.

This ticket is the first implementation slice of ADR-112.

---

# 9. Phase 4 — Schedule / Planner convergence

## Product target

Schedule is the temporal planning owner, not another Task editor.

### PVC-SCHED-4001 — Calendar surface audit

**Status:** second-pass discovery complete.

Evidence: [Remaining Modules Full Surface / UI Audit](../../analysis/2026-09-29-product-vnext-remaining-modules-full-surface-audit.md).

Verified direction:

- keep Calendar-specific Day / Week / Month + period-navigation toolbar as a legal specialized surface;
- converge gutters, states and semantic presentation without forcing a Goal-style header;
- keep owner-projection mutation routing;
- reuse the existing edit-capable `CreateScheduleDialog` for Schedule-owned CalendarEntry edit;
- expose CalendarEntry edit/delete from event inspect;
- keep Routine projections read-only until Routine owns a canonical single-occurrence override;
- route Task completion through the canonical Task occurrence action coordinator rather than direct `completeOccurrence(id)` calls.

### PVC-SCHED-4101 — Create/edit temporal surface convergence

Reuse canonical date/date-time surfaces while preserving exact Instant/Ymd semantics.

### PVC-SCHED-4201 — Dialog-based inspect + owner Quick Surface composition

Resolved interaction family:

- direct calendar interaction for move/resize/high-frequency selection;
- `PlannerDayDialog` / `PlannerEventDialog` are the default inspect containers inside BusinessPanel;
- Sheet is reserved for narrow/container-specific cases, not the default right-on-right layer;
- Schedule-owned CalendarEntry can enter edit/delete from inspect;
- Task occurrence content reuses Task Quick Surface and Task action coordinator;
- Goal/Routine projections use owner quick/context surfaces and delegate mutation to the owner;
- no new page is introduced merely for event metadata.

Also converge duplicated source-dot/source-badge mappings into one Schedule projection presentation authority.

---

# 10. Phase 5 — Routine convergence

## Product target

Routine is a Coach/runtime configuration domain, not a generic reminder CRUD page.

### PVC-ROUTINE-5001 — Routine configuration audit

**Status:** second-pass discovery complete.

Verified direction:

- preserve Profile / Membership / Runtime / TemporaryOverride ownership;
- keep Method Library and compact Routine rows;
- keep the h-11 configuration-toolbar family as a legal compact variant;
- reduce persistent toolbar administration density by moving low-frequency Profile CRUD into the Profile menu;
- replace native WallClock date/time controls with Product Time controls;
- replace free-text IANA timezone entry with a canonical searchable timezone selector/default-to-Product-Time flow;
- preserve host capability gating and unsupported-on-Web behavior.

### PVC-ROUTINE-5101 — Configuration/direct-manipulation convergence

Apply the product grammar without erasing Routine host/runtime boundaries.

### PVC-ROUTINE-5201 — Intervention surface review

Separately audit OS Notification / Mini Window / Guided Break / Focus Window; these are runtime surfaces and must not be collapsed into the configuration UI.

---

# 11. Phase 6 — Knowledge / Repository convergence

## Product target

Knowledge remains a projected repository/document owner, not an embedded Goal/Task note editor.

### PVC-KNOW-6001 — Repository workspace audit

**Status:** second-pass discovery complete.

Verified direction:

- keep `Catalog | Content | Context` as a specialized document workspace;
- keep Web read/search/link-only and Desktop external-editor capability boundaries;
- converge Web/Desktop toolbar, catalog-row, selection, loading/error/empty and source-status presentation where semantics are shared;
- replace the native connection `<select>` with the standard selector grammar;
- do not add a Goal-style max-width entity page or resurrect built-in Markdown editing.

### PVC-KNOW-6101 — Note capsule and quick-access contract

Keep quick workspace retrieval-oriented.

Web capsule should not reintroduce a separate “quick create Note” path if authoritative write capability is not owned by that surface.

### PVC-KNOW-6201 — Stable reference interaction

Make “projected note” vs “stable durable reference” understandable without leaking backend terminology.

---

# 12. Phase 7 — Notification + Settings convergence

## PVC-NOTIF-7001 — Notification center audit

**Status:** second-pass discovery complete.

Verified direction:

- converge Inbox onto the shared Collection surface grammar while preserving unread/archive semantics;
- keep typed owner actions and `read != business completion`;
- make Web browser-system notification click use the same typed destination resolver as in-app/Desktop;
- move category/source colors onto shared semantic tone mapping;
- keep SSE Monitor dev/diagnostic scoped rather than styling it as a normal Inbox page.

## PVC-SET-7101 — Settings visual convergence

**Status:** second-pass discovery complete.

Do not redesign Settings domain ownership or its sidebar/Sheet scene.

Converge section internals toward:

- `SettingsSection`;
- `SettingsPropertyRow`;
- `SettingsStatusBlock`;
- `SettingsObjectCard` only for real bounded objects;
- `SettingsDangerZone`;
- Product/Settings dialog shell based on the canonical dialog primitives.

Reduce the current card-heavy presentation, replace visible native selects, and migrate raw amber/emerald/green feedback to semantic tokens.

Account remains a Settings capability surface; `/account -> /settings?tab=account` stays canonical. Auth identity remains separate.

---

# 13. Phase 8 — Native Surface Orchestration + Governance retirement decision

## Product target

ADR-112 changes the AI convergence target: AI does not maintain a parallel Goal/Task/Knowledge product editor. It orchestrates owner-native business surfaces through typed semantic actions.

ADR-113 retires Product Governance Runtime while preserving repository-native Engineering Governance.

### PVC-GOV-7901 — Product Governance retirement decision / inventory

**Status:** GOV-7901 inventory accepted / frozen; GOV-7903 retirement complete (2026-10-03).

Do not reintroduce Product Governance UI/runtime surfaces; `Governance` now denotes Engineering Governance only.

Inventory and classify:

- Product Governance runtime/contracts/UI/DB/DI/build references;
- Engineering Governance assets that must remain;
- current rule-bundle adapter inputs that depend on Product Governance;
- AGENT/reference-module policy dependencies.

GOV-7902 established repository-native Engineering Governance inputs. GOV-7903 has completed physical removal and permanent negative locks against reintroduction.

### PVC-GOV-7903 — Destructive retirement closure

**Status (2026-10-03): Complete / implemented / validated.** Product package/contracts/UI/Prisma/PowerSync/transport/DI, the legacy bundle bridge, and remaining Docker/env/workspace/test slots are removed. Engineering Governance remains repository-native. Evidence: all 12 affected typechecks and dependency builds, three host builds, ten package test targets, 57 focused App-Vue tests, 199 Engineering Governance tests, full uncached governance, inventory/lockfile/sync/lint/diff checks and zero live runtime/config references pass. Full suites retain four unrelated Shell/Task failures and one Goal index failure; local prod-like runtime smoke was not performed because this worktree lacks its encryption key. See [exact commands, baseline failures and historical-reference limits](../archive/2026-10-03-pvc-gov-7903-retirement-closure.md).

### PVC-AI-8001 — Owner Native Edit Session + Surface Orchestrator foundation

**Status (2026-10-01): Accepted / frozen.** ADR-112 now has a concrete Goal reference implementation. The shell exposes a typed owner-native surface handle, GoalModuleLayout lifecycle-registers the live owner session, and GoalDialog adapts its existing canonical draft without exposing reactive/component internals. Manual edits and semantic patch/add/remove/focus operate on the same draft; submit/cancel, validation, dirty/busy state, lifecycle legality, route/tab leave guards, aggregate readiness, stale response rejection and KeepAlive cleanup remain owner/shell controlled.

Mastra `draftRef / revision / receipt / referenceMap` remain runtime-internal. AI Goal workflow/editor migration is intentionally deferred to AI-8101.

Evidence: [AI-8001 Owner Native Edit Session](../archive/2026-10-01-pvc-ai-8001-owner-native-edit-session.md).

### PVC-AI-8101 — Goal native workflow vertical slice

Replace AI-only Goal/KR editing for one end-to-end `goal.create` path:

```text
chat request
 -> Mastra proposal
 -> open native Goal create surface
 -> AI patches native edit session
 -> user edits/approves
 -> owner command
 -> canonical Goal
```

Do not delete `AIGoalDraftEditor` until restart/retry/recovery/approval parity is proven.

### PVC-AI-8111 — Task + Knowledge native workflow migration

After Goal proves the surface contract:

- migrate `task.create` into native Task create/edit surface;
- migrate `knowledge.capture` into native Knowledge surface;
- reuse Task→KR three-mode completion/record language where relevant;
- move runtime IDs/receipts to diagnostics.

### PVC-AI-8121 — Retire AI-owned product editors and evaluate workflow surface

Only after Goal/Task/Knowledge native parity:

- retire `AIGoalDraftEditor` / `AITaskDraftEditor` and equivalent AI-only product editing paths;
- keep clarification/recovery/execution diagnostics;
- migrate workflow attention/dirty/busy semantics to native sessions;
- then evaluate removing `BusinessPanel.workflow`.

The workflow surface is not deleted earlier.

### PVC-SHELL-8201 — Capsule convergence

**Status (2026-10-01): Accepted / frozen.** All six capsule owner families now share the host chrome through `CapsulePreviewShell`, `CapsulePreviewHeader`, `CapsulePreviewFooter` and `CapsulePreviewState`. Task reaches the grammar through `TaskQuickSurface`; Goal, Schedule, Routine, Notification and Knowledge/Note consume it directly. Schedule was the final production migration. Shared primitives remain presentation-only: no owner contracts, business iteration or owner actions were promoted into a universal row.

Protected behavior remains unchanged:

- hover/pinned dismissal;
- focus behavior;
- stale-window query reuse;
- repeated request avoidance;
- owner navigation;
- Task occurrence actions through the canonical Task action coordinator;
- Schedule Product Time, source identity, selection and view-all behavior.

Evidence: [SHELL-8201 capsule host shell convergence](../archive/2026-10-01-pvc-shell-8201-capsule-host-shell.md).

---

# 14. Phase 9 — Product-wide drift closure

The second-pass full-surface audit defines the convergence model as **shared grammar, specialized surfaces, owner-canonical actions**.

Before final cleanup, formalize the legal surface families:

1. Collection;
2. Entity workspace;
3. Create/edit configuration;
4. Inspect overlay;
5. Document workspace;
6. Calendar workspace;
7. Settings scene;
8. AI collaborator;
9. Diagnostic/developer surface.

Then close drift:

1. document legal header/toolbar variants rather than forcing one literal height;
2. eliminate duplicated toolbar/filter recipes within the same surface family;
3. eliminate duplicated metadata/property/status recipes where semantics match;
4. converge collection/workspace/dialog loading-error-empty presentation;
5. normalize semantic tokens/elevation and owner/source tone mapping;
6. remove retired/alternate views/components only after parity evidence;
7. preserve redirects/mappings when routes are retired;
8. remove temporary compatibility code after migration windows;
9. run the representative screenshot matrix;
10. run accessibility/focus/keyboard pass;
11. run narrow/wide container, light/dark and zh-CN/en-US representative checks;
12. profile high-frequency UI queries, shell previews and hover surfaces;
13. archive superseded product/active-plan docs.

---

# 15. Verification matrix

## Focused unit/component

Per ticket:

```bash
pnpm exec vitest run <focused specs>
```

## App Vue

```bash
pnpm nx run app-vue:typecheck
pnpm nx run app-vue:test
```

Use existing shard commands where the repository CI expects them.

## Web

```bash
pnpm nx run web:build
```

Run the relevant Playwright flows for changed owner surfaces.

## Domain/contracts

For logic changes such as Review window resolution / Record semantics:

- Goal contract tests;
- Goal domain/service tests;
- API/controller tests where contract behavior changes;
- persistence tests if stored review context changes.

## Diff hygiene

```bash
git diff --check
git status --short
```

No debug screenshots, generated noise or unrelated formatting churn in commits.

---

# 16. Review protocol

Every module batch gets a five-layer review:

1. contract correctness;
2. vertical completeness;
3. behavior states;
4. engineering quality;
5. product convergence.

Findings are classified:

- P0 blocker;
- P1 major;
- P2 normal;
- P3 polish.

A visual mismatch is not automatically P1; severity depends on whether it breaks interaction hierarchy, reachability, accessibility or the product contract.

---

# 17. Non-goals

This cycle does **not** mean:

- rewriting the entire frontend framework;
- replacing Reka/shadcn;
- making every module look identical;
- forcing one page template onto Calendar/Knowledge/AI;
- merging Task/Routine/Schedule domain semantics;
- converting AI into the owner of product state;
- introducing new social/team project-management concepts;
- redesigning already-settled persistence merely for visual uniformity.

---

# 18. Dependency order

```text
PR #398 merged / PVC-0001 complete
        ↓
PVC-0002..0003
        ↓
Goal 1101..1601
        ↓
UI 2101..2105
        ↓
second-pass discovery closure:
TASK-3001 + Task deep audit
SCHED-4001
ROUTINE-5001
KNOW-6001
NOTIF-7001
SET-7101
GOV-7901
AI-8001
+ Remaining Modules Full Surface / UI Audit
        ↓
root-cause / owner-correct vertical slices
TASK-3002 / TASK-3401 / TASK-3301
SCHED-4201
Goal Record/Review closure
        ↓
AI native-surface foundation
AI-8001
        ↓
Goal native workflow vertical slice
AI-8101
        ↓
Task / Knowledge native workflow migration
AI-8111
        ↓
AI-owned editor / workflow-surface retirement evaluation
AI-8121
        ↓
bounded module visual convergence batches
        ↓
Phase 9 product-wide grammar + visual regression closure

Completed parallel closure:
GOV-7903 Product Governance destructive retirement (2026-10-03)
```

The broad module audits are now discovery-complete. Do not reopen them as generic discovery unless implementation uncovers contradictory evidence. Implementation migrations should be grouped by root cause and owner contract; shared primitives are promoted only after multiple converged surfaces prove the same grammar.

---

# 19. Immediate next actions

Execution-level ticket breakdown: [Product vNext Execution Master Plan](./2026-09-29-product-vnext-execution-master-plan.md).

1. Keep `product/vnext-convergence` on top of the current `main` baseline.
2. Preserve the updated Goal and Task product North Stars frozen on 2026-09-29.
3. Treat the Task second-pass audit, Remaining Modules Full Surface / UI Audit, ADR-112 and the Native Surface product doc as discovery-complete evidence.
4. Start implementation with the Task lifecycle correctness batch (`TASK-3002A/B/C/D`), while small independent Goal tickets (`GOAL-1101/1104/1401`) may run in parallel.
5. After lifecycle truth is stable, implement Task Home/Quick Surface/action coordinator and the Goal Record foundation required by Task→KR measurement.
6. Migrate Schedule day/event inspect toward Dialog + owner Quick Surface composition only after the Task Quick/action contract is available.
7. Define Owner Native Edit Session / Surface Orchestrator and prove it with Goal before migrating Task/Knowledge AI workflows.
8. Keep Product Governance retired; Engineering Governance remains repository-native and product-neutral.
9. Promote shared UI primitives only after two or more real surfaces demonstrate stable identical grammar.
10. Make deterministic visual regression part of closure, not an informal screenshot exercise.

# 20. Discovery references

- [Product vNext Execution Master Plan](./2026-09-29-product-vnext-execution-master-plan.md)
- [Goal vNext Workspace & Create UI](../../product/goal-vnext-workspace-and-create-ui.md)
- [Cross-module convergence audit](../../analysis/2026-09-29-product-vnext-module-convergence-audit.md)
- [Task vNext second-pass deep audit](../../analysis/2026-09-29-task-vnext-second-pass-deep-audit.md)
- [Remaining Modules Full Surface / UI Audit](../../analysis/2026-09-29-product-vnext-remaining-modules-full-surface-audit.md)
- [Native Surface Orchestration + Quick Surface vNext](../../product/native-surface-orchestration-and-quick-surfaces.md)
- [ADR-112 Owner Native Surface Orchestration](../../architecture/adr/ADR-112-owner-native-surface-orchestration-and-quick-surface-reuse.md)
- [ADR-113 Product Governance retirement decision](../../architecture/adr/ADR-113-retire-product-governance-runtime-keep-engineering-governance.md)
- [Workspace UI contract](../../product/workspace-ui.md)
- [Task vNext](../../product/task-vnext-plan-occurrence-workspace.md)
- [Routine Coach vNext](../../product/routine-coach-vnext.md)
- [Schedule / Planner / Scheduler vNext](../../product/schedule-planner-scheduler-vnext.md)
- [Notification vNext](../../product/notification-vnext.md)
- [Knowledge Repository vNext](../../product/knowledge-repository-vnext.md)
- [Settings Hub vNext](../../product/setting-vnext-settings-hub.md)
