import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import {
  GoalPlanDraftContentSchema,
  GoalPlanDraftSchema,
  type AIWorkflowRunView,
  type GoalPlanDraft,
  type GoalPlanDraftContent,
} from '@memoflow/contracts/ai';
import {
  createEmptyGoalDraft,
  type EditableGoal,
  type EditableGoalKnowledge,
  type EditableGoalTask,
  type EditableKeyResult,
  type GoalWorkflowStage,
  type GoalClarificationView,
  type UseAIGoalWorkflowOptions,
} from './types';
import { getAIErrorMessage } from './error';

/**
 * ADR-052 goal.create UI projection.
 *
 * The durable Mastra Workflow is authoritative. This composable owns only
 * editable presentation state and maps existing UI action names onto typed
 * Workflow commands. The durable Workflow is the only execution owner.
 */
export function useAIGoalWorkflow(options: UseAIGoalWorkflowOptions) {
  const { t, locale } = useI18n();
  const router = useRouter();

  const goalWorkflowRun = ref<Extract<AIWorkflowRunView, { kind: 'goal.create' }> | null>(null);

  const goalDraftLoading = ref(false);
  const goalWorkflowStage = ref<GoalWorkflowStage>('collect');
  const goalClarification = ref<GoalClarificationView | null>(null);
  const clarificationAnswers = ref<string[]>([]);
  const showGoalDraftEditor = ref(false);
  const creatingGoal = ref(false);
  const automationLoading = ref(false);
  const automationExecuting = ref(false);
  const goalAgentLoading = ref(false);
  const goalAgentResuming = ref(false);

  const editableGoal = ref<EditableGoal>(createEmptyGoalDraft());
  const editableKeyResults = ref<EditableKeyResult[]>([]);
  const editableTasks = ref<EditableGoalTask[]>([]);
  const editableKnowledge = ref<EditableGoalKnowledge[]>([]);

  function currentReviewDraft(): GoalPlanDraft | null {
    const suspension = goalWorkflowRun.value?.suspension;
    return suspension?.type === 'goal_draft_review' ? suspension.draft : null;
  }

  function projectDraftToEditor(draft: GoalPlanDraft): void {
    editableGoal.value = {
      name: draft.goal.name,
      summary: draft.goal.summary ?? '',
      status: draft.goal.status,
      startDate: draft.goal.startDate ?? null,
      target: draft.goal.target ?? null,
    };
    editableKeyResults.value = draft.keyResults.map((item) => ({
      draftRef: item.draftRef,
      title: item.title,
      description: item.description ?? '',
      aggregationMethod: item.aggregationMethod,
      initialValue: item.initialValue,
      currentValue: item.currentValue,
      targetValue: item.targetValue,
      target: item.target ?? null,
      unit: item.unit ?? '',
      weight: item.weight,
    }));
    const parsedDraft = GoalPlanDraftSchema.parse(draft);
    editableTasks.value = parsedDraft.tasks;
    editableKnowledge.value = parsedDraft.knowledge;
  }
  function projectRun(run: AIWorkflowRunView | null): void {
    if (!run || run.kind !== 'goal.create') {
      goalWorkflowRun.value = null;
      goalWorkflowStage.value = 'collect';
      goalClarification.value = null;
      clarificationAnswers.value = [];
      return;
    }

    goalWorkflowRun.value = run;
    const suspension = run.suspension;
    if (run.status === 'suspended' && suspension?.type === 'clarification_required') {
      goalWorkflowStage.value = 'clarification';
      goalClarification.value = {
        needsClarification: true,
        questions: suspension.questions.map((question) => ({ question, context: null })),
        rationale: null,
      };
      clarificationAnswers.value = suspension.questions.map(() => '');
      showGoalDraftEditor.value = false;
    } else if (run.status === 'suspended' && suspension?.type === 'goal_draft_review') {
      goalWorkflowStage.value = 'confirm';
      goalClarification.value = null;
      clarificationAnswers.value = [];
      projectDraftToEditor(suspension.draft);
    } else if (run.status === 'suspended' && suspension?.type === 'recovery_required') {
      goalWorkflowStage.value = 'execute';
      goalClarification.value = null;
      clarificationAnswers.value = [];
    } else if (
      run.status === 'completed' ||
      run.status === 'failed' ||
      run.status === 'cancelled'
    ) {
      goalWorkflowStage.value = 'result';
      goalClarification.value = null;
      clarificationAnswers.value = [];
      showGoalDraftEditor.value = false;
    } else {
      goalWorkflowStage.value = 'plan';
      goalClarification.value = null;
      clarificationAnswers.value = [];
    }
    options.scrollMessagesToBottom();
  }

  async function syncGoalWorkflowRun(runId: string): Promise<void> {
    if (!runId) return;
    try {
      projectRun(await options.workflowRuntime.get({ runId }));
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    }
  }

  function buildEditedDraftContent(draft: GoalPlanDraft): GoalPlanDraftContent {
    const goal = {
      ...draft.goal,
      name: editableGoal.value.name,
      summary: editableGoal.value.summary.trim() || null,
      status: editableGoal.value.status,
      startDate: editableGoal.value.startDate,
      target: editableGoal.value.target,
    };

    const priorKeyResults = new Map(draft.keyResults.map((item) => [item.draftRef, item]));
    const keyResults = editableKeyResults.value.map((item) => ({
      ...priorKeyResults.get(item.draftRef),
      draftRef: item.draftRef,
      title: item.title,
      description: item.description.trim() || null,
      aggregationMethod: item.aggregationMethod,
      initialValue: item.initialValue,
      currentValue: item.currentValue,
      targetValue: item.targetValue,
      target: item.target,
      unit: item.unit.trim() || null,
      weight: item.weight,
    }));

    return GoalPlanDraftContentSchema.parse({
      goal,
      keyResults,
      tasks: editableTasks.value,
      knowledge: editableKnowledge.value,
      rationale: draft.rationale,
      warnings: [...draft.warnings],
    });
  }
  function canonicalDraftContent(draft: GoalPlanDraft): GoalPlanDraftContent {
    const { revision: _revision, ...content } = draft;
    return GoalPlanDraftContentSchema.parse({
      ...content,
      goal: {
        ...content.goal,
        summary: content.goal.summary ?? null,
        startDate: content.goal.startDate ?? null,
        target: content.goal.target ?? null,
      },
      keyResults: content.keyResults.map((item) => ({
        ...item,
        description: item.description ?? null,
        target: item.target ?? null,
        unit: item.unit ?? null,
      })),
    });
  }

  async function flushStructuredEdits(): Promise<Extract<
    AIWorkflowRunView,
    { kind: 'goal.create' }
  > | null> {
    const run = goalWorkflowRun.value;
    const draft = currentReviewDraft();
    if (!run || run.status !== 'suspended' || !draft) return run;
    const edited = buildEditedDraftContent(draft);
    if (JSON.stringify(edited) === JSON.stringify(canonicalDraftContent(draft))) return run;

    const next = await options.workflowRuntime.resume({
      runId: run.runId,
      command: { type: 'edit_structured', patch: edited },
    });
    projectRun(next);
    return next.kind === 'goal.create' ? next : null;
  }

  const canSubmitGoalClarification = computed(() => {
    const suspension = goalWorkflowRun.value?.suspension;
    if (suspension?.type !== 'clarification_required') return false;
    return suspension.questions.every(
      (_, index) => (clarificationAnswers.value[index] || '').trim().length > 0,
    );
  });

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

  const goalAgentWaitingForClarification = computed(
    () =>
      goalWorkflowRun.value?.status === 'suspended' &&
      goalWorkflowRun.value.suspension?.type === 'clarification_required',
  );
  const goalAgentWaitingForApproval = computed(
    () =>
      goalWorkflowRun.value?.status === 'suspended' &&
      goalWorkflowRun.value.suspension?.type === 'goal_draft_review',
  );
  const goalAgentWaitingForExecution = computed(
    () =>
      goalWorkflowRun.value?.status === 'suspended' &&
      goalWorkflowRun.value.suspension?.type === 'recovery_required',
  );
  const canResumeGoalAgentClarification = computed(
    () =>
      goalAgentWaitingForClarification.value &&
      canSubmitGoalClarification.value &&
      !goalAgentResuming.value,
  );
  const canRetryGoalAgentExecution = computed(
    () =>
      goalAgentWaitingForExecution.value &&
      goalWorkflowRun.value?.suspension?.type === 'recovery_required' &&
      goalWorkflowRun.value.suspension.retryable &&
      !goalAgentResuming.value,
  );
  const canContinueGoalAgentExecution = canRetryGoalAgentExecution;

  const automatedGoalId = computed(
    () => goalWorkflowRun.value?.result?.referenceMap['goal'] ?? null,
  );
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

  async function startGoalAgentRun(): Promise<void> {
    if (!canRunGoalAgent.value) return;
    const selectedModel = options.selectedModel.value;
    if (!selectedModel) return;
    const idea = options.buildConversationTranscript().trim();
    if (!idea) return;

    goalAgentLoading.value = true;
    goalDraftLoading.value = true;
    try {
      const run = await options.workflowRuntime.start({
        kind: 'goal.create',
        conversationId: options.chatConversationId.value,
        input: { idea },
        providerId: selectedModel.providerId,
        modelId: selectedModel.modelId,
        locale: locale.value.startsWith('en') ? 'en-US' : 'zh-CN',
      });
      projectRun(run);
      const draft =
        run.kind === 'goal.create' && run.suspension?.type === 'goal_draft_review'
          ? run.suspension.draft
          : null;
      if (draft?.goal.name) await options.maybeRenameCurrentConversation(draft.goal.name);
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    } finally {
      goalAgentLoading.value = false;
      goalDraftLoading.value = false;
    }
  }

  async function generateGoalDraftFromConversation(): Promise<void> {
    await startGoalAgentRun();
  }

  async function submitGoalAgentClarification(): Promise<void> {
    const run = goalWorkflowRun.value;
    if (!run || !canResumeGoalAgentClarification.value) return;
    goalAgentResuming.value = true;
    try {
      projectRun(
        await options.workflowRuntime.resume({
          runId: run.runId,
          command: {
            type: 'answer',
            answers: clarificationAnswers.value.map((answer) => answer.trim()),
          },
        }),
      );
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    } finally {
      goalAgentResuming.value = false;
    }
  }

  async function confirmGoalAgentRun(hostOptions?: {
    title?: string;
    description?: string;
    goalId?: string | null;
    skipHostLifecycle?: boolean;
    revision?: number;
  }): Promise<void> {
    let run = goalWorkflowRun.value;
    if (!run || !goalAgentWaitingForApproval.value || goalAgentResuming.value) return;
    if (hostOptions?.title) editableGoal.value.name = hostOptions.title;
    if (hostOptions?.description !== undefined)
      editableGoal.value.summary = hostOptions.description;

    goalAgentResuming.value = true;
    creatingGoal.value = true;
    try {
      run = await flushStructuredEdits();
      if (!run || run.status !== 'suspended' || run.suspension?.type !== 'goal_draft_review')
        return;
      const completed = await options.workflowRuntime.resume({
        runId: run.runId,
        command: { type: 'approve' },
      });
      projectRun(completed);
      if (completed.kind === 'goal.create' && completed.status === 'completed') {
        toast.success(t('aiAssistant.goalAutomation.executionSuccess'));
      }
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    } finally {
      goalAgentResuming.value = false;
      creatingGoal.value = false;
    }
  }

  async function cancelGoalAgentRun(_hostOptions?: {
    skipHostLifecycle?: boolean;
    revision?: number;
  }): Promise<void> {
    const run = goalWorkflowRun.value;
    if (!run || goalAgentResuming.value) return;
    goalAgentResuming.value = true;
    try {
      if (run.status === 'suspended') {
        projectRun(
          await options.workflowRuntime.resume({
            runId: run.runId,
            command: { type: 'cancel' },
          }),
        );
      } else {
        projectRun(await options.workflowRuntime.cancel({ runId: run.runId }));
      }
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    } finally {
      goalAgentResuming.value = false;
    }
  }

  async function reviseGoalAgentRun(hostOptions?: {
    title?: string;
    description?: string;
    goalId?: string | null;
  }): Promise<void> {
    const run = goalWorkflowRun.value;
    if (!run || !goalAgentWaitingForApproval.value || goalAgentResuming.value) return;
    if (hostOptions?.title) editableGoal.value.name = hostOptions.title;
    if (hostOptions?.description !== undefined)
      editableGoal.value.summary = hostOptions.description;
    goalAgentResuming.value = true;
    try {
      await flushStructuredEdits();
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    } finally {
      goalAgentResuming.value = false;
    }
  }

  async function retryGoalAgentExecution(): Promise<void> {
    const run = goalWorkflowRun.value;
    if (!run || !canRetryGoalAgentExecution.value) return;
    goalAgentResuming.value = true;
    try {
      projectRun(
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

  async function openAutomatedGoal(): Promise<void> {
    if (!automatedGoalId.value) return;
    await router.push(`/goals/${automatedGoalId.value}`);
  }

  async function handleCreateGoalFromDraft(): Promise<void> {
    await confirmGoalAgentRun();
  }

  function nextKeyResultDraftRef(): EditableKeyResult['draftRef'] {
    const used = new Set(editableKeyResults.value.map((item) => item.draftRef));
    let suffix = editableKeyResults.value.length + 1;
    while (used.has(`kr:new-${suffix}`)) suffix += 1;
    return `kr:new-${suffix}`;
  }

  function addKeyResultDraft(): void {
    editableKeyResults.value.push({
      draftRef: nextKeyResultDraftRef(),
      title: '',
      description: '',
      aggregationMethod: 'Sum',
      initialValue: 0,
      currentValue: 0,
      targetValue: 1,
      target: null,
      unit: '',
      weight: 3,
    });
  }
  function removeKeyResultDraft(index: number): void {
    editableKeyResults.value.splice(index, 1);
  }
  function updateKeyResultDraft(payload: { index: number; value: EditableKeyResult }): void {
    editableKeyResults.value[payload.index] = { ...payload.value };
  }
  function handleUpdateGoalDraft(payload: EditableGoal): void {
    editableGoal.value = { ...payload };
  }
  function removeTaskDraft(index: number): void {
    editableTasks.value.splice(index, 1);
  }
  function updateTaskDraft(payload: { index: number; value: EditableGoalTask }): void {
    const currentDraft = currentReviewDraft();
    if (!currentDraft) return;
    const parsed = GoalPlanDraftSchema.parse({
      ...currentDraft,
      tasks: currentDraft.tasks.map((item, index) =>
        index === payload.index ? payload.value : item,
      ),
    });
    editableTasks.value[payload.index] = parsed.tasks[payload.index]!;
  }
  function removeKnowledgeDraft(index: number): void {
    editableKnowledge.value.splice(index, 1);
  }
  function updateKnowledgeDraft(payload: { index: number; value: EditableGoalKnowledge }): void {
    const currentDraft = currentReviewDraft();
    if (!currentDraft) return;
    const parsed = GoalPlanDraftSchema.parse({
      ...currentDraft,
      knowledge: currentDraft.knowledge.map((item, index) =>
        index === payload.index ? payload.value : item,
      ),
    });
    editableKnowledge.value[payload.index] = parsed.knowledge[payload.index]!;
  }
  function toggleGoalDraftEditor(): void {
    showGoalDraftEditor.value = !showGoalDraftEditor.value;
  }

  function resetGoalArtifacts(): void {
    goalWorkflowRun.value = null;
    goalWorkflowStage.value = 'collect';
    goalClarification.value = null;
    clarificationAnswers.value = [];
    showGoalDraftEditor.value = false;
    editableGoal.value = createEmptyGoalDraft();
    editableKeyResults.value = [];
    editableTasks.value = [];
    editableKnowledge.value = [];
  }
  return {
    goalDraftLoading,
    goalWorkflowStage,
    goalClarification,
    goalWorkflowRun,
    clarificationAnswers,
    showGoalDraftEditor,
    creatingGoal,
    automationLoading,
    automationExecuting,
    goalAgentLoading,
    goalAgentResuming,
    editableGoal,
    editableKeyResults,
    editableTasks,
    editableKnowledge,
    canSubmitGoalClarification,
    canRunGoalWorkflow,
    canPlanGoalAutomation,
    canRunGoalAgent,
    goalExecutionSummary,
    goalExecutionRecovery,
    automatedGoalId,
    goalAgentWaitingForClarification,
    goalAgentWaitingForApproval,
    goalAgentWaitingForExecution,
    canResumeGoalAgentClarification,
    canContinueGoalAgentExecution,
    canRetryGoalAgentExecution,
    resetGoalArtifacts,
    generateGoalDraftFromConversation,
    startGoalAgentRun,
    submitGoalAgentClarification,
    confirmGoalAgentRun,
    cancelGoalAgentRun,
    reviseGoalAgentRun,
    continueGoalAgentExecution,
    retryGoalAgentExecution,
    syncGoalWorkflowRun,
    openAutomatedGoal,
    handleCreateGoalFromDraft,
    addKeyResultDraft,
    removeKeyResultDraft,
    updateKeyResultDraft,
    handleUpdateGoalDraft,
    removeTaskDraft,
    updateTaskDraft,
    removeKnowledgeDraft,
    updateKnowledgeDraft,
    toggleGoalDraftEditor,
  };
}
