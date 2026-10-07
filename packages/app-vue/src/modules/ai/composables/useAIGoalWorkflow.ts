import {
  GoalPlanDraftSchema,
  type AIWorkflowRunView,
  type GoalPlanDraft,
} from '@memoflow/contracts/ai';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import { getAIErrorMessage, getAIWorkflowTerminalFailureMessage } from './error';
import { goalNativeProjection } from './goalDraftMapping';
import { goalWorkflowTimelineItem } from './goalWorkflowProjection';
import {
  createEmptyGoalDraft,
  type EditableGoal,
  type EditableGoalKnowledge,
  type EditableGoalTask,
  type EditableKeyResult,
  type GoalClarificationView,
  type GoalWorkflowStage,
  type UseAIGoalWorkflowOptions,
} from './types';
import { useGoalNativeReviewCoordinator } from './useGoalNativeReviewCoordinator';

/**
 * ADR-112 Goal native review over the ADR-052 durable Workflow.
 *
 * The durable Mastra Workflow is authoritative. This composable owns only
 * supporting Task/Knowledge presentation state and maps actions onto typed
 * Workflow commands. GoalDialog owns the first Goal/KR mutation; Mastra owns
 * durable idempotent replay and supporting work.
 */
export function useAIGoalWorkflow(options: UseAIGoalWorkflowOptions) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const goalWorkflowRun = ref<Extract<AIWorkflowRunView, { kind: 'goal.create' }> | null>(null);

  const goalDraftLoading = ref(false);
  const goalWorkflowStage = ref<GoalWorkflowStage>('collect');
  const goalClarification = ref<GoalClarificationView | null>(null);
  // Compatibility-only persistence slot. Goal clarification input is owned by the main Composer.
  const clarificationAnswers = ref<string[]>([]);
  const creatingGoal = ref(false);
  const automationLoading = ref(false);
  const automationExecuting = ref(false);
  const goalAgentLoading = ref(false);
  const goalAgentResuming = ref(false);

  const editableGoal = computed<EditableGoal>(() => {
    const goal = currentReviewDraft()?.goal;
    return goal
      ? {
          name: goal.name,
          summary: goal.summary ?? '',
          status: goal.status,
          start: goal.start ?? null,
          target: goal.target ?? null,
        }
      : createEmptyGoalDraft();
  });
  const editableKeyResults = computed<EditableKeyResult[]>(() =>
    (currentReviewDraft()?.keyResults ?? []).map((item) => ({
      ...item,
      description: item.description ?? '',
      target: item.target ?? null,
      unit: item.unit ?? '',
    })),
  );

  const editableTasks = ref<EditableGoalTask[]>([]);
  const editableKnowledge = ref<EditableGoalKnowledge[]>([]);

  const review = useGoalNativeReviewCoordinator({
    options,
    goalWorkflowRun,
    goalAgentResuming,
    creatingGoal,
    editableTasks,
    editableKnowledge,
    currentReviewDraft,
    projectRun,
  });
  const {
    goalOwnerSubmitted,
    goalOwnerAttemptPending,
    goalAgentWaitingForClarification,
    goalAgentWaitingForApproval,
    openGoalNativeReview,
    retireNativeReview,
    submitGoalClarificationResponse,
    submitGoalRevisionResponse,
    confirmGoalAgentRun,
    cancelGoalAgentRun,
    reviseGoalAgentRun,
  } = review;

  function currentReviewDraft(): GoalPlanDraft | null {
    const suspension = goalWorkflowRun.value?.suspension;
    if (suspension?.type === 'goal_draft_review') return suspension.draft;
    if (suspension?.type === 'clarification_required') return suspension.candidateDraft ?? null;
    return null;
  }

  function projectDraftToEditor(draft: GoalPlanDraft): void {
    const parsedDraft = GoalPlanDraftSchema.parse(draft);
    editableTasks.value = parsedDraft.tasks;
    editableKnowledge.value = parsedDraft.knowledge;
  }

  function projectTimeline(run: Extract<AIWorkflowRunView, { kind: 'goal.create' }>): void {
    const message = goalWorkflowTimelineItem(run, t);
    if (message && !options.chatTimeline.value.some((item) => item.id === message.id))
      options.chatTimeline.value.push(message);
  }

  function projectRun(run: AIWorkflowRunView | null, projectNative = true): Promise<void> {
    if (!run || run.kind !== 'goal.create') {
      goalWorkflowRun.value = null;
      goalWorkflowStage.value = 'collect';
      goalClarification.value = null;
      return Promise.resolve();
    }

    const nativeDraft = goalNativeProjection(run);
    let projection = Promise.resolve();
    if (!nativeDraft) retireNativeReview();
    goalWorkflowRun.value = run;
    const suspension = run.suspension;
    if (run.status === 'suspended' && suspension?.type === 'clarification_required') {
      goalWorkflowStage.value = 'clarification';
      goalClarification.value = {
        needsClarification: true,
        questions: suspension.questions.map((question) => ({ question, context: null })),
        rationale: null,
      };
      projectTimeline(run);
      if (suspension.candidateDraft) projectDraftToEditor(suspension.candidateDraft);
      if (projectNative && suspension.candidateDraft) {
        const nativeProjection = review.project(run);
        projection = nativeProjection;
        void nativeProjection.catch((error) =>
          toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed')),
        );
      }
    } else if (run.status === 'suspended' && suspension?.type === 'goal_draft_review') {
      goalWorkflowStage.value = 'confirm';
      goalClarification.value = null;
      projectDraftToEditor(suspension.draft);
      projectTimeline(run);
      if (projectNative) {
        const nativeProjection = review.project(run);
        projection = nativeProjection;
        // projectRun is also consumed by shell callers; keep errors visible without an unhandled rejection.
        void nativeProjection.catch((error) =>
          toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed')),
        );
      }
    } else if (run.status === 'suspended' && suspension?.type === 'recovery_required') {
      goalWorkflowStage.value = 'execute';
      goalClarification.value = null;
    } else if (
      run.status === 'completed' ||
      run.status === 'failed' ||
      run.status === 'cancelled'
    ) {
      goalWorkflowStage.value = 'result';
      goalClarification.value = null;
      if (run.status === 'failed') projectTimeline(run);
    } else {
      goalWorkflowStage.value = 'plan';
      goalClarification.value = null;
    }
    options.scrollMessagesToBottom();
    return projection;
  }

  async function syncGoalWorkflowRun(runId: string): Promise<void> {
    if (!runId) return;
    try {
      await projectRun(await options.workflowRuntime.get({ runId }));
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    }
  }

  const canRunGoalAgent = computed(
    () =>
      Boolean(options.selectedModel.value) &&
      Boolean(options.chatConversationId.value) &&
      !options.chatLoading.value &&
      !goalAgentLoading.value &&
      !goalAgentResuming.value &&
      options.hasWorkflowUserMessages.value &&
      (!goalWorkflowRun.value ||
        ['completed', 'failed', 'cancelled'].includes(goalWorkflowRun.value.status)),
  );
  const canRunGoalWorkflow = canRunGoalAgent;
  const canPlanGoalAutomation = computed(() => false);

  const goalAgentWaitingForExecution = computed(
    () =>
      goalWorkflowRun.value?.status === 'suspended' &&
      goalWorkflowRun.value.suspension?.type === 'recovery_required',
  );
  const canRetryGoalAgentExecution = computed(
    () =>
      goalAgentWaitingForExecution.value &&
      goalWorkflowRun.value?.suspension?.type === 'recovery_required' &&
      goalWorkflowRun.value.suspension.retryable &&
      !goalAgentResuming.value,
  );
  const canContinueGoalAgentExecution = canRetryGoalAgentExecution;
  const canAcceptGoalPartialExecution = computed(
    () =>
      goalAgentWaitingForExecution.value &&
      goalWorkflowRun.value?.result?.status === 'partial' &&
      Boolean(goalWorkflowRun.value.result.referenceMap.goal) &&
      !goalAgentResuming.value,
  );
  const canCancelRemainingGoalExecution = computed(
    () => goalAgentWaitingForExecution.value && !goalAgentResuming.value,
  );

  const automatedGoalId = computed(
    () => goalWorkflowRun.value?.result?.referenceMap['goal'] ?? null,
  );
  const createdSupportingTasks = computed(() => {
    const referenceMap = goalWorkflowRun.value?.result?.referenceMap;
    if (!referenceMap) return [];
    return editableTasks.value.flatMap((item) => {
      const id = referenceMap[item.draftRef];
      return id ? [{ id, title: item.title }] : [];
    });
  });
  const createdSupportingKnowledge = computed(() => {
    const referenceMap = goalWorkflowRun.value?.result?.referenceMap;
    if (!referenceMap) return [];
    return editableKnowledge.value.flatMap((item) => {
      const id = referenceMap[item.draftRef];
      return id ? [{ id, title: item.title }] : [];
    });
  });
  const goalExecutionSummary = computed(() => {
    const receipt = goalWorkflowRun.value?.result;
    if (!receipt) return null;
    const executedCount =
      Object.keys(receipt.referenceMap).length + Object.keys(receipt.relationIds).length;
    return {
      status: receipt.status,
      executedCount,
      skippedCount: 0,
      failedCount: receipt.failures.length,
    };
  });
  const goalExecutionRecovery = computed(() => {
    const suspension = goalWorkflowRun.value?.suspension;
    if (suspension?.type !== 'recovery_required') return null;
    return {
      canRetry: suspension.retryable,
      suggestions: suspension.failures.map((item) => item.message),
    };
  });

  async function startGoalAgentRun(workflowTurn?: string): Promise<boolean> {
    if (!canRunGoalAgent.value) return false;
    const selectedModel = options.selectedModel.value;
    if (!selectedModel) return false;
    const idea = options.buildConversationTranscript().trim();
    if (!idea) return false;

    goalAgentLoading.value = true;
    goalDraftLoading.value = true;
    try {
      const run = await options.workflowRuntime.start({
        kind: 'goal.create',
        conversationId: options.chatConversationId.value,
        input: { idea },
        ...(workflowTurn?.trim() ? { workflowTurn: workflowTurn.trim() } : {}),
        providerId: selectedModel.providerId,
        modelId: selectedModel.modelId,
        locale: locale.value.startsWith('en') ? 'en-US' : 'zh-CN',
      });
      await projectRun(run);
      if (run.kind === 'goal.create' && run.status === 'failed') {
        toast.error(getAIWorkflowTerminalFailureMessage(run.failure, t));
        return false;
      }
      const draft =
        run.kind === 'goal.create' && run.suspension?.type === 'goal_draft_review'
          ? run.suspension.draft
          : null;
      if (draft?.goal.name) await options.maybeRenameCurrentConversation(draft.goal.name);
      return true;
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
      return false;
    } finally {
      goalAgentLoading.value = false;
      goalDraftLoading.value = false;
    }
  }

  async function generateGoalDraftFromConversation(): Promise<void> {
    await startGoalAgentRun();
  }

  async function retryGoalAgentExecution(): Promise<void> {
    const run = goalWorkflowRun.value;
    if (!run || !canRetryGoalAgentExecution.value) return;
    goalAgentResuming.value = true;
    try {
      await projectRun(
        await options.workflowRuntime.resume({
          runId: run.runId,
          command: { type: 'retry' },
        }),
      );
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    } finally {
      goalAgentResuming.value = false;
    }
  }

  async function continueGoalAgentExecution(): Promise<void> {
    await retryGoalAgentExecution();
  }

  async function acceptPartialGoalExecution(): Promise<void> {
    const run = goalWorkflowRun.value;
    if (!run || !canAcceptGoalPartialExecution.value) return;
    goalAgentResuming.value = true;
    try {
      await projectRun(
        await options.workflowRuntime.resume({
          runId: run.runId,
          command: { type: 'accept_partial' },
        }),
      );
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    } finally {
      goalAgentResuming.value = false;
    }
  }

  async function cancelRemainingGoalExecution(): Promise<void> {
    const run = goalWorkflowRun.value;
    if (!run || !canCancelRemainingGoalExecution.value) return;
    goalAgentResuming.value = true;
    try {
      await projectRun(
        await options.workflowRuntime.resume({
          runId: run.runId,
          command: { type: 'cancel_remaining' },
        }),
      );
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    } finally {
      goalAgentResuming.value = false;
    }
  }

  async function openAutomatedGoal(): Promise<void> {
    if (!automatedGoalId.value) return;
    await router.push(`/goals/${automatedGoalId.value}`);
  }

  async function openCreatedSupportingTask(taskId: string): Promise<void> {
    if (!taskId) return;
    await router.push(`/tasks/${taskId}`);
  }

  async function openCreatedSupportingKnowledge(documentId: string): Promise<void> {
    if (!documentId) return;
    await router.push({ name: 'repository', query: { note: documentId } });
  }

  function removeTaskDraft(index: number): void {
    if (
      goalAgentResuming.value ||
      creatingGoal.value ||
      goalOwnerSubmitted.value ||
      goalOwnerAttemptPending.value
    )
      return;
    editableTasks.value.splice(index, 1);
  }
  function updateTaskDraft(payload: { index: number; value: EditableGoalTask }): void {
    if (
      goalAgentResuming.value ||
      creatingGoal.value ||
      goalOwnerSubmitted.value ||
      goalOwnerAttemptPending.value
    )
      return;
    const currentDraft = currentReviewDraft();
    if (!currentDraft) return;
    const parsed = GoalPlanDraftSchema.parse({
      ...currentDraft,
      tasks: editableTasks.value.map((item, index) =>
        index === payload.index ? payload.value : item,
      ),
    });
    editableTasks.value[payload.index] = parsed.tasks[payload.index]!;
  }
  function removeKnowledgeDraft(index: number): void {
    if (
      goalAgentResuming.value ||
      creatingGoal.value ||
      goalOwnerSubmitted.value ||
      goalOwnerAttemptPending.value
    )
      return;
    editableKnowledge.value.splice(index, 1);
  }
  function updateKnowledgeDraft(payload: { index: number; value: EditableGoalKnowledge }): void {
    if (
      goalAgentResuming.value ||
      creatingGoal.value ||
      goalOwnerSubmitted.value ||
      goalOwnerAttemptPending.value
    )
      return;
    const currentDraft = currentReviewDraft();
    if (!currentDraft) return;
    const parsed = GoalPlanDraftSchema.parse({
      ...currentDraft,
      knowledge: editableKnowledge.value.map((item, index) =>
        index === payload.index ? payload.value : item,
      ),
    });
    editableKnowledge.value[payload.index] = parsed.knowledge[payload.index]!;
  }

  function resetGoalArtifacts(): void {
    retireNativeReview();
    goalWorkflowRun.value = null;
    goalWorkflowStage.value = 'collect';
    goalClarification.value = null;
    editableTasks.value = [];
    editableKnowledge.value = [];
  }
  return {
    goalDraftLoading,
    goalOwnerSubmitted,
    goalOwnerAttemptPending,
    goalWorkflowStage,
    goalClarification,
    goalWorkflowRun,
    clarificationAnswers,
    creatingGoal,
    automationLoading,
    automationExecuting,
    goalAgentLoading,
    goalAgentResuming,
    editableGoal,
    editableKeyResults,
    editableTasks,
    editableKnowledge,
    canRunGoalWorkflow,
    canPlanGoalAutomation,
    canRunGoalAgent,
    goalExecutionSummary,
    goalExecutionRecovery,
    automatedGoalId,
    createdSupportingTasks,
    createdSupportingKnowledge,
    goalAgentWaitingForClarification,
    goalAgentWaitingForApproval,
    goalAgentWaitingForExecution,
    canContinueGoalAgentExecution,
    canRetryGoalAgentExecution,
    canAcceptGoalPartialExecution,
    canCancelRemainingGoalExecution,
    projectRun,
    openGoalNativeReview,
    resetGoalArtifacts,
    generateGoalDraftFromConversation,
    startGoalAgentRun,
    submitGoalClarificationResponse,
    submitGoalRevisionResponse,
    confirmGoalAgentRun,
    cancelGoalAgentRun,
    reviseGoalAgentRun,
    continueGoalAgentExecution,
    retryGoalAgentExecution,
    acceptPartialGoalExecution,
    cancelRemainingGoalExecution,
    syncGoalWorkflowRun,
    openAutomatedGoal,
    openCreatedSupportingTask,
    openCreatedSupportingKnowledge,
    removeTaskDraft,
    updateTaskDraft,
    removeKnowledgeDraft,
    updateKnowledgeDraft,
  };
}

export type { UseAIGoalWorkflowOptions } from './types';
