import {
  GoalPlanDraftSchema,
  type AIWorkflowRunView,
  type GoalPlanDraft,
} from '@memoflow/ai-contracts';
import { computed, onScopeDispose, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import {
  getAIErrorMessage,
  getGoalWorkflowInterruptionMessage,
  workflowInterruptionFailure,
} from './error';
import type { ChatItem } from './types';
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
import { useGoalWorkflowEvents } from './useGoalWorkflowEvents';

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
  let startEpoch = 0;
  let runtimeMessageId: string | null = null;
  let projectGoalEventsNative = true;
  let roundSelection: {
    runId?: string;
    requestedModel: { name: string; provider: string };
  } | null = null;
  const goalPlanningInterrupted = ref(false);

  function runtimeStatus(content: string, status: ChatItem['status']) {
    let item = options.chatTimeline.value.find((entry) => entry.id === runtimeMessageId);
    if (!item) {
      runtimeMessageId = `goal-runtime:${options.chatConversationId.value}:${++startMessageSequence}`;
      item = { id: runtimeMessageId, role: 'assistant', content, status };
      options.chatTimeline.value.push(item);
    }
    item.content = content;
    item.status = status;
    goalPlanningInterrupted.value = status === 'interrupted';
    delete item.workflowInterruption;
    delete item.errorMessage;
    options.scrollMessagesToBottom();
    return item;
  }
  function projectInterruption(run: Extract<AIWorkflowRunView, { kind: 'goal.create' }>) {
    const interruption = {
      failure: run.failure,
      draftPreserved: review.goalDraftPreserved.value && !review.goalRestartPending.value,
      ...(roundSelection?.runId === run.runId
        ? { requestedModel: roundSelection.requestedModel }
        : {}),
    };
    const item = runtimeStatus(getGoalWorkflowInterruptionMessage(interruption, t), 'interrupted');
    item.workflowInterruption = interruption;
  }
  onScopeDispose(() => {
    startEpoch++;
  });

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
  watch(
    goalAgentResuming,
    (resuming) => {
      if (resuming) runtimeStatus(t('aiAssistant.businessSurface.resuming'), 'generating');
      else if (goalWorkflowRun.value) {
        const status = goalWorkflowRun.value.status;
        if (status === 'failed') {
          projectInterruption(goalWorkflowRun.value);
          return;
        }
        runtimeStatus(
          t(`aiAssistant.businessSurface.${status === 'suspended' ? 'waiting' : status}`),
          status === 'running' ? 'generating' : status === 'cancelled' ? 'aborted' : 'success',
        );
      }
    },
    { flush: 'sync' },
  );

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
    detachFailedReview,
    submitGoalClarificationResponse,
    submitGoalRevisionResponse,
    confirmGoalAgentRun,
    cancelGoalAgentRun: cancelReviewRun,
    goalSurfaceConflict,
    goalSurfaceReady,
    goalManualHandoff,
    goalDraftPreserved,
    goalSurfaceControlLost,
    goalSurfaceRecovering,
    goalRestartPending,
    focusPreservedGoal,
    continueGoalSurfaceControl,
    handoffGoalNativeReview,
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
    const previous = goalWorkflowRun.value;
    if (
      run?.kind === 'goal.create' &&
      run.status === 'running' &&
      run.awaitAfterVersion &&
      previous?.runId === run.runId &&
      (previous.resourceVersion ?? 0) > run.awaitAfterVersion
    )
      return Promise.resolve();
    projectGoalEventsNative = projectNative;
    if (!run || run.kind !== 'goal.create') {
      goalWorkflowRun.value = null;
      goalWorkflowStage.value = 'collect';
      goalClarification.value = null;
      return Promise.resolve();
    }

    const nativeDraft = goalNativeProjection(run);
    let projection = Promise.resolve();
    if (run.status === 'failed') detachFailedReview(run);
    else if (
      !nativeDraft &&
      !(
        run.status === 'running' &&
        (run.liveActions?.length ||
          (goalSurfaceReady.value && goalWorkflowRun.value?.runId === run.runId))
      )
    )
      retireNativeReview();
    goalWorkflowRun.value = run;
    if (run.status === 'running') {
      runtimeStatus(t('aiAssistant.businessSurface.running'), 'generating');
      if (projectNative && run.liveActions?.length) {
        const liveProjection = review.projectLive(run);
        projection = liveProjection;
        void liveProjection.catch(() => review.freezeGoalSurfaceControl());
      }
    } else if (run.status === 'failed') projectInterruption(run);
    else if (runtimeMessageId)
      runtimeStatus(
        t(`aiAssistant.businessSurface.${run.status === 'suspended' ? 'waiting' : run.status}`),
        run.status === 'cancelled' ? 'aborted' : 'success',
      );
    const suspension = run.suspension;
    if (run.status === 'suspended' && suspension?.type === 'clarification_required') {
      goalWorkflowStage.value = 'clarification';
      goalClarification.value = {
        needsClarification: true,
        questions: suspension.questions.map((question) => ({
          question,
          context: null,
        })),
        rationale: null,
      };
      projectTimeline(run);
      if (suspension.candidateDraft) projectDraftToEditor(suspension.candidateDraft);
      if (projectNative && suspension.candidateDraft) {
        const nativeProjection = review.project(run);
        projection = nativeProjection;
        void nativeProjection.catch(() => review.freezeGoalSurfaceControl());
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
        void nativeProjection.catch(() => review.freezeGoalSurfaceControl());
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
    if (goalRestartPending.value) review.keepGoalRestartReadonly();
    options.scrollMessagesToBottom();
    return projection;
  }

  const goalEvents = useGoalWorkflowEvents({
    current: () => goalWorkflowRun.value,
    runtime: options.workflowRuntime,
    project: (run) =>
      projectRun(
        run,
        !goalAgentResuming.value && (projectGoalEventsNative || goalSurfaceReady.value),
      ),
    missing: () => {
      review.freezeGoalSurfaceControl();
      runtimeStatus(t('aiAssistant.errors.workflowReadUnavailable'), 'interrupted');
    },
  });

  async function syncGoalWorkflowRun(runId: string): Promise<void> {
    if (!runId) return;
    try {
      await projectRun(await options.workflowRuntime.get({ runId }));
    } catch (error) {
      if (goalWorkflowRun.value) review.freezeGoalSurfaceControl();
      else toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowReadUnavailable'));
    }
  }

  const canRunGoalAgent = computed(
    () =>
      Boolean(options.selectedModel.value) &&
      Boolean(options.chatConversationId.value) &&
      !options.chatLoading.value &&
      !goalAgentLoading.value &&
      !goalAgentResuming.value &&
      !goalRestartPending.value &&
      !goalSurfaceControlLost.value &&
      !goalOwnerAttemptPending.value &&
      !(
        goalWorkflowRun.value?.status === 'failed' &&
        (goalOwnerSubmitted.value || goalWorkflowRun.value.result?.referenceMap.goal)
      ) &&
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

    const epoch = ++startEpoch;
    goalAgentLoading.value = true;
    goalDraftLoading.value = true;
    runtimeMessageId = null; // Each new round keeps its predecessor's interruption in history.
    const selection: NonNullable<typeof roundSelection> = {
      requestedModel: {
        name: selectedModel.modelName,
        provider: selectedModel.providerName,
      },
    };
    roundSelection = selection;
    runtimeStatus(t('aiAssistant.businessSurface.requesting'), 'generating');
    try {
      const previousRun = goalWorkflowRun.value;
      const sourceDraft =
        previousRun?.status === 'failed' ? review.prepareGoalRestart(previousRun.runId) : undefined;
      const run = await options.workflowRuntime.start({
        kind: 'goal.create',
        conversationId: options.chatConversationId.value,
        input: { idea, ...(sourceDraft ? { sourceDraft } : {}) },
        ...(workflowTurn?.trim() ? { workflowTurn: workflowTurn.trim() } : {}),
        agentInstanceId: selectedModel.agentInstanceId,
        providerId: selectedModel.providerId,
        modelId: selectedModel.modelId,
        locale: locale.value.startsWith('en') ? 'en-US' : 'zh-CN',
      });
      selection.runId = run.runId;
      if (epoch !== startEpoch) {
        if (!['completed', 'failed', 'cancelled'].includes(run.status)) {
          const cancelled = await options.workflowRuntime.cancel({
            runId: run.runId,
          });
          if (!cancelled || cancelled.status !== 'cancelled') {
            review.keepGoalRestartReadonly();
            if (runtimeMessageId)
              runtimeStatus(t('aiAssistant.businessSurface.cancelUnconfirmed'), 'interrupted');
            return false;
          }
          if (cancelled?.kind === 'goal.create') await review.adoptGoalRestart(cancelled);
        } else if (run.kind === 'goal.create') {
          await review.adoptGoalRestart(run);
        }
        if (runtimeMessageId) runtimeStatus(t('aiAssistant.businessSurface.cancelled'), 'aborted');
        return false;
      }
      if (run.kind === 'goal.create') await review.adoptGoalRestart(run);
      await projectRun(run);
      if (run.kind === 'goal.create' && run.status === 'failed') {
        return false;
      }
      const draft =
        run.kind === 'goal.create' && run.suspension?.type === 'goal_draft_review'
          ? run.suspension.draft
          : null;
      if (draft?.goal.name) await options.maybeRenameCurrentConversation(draft.goal.name);
      return true;
    } catch (error) {
      review.keepGoalRestartReadonly();
      if (epoch === startEpoch) {
        const failure = workflowInterruptionFailure(error);
        const interruption: NonNullable<ChatItem['workflowInterruption']> = {
          failure,
          draftPreserved: goalDraftPreserved.value && !goalRestartPending.value,
          requestedModel: selection.requestedModel,
          confirmation: failure.code === 'RATE_LIMITED' ? 'stopped' : 'unconfirmed',
        };
        runtimeStatus(
          getGoalWorkflowInterruptionMessage(interruption, t),
          'interrupted',
        ).workflowInterruption = interruption;
      } else if (runtimeMessageId) {
        runtimeStatus(t('aiAssistant.businessSurface.cancelUnconfirmed'), 'interrupted');
      }
      return false;
    } finally {
      goalAgentLoading.value = false;
      goalDraftLoading.value = false;
    }
  }

  async function cancelGoalAgentRun(): Promise<void> {
    if (goalAgentResuming.value || goalOwnerAttemptPending.value) return;
    startEpoch++;
    if (goalAgentLoading.value) {
      runtimeStatus(t('aiAssistant.businessSurface.cancelling'), 'generating');
      return;
    }
    await cancelReviewRun();
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
    startEpoch++;
    runtimeMessageId = null;
    goalPlanningInterrupted.value = false;
    retireNativeReview();
    goalWorkflowRun.value = null;
    goalWorkflowStage.value = 'collect';
    goalClarification.value = null;
    editableTasks.value = [];
    editableKnowledge.value = [];
  }
  return {
    goalDraftLoading,
    goalEventsConnected: goalEvents.connected,
    goalOwnerSubmitted,
    goalOwnerAttemptPending,
    goalSurfaceConflict,
    goalSurfaceReady,
    goalManualHandoff,
    goalSurfaceControlLost,
    goalSurfaceRecovering,
    goalDraftPreserved,
    goalPlanningInterrupted,
    goalRestartPending,
    focusPreservedGoal,
    continueGoalSurfaceControl,
    handoffGoalNativeReview,
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

let startMessageSequence = 0;
export type { UseAIGoalWorkflowOptions } from './types';
