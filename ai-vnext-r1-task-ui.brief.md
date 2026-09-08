# AI-VNEXT-06 Round R1: task.create Mastra-native UI projection

Repo: /home/ubuntu/projects/memoflow-ai-vnext (branch refactor/mastra-native-ai-vnext)

## Mission (ONE concern, surgical)
Rewrite the legacy `useAITaskWorkflow` composable to a thin `AIWorkflowRunView` (kind `task.create`) projection — mirroring the already-done `useAIGoalWorkflow` — and add an `AITaskWorkflowPanel.vue` component mirroring `AIGoalWorkflowPanel.vue` (testid `task-workflow-panel`), plus composable + component tests. Then wire it into `useAIChatView.ts`. Do NOT touch knowledge.* yet (separate round). Do NOT touch goal.* (already done).

## Ground rule
New production code must NEVER use `AgentRunResult`, `AgentStartRunClientRequest`, `AgentResumePayload`, `AgentExecutedAction`, `pendingActions`, `approvedActions`, `createAgentId`, `hostProposalLifecycle`, `dispatchHostProposalDecision`, `startAgentRun`, `resumeAgentRun`. The task UI must own NO workflow state — it is a thin projection over the Mastra runtime (`workflowRuntime`). Mutations never run client-side; they happen in the Mastra workflow via typed resume commands (`approve`/`answer`/`cancel`/`edit_structured`/`retry`).

## Reference files (copy the pattern, do not reinvent)
- COMPOSABLE PATTERN: `packages/app-vue/src/modules/ai/composables/useAIGoalWorkflow.ts` (already the vNext thin-projection reference)
- COMPOSABLE TEST PATTERN: `packages/app-vue/src/modules/ai/composables/useAIGoalWorkflow.spec.ts`
- COMPONENT PATTERN: `packages/app-vue/src/modules/ai/components/AIGoalWorkflowPanel.vue` (testid `goal-workflow-panel`/`goal-workflow-recovery`/`goal-workflow-result`/`goal-workflow-revision`)
- OPTIONS TYPES: `packages/app-vue/src/modules/ai/composables/types.ts` (import `WorkflowMode`, workflowRuntime type = `IWorkflowRuntimeService`)
- RUNTIME CLIENT: `packages/ai/src/client/runtime-workflow.ts` `WorkflowRuntimeClient` (methods `start/resume/get/list/cancel`)
- CURRENT LEGACY FILE TO REPLACE: `packages/app-vue/src/modules/ai/composables/useAITaskWorkflow.ts`
- CONSUMER TO REWIRE: `packages/app-vue/src/modules/ai/composables/useAIChatView.ts` (currently assembles `useAITaskWorkflow` with `service.startAgentRun/resumeAgentRun` + `taskAgentRun` ref + `syncLinkedGoalFromTaskAgentRun`)

## Contracts (already committed; read these)
- `packages/contracts/src/modules/ai/api/ai-runtime.dto.ts`: `AIWorkflowRunView` discriminated union with kind `task.create`; `AIWorkflowSuspension` (`clarification_required` w/ questions+round, `task_draft_review` w/ draft+revision, `recovery_required` w/ retryable+failures); `AIWorkflowResumeCommand` (`answer`/`approve`/`cancel`/`edit_structured`/`retry`/...); `AIWorkflowStartClientRequest` kind `task.create` (input `TaskCreateClientInput`).
- `packages/contracts/src/modules/ai/api/ai-task-create-workflow.dto.ts`: `TaskCreateClientInput` (`{idea, goalId?, surfaceContext?}` strict), `TaskPlanDraft` (`{revision, task, rationale, warnings}` where `task` has title/description/importance/cadence/startDate/timeOfDay/daysOfWeek/occurrences/goalId/tags), `TaskPlanExecutionReceipt` (`{workflowRunId, revision, status, taskPlanId?, taskIds, failures, retryable}`).

## Deliverables
1. **Rewrite `useAITaskWorkflow.ts`** as a vNext projection. New options type `UseAITaskWorkflowOptions`:
   - `workflowRuntime: IWorkflowRuntimeService`
   - `selectedModel: Ref<ChatModelOption | null>`
   - `chatConversationId: Ref<string>`
   - `chatLoading: Ref<boolean>`
   - `hasWorkflowUserMessages: Ref<boolean>`
   - `buildConversationTranscript: () => string`
   - `scrollMessagesToBottom: () => void`
   - `maybeRenameCurrentConversation: (name: string) => Promise<void>`
   - `openCreatedTask?: (taskId: string) => Promise<unknown>` (optional; call only on completed run with a `taskPlanId`)
   - Keep a `linkedGoalId` ref + `setLinkedGoalId` (used by the ActionBar goal link) and `resetTaskWorkflowLocalState()`.
   - State: `taskWorkflowRun` = `Extract<AIWorkflowRunView, {kind:'task.create'}> | null`; `taskWorkflowStage` ('collect'|'clarification'|'confirm'|'result'|...); `clarificationAnswers`; `showTaskDraftEditor`; `taskAgentLoading`/`taskAgentResuming`; editable draft (`EditableTaskPlanTask`-style) if you add a draft editor — but a minimal read-only review panel is acceptable for this round.
   - Start: `startTaskAgentRun()` → `workflowRuntime.start({ kind: 'task.create', conversationId, input: { idea, ...(goalId?{goalId}:{}) }, providerId, modelId, locale })` then projectRun; rename conversation from draft.task.title when available.
   - Resume map to typed commands: clarification → `{type:'answer', answers}`; approve → `{type:'approve'}`; cancel → `{type:'cancel'}` or `cancel({runId})`; retry → `{type:'retry'}`; structured edit → `{type:'edit_structured', patch}`.
   - `syncTaskWorkflowRun(runId)` via `workflowRuntime.get`.
   - Deep-link: only when run `status==='completed'` AND `result.taskPlanId` present → `openCreatedTask?.(result.taskPlanId)` (pending draft/recovery stays in AI workspace). Do NOT deep-link on every `task_draft_review` projection.
   - Export `startTaskAgentRun`, `cancelTaskAgentRun`, `completeTaskAgentRun`, `reviseTaskAgentRun`, `retryTaskAgentExecution`, `confirmTaskAgentRun`, `syncTaskWorkflowRun`, `resetTaskWorkflowLocalState`, `setLinkedGoalId`, `projectRun`, and the computeds `taskWorkflowRun`, `taskWorkflowStage`, `clarificationAnswers`, `canRunTaskAgent`, `canSubmitTaskClarification`, `taskAgentWaitingForApproval`, `taskAgentWaitingForClarification`, `canRetryTaskAgentExecution`, `taskExecutionSummary`, `taskExecutionRecovery`.
   - Keep `canRunTaskAgent` semantics: requires selectedModel + conversationId + !chatLoading + !loading + hasWorkflowUserMessages + (!run or run terminal).

2. **Create `AITaskWorkflowPanel.vue`** at `packages/app-vue/src/modules/ai/components/` mirroring `AIGoalWorkflowPanel.vue` structure:
   - TestIDs: `task-workflow-panel`, `task-workflow-recovery`, `task-workflow-result`, `task-workflow-revision`.
   - Renders: status badge, revision badge, draft title (from `suspension.type==='task_draft_review' ? suspension.draft.task.title`), rationale, warnings, optional draft editor (mirror goal), recovery failures, result receipt (taskPlanId / taskIds count).
   - Use existing i18n keys under `aiAssistant.chatPage.workflow.*` and `aiAssistant.dialogs.*`; add new `aiAssistant.taskWorkflow.*` keys to `packages/app-vue/src/**/i18n/**` if needed (find where goal workflow keys live and mirror the file).
   - Emits similar to goal panel (e.g. `confirm`, `cancel`, `retry`, `update-clarification-answer`, `edit-started`...). Keep it a PRESENTATION component — all state flows in via props from the composable refs.

3. **Add component spec** `AITaskWorkflowPanel.spec.ts` mirroring `AIGoalWorkflowPanel.spec.ts` (verify the reference exists at `packages/app-vue/src/modules/ai/components/AIGoalWorkflowPanel.spec.ts`; if it does not exist, a minimal mount smoke test asserting the panel renders draft title / status is fine).

4. **Add composable spec** `useAITaskWorkflow.spec.ts` mirroring `useAIGoalWorkflow.spec.ts` (verify it exists; if not, write ~6 composable tests): client start request has NO `identityId`; clarification/draft-review/recovery stage projection; typed command mapping for approve/answer/retry/cancel; completed-only deep-link (openCreatedTask called only with result.taskPlanId); session restore via `workflowRuntime.get`; no `startAgentRun`/`AgentRunResult`/`pendingActions` in the module.

5. **Rewire `useAIChatView.ts`** to use the new `taskWorkflow` composable in place of the legacy `useAITaskWorkflow` + `taskAgentRun` + `syncLinkedGoalFromTaskAgentRun`:
   - Remove the legacy `taskAgentRun` ref and `syncTaskAgentRunFromStart` plumbing around the task path.
   - Replace `taskWorkflow.startTaskAgentRun` etc. calls; session restore uses `taskWorkflow.syncTaskWorkflowRun(runId)` from a persisted task runId (find where goal does it via `goalWorkflow.syncGoalWorkflowRun` and mirror).
   - Any template/component referencing `taskAgentRun`/`task-workflow-panel` must be updated to use `taskWorkflow.taskWorkflowRun`. Find all usages of `taskAgentRun` and `task-workflow` across `packages/app-vue/src` and `packages/app-vue/src/modules/ai/components/**` and update.

## Verification (run from repo root with PATH="$HOME/.cargo/bin:$PATH")
- `node --stack_size=8192 node_modules/vitest/vitest.mjs run --config packages/app-vue/vitest.config.ts packages/app-vue/src/modules/ai/composables/useAITaskWorkflow.spec.ts packages/app-vue/src/modules/ai/composables/useAIGoalWorkflow.spec.ts`
- `cd packages/app-vue && node --stack_size=8192 ../../node_modules/typescript/bin/tsc --noEmit -p tsconfig.json`
- Then full `packages/app-vue` unit suite (expect ~186-187 files; all green or only pre-existing environmental better-sqlite3 failures).
- ESLint on changed files: `cd /home/ubuntu/projects/memoflow-ai-vnext && node node_modules/eslint/bin/eslint.js <changed files>`
- `pnpm test:inventory` from repo root if you add NEW test files (regenerates tools/test-system-v2/test-inventory.json) — REQUIRED for any new spec file.

## Hard constraints
- identityId is NEVER sent by the client — the contracts `.strict()` schema rejects it. Assert tests prove the request omits it.
- No `AgentAction`/`pendingActions`/`approvedActions`/`dependsOn` in production code.
- Mastra is the ONLY runtime — do not re-add any Host Proposal / AgentRun bridge. If a section of the old panel cannot be projected yet because there is no vNext surface, REMOVE it rather than resurrecting a legacy path.
- Do not modify the committed backend (`packages/ai/src/server/mastra/workflows/*`, contracts `ai-task-create-workflow.dto.ts`).
- Keep everything deterministic/idempotent; no provider keys or credentials in the client.

Do the work, self-verify with the commands above, and leave the changes uncommitted (the orchestrator will gate + commit). Report exactly what you changed and the test/typecheck/lint results.
