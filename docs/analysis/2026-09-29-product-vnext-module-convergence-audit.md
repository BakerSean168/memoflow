# MemoFlow Product vNext — Cross-module convergence audit

Date: 2026-09-29  
Branch: `product/vnext-convergence`  
Status: discovery / first-pass verified audit

## 1. Scope

This audit compares the current Vue product surfaces with the active product documents and the Goal reference direction frozen on 2026-09-29.

Modules covered:

- Task
- Schedule / Planner
- Routine
- Knowledge / Repository
- Notification
- Settings
- AI / Shell

This is not an implementation checklist. It records current facts, convergence debt, protected behavior and questions that materially affect the next module-specific plans.

---

# 2. Executive findings

The modules are not equally unfinished.

## Already relatively converged

- **Task**: create uses property chips; Plan/Occurrence semantics are explicit; Goal/KR binding exists; direct-manipulation detail work is already substantial.
- **Knowledge**: the current Catalog → Content → Context implementation closely matches the vNext product document.
- **Notification**: inbox density, inline actions, realtime/server-state ownership and browser presentation are mostly coherent.
- **Settings**: information architecture and owner boundaries are already mature.

## Highest-value remaining convergence work

1. **Goal closure** — KR / Record / Review is still the reference-flow blocker.
2. **Routine temporal UI** — current editor still uses native `type="date"` / `type="time"` controls and has an overloaded toolbar.
3. **Task logic/presentation cleanup** — current Goal-scoped filter exposes raw IDs and list reads use very broad 500-item fetches.
4. **Schedule product grammar** — calendar is strong, but toolbar and create/edit chrome still form a parallel visual system.
5. **AI surface architecture** — product capabilities are good, but view/composer orchestration is large and some rendering paths duplicate the same component tree.
6. **Settings/Knowledge component ownership** — several very large components combine orchestration and presentation even though domain ownership is already correct.

---

# 3. Task

> Second-pass deep audit: [Task vNext — Second-pass deep audit](./2026-09-29-task-vnext-second-pass-deep-audit.md). The focused audit supersedes this section for Task-specific severity and repair ordering; the summary below remains the cross-module comparison.

## 3.1 Current facts

Current surfaces:

```text
/tasks
  ├─ Today
  ├─ Upcoming
  └─ Plans

/tasks/:id
  └─ Task Plan workspace
```

Second-pass product target removes the duplicated Upcoming surface and converges Task Home to `Today | Plans`; future browsing hands off to Schedule / Calendar.

The Task create dialog already follows the current vNext direction:

- `ProductDialogShell`;
- title/description identity;
- property chips for schedule / recurrence / Goal / reminder / importance / labels;
- Checklist remains a first-class section;
- Goal/KR binding is owner-aware.

Task Detail already uses:

- inline title/description;
- property chips;
- direct property popovers;
- metadata rows similar to Goal.

## 3.2 Good decisions to protect

- Keep `TaskPlan` vs `TaskOccurrence` semantic split.
- Keep Today occurrence actions fast and separate from Plan configuration; future temporal browsing belongs to Schedule.
- Keep `/tasks/:id` as a real workspace route. Unlike KR-inside-Goal, a Task Plan is its own owner context.
- Keep Goal/KR relations as cross-owner references, not Goal-owned Task state.
- Keep Checklist definition vs occurrence checklist snapshots separate.

## 3.3 Verified drift / gaps

### TASK-A1 — Goal scope label leaks raw IDs

Current `TaskManagementView` produces a label shaped like:

```text
Goal <goalId> · KR <keyResultId>
```

This is an implementation identifier, not product context.

Desired:

- resolve Goal name;
- if scoped to KR, resolve KR title;
- preserve filter scope even when the referenced object is no longer in the first local list page.

Severity: P2 product clarity.

### TASK-A2 — broad list/range reads

Current management loads:

```text
Task plans limit = 500
Occurrences page/limit = 500
```

This is acceptable for small current data but violates the direction used by Knowledge and other server-state convergence work: scale should not depend on fetching an effectively unbounded local set.

The next Task plan should review:

- surface-specific range query for occurrences;
- cursor/page ownership;
- filtered Plan query;
- whether count and visible rows can be server-derived.

Severity: P2 performance/logic debt.

### TASK-A3 — duplicated detail grammar with Goal

Task Detail and Goal Detail now implement the same:

- identity;
- property row;
- “More properties”;
- metadata rows;
- inline description;
- badges/chips;

but own the markup independently.

Do **not** extract immediately. First finish Goal, then compare concrete interaction contracts.

Severity: P2 maintainability/drift source.

### TASK-A4 — popover chrome is locally repeated

Task create/detail repeat:

```text
rounded-xl
border-border/80
shadow-xl
fixed per-property widths
max-h 70vh
```

Candidate for shared overlay recipe after Goal closure.

Severity: P3 now; becomes P2 if more surfaces copy it.

## 3.4 Preliminary Task direction

Task does not need a fundamental navigation redesign.

The likely next pass is:

```text
logic query cleanup
+ Goal/KR context naming
+ shared metadata grammar adoption
+ occurrence execution refinement
+ create/detail visual convergence
```

---

# 4. Schedule / Planner

## 4.1 Current facts

Current main route:

```text
/schedule/calendar
```

The page already provides:

- Day / Week / Month;
- period navigation;
- FullCalendar projection;
- owner-specific mutation routing;
- Task event action Sheet;
- generic event detail Sheet;
- day detail Sheet;
- create Schedule Dialog;
- exact date/date-time shared picker usage.

The Planner owner command router already protects owner boundaries for Schedule / Task / Goal mutation.

## 4.2 Good decisions to protect

- Planner consumes unified projections; it does not become owner of Task/Goal state.
- Task reschedule remains Task-owned.
- Goal time projection remains Goal-owned.
- Schedule exact-time semantics remain exact time semantics.
- Sheet/Dialog overlays are preferable to adding event-detail routes.

## 4.3 Verified drift / gaps

### SCHED-A1 — toolbar is a parallel visual grammar

Schedule owns a custom toolbar recipe:

- `min-h-14`;
- custom semantic surface background;
- custom shadow;
- custom rounded previous/next controls;
- custom view tabs.

The interactions are good, but the visual grammar is independent from Task/Goal/Notification.

This is the clearest candidate for the future `ProductModuleToolbar(collection)` contract.

Severity: P2 visual convergence.

### SCHED-A2 — create dialog has its own “time card” language

`CreateScheduleDialog` combines:

- identity;
- a bordered Time panel;
- DateTime picker dialogs;
- optional property chips;
- conflict setting card.

This is not wrong, because time is the primary domain of Schedule. It should **not** be forced to look identical to Goal Create.

The convergence question is narrower:

> Can identity, optional-property chips, dialog shell and temporal overlays share product grammar while Schedule keeps a domain-specific central time editor?

Likely answer: yes.

### SCHED-A3 — DateTime picker still owns separate presentation chrome

Schedule uses `ProductDateTimePicker`, while Goal/Task exact-date surfaces increasingly share `ProductTemporalPickerSurface`.

Do not merge semantics. Review whether calendar shell/elevation/header can be shared without changing `Instant` behavior.

Severity: P2 shared-surface drift.

### SCHED-A4 — mutation UX needs dedicated behavioral regression

Past user-visible failures included duplicate/conflict behavior on drag.

Current code now routes mutations through `createPlannerOwnerCommandRouter`, which is the right boundary. The next pass needs explicit behavioral fixtures for:

- drag success;
- drag rollback;
- optimistic/authoritative projection convergence;
- duplicate mutation/idempotency;
- conflict error;
- Task occurrence vs Schedule event behavior.

Severity: P1 if still reproducible, otherwise P2 hardening.

---

# 5. Routine

## 5.1 Current facts

Routine has a single product route:

```text
/routines
```

This is already consistent with the desired “configuration center, not deep page hierarchy” direction.

Current surface contains:

- state segmented filter;
- global/profile enabled state;
- Profile picker;
- create menu + method library;
- Routine rows;
- create/edit Routine Dialog;
- Profile Dialog;
- local-runtime capability hints;
- capsule quick workspace.

The Routine editor already uses `ProductPropertyChip` heavily.

## 5.2 Good decisions to protect

- No standalone Routine detail page.
- Web must not pretend to own local ActivitySensor capability.
- Profile configured/enabled/active state remains distinct.
- Method Library is an onboarding/configuration aid, not a new domain owner.
- Intervention runtime surfaces remain separate from configuration UI.

## 5.3 Verified drift / gaps

### ROUTINE-A1 — native date/time controls bypass product-time UI

Current `RoutineEditorDialog` still contains:

```html
<input type="time">
<input type="date">
```

This bypasses:

- MemoFlow temporal presentation;
- shared locale behavior;
- shared date picker keyboard/focus behavior;
- current visual grammar.

The next Routine pass should migrate WallClock start date/time to shared exact-time primitives while preserving Routine trigger semantics.

Severity: P1 product consistency / internationalization.

### ROUTINE-A2 — top toolbar is overloaded

At one time the toolbar may contain:

- state segmented filter;
- global/profile enable toggle;
- paused badge;
- profile picker;
- create dropdown.

It is only 44px high and lacks the responsive compaction pattern used by Task.

At narrow business-panel widths this has a high risk of crowding.

Recommended audit direction:

- state/view controls left;
- current scope/profile context;
- primary Create action;
- move low-frequency profile management into scoped menu/dialog;
- retain enabled state but decide whether it belongs in row/header context.

Severity: P2 UX density.

### ROUTINE-A3 — editor is one very large component

`RoutineEditorDialog.vue` is ~840 lines and owns:

- three trigger variants;
- memberships;
- local runtime hints;
- recurrence;
- intervention policy;
- form validation/persistence presentation.

This is not automatically wrong, but it increases drift risk.

Split only by stable domain sub-surface:

- Trigger editor;
- Profile membership;
- Intervention policy;
- schedule/date row.

Do not split merely by line count.

Severity: P2 maintainability.

---

# 6. Knowledge / Repository

## 6.1 Current facts

Current implementation is notably aligned with the product doc.

It already has:

```text
Catalog | Content | Context
```

and:

- single document toolbar;
- Obsidian-style lazy tree;
- search mode;
- hidden-directory support;
- stable-reference action under More;
- Context inline on wide panel;
- left/right Sheets on narrow panel;
- projection-only Web;
- no embedded Markdown editor;
- recent-note cache with stale window;
- stable `knowledgeDocumentId` separate from projection/path.

## 6.2 Good decisions to protect

This module should **not** be redesigned to match Goal/Task detail.

Knowledge is a document workspace and legitimately needs a document-toolbar variant.

Protect:

- content-first reading;
- browse/search catalog;
- lazy tree;
- stable reference identity;
- Web projection-only behavior;
- Desktop external-editor ownership.

## 6.3 Verified drift / gaps

### KNOW-A1 — native connection `select`

`KnowledgeNoteCatalog` still uses a raw native `<select>` when multiple connections exist.

This is a small but clear interaction/style exception.

Migrate to shared Select/Dropdown only if keyboard/accessibility semantics remain equivalent.

Severity: P3.

### KNOW-A2 — workspace orchestration concentration

`KnowledgeProjectionWorkspaceView.vue` is ~1169 lines and coordinates:

- connection state;
- tree;
- search;
- detail;
- routing;
- context panel;
- adoption;
- narrow layout.

The business model is correct; the remaining issue is ownership inside the frontend.

A later refactor can separate:

```text
workspace orchestration
catalog state
selected document state
adoption operation
layout presentation
```

without changing the product surface.

Severity: P2 maintainability.

### KNOW-A3 — quick Note creation must remain absent on Web

The current route documentation correctly states:

> existing-note editing is intentionally absent; Desktop delegates edits to Obsidian and Web remains projection-only.

The shell Note capsule should remain retrieval-oriented.

This is a protected non-feature, not missing UI.

---

# 7. Notification

## 7.1 Current facts

The Notification center is already relatively mature:

- All / Unread filter only;
- compact rows;
- skeleton instead of full-page spinner;
- inline quick actions;
- owner-command actions;
- mark-all-read;
- realtime query invalidation;
- browser system notification presentation;
- device-local browser presentation preference.

## 7.2 Good decisions to protect

- Notification Fact remains server-owned.
- Browser/native popup is a presentation of an existing fact, not another canonical channel.
- Owner mutation stays typed and delegated.
- Center remains an inbox, not Operations/worker diagnostics.

## 7.3 Verified drift / gaps

### NOTIF-A1 — raw palette classes remain

`NotificationItem.vue` contains:

```text
bg-purple-500/10 text-purple-500
bg-cyan-500/10 text-cyan-500
```

This bypasses the semantic token policy.

Introduce semantic category/tone presentation or map to existing semantic tokens.

Severity: P2 design-system drift.

### NOTIF-A2 — browser popup click loses entity destination

The in-app row resolves an owner destination via `resolveNotificationDestination()`.

The browser system popup currently navigates generically to:

```text
/notifications
```

instead of the related Goal/Task/Routine/Schedule destination.

A better browser presentation should carry/resolve the same safe navigation intent when possible.

Severity: P2 interaction logic.

### NOTIF-A3 — center toolbar should become the collection-toolbar reference

The Notification toolbar already shares much of Goal/Task’s single-row pattern and is a useful candidate when formalizing the collection toolbar variant.

No wholesale Notification redesign is required.

---

# 8. Settings

## 8.1 Current facts

The Settings Hub architecture is strong:

- six stable groups;
- separate settings scene;
- container-resolved narrow mode;
- lazy section loading;
- stable `?tab=` contract;
- owner-specific sections.

The product doc’s ownership model should remain authoritative.

## 8.2 Verified drift / gaps

### SET-A1 — two large owner panels dominate frontend complexity

Current sizes:

- `KnowledgeRepositorySettings.vue` ~1199 lines;
- `AISettings.vue` ~852 lines.

The problem is not Settings architecture; it is local component responsibility.

Future split should follow workflows:

AI:
- provider list;
- provider onboarding flow;
- connection/model probe;
- defaults.

Knowledge:
- connection summary;
- installation/repository selection;
- health/reconciliation;
- disconnect confirmation.

Severity: P2 maintainability.

### SET-A2 — raw DialogContent bypasses product dialog shell

AI onboarding and Knowledge disconnect still use raw `DialogContent`.

Not every specialized workflow must use `ProductDialogShell`, but this should be an explicit exception.

Review:

- motion;
- header/footer spacing;
- focus behavior;
- max-height;
- narrow layout.

If equivalent, migrate to shared shell/recipe.

Severity: P2 visual/behavior drift.

### SET-A3 — do not force Settings into business-module toolbar grammar

Settings is a separate scene and has a different information architecture.

Its compact header / sidebar navigation should remain separate from business-panel collection toolbar abstractions.

---

# 9. AI

## 9.1 Current facts

Several recently requested behaviors are already present:

- automatic workflow intent inference via `inferWorkflowMode`;
- no user-facing explicit “semantic intent selector” required for normal send;
- file attachments;
- pasted image support in composer tests;
- Goal / Task / Knowledge explicit context entities;
- recent entity lists;
- Goal/Task/Knowledge workflow panels;
- `/ai/chat` redirects to the single AI workspace;
- context panel uses shell workflow surface when available.

These should be treated as converged behavior, not reimplemented.

## 9.2 Verified drift / gaps

### AI-A1 — duplicated composer render path

`AIChatView.vue` renders `AIFooterComposer` twice:

- once inside Teleport;
- once in the `v-else` inline path.

The prop/event blocks are duplicated.

A single component with a conditional/disabled Teleport wrapper would reduce drift risk.

Severity: P2 maintainability.

### AI-A2 — view remains orchestration-heavy

`AIChatView.vue` ~650 lines plus:

- `useAIChatView`;
- `useAIChatSession`;
- Goal/Task/Knowledge workflows;
- shell bridge.

This is already partly decomposed. Further refactor should focus on ownership boundaries, not arbitrary splitting.

Candidate separation:

- shell mounting/adaptation;
- conversation surface;
- workflow surface;
- composer adapter.

Severity: P2.

### AI-A3 — AI Goal draft must follow the final Goal product language

After Goal KR/Record/Review closure:

- AI Goal draft editor must use the same KR calculation labels;
- same Goal temporal semantics;
- same create-stage Reminder decision;
- no AI-only duplicate form semantics.

This dependency is why Goal closes before AI convergence implementation.

Severity: P1 consistency once Goal reference changes.

### AI-A4 — raw color/elevation remnants

Examples:

- amber hard-coded warning text;
- raw rgba composer shadows.

These should move to semantic tokens/overlay recipes during final drift closure.

Severity: P3.

---

# 10. Shell / Capsules

## 10.1 Current facts

Recent shell work already addressed:

- hover vs pinned capsule modes;
- delayed hover open/close;
- focus-aware dismissal;
- outside/Escape close;
- stale-window cache reuse in Goal/Task/Routine/Note previews.

Do not re-open this design unless behavior regresses.

## 10.2 Remaining convergence direction

Use capsule surfaces as quick workspaces:

- Goal: attention/progress;
- Task: today execution;
- Routine: upcoming interventions;
- Note: retrieval;
- Notification: inbox preview;
- Schedule: upcoming calendar context.

Do not make every capsule expose the same actions.

The shared contract is interaction/density/cache behavior, not identical content.

---

# 11. Cross-module root causes

The verified findings collapse into six root causes.

## RC-1 — unformalized surface grammar

Symptoms:

- toolbar heights/backgrounds differ;
- local chip recipes;
- local Popover shadow/border widths.

Repair after Goal closure:

- legal toolbar variants;
- metadata row/chip recipe;
- overlay recipe;
- semantic elevation.

## RC-2 — historical native controls remain

Most visible in Routine and Knowledge connection selector.

Repair:

- migrate only where shared primitives preserve domain semantics and accessibility.

## RC-3 — frontend orchestration concentration

Large views/components:

- Task Detail;
- Schedule Calendar/useCalendarView;
- Routine Configuration/Editor;
- Knowledge Workspace;
- AI Chat;
- Settings AI/Knowledge.

Repair:

- split by stable interaction/domain ownership;
- do not line-count refactor.

## RC-4 — query scale shortcuts

Task still relies on broad 500-item reads.

Repair:

- owner-aware server-state query shapes;
- bounded surface queries;
- stable identity resolution for cross-owner scope labels.

## RC-5 — route depth vs inspect depth is inconsistent

Goal currently has KR/Review deep routes that should become compatibility entries.

Other modules should be evaluated by owner boundary:

- Task Plan route: keep;
- Schedule event page: do not add;
- Routine detail page: do not add;
- Knowledge note selection: remain in workspace;
- Notification object detail: navigate to owning module.

## RC-6 — AI/manual UI concepts can drift

AI workflows already have separate draft components.

Once a manual owner surface changes, AI draft/review must consume the same presentation mappings/contracts.

---

# 12. Proposed audit order after Goal closure

1. **Task** — closest to Goal; validates shared entity/detail grammar.
2. **Routine** — strongest temporal/control inconsistency and no deep-page requirement.
3. **Schedule** — validates collection/document-specific toolbar variants and temporal surfaces.
4. **Knowledge** — validates that convergence does not force document workspaces into entity-page shapes.
5. **Notification** — smaller polish/logic pass.
6. **Settings** — ownership-preserving presentation cleanup.
7. **AI/Shell** — update manual/AI concept parity and close product-wide drift.

---

# 13. Decisions that should be made before module-specific implementation

These are not blockers for the Goal phase, but they materially change later plans.

## Q1 — Routine row interaction

Current row click opens the full Routine editor dialog.

Two credible directions:

A. keep “row → editor Dialog” because Routine configuration is inherently a compound rule;  
B. introduce direct inline edits for simple state/trigger fields and reserve Dialog for full policy.

Recommendation for later review: **B only for truly simple properties; keep a configuration Dialog for compound trigger/policy editing.**

## Q2 — Schedule create structure

Current time block is intentionally more prominent than Goal/Task properties.

Recommendation: keep time as a domain-specific primary panel; only converge shell/chips/picker/elevation. Do not force Schedule time into a tiny chip row.

## Q3 — Task Plan detail route

Recommendation: keep it. A Task Plan is its own owner/workspace and is not analogous to a KR nested under Goal.

No user decision is required unless the desired navigation model changes.

---

# 14. Next discovery artifacts

Before implementing each module convergence batch, produce a focused child audit/plan containing:

- current user path;
- source files and owners;
- product-doc comparison;
- verified drift ledger;
- protected contracts;
- screenshot baseline;
- exact implementation tickets;
- regression matrix.

Do not begin all module migrations in parallel merely because their audits can be parallelized.
