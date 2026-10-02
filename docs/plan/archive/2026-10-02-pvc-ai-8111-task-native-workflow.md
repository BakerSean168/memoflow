---
tags: [plan, archive, ai, task, shell]
description: PVC-AI-8111 native full Task create workflow implementation and verification
created: 2026-10-02T00:00:00+00:00
updated: 2026-10-02T06:50:00+00:00
---

# PVC-AI-8111 — Task native AI workflow

## Evidence and owner boundary

Baseline: `d63a0a5bd4b`, branch `product/vnext-ai-8111`. Implementation stays in this
worktree, dirty, without commit/push/merge/PR or another writer.

ADR-112 and AI-8001 establish semantic owner sessions. Accepted AI-8101 provides
owner-first create, deterministic review hints, canonical truth reconciliation and
recoverable projection ordering. TASK-3901 freezes native Task product semantics.

Current Task ownership differs from Goal: `TaskPlanDialog.vue` owns the detached
`TaskPlanViewModel`, draft storage and `TaskPlanForm` validation; `TaskManagementView.vue`
owns full-create request mapping and `useTaskPlanMutations.createPlanSafe`. The form
already implements native three-mode KR rules. QuickTaskDialog is a separate intent,
opened by `dialog=quick-task`. AI full create will explicitly open `dialog=task-plan`.

`TaskPlanTaskSchema` already carries schedule (including recurrence), description,
importance, labels, reminders and TaskGoalLink. It does not carry checklist; no new
proposal fields are planned. Native checklist changes remain owner draft content and
are submitted by the owner, without widening the durable AI proposal.

`CreateTaskPlanReq.id` is the existing idempotency seam. The owner use case returns an
existing identity-scoped Task for that ID. `taskWorkflowEntityId` derives ID from run,
revision, draftRef and operation. Current apply resolves labels before creation; replay
must read owner truth before labels. UI TaskService.getPlan and host
TaskApplicationPort.getTaskPlan already supply canonical reads.

## Architecture decisions

- Add a Task-specific semantic session using the shared owner-neutral session contract,
  narrowed to supported full-create capabilities. No shared contract changes planned.
- Dialog adapter patches/reads the same detached draft as manual edits, coordinates
  native Save with AI when attached, and submits through the view's canonical mapping
  and mutation callback. Ordinary full create and Quick Task retain their owner paths.
- AppShell provides an instance-scoped Task host. Task owner registers only a live full
  create dialog; closed/disposed handles reject. Route opening follows shell leave guards.
- Review suspension carries typed `{taskId, draftRef}` ownerCreate metadata. Revision
  and draftRef coherence are schema-validated; Node generates deterministic identities.
- AI reads canonical owner truth before projecting on restore. Exact ID means approve
  only; NOT_FOUND permits create; unknown/mismatch fails closed and retains run pointer.
- Confirm locks native editing, reads owner draft, reconciles supported proposal fields
  via edit_structured, then uses the resulting revision ID for owner submit. Labels are
  projected without creation; unresolved proposal names resolve after native validation.
- Persistence attempt freezes run/revision/ID. Lost response immediately probes owner:
  exact => approve only, NOT_FOUND => same-revision/same-ID retry, unknown => remain locked.
- Native cancel closes the review; workflow cancel invalidates the session and cancels
  Mastra. Busy/ambiguous attempts block cancellation and revision changes.
- Panel retains workflow/clarification/recovery/status controls and an open-native action;
  AITaskDraftEditor remains source-only. No raw Task/result/binding IDs in normal panel UI.
- Restore projects runtime first, persists pointer, then safely opens native review.
  Projection failure does not clear durable authority.

## Implementation phases

1. Durable identity schema/workflow and narrow identity-scoped read port in API/Desktop;
   apply probes owner before label/create; test current revision and replay/retry.
2. Task full-create dialog session, owner callback and shell host; test same draft,
   validation, busy/dirty, cancellation/disposal and ordinary owner behavior.
3. AI native projection/reconciliation/owner-first/recovery and panel/restore wiring;
   test revision advancement, ambiguity, freeze, reuse, restore and transient failure.
4. Upgrade Task P0 browser journeys to real owner POST/test DB, pass-through ordering,
   canonical ID/deep-link, refresh/cancel and absence of legacy/Quick Task editors.
5. Run focused gates, serial dependency builds/typechecks, lint/format/inventory/diff,
   full governance and dedicated AI-workspace E2E; restore tracked reports.

## Verification and handoff

Record exact suites/counts and commands here after execution. Required seams include
DTO/runtime, host adapter parity, dialog/session, workflow composable, panel and
AIChatView/persistence. Run Goal focused regressions if shared code changes.

Use nearest Nx targets. Contracts/AI/App-Vue dist writers run serially. E2E runtime/auth
network failures are reported separately from product assertions with trace evidence.
Do not repair unrelated baseline shell geometry or destructive DB bootstrap. Acceptance
and independent review remain with ChatGPT Web; final handoff lists production files,
architecture differences, tests, E2E evidence, outstanding P0/P1/P2 and dirty-worktree status.

## Acceptance — 2026-10-02

AI-8111 is accepted and frozen. Normal `task.create` review now uses the real full
`TaskPlanDialog` owner surface rather than `AITaskDraftEditor`. Quick Task remains a separate
manual intent and is untouched.

The accepted owner-first sequence is:

1. Mastra suspends with revision-bound deterministic `ownerCreate` metadata.
2. The proposal projects into the native full Task draft/session.
3. Manual edits and AI semantic patches mutate that same owner draft.
4. Native validation and label resolution run before persistence.
5. Canonical Task creation uses the workflow-supplied `ITaskPlanId_*` through the normal
   Task transport/use-case path.
6. Only after owner persistence is confirmed does Mastra receive `approve`.
7. Completed runs deep-link to the canonical `/tasks/:id` detail route.

Independent review found and repaired two integration defects before acceptance: the Task HTTP
controller was not forwarding the caller-supplied deterministic ID to the create use case, and
production `useAIChatView` had not wired the workflow's completed-task deep-link callback. Both
now have regression coverage. `CreateTaskPlanSchema` also enforces the canonical
`ITaskPlanId_*` prefix so transport tests cannot silently model a non-product identity format.

### Validation evidence

- Focused App-Vue matrix: **8 files / 79 tests passed** (`TaskPlanDialog`,
  `TaskManagementView`, `useTaskNativeSurface`, `useAITaskWorkflow`, `AITaskWorkflowPanel`,
  `AIChatView`, `useAIWorkflowPersistence`, `AppShell`).
- Focused AI matrix: **3 files / 22 tests passed** (`task-create.workflow`,
  `mastra-workflow.runtime`, `deterministic-entity-id`), including `ApplyTaskPlanService`
  behavior exercised from the Task workflow suite.
- Focused contracts: **2 files / 15 tests passed**.
- Task owner/client/transport: **3 files / 57 tests passed**.
- API host adapter: **5 tests passed**; Desktop host adapter: **5 tests passed**.
- Uncached serial typecheck passed for **contracts, task, ai, app-vue** and 28 dependency
  tasks.
- Full `pnpm governance:check` passed, including the 34-test runtime/governance suite,
  **22/22** HARD-7101 behavior bindings, package/architecture/public-surface audits and vNext
  retirement/ownership locks.
- Targeted ESLint: **0 errors** (three pre-existing `no-explicit-any` warnings remain in the
  controller test fixture outside the new ID assertion). Targeted Prettier passed.
- `pnpm test:inventory:check` passed: **1,342 test files** (unit 1,161; integration 34;
  smoke 3; boundary-ipc 8; boundary-main 8; e2e 63; perf 2; governance 63).
- `git diff --check` passed.

### Browser acceptance evidence

Using a fresh AI-8111 API build on isolated `:3001` (`lane=e2e`) and the current worktree Web
on `:4175`, without destructive schema bootstrap:

- full native Task owner-first create -> deterministic owner POST -> Mastra approve -> canonical
  deep-link: **1/1 passed** (28.2s test body);
- refresh/restoration of a pending `task.create` native review: **1/1 passed** (28.2s);
- cancel at approval closes native review and creates no Task: **1/1 passed** (21.2s).

The earlier failed probes that reused the AI-8101 `:3000` dist were explicitly discarded as
invalid evidence; the accepted runs above use the current AI-8111 API/Web code.

`AITaskDraftEditor.vue` remains source-only for later AI-8121 retirement and is absent from the
normal Task workflow review path. No Quick Task implementation, new runtime command, or second
Task business mutation path was introduced.
