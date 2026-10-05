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
  let projectedMode: 'clarification' | 'review' | null = null;
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
  let pendingProjection: {
    runId: string;
    revision: number;
    mode: 'clarification' | 'review';
    promise: Promise<void>;
  } | null = null;

  type GoalNativeProjection = {
    mode: 'clarification' | 'review';
    draft: GoalPlanDraft;
    revision: number;
    ownerCreate?: {
      goalId: string;
      keyResultIds: Record<string, string>;
    };
  };

  function goalNativeProjection(
    run: Extract<AIWorkflowRunView, { kind: 'goal.create' }>,
  ): GoalNativeProjection | null {
    const suspension = run.suspension;
    if (suspension?.type === 'goal_draft_review') {
      return {
        mode: 'review',
        draft: suspension.draft,
        revision: suspension.revision,
        ownerCreate: suspension.ownerCreate,
      };
    }
    if (suspension?.type === 'clarification_required' && suspension.candidateDraft) {
      return {
        mode: 'clarification',
        draft: suspension.candidateDraft,
        revision: suspension.candidateDraft.revision,
      };
    }
    return null;
  }

  function applyNativeProjection(
    session: GoalNativeEditSession,
    projection: GoalNativeProjection,
    existingLabels: Awaited<ReturnType<typeof labelCatalog.existingNames>>,
  ): void {
    const ownerIds = projection.ownerCreate?.keyResultIds ?? {};
    session.coordinateSubmit(
      projection.mode === 'review' ? () => confirmGoalAgentRun() : async () => undefined,
    );
    const draft = projection.draft;
    const projectedKeyResultIds = draft.keyResults.map((item) => {
      const ownerId = ownerIds[item.draftRef];
      const id = (ownerId ??
        `workflow-draft-ref:${encodeURIComponent(item.draftRef)}`) as GoalNativeSubmitContext['keyResultIds'][number];
      return [item.draftRef, id] as const;
    });
    session.patch({
      name: draft.goal.name,
      summary: draft.goal.summary ?? '',
      description: draft.goal.description ?? '',
      reminderConfig: draft.goal.reminderConfig ?? null,
      status: draft.goal.status,
      start: draft.goal.start ?? null,
      target: draft.goal.target ?? null,
      labelIds: existingLabels.flatMap((item) => (item.label ? [item.label.id] : [])),
      keyResults: draft.keyResults.map((item, index) => ({
        id: projectedKeyResultIds[index]![1],
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
    pendingLabelNames = existingLabels.filter((item) => !item.label).map((item) => item.name);
    keyResultRefs = new Map(projectedKeyResultIds.map(([ref, id]) => [id, ref]));
    // During clarification the native owner surface stays editable, but its Save
    // action is still coordinated to a no-op until workflow review is ready.
    session.setEditingBlocked(false);
  }

  // Equivalent restores/review clicks share one projection attempt until owner registration.
  // This is session-local in-flight work, not a cache of owner truth or NOT_FOUND.
  function projectNativeReview(
    run: Extract<AIWorkflowRunView, { kind: 'goal.create' }>,
  ): Promise<void> {
    const projection = goalNativeProjection(run);
    if (!projection) return Promise.resolve();
    if (
      pendingProjection?.runId === run.runId &&
      pendingProjection.revision === projection.revision &&
      pendingProjection.mode === projection.mode
    )
      return pendingProjection.promise;
    const pending = {
      runId: run.runId,
      revision: projection.revision,
      mode: projection.mode,
      promise: performNativeReview(run, projection).finally(() => {
        if (pendingProjection === pending) pendingProjection = null;
      }),
    };
    pendingProjection = pending;
    return pending.promise;
  }

  async function performNativeReview(
    run: Extract<AIWorkflowRunView, { kind: 'goal.create' }>,
    projection: GoalNativeProjection,
  ): Promise<void> {
    if (
      nativeSession &&
      projectedRunId === run.runId &&
      projectedRevision === projection.revision
    ) {
      try {
        nativeSession.readDraftState();
      } catch {
        nativeSession = null;
      }
      if (nativeSession && projectedMode === 'review' && projection.mode === 'review') {
        await nativeSession.focus('name');
        return;
      }
    }

    const epoch = ++projectionEpoch;
    if (projection.mode === 'review' && projection.ownerCreate) {
      // Recover the owner-first/approve transport gap from canonical owner truth.
      // Once this revision has created a Goal, another edit revision must not create
      // a second Goal. Only the existing deterministic replay may continue.
      const canonical = await goalService.getGoalAggregateView(projection.ownerCreate.goalId);
      if (epoch !== projectionEpoch) return;
      if (canonical.ok) {
        const ids = canonical.data.keyResults.map((item) => String(item.id));
        const expected = Object.values(projection.ownerCreate.keyResultIds);
        if (
          String(canonical.data.goal.id) !== projection.ownerCreate.goalId ||
          ids.length !== expected.length ||
          new Set(ids).size !== expected.length ||
          expected.some((id) => !ids.includes(id))
        ) {
          throw new Error('Created Goal does not match the workflow owner identities');
        }
        if (nativeSession) {
          try {
            nativeSession.setEditingBlocked(false);
            nativeSession.requestCancel();
          } catch {
            /* Owner already retired the handle. */
          }
        }
        submitted = { runId: run.runId, revision: projection.revision };
        goalOwnerSubmitted.value = true;
        nativeSession = null;
        projectedRunId = null;
        projectedRevision = null;
        projectedMode = null;
        return;
      }
      if (canonical.error.code !== 'NOT_FOUND') throw canonical.error;
    }

    const existing = await labelCatalog.existingNames(projection.draft.goal.labels);
    if (epoch !== projectionEpoch) return;

    if (
      nativeSession &&
      projectedRunId === run.runId &&
      projectedRevision === projection.revision
    ) {
      nativeSession.setEditingBlocked(false);
      applyNativeProjection(nativeSession, projection, existing);
      projectedMode = projection.mode;
      submitted = null;
      goalOwnerSubmitted.value = false;
      await nativeSession.focus('name');
      return;
    }

    const session = await nativeSurface.openCreate();
    if (epoch !== projectionEpoch) {
      session.requestCancel();
      return;
    }
    applyNativeProjection(session, projection, existing);
    nativeSession = session;
    projectedRunId = run.runId;
    projectedRevision = projection.revision;
    projectedMode = projection.mode;
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
    pendingProjection = null;
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
    projectedMode = null;
    goalOwnerSubmitted.value = false;
  }

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

  function projectClarificationToTimeline(
    run: Extract<AIWorkflowRunView, { kind: 'goal.create' }>,
  ): void {
    const suspension = run.suspension;
    if (suspension?.type !== 'clarification_required') return;
    const id = `goal-clarification-${run.runId}-${suspension.round ?? 1}`;
    if (options.chatTimeline.value.some((item) => item.id === id)) return;
    const content = suspension.questions
      .map((question, index) =>
        suspension.questions.length === 1 ? question : `${index + 1}. ${question}`,
      )
      .join('\n');
    options.chatTimeline.value.push({ id, role: 'assistant', content, status: 'success' });
  }

  function projectSupportingProposalsToTimeline(
    run: Extract<AIWorkflowRunView, { kind: 'goal.create' }>,
  ): void {
    const suspension = run.suspension;
    if (suspension?.type !== 'goal_draft_review') return;
    const id = `goal-supporting-proposals-${run.runId}-${suspension.draft.revision}`;
    if (options.chatTimeline.value.some((item) => item.id === id)) return;
    const content = [
      ...suspension.draft.tasks.map((item) => `- ${item.title}`),
      ...suspension.draft.knowledge.map((item) => `- ${item.title}`),
    ].join('\n');
    if (content)
      options.chatTimeline.value.push({ id, role: 'assistant', content, status: 'success' });
  }
  function projectRun(run: AIWorkflowRunView | null, projectNative = true): Promise<void> {
    if (!run || run.kind !== 'goal.create') {
      goalWorkflowRun.value = null;
      goalWorkflowStage.value = 'collect';
      goalClarification.value = null;
      return Promise.resolve();
    }

    const nativeDraft = goalNativeProjection(run);
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
      projectClarificationToTimeline(run);
      if (suspension.candidateDraft) projectDraftToEditor(suspension.candidateDraft);
      if (projectNative && suspension.candidateDraft) {
        nativeProjection = projectNativeReview(run);
        void nativeProjection.catch((error) =>
          toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed')),
        );
      }
    } else if (run.status === 'suspended' && suspension?.type === 'goal_draft_review') {
      goalWorkflowStage.value = 'confirm';
      goalClarification.value = null;
      projectDraftToEditor(suspension.draft);
      projectSupportingProposalsToTimeline(run);
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
    } else if (
      run.status === 'completed' ||
      run.status === 'failed' ||
      run.status === 'cancelled'
    ) {
      goalWorkflowStage.value = 'result';
      goalClarification.value = null;
    } else {
      goalWorkflowStage.value = 'plan';
      goalClarification.value = null;
    }
    options.scrollMessagesToBottom();
    return projectNative && nativeDraft ? nativeProjection : Promise.resolve();
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
    if (
      next.kind === 'goal.create' &&
      next.suspension?.type === 'clarification_required' &&
      next.suspension.candidateDraft
    ) {
      const candidate = next.suspension.candidateDraft;
      const session = liveSession();
      if (JSON.stringify(session.readDraftState().draft) !== submittedSnapshot)
        throw new Error('Goal draft changed while saving its workflow revision; answer again');
      const rows = session.readDraftState().draft.keyResults;
      if (rows.length !== candidate.keyResults.length)
        throw new Error('Goal Key Result mapping changed while saving its workflow revision');
      const projectedIds = candidate.keyResults.map(
        (item) =>
          `workflow-draft-ref:${encodeURIComponent(item.draftRef)}` as GoalNativeSubmitContext['keyResultIds'][number],
      );
      session.patch({
        keyResults: rows.map((item, index) => ({ ...item, id: projectedIds[index]! })),
      });
      projectedRevision = candidate.revision;
      projectedMode = 'clarification';
      keyResultRefs = new Map(
        candidate.keyResults.map((item, index) => [projectedIds[index]!, item.draftRef]),
      );
    }
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

  async function submitGoalClarificationResponse(response: string): Promise<boolean> {
    let run = goalWorkflowRun.value;
    const normalized = response.trim();
    if (!run || !goalAgentWaitingForClarification.value || goalAgentResuming.value || !normalized)
      return false;
    goalAgentResuming.value = true;
    try {
      await nativeProjection;
      if (run.suspension?.type === 'clarification_required' && run.suspension.candidateDraft) {
        run = (await flushStructuredEdits()) ?? run;
      }
      if (run.suspension?.type !== 'clarification_required') return false;
      await projectRun(
        await options.workflowRuntime.resume({
          runId: run.runId,
          command: { type: 'answer', answers: [normalized] },
          workflowTurn: normalized,
        }),
      );
      return true;
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
      return false;
    } finally {
      goalAgentResuming.value = false;
    }
  }

  async function submitGoalRevisionResponse(response: string): Promise<boolean> {
    let run = goalWorkflowRun.value;
    const normalized = response.trim();
    if (!run || !goalAgentWaitingForApproval.value || goalAgentResuming.value || !normalized)
      return false;
    goalAgentResuming.value = true;
    try {
      await nativeProjection;
      run = (await flushStructuredEdits()) ?? run;
      if (run.suspension?.type !== 'goal_draft_review') return false;
      await projectRun(
        await options.workflowRuntime.resume({
          runId: run.runId,
          command: { type: 'revise_natural_language', instruction: normalized },
          workflowTurn: normalized,
        }),
      );
      return true;
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
      return false;
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
            command:
              run.suspension?.type === 'recovery_required'
                ? { type: 'cancel_remaining' }
                : { type: 'cancel' },
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
