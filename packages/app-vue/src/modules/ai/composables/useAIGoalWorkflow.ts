import { GOAL_SERVICE_KEY } from '../../../di/keys';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import { useGoalNativeSurface } from '../../../layouts/shell/useGoalNativeSurface';
import type {
  GoalNativeEditSession,
  GoalNativeSubmitContext,
} from '../../goal/composables/goalNativeEditSession';
import { useLabelCatalog } from '../../../shared/composables/useLabelCatalog';
import { computed, onScopeDispose, ref } from 'vue';
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
  const nativeSurface = useGoalNativeSurface();
  const labelCatalog = useLabelCatalog();
  const goalService = useStrictInject(GOAL_SERVICE_KEY, 'GoalService');
  let nativeSession: GoalNativeEditSession | null = null;
  let projectedRunId: string | null = null;
  let projectedRevision: number | null = null;
  let pendingOwnerAttempt: {
    runId: string;
    revision: number;
    goalId: string;
    keyResultIds: string[];
  } | null = null;
  const goalOwnerAttemptPending = ref(false);
  let pendingLabelNames: string[] = [];
  let keyResultRefs = new Map<string, string>();
  let projectionEpoch = 0;
  // A successful owner submit is remembered until approve returns; retrying approve
  // must never create a different revision after the native dialog has closed.
  let submitted: { runId: string; revision: number } | null = null;
  const goalOwnerSubmitted = ref(false);
  let nativeProjection: Promise<void> = Promise.resolve();

  async function projectNativeReview(
    run: Extract<AIWorkflowRunView, { kind: 'goal.create' }>,
  ): Promise<void> {
    const review = run.suspension;
    if (review?.type !== 'goal_draft_review') return;
    if (nativeSession && projectedRunId === run.runId && projectedRevision === review.revision) {
      try {
        nativeSession.readDraftState();
      } catch {
        nativeSession = null;
      }
      if (nativeSession) {
        await nativeSession.focus('name');
        return;
      }
    }
    const epoch = ++projectionEpoch;
    // Recover the owner-first/approve transport gap from canonical owner truth.
    // Once this revision has created a Goal, another edit revision must not create
    // a second Goal. Only the existing deterministic replay may continue.
    const canonical = await goalService.getGoalAggregateView(review.ownerCreate.goalId);
    if (epoch !== projectionEpoch) return;
    if (canonical.ok) {
      const ids = canonical.data.keyResults.map((item) => String(item.id));
      const expected = Object.values(review.ownerCreate.keyResultIds);
      if (
        String(canonical.data.goal.id) !== review.ownerCreate.goalId ||
        ids.length !== expected.length ||
        new Set(ids).size !== expected.length ||
        expected.some((id) => !ids.includes(id))
      ) {
        throw new Error('Created Goal does not match the workflow owner identities');
      }
      submitted = { runId: run.runId, revision: review.revision };
      goalOwnerSubmitted.value = true;
      nativeSession = null;
      projectedRunId = null;
      return;
    }
    if (canonical.error.code !== 'NOT_FOUND') throw canonical.error;
    const existing = await labelCatalog.existingNames(review.draft.goal.labels);
    if (epoch !== projectionEpoch) return;
    const session = await nativeSurface.openCreate();
    if (epoch !== projectionEpoch) {
      session.requestCancel();
      return;
    }
    // Claim coordination before projecting any draft values.
    session.coordinateSubmit(() => confirmGoalAgentRun());
    const draft = review.draft;
    session.patch({
      name: draft.goal.name,
      summary: draft.goal.summary ?? '',
      description: draft.goal.description ?? '',
      reminderConfig: draft.goal.reminderConfig ?? null,
      status: draft.goal.status,
      start: draft.goal.start ?? null,
      target: draft.goal.target ?? null,
      labelIds: existing.flatMap((item) => (item.label ? [item.label.id] : [])),
      keyResults: draft.keyResults.map((item) => ({
        id: review.ownerCreate.keyResultIds[
          item.draftRef
        ] as GoalNativeSubmitContext['keyResultIds'][number],
        title: item.title,
        description: item.description ?? null,
        calculationMethod: item.aggregationMethod,
        initialValue: item.initialValue,
        currentValue: item.currentValue,
        targetValue: item.targetValue,
        target: item.target ?? null,
        unit: item.unit ?? '',
        weight: item.weight,
      })),
    });
    pendingLabelNames = existing.filter((item) => !item.label).map((item) => item.name);
    keyResultRefs = new Map(
      Object.entries(review.ownerCreate.keyResultIds).map(([ref, id]) => [id, ref]),
    );
    nativeSession = session;
    projectedRunId = run.runId;
    projectedRevision = review.revision;
    submitted = null;
    goalOwnerSubmitted.value = false;
  }

  async function openGoalNativeReview(): Promise<void> {
    const run = goalWorkflowRun.value;
    if (
      !run ||
      run.suspension?.type !== 'goal_draft_review' ||
      goalAgentResuming.value ||
      submitted ||
      pendingOwnerAttempt
    )
      return;
    try {
      nativeProjection = projectNativeReview(run);
      await nativeProjection;
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    }
  }

  onScopeDispose(retireNativeReview);

  function liveSession(): GoalNativeEditSession {
    if (!nativeSession || projectedRunId !== goalWorkflowRun.value?.runId)
      throw new Error('Open the native Goal review before confirming');
    nativeSession.readDraftState(); // Owner rejects closed/deactivated handles.
    return nativeSession;
  }

  function retireNativeReview(): void {
    projectionEpoch += 1;
    if (nativeSession) {
      try {
        nativeSession.setEditingBlocked(false);
        nativeSession.requestCancel();
      } catch {
        /* Owner already retired the handle. */
      }
    }
    nativeSession = null;
    projectedRunId = null;
    submitted = null;
    pendingOwnerAttempt = null;
    goalOwnerAttemptPending.value = false;
    projectedRevision = null;
    goalOwnerSubmitted.value = false;
  }

  const goalWorkflowRun = ref<Extract<AIWorkflowRunView, { kind: 'goal.create' }> | null>(null);

  const goalDraftLoading = ref(false);
  const goalWorkflowStage = ref<GoalWorkflowStage>('collect');
  const goalClarification = ref<GoalClarificationView | null>(null);
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

  function currentReviewDraft(): GoalPlanDraft | null {
    const suspension = goalWorkflowRun.value?.suspension;
    return suspension?.type === 'goal_draft_review' ? suspension.draft : null;
  }

  function projectDraftToEditor(draft: GoalPlanDraft): void {
    const parsedDraft = GoalPlanDraftSchema.parse(draft);
    editableTasks.value = parsedDraft.tasks;
    editableKnowledge.value = parsedDraft.knowledge;
  }
  function projectRun(run: AIWorkflowRunView | null, projectNative = true): Promise<void> {
    if (!run || run.kind !== 'goal.create') {
      goalWorkflowRun.value = null;
      goalWorkflowStage.value = 'collect';
      goalClarification.value = null;
      clarificationAnswers.value = [];
      return Promise.resolve();
    }

    if (run.suspension?.type !== 'goal_draft_review') retireNativeReview();
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
    } else if (run.status === 'suspended' && suspension?.type === 'goal_draft_review') {
      goalWorkflowStage.value = 'confirm';
      goalClarification.value = null;
      clarificationAnswers.value = [];
      projectDraftToEditor(suspension.draft);
      if (projectNative) {
        nativeProjection = projectNativeReview(run);
        // projectRun is also consumed by shell callers; keep errors visible without an unhandled rejection.
        void nativeProjection.catch((error) =>
          toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed')),
        );
      }
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
    } else {
      goalWorkflowStage.value = 'plan';
      goalClarification.value = null;
      clarificationAnswers.value = [];
    }
    options.scrollMessagesToBottom();
    return projectNative && suspension?.type === 'goal_draft_review'
      ? nativeProjection
      : Promise.resolve();
  }

  async function syncGoalWorkflowRun(runId: string): Promise<void> {
    if (!runId) return;
    try {
      await projectRun(await options.workflowRuntime.get({ runId }));
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    }
  }

  function buildEditedDraftContent(draft: GoalPlanDraft): GoalPlanDraftContent {
    const native = liveSession().readDraftState().draft;
    const goal = {
      ...draft.goal,
      name: native.name,
      summary: native.summary.trim() || null,
      status: native.status,
      start: native.start,
      target: native.target,
      description: native.description.trim() || null,
      reminderConfig: native.reminderConfig,
      labels: [
        ...new Set([
          ...native.labelIds.map((id) => {
            const label = labelCatalog.labels.value.find((item) => item.id === id);
            if (!label) throw new Error('Selected Goal label is unavailable');
            return label.name;
          }),
          ...pendingLabelNames,
        ]),
      ],
    };
    const used = new Set(draft.keyResults.map((item) => item.draftRef));
    const keyResults = native.keyResults.map((item) => {
      let draftRef = item.id ? keyResultRefs.get(item.id) : undefined;
      if (!draftRef) {
        let suffix = 1;
        while (used.has(`kr:new-${suffix}`)) suffix += 1;
        draftRef = `kr:new-${suffix}`;
        used.add(draftRef);
      }
      return {
        draftRef,
        title: item.title,
        description: item.description?.trim() || null,
        aggregationMethod: item.calculationMethod,
        initialValue: item.initialValue,
        currentValue: item.currentValue,
        targetValue: item.targetValue,
        target: item.target ?? null,
        unit: item.unit?.trim() || null,
        weight: item.weight,
      };
    });
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
        description: content.goal.description ?? null,
        reminderConfig: content.goal.reminderConfig ?? null,
        start: content.goal.start ?? null,
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

    const submittedSnapshot = JSON.stringify(liveSession().readDraftState().draft);
    const next = await options.workflowRuntime.resume({
      runId: run.runId,
      command: { type: 'edit_structured', patch: edited },
    });
    await projectRun(next, false);
    if (next.kind === 'goal.create' && next.suspension?.type === 'goal_draft_review') {
      const review = next.suspension;
      const session = liveSession();
      if (JSON.stringify(session.readDraftState().draft) !== submittedSnapshot)
        throw new Error('Goal review changed while saving its workflow revision; confirm again');
      const rows = session.readDraftState().draft.keyResults;
      session.patch({
        keyResults: rows.map((item, index) => ({
          ...item,
          id: review.ownerCreate.keyResultIds[
            edited.keyResults[index]!.draftRef
          ] as GoalNativeSubmitContext['keyResultIds'][number],
        })),
      });
      projectedRevision = review.revision;
      keyResultRefs = new Map(
        Object.entries(review.ownerCreate.keyResultIds).map(([ref, id]) => [id, ref]),
      );
    }
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
      await projectRun(run);
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
      await projectRun(
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

  async function reconcileOwnerAttempt(): Promise<boolean> {
    const attempt = pendingOwnerAttempt;
    if (!attempt) return false;
    const owner = await goalService.getGoalAggregateView(attempt.goalId);
    if (!owner.ok) {
      if (owner.error.code !== 'NOT_FOUND') throw owner.error;
      // Definite absence permits another owner attempt with these same identities.
      // Keep the revision frozen: a lost response must never enable edit_structured.
      return false;
    }
    const ids = owner.data.keyResults.map((item) => String(item.id));
    const expected = attempt.keyResultIds;
    if (
      String(owner.data.goal.id) !== attempt.goalId ||
      ids.length !== expected.length ||
      new Set(ids).size !== expected.length ||
      expected.some((id) => !ids.includes(id))
    )
      throw new Error('Created Goal does not match the workflow owner identities');
    submitted = { runId: attempt.runId, revision: attempt.revision };
    goalOwnerSubmitted.value = true;
    pendingOwnerAttempt = null;
    goalOwnerAttemptPending.value = false;
    return true;
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
    if (
      !pendingOwnerAttempt &&
      !submitted &&
      (hostOptions?.title || hostOptions?.description !== undefined)
    )
      liveSession().patch({
        ...(hostOptions.title ? { name: hostOptions.title } : {}),
        ...(hostOptions.description !== undefined ? { summary: hostOptions.description } : {}),
      });

    goalAgentResuming.value = true;
    creatingGoal.value = true;
    try {
      if (pendingOwnerAttempt) await reconcileOwnerAttempt();
      // A failed initial projection can be retried independently by opening review.
      await nativeProjection;
      if (
        !submitted ||
        submitted.runId !== run.runId ||
        submitted.revision !== currentReviewDraft()?.revision
      ) {
        if (!pendingOwnerAttempt) run = await flushStructuredEdits();
        if (!run || run.suspension?.type !== 'goal_draft_review') return;
        const review = run.suspension;
        const session = liveSession();
        const expectedDraft = session.readDraftState().draft;
        let saved;
        try {
          // Only the controlled same-revision retry may temporarily release the
          // owner lock. requestSubmit synchronously takes the owner's busy lock.
          if (pendingOwnerAttempt) session.setEditingBlocked(false);
          saved = await session.requestSubmit({
            onCreateAttempt: () => {
              pendingOwnerAttempt = {
                runId: run!.runId,
                revision: review.revision,
                goalId: review.ownerCreate.goalId,
                keyResultIds: Object.values(review.ownerCreate.keyResultIds),
              };
              goalOwnerAttemptPending.value = true;
              session.setEditingBlocked(true);
            },
            createId: review.ownerCreate.goalId as GoalNativeSubmitContext['createId'],
            keyResultIds: review.draft.keyResults.map(
              (item) =>
                review.ownerCreate.keyResultIds[
                  item.draftRef
                ] as GoalNativeSubmitContext['keyResultIds'][number],
            ),
            pendingLabelNames: [...pendingLabelNames],
            expectedDraft,
          });
        } catch (error) {
          if (!pendingOwnerAttempt || !(await reconcileOwnerAttempt())) throw error;
        }
        if (!saved || String(saved.id) !== review.ownerCreate.goalId) {
          if (!submitted && (!pendingOwnerAttempt || !(await reconcileOwnerAttempt()))) return;
        }
        submitted = { runId: run.runId, revision: review.revision };
        pendingOwnerAttempt = null;
        goalOwnerAttemptPending.value = false;
        goalOwnerSubmitted.value = true;
      }
      if (!run || run.status !== 'suspended' || run.suspension?.type !== 'goal_draft_review')
        return;
      const completed = await options.workflowRuntime.resume({
        runId: run.runId,
        command: { type: 'approve' },
      });
      await projectRun(completed, false);
      if (completed.kind === 'goal.create' && completed.status === 'completed') {
        toast.success(t('aiAssistant.goalAutomation.executionSuccess'));
      }
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    } finally {
      goalAgentResuming.value = false;
      creatingGoal.value = false;
      if (pendingOwnerAttempt || submitted) {
        try {
          nativeSession?.setEditingBlocked(true);
        } catch {
          /* Owner closed after save. */
        }
      }
    }
  }

  async function cancelGoalAgentRun(_hostOptions?: {
    skipHostLifecycle?: boolean;
    revision?: number;
  }): Promise<void> {
    const run = goalWorkflowRun.value;
    if (!run || goalAgentResuming.value || pendingOwnerAttempt) return;
    goalAgentResuming.value = true;
    try {
      retireNativeReview();
      if (run.status === 'suspended') {
        await projectRun(
          await options.workflowRuntime.resume({
            runId: run.runId,
            command: { type: 'cancel' },
          }),
        );
      } else {
        await projectRun(await options.workflowRuntime.cancel({ runId: run.runId }));
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
    if (
      !run ||
      !goalAgentWaitingForApproval.value ||
      goalAgentResuming.value ||
      submitted ||
      pendingOwnerAttempt
    )
      return;
    if (hostOptions?.title || hostOptions?.description !== undefined)
      liveSession().patch({
        ...(hostOptions.title ? { name: hostOptions.title } : {}),
        ...(hostOptions.description !== undefined ? { summary: hostOptions.description } : {}),
      });
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

  async function openAutomatedGoal(): Promise<void> {
    if (!automatedGoalId.value) return;
    await router.push(`/goals/${automatedGoalId.value}`);
  }

  function removeTaskDraft(index: number): void {
    if (goalAgentResuming.value || creatingGoal.value || submitted || pendingOwnerAttempt) return;
    editableTasks.value.splice(index, 1);
  }
  function updateTaskDraft(payload: { index: number; value: EditableGoalTask }): void {
    if (goalAgentResuming.value || creatingGoal.value || submitted || pendingOwnerAttempt) return;
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
    if (goalAgentResuming.value || creatingGoal.value || submitted || pendingOwnerAttempt) return;
    editableKnowledge.value.splice(index, 1);
  }
  function updateKnowledgeDraft(payload: { index: number; value: EditableGoalKnowledge }): void {
    if (goalAgentResuming.value || creatingGoal.value || submitted || pendingOwnerAttempt) return;
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
    clarificationAnswers.value = [];
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
    projectRun,
    openGoalNativeReview,
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
    removeTaskDraft,
    updateTaskDraft,
    removeKnowledgeDraft,
    updateKnowledgeDraft,
  };
}

export type { UseAIGoalWorkflowOptions } from './types';
