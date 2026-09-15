import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import type { AIWorkflowRunView } from '@memoflow/contracts/ai';
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
  const taskAgentLoading = ref(false);
  const taskAgentResuming = ref(false);
  const reviewDraft = computed(() => taskWorkflowRun.value?.suspension?.type === 'task_draft_review' ? taskWorkflowRun.value.suspension.draft : null);

  function projectRun(run: AIWorkflowRunView | null): void {
    if (!run || run.kind !== 'task.create') { taskWorkflowRun.value = null; taskWorkflowStage.value = 'collect'; clarificationAnswers.value = []; return; }
    taskWorkflowRun.value = run;
    const suspension = run.suspension;
    if (run.status === 'suspended' && suspension?.type === 'clarification_required') {
      taskWorkflowStage.value = 'clarification'; clarificationAnswers.value = suspension.questions.map(() => '');
    } else if (run.status === 'suspended' && suspension?.type === 'task_draft_review') {
      taskWorkflowStage.value = 'confirm'; linkedGoalId.value = suspension.draft.task.goalId;
    } else if (run.status === 'suspended' && suspension?.type === 'recovery_required') taskWorkflowStage.value = 'execute';
    else if (['completed', 'failed', 'cancelled'].includes(run.status)) { taskWorkflowStage.value = 'result'; clarificationAnswers.value = []; }
    else { taskWorkflowStage.value = 'plan'; clarificationAnswers.value = []; }
    options.scrollMessagesToBottom();
  }
  async function syncTaskWorkflowRun(runId: string): Promise<void> {
    if (!runId) return;
    try { projectRun(await options.workflowRuntime.get({ runId })); }
    catch (error) { toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed')); }
  }
  const taskAgentWaitingForClarification = computed(() => taskWorkflowRun.value?.status === 'suspended' && taskWorkflowRun.value.suspension?.type === 'clarification_required');
  const taskAgentWaitingForApproval = computed(() => taskWorkflowRun.value?.status === 'suspended' && taskWorkflowRun.value.suspension?.type === 'task_draft_review');
  const canSubmitTaskClarification = computed(() => taskWorkflowRun.value?.suspension?.type === 'clarification_required' && taskWorkflowRun.value.suspension.questions.every((_, i) => Boolean(clarificationAnswers.value[i]?.trim())));
  const canRetryTaskAgentExecution = computed(() => taskWorkflowRun.value?.status === 'suspended' && taskWorkflowRun.value.suspension?.type === 'recovery_required' && taskWorkflowRun.value.suspension.retryable && !taskAgentResuming.value);
  const canRunTaskAgent = computed(() => Boolean(options.selectedModel.value) && Boolean(options.chatConversationId.value) && !options.chatLoading.value && !taskAgentLoading.value && !taskAgentResuming.value && options.hasWorkflowUserMessages.value && (!taskWorkflowRun.value || ['completed', 'failed', 'cancelled'].includes(taskWorkflowRun.value.status)));
  const taskExecutionSummary = computed(() => { const receipt = taskWorkflowRun.value?.result; return receipt ? { status: receipt.status, executedCount: receipt.taskIds.length, failedCount: receipt.failures.length } : null; });
  const taskExecutionRecovery = computed(() => { const suspension = taskWorkflowRun.value?.suspension; return suspension?.type === 'recovery_required' ? { canRetry: suspension.retryable, suggestions: suspension.failures.map((failure) => getAIWorkflowFailureMessage(failure, t)) } : null; });

  async function startTaskAgentRun(): Promise<void> {
    if (!canRunTaskAgent.value || !options.selectedModel.value) return;
    const idea = options.buildConversationTranscript().trim(); if (!idea) return;
    taskAgentLoading.value = true;
    try {
      const goalId = linkedGoalId.value;
      const run = await options.workflowRuntime.start({ kind: 'task.create', conversationId: options.chatConversationId.value, input: { idea, ...(goalId ? { goalId } : {}) }, providerId: options.selectedModel.value.providerId, modelId: options.selectedModel.value.modelId, locale: locale.value.startsWith('en') ? 'en-US' : 'zh-CN' });
      projectRun(run);
      if (run.kind === 'task.create' && run.suspension?.type === 'task_draft_review') await options.maybeRenameCurrentConversation(run.suspension.draft.task.title);
    } catch (error) { toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed')); }
    finally { taskAgentLoading.value = false; }
  }
  async function resume(command: Parameters<typeof options.workflowRuntime.resume>[0]['command']): Promise<void> {
    const run = taskWorkflowRun.value; if (!run || taskAgentResuming.value) return;
    taskAgentResuming.value = true;
    try {
      const next = await options.workflowRuntime.resume({ runId: run.runId, command }); projectRun(next);
      if (next.kind === 'task.create' && next.status === 'completed' && next.result?.taskPlanId) await options.openCreatedTask?.(next.result.taskPlanId);
    } catch (error) { toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed')); }
    finally { taskAgentResuming.value = false; }
  }
  const confirmTaskAgentRun = () => resume({ type: 'approve' });
  const submitTaskClarification = () => resume({ type: 'answer', answers: clarificationAnswers.value.map((answer) => answer.trim()) });
  const retryTaskAgentExecution = () => resume({ type: 'retry' });
  const reviseTaskAgentRun = (patch: Record<string, unknown>) => resume({ type: 'edit_structured', patch });
  async function cancelTaskAgentRun(): Promise<void> { const run = taskWorkflowRun.value; if (!run || taskAgentResuming.value) return; if (run.status === 'suspended') return resume({ type: 'cancel' }); taskAgentResuming.value = true; try { projectRun(await options.workflowRuntime.cancel({ runId: run.runId })); } catch (error) { toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed')); } finally { taskAgentResuming.value = false; } }
  const completeTaskAgentRun = confirmTaskAgentRun;
  function setLinkedGoalId(goalId: string | null | undefined) { linkedGoalId.value = goalId?.trim() || null; }
  function resetTaskWorkflowLocalState() { taskWorkflowRun.value = null; taskWorkflowStage.value = 'collect'; clarificationAnswers.value = []; linkedGoalId.value = null; showTaskDraftEditor.value = false; taskAgentLoading.value = false; taskAgentResuming.value = false; }
  return { taskWorkflowRun, taskWorkflowStage, clarificationAnswers, linkedGoalId, showTaskDraftEditor, taskAgentLoading, taskAgentResuming, canRunTaskAgent, canSubmitTaskClarification, taskAgentWaitingForApproval, taskAgentWaitingForClarification, canRetryTaskAgentExecution, taskExecutionSummary, taskExecutionRecovery, reviewDraft, startTaskAgentRun, cancelTaskAgentRun, completeTaskAgentRun, reviseTaskAgentRun, retryTaskAgentExecution, confirmTaskAgentRun, submitTaskClarification, syncTaskWorkflowRun, resetTaskWorkflowLocalState, setLinkedGoalId, projectRun };
}
