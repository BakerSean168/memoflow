import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import {
  TaskPlanDraftContentSchema,
  TaskPlanTaskSchema,
  type AIWorkflowRunView,
  type TaskPlanDraft,
  type TaskPlanTask,
} from '@memoflow/contracts/ai';
import type { TaskWorkflowStage, UseAITaskWorkflowOptions } from './types';
import { getAIErrorMessage, getAIWorkflowFailureMessage } from './error';

/** Thin presentation projection for the durable task.create Mastra Workflow. */
export function useAITaskWorkflow(options: UseAITaskWorkflowOptions) {
  const { t, locale } = useI18n();
  const taskWorkflowRun = ref<Extract<AIWorkflowRunView, { kind: 'task.create' }> | null>(null);
  const taskWorkflowStage = ref<TaskWorkflowStage>('collect');
  const clarificationAnswers = ref<string[]>([]);
  const linkedGoalId = ref<string | null>(null);
  const showTaskDraftEditor = ref(false);
  const editableTask = ref<TaskPlanTask | null>(null);
  const taskAgentLoading = ref(false);
  const taskAgentResuming = ref(false);
  const reviewDraft = computed(() =>
    taskWorkflowRun.value?.suspension?.type === 'task_draft_review'
      ? taskWorkflowRun.value.suspension.draft
      : null,
  );

  function projectDraftToEditor(draft: TaskPlanDraft): void {
    editableTask.value = TaskPlanTaskSchema.parse(draft.task);
  }

  function projectRun(run: AIWorkflowRunView | null): void {
    if (!run || run.kind !== 'task.create') {
      taskWorkflowRun.value = null;
      taskWorkflowStage.value = 'collect';
      clarificationAnswers.value = [];
      editableTask.value = null;
      showTaskDraftEditor.value = false;
      return;
    }
    taskWorkflowRun.value = run;
    const suspension = run.suspension;
    if (run.status === 'suspended' && suspension?.type === 'clarification_required') {
      taskWorkflowStage.value = 'clarification';
      clarificationAnswers.value = suspension.questions.map(() => '');
    } else if (run.status === 'suspended' && suspension?.type === 'task_draft_review') {
      taskWorkflowStage.value = 'confirm';
      linkedGoalId.value = suspension.draft.task.goalBinding?.goalId ?? null;
      projectDraftToEditor(suspension.draft);
    } else if (run.status === 'suspended' && suspension?.type === 'recovery_required')
      taskWorkflowStage.value = 'execute';
    else if (['completed', 'failed', 'cancelled'].includes(run.status)) {
      taskWorkflowStage.value = 'result';
      clarificationAnswers.value = [];
      showTaskDraftEditor.value = false;
    } else {
      taskWorkflowStage.value = 'plan';
      clarificationAnswers.value = [];
    }
    options.scrollMessagesToBottom();
  }
  async function syncTaskWorkflowRun(runId: string): Promise<void> {
    if (!runId) return;
    try {
      projectRun(await options.workflowRuntime.get({ runId }));
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    }
  }
  const taskAgentWaitingForClarification = computed(
    () =>
      taskWorkflowRun.value?.status === 'suspended' &&
      taskWorkflowRun.value.suspension?.type === 'clarification_required',
  );
  const taskAgentWaitingForApproval = computed(
    () =>
      taskWorkflowRun.value?.status === 'suspended' &&
      taskWorkflowRun.value.suspension?.type === 'task_draft_review',
  );
  const canSubmitTaskClarification = computed(
    () =>
      taskWorkflowRun.value?.suspension?.type === 'clarification_required' &&
      taskWorkflowRun.value.suspension.questions.every((_, i) =>
        Boolean(clarificationAnswers.value[i]?.trim()),
      ),
  );
  const canRetryTaskAgentExecution = computed(
    () =>
      taskWorkflowRun.value?.status === 'suspended' &&
      taskWorkflowRun.value.suspension?.type === 'recovery_required' &&
      taskWorkflowRun.value.suspension.retryable &&
      !taskAgentResuming.value,
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

  function currentReviewDraft(): TaskPlanDraft | null {
    return reviewDraft.value;
  }

  function buildEditedDraftContent(draft: TaskPlanDraft) {
    return TaskPlanDraftContentSchema.parse({
      task: editableTask.value ?? draft.task,
      rationale: draft.rationale,
      warnings: [...draft.warnings],
    });
  }

  function canonicalDraftContent(draft: TaskPlanDraft) {
    const { revision: _revision, ...content } = draft;
    return TaskPlanDraftContentSchema.parse(content);
  }

  async function flushStructuredEdits(): Promise<Extract<
    AIWorkflowRunView,
    { kind: 'task.create' }
  > | null> {
    const run = taskWorkflowRun.value;
    const draft = currentReviewDraft();
    if (!run || run.status !== 'suspended' || !draft) return run;
    const edited = buildEditedDraftContent(draft);
    if (JSON.stringify(edited) === JSON.stringify(canonicalDraftContent(draft))) return run;

    const next = await options.workflowRuntime.resume({
      runId: run.runId,
      command: { type: 'edit_structured', patch: edited },
    });
    projectRun(next);
    return next.kind === 'task.create' ? next : null;
  }

  async function startTaskAgentRun(): Promise<void> {
    if (!canRunTaskAgent.value || !options.selectedModel.value) return;
    const idea = options.buildConversationTranscript().trim();
    if (!idea) return;
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
      projectRun(run);
      if (run.kind === 'task.create' && run.suspension?.type === 'task_draft_review')
        await options.maybeRenameCurrentConversation(run.suspension.draft.task.title);
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
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
      projectRun(next);
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
  async function confirmTaskAgentRun(): Promise<void> {
    const current = taskWorkflowRun.value;
    if (!current || !taskAgentWaitingForApproval.value || taskAgentResuming.value) return;
    taskAgentResuming.value = true;
    try {
      const run = await flushStructuredEdits();
      if (!run || run.status !== 'suspended' || run.suspension?.type !== 'task_draft_review')
        return;
      const next = await options.workflowRuntime.resume({
        runId: run.runId,
        command: { type: 'approve' },
      });
      projectRun(next);
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
  const submitTaskClarification = () =>
    resume({ type: 'answer', answers: clarificationAnswers.value.map((answer) => answer.trim()) });
  const retryTaskAgentExecution = () => resume({ type: 'retry' });
  const reviseTaskAgentRun = (patch: Record<string, unknown>) =>
    resume({ type: 'edit_structured', patch });
  async function cancelTaskAgentRun(): Promise<void> {
    const run = taskWorkflowRun.value;
    if (!run || taskAgentResuming.value) return;
    if (run.status === 'suspended') return resume({ type: 'cancel' });
    taskAgentResuming.value = true;
    try {
      projectRun(await options.workflowRuntime.cancel({ runId: run.runId }));
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    } finally {
      taskAgentResuming.value = false;
    }
  }
  const completeTaskAgentRun = confirmTaskAgentRun;
  function setLinkedGoalId(goalId: string | null | undefined) {
    linkedGoalId.value = goalId?.trim() || null;
  }
  function updateTaskDraft(task: TaskPlanTask): void {
    editableTask.value = TaskPlanTaskSchema.parse(task);
  }
  function resetTaskWorkflowLocalState() {
    taskWorkflowRun.value = null;
    taskWorkflowStage.value = 'collect';
    clarificationAnswers.value = [];
    linkedGoalId.value = null;
    showTaskDraftEditor.value = false;
    editableTask.value = null;
    taskAgentLoading.value = false;
    taskAgentResuming.value = false;
  }
  return {
    taskWorkflowRun,
    taskWorkflowStage,
    clarificationAnswers,
    linkedGoalId,
    showTaskDraftEditor,
    editableTask,
    taskAgentLoading,
    taskAgentResuming,
    canRunTaskAgent,
    canSubmitTaskClarification,
    taskAgentWaitingForApproval,
    taskAgentWaitingForClarification,
    canRetryTaskAgentExecution,
    taskExecutionSummary,
    taskExecutionRecovery,
    reviewDraft,
    startTaskAgentRun,
    cancelTaskAgentRun,
    completeTaskAgentRun,
    reviseTaskAgentRun,
    retryTaskAgentExecution,
    confirmTaskAgentRun,
    submitTaskClarification,
    updateTaskDraft,
    syncTaskWorkflowRun,
    resetTaskWorkflowLocalState,
    setLinkedGoalId,
    projectRun,
  };
}
