---
tags: [plan, archive, ai, goal, shell]
description: PVC-AI-8101 Goal native AI workflow vertical slice implementation plan
created: 2026-10-01T00:00:00+00:00
updated: 2026-10-02T00:00:00+00:00
---

# PVC-AI-8101 — Goal native AI workflow vertical slice

## Objective

Move normal `goal.create` review/editing from `AIGoalDraftEditor` to the real Goal native
create session established by AI-8001, while preserving Mastra durable
restart/retry/recovery and Task/Knowledge follow-up projection.

The first Goal/KR business mutation must be performed by the native Goal owner submit path.
Mastra may subsequently replay that same deterministic create idempotently while applying
the remaining workflow plan.

## Architecture

### 1. Keep workflow identity internal

Mastra remains authoritative for:

- `workflowRunId`;
- draft `revision`;
- `draftRef`;
- deterministic Goal/KR/Task/Knowledge identities;
- execution receipt/referenceMap;
- retry/recovery.

A `goal_draft_review` suspension exposes typed owner-create identity hints for the current
revision. They are orchestration metadata only and are never rendered as normal product
fields.

Do not duplicate the Node SHA implementation in the browser.

### 2. Project into one native Goal draft

When a review suspension is reached or restored:

- open the Goal native create surface through `useGoalNativeSurface`;
- patch Goal name/summary/status/start/target;
- project KRs through the owner session;
- resolve existing proposed Label names to visible native Label IDs without creating new
  labels before approval;
- keep unresolved proposed Label names as workflow data for submit-time resolution.

The normal review path must not render `AIGoalDraftEditor`.

KR hidden IDs may be used only as orchestration tracking keys so manual edit/delete keeps a
stable mapping back to workflow `draftRef`. They are not product fields.

### 3. Native review -> durable revision -> owner submit

On workflow confirm:

1. read the live native Goal draft;
2. reconcile KRs back to workflow draftRefs; preserved rows keep their draftRef, new native
   rows receive a new `kr:new-N` ref, removed rows disappear;
3. map currently selected native labels back to names and preserve unresolved proposal label
   names;
4. combine native Goal/KR content with the still-supported Task/Knowledge workflow drafts;
5. send `edit_structured` only when content differs;
6. use the returned review suspension's fresh deterministic identity hints for that revision;
7. call the native Goal session `requestSubmit` with typed owner submit context:
   deterministic Goal/KR create identities plus pending label names;
8. only after owner submit succeeds, resume Mastra with `approve`.

Goal owner validation and owner commands remain the only first-create path.

### 4. Preserve idempotent apply/recovery

`CreateGoalReq.id` and initial KR IDs are already the Goal owner's durable idempotency seam.

When Mastra handles `approve` after native submit:

- the deterministic create is an owner-port replay of the already-created Goal, not a second
  business fact;
- ApplyGoalPlanService continues Task/Knowledge work and durable receipts;
- the Goal mutation adapter/result must surface current Goal status so ApplyGoalPlanService
  does not redundantly activate a Goal that the native owner submit already transitioned;
- partial retry/recovery continues to use the existing receipt semantics.

No new "native submitted" resume command is introduced unless implementation evidence proves
the replay path cannot satisfy the contract.

### 5. Controlled submission

A workflow-orchestrated native Goal review must not allow a direct native Save/Enter action
to create against a stale workflow revision. Use the smallest typed owner/host mechanism to
make workflow confirmation the submit coordinator while leaving ordinary Goal create/edit
behavior unchanged.

User field editing remains fully native. Workflow confirmation invokes the same Goal owner
session submit.

### 6. Labels

Do not create AI-proposed labels merely by opening review.

At owner submit time, after Goal validation has passed, resolve/create pending workflow label
names through the existing identity-scoped Label catalog and submit canonical label IDs.
Existing visible labels selected/removed by the user must be reflected in the durable draft.

### 7. Persistence / restore

On workflow restore:

- recover the Mastra run as authority;
- reopen the native Goal surface;
- reproject the durable review draft;
- do not restore Goal/KR into an AI-only editor.

Task/Knowledge review overlay may remain until their native migrations.

Native unsaved Goal/KR edits do not require a second durable AI draft store; normal owner
dirty/leave semantics apply until workflow confirmation persists them as a new Mastra revision.

### 8. Retirement boundary

AI-8101 removes `AIGoalDraftEditor` from the normal Goal review rendering path but does not
delete it. Physical retirement belongs to AI-8121 after parity evidence.

Do not migrate Task or Knowledge owner editors in this ticket.

## Required tests

- goal_draft_review carries correct current-revision owner identity hints;
- normal UI does not render internal identity hints;
- review opens the native Goal surface and projects Goal/KRs;
- manual native edits are read back into `edit_structured`;
- KR delete/add preserves/allocates draftRefs correctly;
- revised workflow returns fresh identity hints and owner submit uses those fresh IDs;
- native owner submit occurs before Mastra approve;
- owner validation failure does not send approve;
- direct native submit cannot bypass orchestration in workflow-controlled mode;
- labels are not created on review open and are resolved at submit;
- Mastra replay does not duplicate Goal/KR or duplicate activation;
- tasks/knowledge continue after native Goal creation;
- restart reopens/reprojects native review;
- recovery retry parity remains;
- cancellation closes/invalidates the native review session and cancels workflow;
- `AIGoalDraftEditor` is absent from normal review rendering but remains in source.

## Gates

Run focused contracts/workflow/app-vue tests, App-Vue and AI/contracts typechecks/builds as
needed, targeted ESLint/Prettier, test inventory, full governance, and `git diff --check`.

## Implementation clarifications

- Native Save/Enter delegates through a Goal-owned typed submission coordinator. Semantic
  `requestSubmit` requires explicit create context for a coordinated session. Ordinary owner
  create/edit keeps its normal path.
- Owner submit context includes a detached expected native snapshot; changes while
  `edit_structured` is in flight fail closed and require confirming the live draft again.
- Supporting Task/Knowledge overlays remain recoverable; Goal/KR overlays are discarded.
- A successful owner result is retained in the live orchestrator until approve succeeds,
  allowing approval transport retry without reopening or revising the created Goal.
- Goal mutation host adapters read current status from the canonical mutation read model.

- The durable Goal proposal also carries optional native description/reminder configuration,
  so confirming those fields survives restore and deterministic replay. Both reuse existing
  Goal owner schemas; no new editor or business validation is introduced.

- Restore probes the deterministic Goal through the existing identity-scoped owner read
  port. If Goal/KR creation already succeeded before an approval transport failure,
  confirmation resumes approval of that same revision; it does not reopen an editable
  create session that could allocate a second Goal after another revision. Unknown read
  failures and identity mismatches fail closed. No new runtime resume command is needed.

## Implementation handoff — 2026-10-01

Implementation is written in `product/vnext-ai-8101` on baseline `55f032f1cb9`.
The worktree is intentionally dirty. Architecture acceptance, independent diff review,
CI/test acceptance, repair decisions and batch merge remain with ChatGPT Web.

### Validation evidence

- Focused App-Vue suite: **8 files / 102 tests passed** (`useAIGoalWorkflow`,
  `useAIWorkflowPersistence`, `AIGoalWorkflowPanel`, `GoalDialog`, `GoalModuleLayout`,
  `useLabelCatalog`, `AppShell`, `AIChatView`). After the structured-error governance
  repair, `useAIGoalWorkflow` was rerun: **15 tests passed**.
- Focused AI suite: **3 files / 19 tests passed** (`apply-goal-plan.service`,
  `goal-create.workflow`, `mastra-workflow.runtime`). Existing deterministic mismatch,
  partial receipt and recovery cases remain intact.
- Focused contracts suite: **1 file / 7 tests passed** (`ai-goal-create-workflow.dto`).
- `pnpm nx run app-vue:typecheck`: passed, including 28 dependency build tasks.
- `pnpm nx run ai:typecheck` and `pnpm nx run contracts:typecheck`: passed.
- Contracts and AI builds passed through the serial App-Vue dependency graph.
- `pnpm nx run app-vue:build`: exit 0; emits an unchanged Schedule declaration diagnostic
  `TS4023` in `PlannerEventDialog.vue` concerning non-exported
  `CalendarEventProjectionBase` from the Schedule contract. Those files are outside this
  diff; independent acceptance should account for the diagnostic. No Schedule repair was
  made in this ticket.
- Targeted ESLint with `--max-warnings=0`: passed.
- Targeted Prettier check: passed.
- `pnpm test:inventory:check`: passed, 1,336 files (unit 1,155; integration 34; smoke 3;
  boundary-ipc 8; boundary-main 8; e2e 63; perf 2; governance 63).
- Full `pnpm nx run memoflow:governance-check`: passed after replacing raw recovery
  message rethrow with the structured Result error consumed by the safe UI translator.
- `git diff --check`: passed.

Dependency/build trees were run sequentially. No commit, push, PR or merge was performed.
`AIGoalDraftEditor.vue` remains in source and is absent from normal Goal review rendering.
No `native_submitted` runtime command, Task native migration, Knowledge native migration,
or BusinessPanel surface retirement was introduced.

## Repair handoff — 2026-10-02

The independent review's six repair requests are implemented in the existing dirty
worktree. This is repair evidence for ChatGPT Web review; acceptance and merge remain
with ChatGPT Web. The master acceptance plan is unchanged.

### Repair evidence

1. **Ambiguous owner create:** GoalDialog signals persistence only after native validation
   and pending-label resolution. The orchestrator snapshots the attempted run/revision and
   deterministic Goal/KR identities and blocks native/supporting edits. Null or thrown
   persistence results immediately probe canonical owner truth. An exact identity match
   retains the original submission for approve-only retry; `NOT_FOUND` keeps editing and
   revision changes locked and permits only a controlled retry of the same revision/IDs.
   That retry temporarily releases the native edit lock synchronously into owner submit;
   the owner busy lock protects the draft until the result is reconciled. Unknown/mismatched reads
   keep the pending attempt locked, including revision and cancellation guards. Confirm
   reconciles that attempt before `flushStructuredEdits`. Terminal retirement releases the
   native lock before closing the session. Tests cover immediate reconciliation, lost null
   and thrown responses followed by transient reads/edit/reconfirm attempts, approve
   transport retry, definite absence, and editable pre-persistence validation failure.
2. **Replay owner facts before labels:** `GoalPlanMutationPort.readGoal` is bound in API and
   Desktop to the existing identity-scoped `GoalApplicationPort.getGoalAggregate`. AI reads
   no repositories. Exact deterministic owner identities seed Goal/KR references, version
   and status before label resolution; replay skips Goal label resolution/create and
   continues lifecycle/supporting operations. Mismatched KR identities fail closed;
   unknown/thrown reads produce structured failures; only `NOT_FOUND` enters normal
   label/create execution. Tests cover supporting continuation despite unavailable Goal
   labels, mismatch, unknown reads, normal create, prior-receipt idempotency, and retryable partial
   receipts retaining canonical Goal/KR facts when supporting label resolution fails. Both host
   adapters have identity-scope and error-preservation tests.
3. **Live native review reuse:** Explicit reopen focuses a valid same-run/revision owner
   session without projecting over dirty fields. Successful structured edits advance the
   tracked native revision. Tests separate active reopen (including after revision advance)
   from actual cancellation/retired-handle reopen, which reprojects the durable draft.
   A focus error on a valid session propagates without discarding its unsaved draft.
4. **Supporting snapshot freeze:** Task/Knowledge update/removal mutators and panel controls
   are guarded while confirming/resuming, after owner submission, and while owner outcome
   is pending. Late component input events are suppressed. Delayed `edit_structured`,
   owner-submit and approve tests prove the approved supporting snapshot is preserved.
5. **Recoverable restore:** AIChatView projects the authoritative run without opening native
   review, restores/rebases and persists the supporting overlay, then independently opens
   native review with safe error handling. Only explicit nonrecoverable runtime restore
   errors clear the persisted pointer. A runtime-load/owner-transient/retry regression
   verifies the unsaved supporting overlay remains persisted and visible through retry;
   the view integration test locks this ordering.
6. **Normal result UI:** The raw Goal reference card is removed. The result-panel test
   asserts the internal deterministic Goal ID is absent. Runtime/diagnostic IDs and the
   existing completed-Goal open action remain internal to their existing contracts.

`AIGoalDraftEditor.vue` remains in source and is absent from normal Goal review. Native
Goal/KR creation remains the first mutation; native Save/Enter coordination, pending label
resolution at submit, BusinessPanel, and existing partial-receipt/recovery behavior remain.
Task/Knowledge native migration and new navigation/runtime commands were not introduced.
The generic shared owner session interface gained no workflow-specific repair fields.

### Repair gates

- Required App-Vue focus: **8 files / 116 tests passed** (`useAIGoalWorkflow`,
  `useAIWorkflowPersistence`, `AIGoalWorkflowPanel`, `GoalDialog`, `GoalModuleLayout`,
  `useLabelCatalog`, `AppShell.spec.ts`, `AIChatView`).
- Required AI focus: **3 files / 25 tests passed** (`apply-goal-plan.service`,
  `goal-create.workflow`, `mastra-workflow.runtime`).
- Required contracts focus: **1 file / 7 tests passed** (`ai-goal-create-workflow.dto`).
- New API/Desktop read adapters: **2 files / 8 tests passed** (4 tests per host).
- `pnpm nx run app-vue:typecheck`: passed, including its 28 dependency tasks.
- `pnpm nx run ai:typecheck` and `pnpm nx run contracts:typecheck`: passed.
- Targeted ESLint with `--max-warnings=0`: passed for dirty TypeScript/Vue files.
- Targeted Prettier check: passed for the dirty review files.
- Inventory refreshed only for the two new adapter suites; `pnpm test:inventory:check`
  passed: **1,338 files** (unit 1,157; other suite counts unchanged).
- Full `pnpm nx run memoflow:governance-check`: passed.
- `git diff --check`: passed.

These gates were rerun after tightening `NOT_FOUND` recovery to prohibit new revisions
and adding delayed approve / partial label failure regressions. Nx reused matching
contracts/AI typecheck and dependency build caches; App-Vue typecheck ran afresh.

Build/typecheck/governance graphs were serialized. No commit, push, merge, PR, second
worktree or delegated writer was used. The dirty worktree is ready for independent review.

### Additional test observation outside the required focus

The initial broad `AppShell` filter also selected `useAppShellStore.spec.ts`. An isolated
rerun (`pnpm nx run app-vue:test -- useAppShellStore.spec.ts`) confirms **18 passed / 3
failed** geometry assertions: expected/actual widths **620/608**, **666/658**, and
**653/645**, at lines 330, 338 and 347. `useAppShellStore.ts`, its spec, `panel-geometry.ts`
and `clamp.ts` are unchanged from baseline `55f032f1cb9`. No unrelated shell geometry
repair was made. The required `AppShell.spec.ts` suite passes in the eight-file focus.

### Goal native workflow E2E acceptance evidence

- Isolated confirmation P0: **1 passed (23.4s)**; isolated restore P0: **1 passed (29.3s)**.
- Native GoalDialog Save exercises the real owner API/test DB via `POST /api/v1/goals`.
  Pass-through telemetry asserts exactly one create with deterministic Goal/KR IDs in draft
  order before mocked Mastra `goal.create` approve; Goal reads/status/updates stay real.
- The initial earlier auth failure was `net::ERR_NETWORK_CHANGED` before app bootstrap;
  the rerun passed.

The native GoalDialog is the stable restore surface; the durable Workflow projection may remain hidden.
