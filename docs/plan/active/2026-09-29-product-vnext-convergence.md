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
+ optional AI assistance
+ shared product primitives only after a reference flow is proven
```

Goal is the first **reference implementation**, not the only scope.

The overall sequence is:

```text
freeze current integration baseline
        ↓
finish Goal KR -> Record -> Review vertical loop
        ↓
extract only the shared grammar proven by Goal
        ↓
audit and converge Task / Schedule / Routine / Knowledge / Notification / Settings / AI
        ↓
product-wide drift closure
        ↓
visual regression + interaction regression gate
```

The plan deliberately avoids premature “one universal entity component” abstractions. Shared primitives are promoted only after at least two real product surfaces demonstrate the same stable interaction grammar.

---

# 1. Target outcome

A user should experience MemoFlow as one coherent product even when moving between Goal, Task, Schedule, Routine, Knowledge, Notification and AI.

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
10. core surfaces have deterministic screenshot and interaction regression coverage.

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
| --- | --- | --- |
| Sum | 累计 | 本次增加 |
| Average | 平均值 | 本次测量 |
| Max | 最高值 | 本次测量 |
| Min | 最低值 | 本次测量 |
| Last | 最新值 | 当前值 |

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

Candidate shared pieces:

- `ProductEntityIdentity`
- `ProductMetadataRow`
- `ProductMetadataChip`
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

Remove repeated raw palette/elevation recipes from feature surfaces where semantic tokens cover the intent.

### PVC-UI-2105 — Visual regression harness

Promote Phase-0 screenshots into CI/review gates for core surfaces.

---

# 8. Phase 3 — Task convergence

## Product target

Keep Task’s canonical Plan/Occurrence split while making the UI behave like the same product as Goal.

Primary paths:

```text
Task create
Task list / Today / Upcoming
Task Plan workspace
Occurrence quick execution
Checklist
Goal/KR contribution context
```

## Audit/implementation tickets

### PVC-TASK-3001 — Task surface audit

Review:

- create dialog density;
- property-chip semantics;
- Plan vs Occurrence language;
- Task list row density;
- Task Detail direct manipulation;
- checklist editing;
- reminder/date/recurrence surfaces;
- Goal/KR binding;
- deep navigation;
- empty/loading/error behavior.

Deliverable: verified drift ledger and bounded migration set.

### PVC-TASK-3101 — Align Task create/detail grammar

Reuse only the primitives proven by Goal while preserving Task-owned Plan/Occurrence semantics.

### PVC-TASK-3201 — Occurrence execution surface

Ensure complete/skip/missed/checklist actions remain quick and do not route through Plan editing.

### PVC-TASK-3301 — Task/Goal contribution clarity

Make it visually clear when a Task contributes to a KR versus merely being related to a Goal.

---

# 9. Phase 4 — Schedule / Planner convergence

## Product target

Schedule is the temporal planning owner, not another Task editor.

### PVC-SCHED-4001 — Calendar surface audit

Review:

- toolbar variants;
- view switch;
- period navigation;
- event/card density;
- drag/drop mutation behavior;
- collision/error feedback;
- selection/create behavior;
- mobile/narrow panel behavior.

### PVC-SCHED-4101 — Create/edit temporal surface convergence

Reuse canonical date/date-time surfaces while preserving exact Instant/Ymd semantics.

### PVC-SCHED-4201 — Inspect vs edit surfaces

Decide which event information belongs in:

- direct calendar interaction;
- Sheet;
- Dialog;
- cross-module owner navigation.

No new page should be introduced merely for event metadata.

---

# 10. Phase 5 — Routine convergence

## Product target

Routine is a Coach/runtime configuration domain, not a generic reminder CRUD page.

### PVC-ROUTINE-5001 — Routine configuration audit

Review:

- Profile vs Routine hierarchy;
- method library;
- configuration center density;
- inline enable/disable;
- runtime-active vs configured state;
- web unsupported capability handling;
- temporary overrides;
- capsule quick workspace.

### PVC-ROUTINE-5101 — Configuration/direct-manipulation convergence

Apply the product grammar without erasing Routine host/runtime boundaries.

### PVC-ROUTINE-5201 — Intervention surface review

Separately audit OS Notification / Mini Window / Guided Break / Focus Window; these are runtime surfaces and must not be collapsed into the configuration UI.

---

# 11. Phase 6 — Knowledge / Repository convergence

## Product target

Knowledge remains a projected repository/document owner, not an embedded Goal/Task note editor.

### PVC-KNOW-6001 — Repository workspace audit

Review:

- catalog tree;
- document toolbar;
- context panel;
- stable reference state;
- hidden directory behavior;
- loading/retry/error;
- narrow-panel behavior;
- source connection health.

### PVC-KNOW-6101 — Note capsule and quick-access contract

Keep quick workspace retrieval-oriented.

Web capsule should not reintroduce a separate “quick create Note” path if authoritative write capability is not owned by that surface.

### PVC-KNOW-6201 — Stable reference interaction

Make “projected note” vs “stable durable reference” understandable without leaking backend terminology.

---

# 12. Phase 7 — Notification + Settings convergence

## PVC-NOTIF-7001 — Notification center audit

Review:

- unread/read filtering;
- actionability;
- compact row density;
- navigation target;
- browser/system delivery preferences;
- capsule preview;
- read state/update latency.

## PVC-SET-7101 — Settings visual convergence

Do not redesign Settings domain ownership.

Converge only:

- navigation/chrome;
- property rows;
- status/connection surfaces;
- loading/error states;
- responsive presentation.

The existing six-group Settings Hub and owner boundaries remain protected.

---

# 13. Phase 8 — AI / shell convergence

## Product target

AI remains a first-class interaction surface but uses the same product objects and owner actions.

### PVC-AI-8001 — AI chat/composer audit

Review:

- attachment/context adding;
- pasted image behavior;
- referenced Goal/Task/Knowledge context;
- automatic intent recognition;
- model selection density;
- tool/action confirmation;
- narrow-column behavior.

### PVC-AI-8101 — Goal/Task action presentation

AI-generated Goal/KR/Task drafts should reuse the same user-facing concepts as manual owner surfaces; no parallel “AI-only form language”.

### PVC-SHELL-8201 — Capsule convergence

Audit all capsule previews for:

- hover/pinned dismissal;
- stale-window query reuse;
- repeated request avoidance;
- quick actions;
- consistent header/list/footer density;
- owner navigation.

---

# 14. Phase 9 — Product-wide drift closure

Only after the module vertical slices are complete:

1. eliminate duplicated toolbar recipes;
2. eliminate duplicated metadata chip recipes;
3. normalize semantic tokens/elevation;
4. remove retired views/components;
5. remove dead route rendering while preserving redirects/mappings;
6. remove temporary compatibility code after migration window;
7. run full visual matrix;
8. run accessibility/focus pass;
9. profile high-frequency UI queries and hover surfaces;
10. archive superseded product/active-plan docs.

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
parallel module audits:
TASK-3001
SCHED-4001
ROUTINE-5001
KNOW-6001
NOTIF-7001
SET-7101
AI-8001
        ↓
bounded module convergence batches
        ↓
Phase 9 global drift closure
```

Module audits may run in parallel after the Goal interaction contract is stable enough to compare against; implementation migrations should not all begin simultaneously before shared-primitives decisions are reviewed.

---

# 19. Immediate next actions

1. Keep `product/vnext-convergence` on top of the current `main` baseline.
2. Preserve the updated Goal product North Star frozen on 2026-09-29.
3. Continue the focused audits for Task, Routine, Schedule, Knowledge, Notification, Settings and AI.
4. Produce one verified module drift ledger per owner before implementing its convergence batch.
5. Begin implementation with Goal create Reminder removal + KR/Record/Review closure.

# 20. Discovery references

- [Goal vNext Workspace & Create UI](../../product/goal-vnext-workspace-and-create-ui.md)
- [Cross-module convergence audit](../../analysis/2026-09-29-product-vnext-module-convergence-audit.md)
- [Task vNext second-pass deep audit](../../analysis/2026-09-29-task-vnext-second-pass-deep-audit.md)
- [Workspace UI contract](../../product/workspace-ui.md)
- [Task vNext](../../product/task-vnext-plan-occurrence-workspace.md)
- [Routine Coach vNext](../../product/routine-coach-vnext.md)
- [Schedule / Planner / Scheduler vNext](../../product/schedule-planner-scheduler-vnext.md)
- [Notification vNext](../../product/notification-vnext.md)
- [Knowledge Repository vNext](../../product/knowledge-repository-vnext.md)
- [Settings Hub vNext](../../product/setting-vnext-settings-hub.md)
