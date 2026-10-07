import { type AIWorkflowRunView, type GoalPlanDraft } from '@memoflow/contracts/ai';
import { computed, onScopeDispose, ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { GOAL_SERVICE_KEY } from '../../../di/keys';
import { useGoalNativeSurface } from '../../../layouts/shell/useGoalNativeSurface';
import { useLabelCatalog } from '../../../shared/composables/useLabelCatalog';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import type {
  GoalNativeEditSession,
  GoalNativeSubmitContext,
} from '../../goal/composables/goalNativeEditSession';
import { getAIErrorMessage, getAIWorkflowTerminalFailureMessage } from './error';
import {
  buildEditedGoalDraftContent,
  canonicalDraftContent,
  goalNativeProjection,
  type GoalNativeProjection,
} from './goalDraftMapping';
import {
  type EditableGoalKnowledge,
  type EditableGoalTask,
  type UseAIGoalWorkflowOptions,
} from './types';

/** Goal owner review, revision freezing and owner-first recovery form one coordinator. */
export function useGoalNativeReviewCoordinator(input: {
  options: UseAIGoalWorkflowOptions;
  goalWorkflowRun: Ref<Extract<AIWorkflowRunView, { kind: 'goal.create' }> | null>;
  goalAgentResuming: Ref<boolean>;
  creatingGoal: Ref<boolean>;
  editableTasks: Ref<EditableGoalTask[]>;
  editableKnowledge: Ref<EditableGoalKnowledge[]>;
  currentReviewDraft: () => GoalPlanDraft | null;
  projectRun: (run: AIWorkflowRunView | null, projectNative?: boolean) => Promise<void>;
}) {
  const {
    options,
    goalWorkflowRun,
    goalAgentResuming,
    creatingGoal,
    editableTasks,
    editableKnowledge,
    currentReviewDraft,
    projectRun,
  } = input;
  const { t } = useI18n();
  const workflowFailureMessage = (run: Extract<AIWorkflowRunView, { kind: 'goal.create' }>) =>
    getAIWorkflowTerminalFailureMessage(run.failure, t);
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

  function applyNativeProjection(
    session: GoalNativeEditSession,
    projection: GoalNativeProjection,
    existingLabels: Awaited<ReturnType<typeof labelCatalog.existingNames>>,
  ): void {
    const ownerIds = projection.ownerCreate?.keyResultIds ?? {};
    session.coordinateSubmit(
      projection.mode === 'review' ? () => confirmGoalAgentRun() : async () => undefined,
      () => cancelGoalAgentRun(),
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

  async function flushStructuredEdits(): Promise<Extract<
    AIWorkflowRunView,
    { kind: 'goal.create' }
  > | null> {
    const run = goalWorkflowRun.value;
    const draft = currentReviewDraft();
    if (!run || run.status !== 'suspended' || !draft) return run;
    const edited = buildEditedGoalDraftContent({
      draft,
      native: liveSession().readDraftState().draft,
      labels: labelCatalog.labels.value,
      pendingLabelNames,
      keyResultRefs,
      tasks: editableTasks.value,
      knowledge: editableKnowledge.value,
    });
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
      const next = await options.workflowRuntime.resume({
        runId: run.runId,
        command: { type: 'answer', answers: [normalized] },
        workflowTurn: normalized,
      });
      await projectRun(next);
      if (next.kind === 'goal.create' && next.status === 'failed') {
        toast.error(workflowFailureMessage(next));
        return false;
      }
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
      const next = await options.workflowRuntime.resume({
        runId: run.runId,
        command: { type: 'revise_natural_language', instruction: normalized },
        workflowTurn: normalized,
      });
      await projectRun(next);
      if (next.kind === 'goal.create' && next.status === 'failed') {
        toast.error(workflowFailureMessage(next));
        return false;
      }
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

  function project(run: Extract<AIWorkflowRunView, { kind: 'goal.create' }>): Promise<void> {
    nativeProjection = projectNativeReview(run);
    return nativeProjection;
  }
  return {
    project,
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
  };
}
