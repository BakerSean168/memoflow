import {
  TaskPlanTaskSchema,
  type AIWorkflowRunView,
  type TaskPlanDraft,
  type TaskPlanTask,
} from '@memoflow/contracts/ai';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import {
  getAIErrorMessage,
  getAIWorkflowFailureMessage,
  getAIWorkflowTerminalFailureMessage,
} from './error';
import type { TaskWorkflowStage, UseAITaskWorkflowOptions } from './types';
import { useTaskNativeReviewCoordinator } from './useTaskNativeReviewCoordinator';

/** Thin presentation projection for the durable task.create Mastra Workflow. */
export function useAITaskWorkflow(options: UseAITaskWorkflowOptions) {
  const { t, locale } = useI18n();
  const taskWorkflowRun = ref<Extract<AIWorkflowRunView, { kind: 'task.create' }> | null>(null);
  const taskWorkflowStage = ref<TaskWorkflowStage>('collect');
  const linkedGoalId = ref<string | null>(null);
  const editableTask = ref<TaskPlanTask | null>(null);
  const taskAgentLoading = ref(false);
  const taskAgentResuming = ref(false);
  const reviewDraft = computed(() =>
    taskWorkflowRun.value?.suspension?.type === 'task_draft_review'
      ? taskWorkflowRun.value.suspension.draft
      : null,
  );

  const review = useTaskNativeReviewCoordinator({
    options,
    taskWorkflowRun,
    taskAgentResuming,
    reviewDraft,
    projectRun,
    resume,
  });
  const {
    taskOwnerAttemptPending,
    taskOwnerSubmitted,
    taskAgentWaitingForApproval,
    openTaskNativeReview,
    retireNativeReview,
    confirmTaskAgentRun,
    reviseTaskAgentRun,
    cancelTaskAgentRun,
    updateTaskDraft,
  } = review;

  function projectDraftToEditor(draft: TaskPlanDraft): void {
    editableTask.value = TaskPlanTaskSchema.parse(draft.task);
  }

  function projectClarificationToTimeline(
    run: Extract<AIWorkflowRunView, { kind: 'task.create' }>,
  ): void {
    const suspension = run.suspension;
    if (suspension?.type !== 'clarification_required') return;
    const id = `task-clarification-${run.runId}-${suspension.round ?? 1}`;
    if (options.chatTimeline.value.some((item) => item.id === id)) return;
    const content = suspension.questions
      .map((question, index) =>
        suspension.questions.length === 1 ? question : `${index + 1}. ${question}`,
      )
      .join('\n');
    options.chatTimeline.value.push({ id, role: 'assistant', content, status: 'success' });
  }

  function projectFailureToTimeline(
    run: Extract<AIWorkflowRunView, { kind: 'task.create' }>,
  ): void {
    if (run.status !== 'failed') return;
    const id = `task-workflow-failure-${run.runId}`;
    if (options.chatTimeline.value.some((item) => item.id === id)) return;
    const message = getAIWorkflowTerminalFailureMessage(run.failure, t);
    options.chatTimeline.value.push({
      id,
      role: 'assistant',
      content: message,
      status: 'error',
      errorMessage: message,
    });
  }

  async function projectRun(run: AIWorkflowRunView | null, openNative = true): Promise<void> {
    if (!run || run.kind !== 'task.create') {
      retireNativeReview();
      taskWorkflowRun.value = null;
      taskWorkflowStage.value = 'collect';
      editableTask.value = null;
      return;
    }
    taskWorkflowRun.value = run;
    const suspension = run.suspension;
    if (run.status === 'suspended' && suspension?.type === 'clarification_required') {
      taskWorkflowStage.value = 'clarification';
      projectClarificationToTimeline(run);
    } else if (run.status === 'suspended' && suspension?.type === 'task_draft_review') {
      taskWorkflowStage.value = 'confirm';
      linkedGoalId.value = suspension.draft.task.goalBinding?.goalId ?? null;
      projectDraftToEditor(suspension.draft);
    } else if (run.status === 'suspended' && suspension?.type === 'recovery_required')
      taskWorkflowStage.value = 'execute';
    else if (['completed', 'failed', 'cancelled'].includes(run.status)) {
      taskWorkflowStage.value = 'result';
      if (run.status === 'failed') projectFailureToTimeline(run);
    } else {
      taskWorkflowStage.value = 'plan';
    }
    options.scrollMessagesToBottom();
    if (openNative && run.suspension?.type === 'task_draft_review') {
      await review.project(run);
    }
  }
  async function syncTaskWorkflowRun(runId: string): Promise<void> {
    if (!runId) return;
    try {
      await projectRun(await options.workflowRuntime.get({ runId }));
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    }
  }
  const taskAgentWaitingForClarification = computed(
    () =>
      taskWorkflowRun.value?.status === 'suspended' &&
      taskWorkflowRun.value.suspension?.type === 'clarification_required',
  );
  const taskAgentWaitingForExecution = computed(
    () =>
      taskWorkflowRun.value?.status === 'suspended' &&
      taskWorkflowRun.value.suspension?.type === 'recovery_required',
  );
  const canRetryTaskAgentExecution = computed(
    () =>
      taskAgentWaitingForExecution.value &&
      taskWorkflowRun.value?.suspension?.type === 'recovery_required' &&
      taskWorkflowRun.value.suspension.retryable &&
      !taskAgentResuming.value,
  );
  const canAcceptTaskPartialExecution = computed(
    () =>
      taskAgentWaitingForExecution.value &&
      taskWorkflowRun.value?.result?.status === 'partial' &&
      Object.keys(taskWorkflowRun.value.result.referenceMap).length > 0 &&
      !taskAgentResuming.value,
  );
  const canCancelRemainingTaskExecution = computed(
    () => taskAgentWaitingForExecution.value && !taskAgentResuming.value,
  );
  const canRunTaskAgent = computed(
    () =>
      Boolean(options.selectedModel.value) &&
      Boolean(options.chatConversationId.value) &&
      !options.chatLoading.value &&
      !taskAgentLoading.value &&
      !taskAgentResuming.value &&
      options.hasWorkflowUserMessages.value &&
      (!taskWorkflowRun.value ||
        ['completed', 'failed', 'cancelled'].includes(taskWorkflowRun.value.status)),
  );
  const taskExecutionSummary = computed(() => {
    const receipt = taskWorkflowRun.value?.result;
    return receipt
      ? {
          status: receipt.status,
          executedCount: Object.keys(receipt.referenceMap).length,
          failedCount: receipt.failures.length,
        }
      : null;
  });
  const taskExecutionRecovery = computed(() => {
    const suspension = taskWorkflowRun.value?.suspension;
    return suspension?.type === 'recovery_required'
      ? {
          canRetry: suspension.retryable,
          suggestions: suspension.failures.map((failure) =>
            getAIWorkflowFailureMessage(failure, t),
          ),
        }
      : null;
  });

  async function startTaskAgentRun(): Promise<boolean> {
    if (!canRunTaskAgent.value || !options.selectedModel.value) return false;
    const idea = options.buildConversationTranscript().trim();
    if (!idea) return false;
    taskAgentLoading.value = true;
    try {
      const goalId = linkedGoalId.value;
      const run = await options.workflowRuntime.start({
        kind: 'task.create',
        conversationId: options.chatConversationId.value,
        input: { idea, ...(goalId ? { goalId } : {}) },
        providerId: options.selectedModel.value.providerId,
        modelId: options.selectedModel.value.modelId,
        locale: locale.value.startsWith('en') ? 'en-US' : 'zh-CN',
      });
      await projectRun(run);
      if (run.kind === 'task.create' && run.status === 'failed') {
        toast.error(getAIWorkflowTerminalFailureMessage(run.failure, t));
        return false;
      }
      if (run.kind === 'task.create' && run.suspension?.type === 'task_draft_review')
        await options.maybeRenameCurrentConversation(run.suspension.draft.task.title);
      return true;
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
      return false;
    } finally {
      taskAgentLoading.value = false;
    }
  }
  async function resume(
    command: Parameters<typeof options.workflowRuntime.resume>[0]['command'],
  ): Promise<void> {
    const run = taskWorkflowRun.value;
    if (!run || taskAgentResuming.value) return;
    taskAgentResuming.value = true;
    try {
      const next = await options.workflowRuntime.resume({ runId: run.runId, command });
      await projectRun(next);
      if (next.kind === 'task.create' && next.status === 'failed') {
        toast.error(getAIWorkflowTerminalFailureMessage(next.failure, t));
        return;
      }
      if (next.kind === 'task.create' && next.status === 'completed' && next.result) {
        const createdTaskPlanId = Object.values(next.result.referenceMap)[0];
        if (createdTaskPlanId) await options.openCreatedTask?.(createdTaskPlanId);
      }
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    } finally {
      taskAgentResuming.value = false;
    }
  }
  async function submitTaskClarificationResponse(response: string): Promise<boolean> {
    const run = taskWorkflowRun.value;
    const normalized = response.trim();
    if (!run || !taskAgentWaitingForClarification.value || taskAgentResuming.value || !normalized)
      return false;
    taskAgentResuming.value = true;
    try {
      const next = await options.workflowRuntime.resume({
        runId: run.runId,
        command: { type: 'answer', answers: [normalized] },
        workflowTurn: normalized,
      });
      await projectRun(next);
      if (next.kind === 'task.create' && next.status === 'failed') {
        toast.error(getAIWorkflowTerminalFailureMessage(next.failure, t));
        return false;
      }
      if (next.kind === 'task.create' && next.status === 'completed' && next.result) {
        const createdTaskPlanId = Object.values(next.result.referenceMap)[0];
        if (createdTaskPlanId) await options.openCreatedTask?.(createdTaskPlanId);
      }
      return true;
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
      return false;
    } finally {
      taskAgentResuming.value = false;
    }
  }
  const retryTaskAgentExecution = () => resume({ type: 'retry' });
  const acceptPartialTaskExecution = () => resume({ type: 'accept_partial' });
  const cancelRemainingTaskExecution = () => resume({ type: 'cancel_remaining' });
  const completeTaskAgentRun = confirmTaskAgentRun;
  function setLinkedGoalId(goalId: string | null | undefined) {
    linkedGoalId.value = goalId?.trim() || null;
  }
  function resetTaskWorkflowLocalState() {
    retireNativeReview();
    taskWorkflowRun.value = null;
    taskWorkflowStage.value = 'collect';
    linkedGoalId.value = null;
    editableTask.value = null;
    taskAgentLoading.value = false;
    taskAgentResuming.value = false;
  }
  return {
    taskWorkflowRun,
    taskOwnerAttemptPending,
    taskOwnerSubmitted,
    openTaskNativeReview,
    taskWorkflowStage,
    linkedGoalId,
    editableTask,
    taskAgentLoading,
    taskAgentResuming,
    canRunTaskAgent,
    taskAgentWaitingForApproval,
    taskAgentWaitingForClarification,
    taskAgentWaitingForExecution,
    canRetryTaskAgentExecution,
    canAcceptTaskPartialExecution,
    canCancelRemainingTaskExecution,
    taskExecutionSummary,
    taskExecutionRecovery,
    reviewDraft,
    startTaskAgentRun,
    cancelTaskAgentRun,
    completeTaskAgentRun,
    reviseTaskAgentRun,
    retryTaskAgentExecution,
    acceptPartialTaskExecution,
    cancelRemainingTaskExecution,
    confirmTaskAgentRun,
    submitTaskClarificationResponse,
    updateTaskDraft,
    syncTaskWorkflowRun,
    resetTaskWorkflowLocalState,
    setLinkedGoalId,
    projectRun,
  };
}
