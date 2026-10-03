---
tags:
  - plan
  - archive
description: PVC-BASE-002 interaction characterization evidence and current behavior
created: 2026-09-30T00:00:00
updated: 2026-09-30T00:00:00
---

# PVC-BASE-002 — Interaction characterization pack

Ticket: [Product vNext master plan](../active/2026-09-29-product-vnext-execution-master-plan.md#pvc-base-002--interaction-characterization-pack).

Characterization-first scope: tests and documentation only. No production behavior or observability changes were necessary. Existing passing behavior is the baseline, including incomplete missing-entity presentation. No intentionally failing tests were necessary: `/tasks?dialog=quick-task` already works in this checkout.

## Six-bullet audit

Paths below are relative to the repository root; named cases identify executable tests, rather than source-string checks.

### 1. Goal KR deep-link refresh / not-found / close

New [GoalDeepLinks.characterization.spec.ts](../../../packages/app-vue/src/modules/goal/views/GoalDeepLinks.characterization.spec.ts):

- `loads a KR from an empty store on direct load and refresh, then closes to its Goal`: `/goals/goal-1/key-results/kr-1` requests the owner aggregate on each fresh mount, renders the returned KR title/value/unit, and Back navigates to `/goals/goal-1`.
- `keeps a blank KR body and a working close for missing-kr` and `... missing-goal`: missing KR or unavailable owner aggregate leaves the route in place with no title/article. The Back button remains usable and routes to the owner ID, even if that owner is missing. There is currently no explicit not-found message or redirect.

Originally reused `KeyResultDetailView.spec.ts` (retired by GOAL-1301), `localizes %s and keeps the KR unit` (five methods × two locales), protects existing calculation labels and units. Reused [GoalModuleLayout.spec.ts](../../../packages/app-vue/src/modules/goal/views/GoalModuleLayout.spec.ts) protects route-owned Goal modal cancellation/save filter preservation; this is separate from the KR Back action.

**Intentional GOAL-1301 update (2026-09-30):** The KR cases above describe the historical baseline. Current `GoalDeepLinks.characterization.spec.ts` mounts the real Goal Detail workspace plus the Goal-owned Inspect dialog for both Goal and legacy KR routes. Direct load/refresh uses one workspace read; normal detail action opens Inspect; close preserves query/hash and returns to `goal-detail`; back/forward follows route state without refetching the same owner. Missing Goal renders an explicit unavailable/not-found alert with a close action; missing KR keeps the Goal workspace and renders a not-found Inspect message with a close action. Neither remains blank. Five-method/both-locale parity moved to `GoalKeyResultInspectDialog.spec.ts`; the standalone KR view/spec were deleted. Review characterization remains unchanged in behavior.

### 2. Goal Review create / detail deep links

New `GoalDeepLinks.characterization.spec.ts`:

- `loads Review create on refresh, validates reflection and saves into the canonical detail deep link`: fresh create mounts fetch the owner aggregate and seven-day system context. Empty/whitespace reflection disables Save. Saving sends reflection, trimmed optional challenges/adjustments (blank becomes null), and `windowDays: 7`; success navigates by returned review ID to `/goals/goal-1/review/review-1`.
- `retains the Review create draft on a failed save and navigates only after retry succeeds`: a null create result keeps the form, draft, and route, releases saving state, and permits retry.
- `uses history back to leave Review create without saving`: create Back uses router history, rather than an explicit owner destination. Tested with an existing Goal history entry; a fresh direct-load Back has no guaranteed in-app history destination.
- `restores Review detail on direct load and refresh and closes to its owning Goal`: empty review state is repopulated by aggregate loading; reflection, adjustments, and authoritative snapshot render. Detail Back explicitly routes to the Goal.
- `keeps missing Review detail blank with a working Goal back action`: missing review retains the “Goal review” header and Back, with no article/not-found message/redirect.

Harness boundary: real mounted KR/create/detail SFCs and production route paths/names/props, real memory router; unrelated Goal shell/list/owner detail replaced with destination probes. Lazy leaf components are resolved eagerly in the harness. Aggregate/context/create ports are mocked, so this is router/render behavior coverage, not backend or browser reload coverage. Refresh means a new router and mount at the same URL with empty entity state.

### 3. Task quick route

Reused [TaskManagementView.runtime.spec.ts](../../../packages/app-vue/src/modules/task/views/TaskManagementView.runtime.spec.ts), describe `Task Management quick create`:

- `opens the title-only dialog on direct load and refresh without opening the full editor`
- `consumes later route changes and closes when the quick intent is removed`
- `clears only quick dialog state on %s without reopening` (cancel/dismiss)
- `keeps the draft on failure, then creates the canonical quick plan and refreshes bounded Today on retry`
- `refreshes Today even when quick creation is opened over Plans without inheriting its Goal scope`
- `preserves full create-and-bind and the ordinary New Task editor`

Current behavior: `dialog=quick-task` opens the one-input quick surface, creates an unbound OneTime/AllDay plan for Product Today, trims the title, preserves draft/intent on failure, and removes only the quick dialog query on success/cancel. Other query values and hash survive cancellation. Success refreshes bounded Today with overdue open occurrences, rather than opening the full editor. These are mounted view/dialog tests with a reactive route double and command/query ports; no new duplicate tests added.

### 4. Task End Plan / Archive semantics

Reused [TaskPlanRow.spec.ts](../../../packages/app-vue/src/modules/task/components/TaskPlanRow.spec.ts): `keeps low-frequency end/delete actions in the shared action menu` invokes the actual mounted row menu actions and asserts abandon/delete emissions; `shows terminal %s and hides End Plan independently of archive metadata` covers Succeeded/Failed/Abandoned. Open rows expose End Plan; terminal rows expose delete only. Archive is not a row action.

Reused [useTaskPlanMutations.spec.ts](../../../packages/app-vue/src/modules/task/composables/useTaskPlanMutations.spec.ts): `abandon is server-confirmed and does not fake Closed before the server response` and `legacy archive compatibility mutation is also server-confirmed rather than optimistic Closed` keep the cached lifecycle unchanged while a command is pending and apply the returned DTO afterward.

Reused [abandon-task-plan.test.ts](../../../packages/task/src/server/application/use-cases/commands/__tests__/abandon-task-plan.test.ts): `closes the plan as explicitly Abandoned and removes current/future incomplete occurrences` asserts Closed + Abandoned, reason retention, no soft-delete, incomplete occurrence cleanup and plan-abandoned event. End Plan means abandonment, not success or archive.

Reused [archive-task-plan.test.ts](../../../packages/task/src/server/application/use-cases/commands/__tests__/archive-task-plan.test.ts): `should archive an active plan`, `should archive a paused plan`, `should return NOT_FOUND when plan does not exist`, and DTO success. Archive sets metadata while preserving Active/Paused lifecycle. Reused [TaskPlan.test.ts](../../../packages/task/src/server/domain/aggregates/__tests__/TaskPlan.test.ts), `archive()` cases and `archive metadata does not block pausing an active plan` / `... resuming a paused plan`, cover independence and duplicate archive rejection. These execute domain behavior; Archive must not be conflated with closing/ending a Plan.

### 5. Schedule CalendarEntry click / read-only

Extended [PlannerCalendar.spec.ts](../../../packages/app-vue/src/modules/schedule/planner/PlannerCalendar.spec.ts), `renders canonical projections and emits the FullCalendar-owned visible range`, now clicks the real rendered FullCalendar event and asserts the exact canonical projection emission.

New [ScheduleInspect.characterization.spec.ts](../../../packages/app-vue/src/modules/schedule/views/ScheduleInspect.characterization.spec.ts), `opens read-only details from %s and closes without owner mutations` (calendar/day-sheet): mounted Schedule view routes CalendarEntry clicks from either source to the real EventDetailSheet, displays title/note/time/read-only guidance, exposes no editing inputs/actions, closes via update:open, and invokes no Schedule/Task/Goal mutation. Planner click producer and Sheet transport primitives are stubbed in this consumer test; the real FullCalendar producer is covered above.

Reused [calendar-event-semantics.spec.ts](../../../packages/app-vue/src/modules/schedule/components/calendar-event-semantics.spec.ts) protects semantic click projection. Reused [planner-owner-command.router.spec.ts](../../../packages/app-vue/src/modules/schedule/planner/planner-owner-command.router.spec.ts), `enforces read-only capabilities before resolving any owner port`, `routes CalendarEntry resize to Schedule owner with projection revision`, and `routes an AllDay CalendarEntry move as canonical Ymd range truth`: inspect is read-only even for entries whose projection permits move/resize; calendar mutations remain separate owner commands.

### 6. AI Goal / Task workflow restart / retry / approval

Reused [goal-create.workflow.spec.ts](../../../packages/ai/src/server/mastra/workflows/goal-create.workflow.spec.ts): `survives restart across clarification, draft review, structured edit and approve`; `persists a partial receipt and retries only the failed deterministic child after restart`; `cancels from review without executing a business mutation`. Fresh workflow definitions use the same LibSQL snapshot. Approval supplies current execution context; receipt checkpoints avoid reapplying the successful Goal/activation when retrying a failed task child.

Reused [task-create.workflow.spec.ts](../../../packages/ai/src/server/mastra/workflows/task-create.workflow.spec.ts): `survives restart across clarification, draft review and approve`, `cancels from review without executing any business mutation`, and `is idempotent: re-applying a successful receipt does not duplicate the template`. Added `persists recovery and retries the same deterministic task after restart without replanning`: transient task creation failure suspends for recovery; a fresh workflow retries the same task ID with the new execution context, without another planner run. No task mutation occurs before approval.

Reused [mastra-workflow.runtime.spec.ts](../../../packages/ai/src/server/mastra/runtime/mastra-workflow.runtime.spec.ts): `restores a suspended HITL run after a process-style restart and keeps approval idempotent`, `owns start/get/list/resume and short-circuits a second approve after terminal completion`, and `owns a task.create workflow: start → draft review → approve creates one task template`. Runtime restart uses a new runtime over the same file and rejects other identities.

Reused UI composable suites:

- [useAIGoalWorkflow.spec.ts](../../../packages/app-vue/src/modules/ai/composables/useAIGoalWorkflow.spec.ts): `projects a goal_draft_review suspension and maps approve resume`, `maps recovery_required retry to a typed retry resume command`, and `syncs from a persisted run via workflowRuntime.get (session restore projection)`.
- [useAITaskWorkflow.spec.ts](../../../packages/app-vue/src/modules/ai/composables/useAITaskWorkflow.spec.ts): `maps clarification, approval, retry, and cancel to typed commands`, `flushes local structured edits before approval without starting another planner run`, and `restores the authoritative session through workflowRuntime.get`.
- [useAIWorkflowPersistence.spec.ts](../../../packages/app-vue/src/modules/ai/composables/useAIWorkflowPersistence.spec.ts): run-pointer persistence/old snapshot retirement; revision-bound local draft and suspended HITL overlays; stale-overlay rejection and successful-revision rebasing. Browser persistence is a pointer/editor overlay; authoritative workflow truth lives in the durable runtime.

## Validation

All runs use this checkout's checked-in Nx/Vitest configuration. The initial UI harness failures (lazy compilation timeout, missing Sheet primitive injection, implicit Product Time timezone) were fixed in tests only.

| Check | Result |
| --- | --- |
| New Goal/Schedule mounted pack + extended PlannerCalendar | 3 files / 17 tests passed |
| Referenced app-vue suites | 10 files / 86 tests passed |
| AI workflow/runtime suites, including new Task retry | 3 files / 15 tests passed |
| Task lifecycle/use-case suites | 3 files / 105 tests passed |
| `pnpm nx run app-vue:typecheck` | Passed, including dependency builds |
| Focused ESLint on all four changed/new test files | Passed |
| `git diff --check` | Passed |
| `pnpm nx run memoflow:governance-check` | Passed; rerun after documentation closure |

Reproduction commands (repository root):

```bash
pnpm nx run app-vue:test -- src/modules/goal/views/GoalDeepLinks.characterization.spec.ts src/modules/schedule/views/ScheduleInspect.characterization.spec.ts src/modules/schedule/planner/PlannerCalendar.spec.ts
pnpm nx run app-vue:test -- src/modules/goal/views/KeyResultDetailView.spec.ts src/modules/goal/views/GoalModuleLayout.spec.ts src/modules/task/views/TaskManagementView.runtime.spec.ts src/modules/task/components/TaskPlanRow.spec.ts src/modules/task/composables/useTaskPlanMutations.spec.ts src/modules/schedule/components/calendar-event-semantics.spec.ts src/modules/schedule/planner/planner-owner-command.router.spec.ts src/modules/ai/composables/useAIWorkflowPersistence.spec.ts src/modules/ai/composables/useAIGoalWorkflow.spec.ts src/modules/ai/composables/useAITaskWorkflow.spec.ts
pnpm nx run ai:test -- src/server/mastra/workflows/task-create.workflow.spec.ts src/server/mastra/workflows/goal-create.workflow.spec.ts src/server/mastra/runtime/mastra-workflow.runtime.spec.ts
pnpm nx run task:test -- src/server/application/use-cases/commands/__tests__/abandon-task-plan.test.ts src/server/application/use-cases/commands/__tests__/archive-task-plan.test.ts src/server/domain/aggregates/__tests__/TaskPlan.test.ts
pnpm nx run app-vue:typecheck
pnpm exec eslint packages/app-vue/src/modules/goal/views/GoalDeepLinks.characterization.spec.ts packages/app-vue/src/modules/schedule/views/ScheduleInspect.characterization.spec.ts packages/app-vue/src/modules/schedule/planner/PlannerCalendar.spec.ts packages/ai/src/server/mastra/workflows/task-create.workflow.spec.ts
git diff --check
pnpm nx run memoflow:governance-check
```

The Schedule suite was rerun separately after renaming its Sheet transport stub to satisfy Vue's multi-word component-name lint rule. The AI file received formatting only after its successful run. Tests added by this ticket make behavioral assertions; existing source-string architecture checks are not used as substitutes for interaction coverage. No commit or push performed.
