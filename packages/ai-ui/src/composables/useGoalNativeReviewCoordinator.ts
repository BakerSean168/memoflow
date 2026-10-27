import {
  type AIWorkflowRunView,
  type GoalPlanDraft,
  type GoalWorkflowLiveActionRecord,
  type GoalCreateClientInput,
} from '@memoflow/ai-contracts';
import { computed, onScopeDispose, ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { GOAL_SERVICE_KEY } from '../ai-ui-host';
import { useGoalNativeSurface } from '../ai-ui-host';
import { useLabelCatalog } from '../ai-ui-host';
import { useStrictInject } from '../ai-ui-host';
import type {
  GoalNativeEditSession,
  GoalNativeDraftState,
  GoalNativeSubmitContext,
} from '../host-ports/goal-session';
import { getAIErrorMessage } from './error';
import { useGoalSurfaceLease } from './useGoalSurfaceLease';
import {
  buildEditedGoalDraftContent,
  buildGoalPlanningSeed,
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
  const nativeSurface = useGoalNativeSurface();
  const goalSurfaceConflict = ref(false);
  const goalSurfaceReady = ref(false);
  const goalManualHandoff = ref(false);
  const goalDraftPreserved = ref(false);
  const goalSurfaceControlLost = ref(false);
  const goalSurfaceRecovering = ref(false);
  const goalRestartPending = ref(false);
  let pendingRestart: {
    session: GoalNativeEditSession;
    snapshot: GoalNativeDraftState;
    source: NonNullable<GoalCreateClientInput['sourceDraft']>;
    epoch: number;
    runId?: string;
  } | null = null;
  const labelCatalog = useLabelCatalog();
  const goalService = useStrictInject(GOAL_SERVICE_KEY, 'GoalService');
  let nativeSession: GoalNativeEditSession | null = null;
  let projectedRunId: string | null = null;
  let projectedRevision: number | null = null;
  let projectedMode: 'clarification' | 'review' | 'live' | null = null;
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
  const appliedLiveActionIds = new Set<string>();
  let pendingLiveProjection: {
    runId: string;
    lastSequence: number;
    promise: Promise<void>;
  } | null = null;
  function freezeGoalSurfaceControl(): void {
    // Loss of authority is not loss of business data. Freeze in place until
    // an explicit recovery obtains a fresh server fence or confirms termination.
    projectionEpoch++;
    goalSurfaceControlLost.value = true;
    goalSurfaceConflict.value = true;
    goalSurfaceReady.value = false;
    if (nativeSession) {
      try {
        nativeSession.setEditingBlocked(true);
      } catch {
        /* An already closed owner handle has no draft to freeze. */
      }
    }
  }
  const surfaceLease = useGoalSurfaceLease(options.workflowRuntime, freezeGoalSurfaceControl);

  function recordNativeLiveAction(runId: string, record: GoalWorkflowLiveActionRecord): void {
    const id = `goal-native-live:${runId}:${record.command.revision}:${record.command.actionId}`;
    if (options.chatTimeline.value.some((item) => item.id === id)) return;
    options.chatTimeline.value.push({
      id,
      role: 'assistant',
      status: 'success',
      content: t('aiAssistant.businessSurface.formUpdated', {
        revision: record.command.revision,
      }),
      businessOperation: {
        runId,
        revision: record.command.revision,
        operation: record.command.operation,
      },
    });
  }

  function restoredSession(runId: string) {
    const session = nativeSurface.locate();
    if (!session) return null;
    try {
      const snapshot = session.readDraftState();
      return snapshot.mode === 'create' &&
        snapshot.goalId === null &&
        !snapshot.busy &&
        snapshot.restoredWorkflowRunId === runId
        ? { session, snapshot }
        : null;
    } catch {
      return null;
    }
  }

  function applyNativeLiveCommand(
    session: GoalNativeEditSession,
    record: GoalWorkflowLiveActionRecord,
  ): void {
    const { command } = record;
    if (command.operation === 'goal.setName') {
      session.patch({ name: command.value });
    } else if (command.operation === 'goal.patchDescription') {
      session.patch({ description: command.value ?? '' });
    } else if (command.operation === 'goal.setStart') {
      session.patch({ start: command.value });
    } else if (command.operation === 'goal.setTarget') {
      session.patch({ target: command.value });
    } else if (command.operation === 'goal.patchKeyResults') {
      const ids = command.value.map(
        (item) =>
          `workflow-draft-ref:${encodeURIComponent(item.draftRef)}` as GoalNativeSubmitContext['keyResultIds'][number],
      );
      session.patch({
        keyResults: command.value.map((item, index) => ({
          id: ids[index]!,
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
      keyResultRefs = new Map(command.value.map((item, index) => [ids[index]!, item.draftRef]));
    }
  }

  async function performLiveProjection(
    run: Extract<AIWorkflowRunView, { kind: 'goal.create' }>,
  ): Promise<void> {
    if (
      run.status !== 'running' ||
      !run.liveActions?.length ||
      goalSurfaceControlLost.value ||
      goalManualHandoff.value ||
      pendingOwnerAttempt ||
      submitted ||
      run.result?.referenceMap.goal
    )
      return;
    const actions = [...run.liveActions].sort((a, b) => a.sequence - b.sequence);
    const appliedKey = (record: GoalWorkflowLiveActionRecord) =>
      `${record.command.revision}:${record.command.actionId}`;
    const unapplied = actions.filter((record) => !appliedLiveActionIds.has(appliedKey(record)));
    if (unapplied.length === 0) return;
    let session = nativeSession;
    if (session && projectedRunId !== run.runId) {
      goalSurfaceConflict.value = true;
      return;
    }
    if (session) {
      try {
        session.readDraftState();
      } catch {
        session = null;
        nativeSession = null;
        appliedLiveActionIds.clear();
      }
    }
    const epoch = ++projectionEpoch;
    let opened = false;
    if (!session) {
      const restored = restoredSession(run.runId);
      if (!restored && !nativeSurface.isAvailable()) {
        goalSurfaceConflict.value = true;
        return;
      }
      if (!(await surfaceLease.claim(run.runId))) {
        if (epoch === projectionEpoch) goalSurfaceConflict.value = true;
        return;
      }
      if (epoch !== projectionEpoch) return;
      try {
        session = restored
          ? nativeSurface.reclaimControlledCreate(run.runId, restored.session, restored.snapshot)
          : await nativeSurface.openControlledCreate(run.runId);
        opened = !restored;
      } catch (error) {
        if (epoch !== projectionEpoch) return;
        void surfaceLease.release();
        if (!nativeSurface.isAvailable()) {
          goalSurfaceConflict.value = true;
          return;
        }
        throw error;
      }
    } else if (!(await surfaceLease.verify(run.runId))) {
      if (epoch === projectionEpoch) goalSurfaceConflict.value = true;
      return;
    }
    if (
      epoch !== projectionEpoch ||
      goalManualHandoff.value ||
      run.runId !== goalWorkflowRun.value?.runId
    ) {
      if (opened) session.requestCancel();
      return;
    }
    try {
      session.coordinateSubmit(
        async () => undefined,
        () => cancelGoalAgentRun(),
      );
      // Claim control still prevents user edits; AI capability patches only this
      // mounted native owner draft. No direct Goal persistence occurs here.
      session.setEditingBlocked(false);
      for (const record of actions) {
        if (appliedLiveActionIds.has(appliedKey(record))) continue;
        applyNativeLiveCommand(session, record);
        appliedLiveActionIds.add(appliedKey(record));
        recordNativeLiveAction(run.runId, record);
      }
      nativeSession = session;
      projectedRunId = run.runId;
      projectedRevision = actions[actions.length - 1]!.command.revision;
      projectedMode = 'live';
      goalSurfaceReady.value = true;
      goalSurfaceConflict.value = false;
    } catch (error) {
      if (opened) session.requestCancel();
      throw error;
    }
  }

  function projectLive(run: Extract<AIWorkflowRunView, { kind: 'goal.create' }>): Promise<void> {
    const lastSequence = run.liveActions?.[run.liveActions.length - 1]?.sequence ?? 0;
    if (
      pendingLiveProjection?.runId === run.runId &&
      pendingLiveProjection.lastSequence === lastSequence
    )
      return pendingLiveProjection.promise;
    const pending = {
      runId: run.runId,
      lastSequence,
      promise: Promise.resolve()
        .then(() => performLiveProjection(run))
        .finally(() => {
          if (pendingLiveProjection === pending) pendingLiveProjection = null;
        }),
    };
    pendingLiveProjection = pending;
    nativeProjection = pending.promise;
    return pending.promise;
  }

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
    // The scoped AI capability may patch, but native user commands remain blocked
    // until the user explicitly takes over in Chat.
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

  function recordNativePatch(runId: string, projection: GoalNativeProjection): void {
    const operationId = `goal-native-patch:${runId}:${projection.revision}:${projection.mode}`;
    if (options.chatTimeline.value.some((item) => item.id === operationId)) return;
    options.chatTimeline.value.push({
      id: operationId,
      role: 'assistant',
      status: 'success',
      content: t('aiAssistant.businessSurface.formUpdated', {
        revision: projection.revision,
      }),
      businessOperation: {
        runId,
        revision: projection.revision,
        operation: 'goal.patch',
      },
    });
  }

  async function performNativeReview(
    run: Extract<AIWorkflowRunView, { kind: 'goal.create' }>,
    projection: GoalNativeProjection,
  ): Promise<void> {
    if (goalSurfaceControlLost.value) return;
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
        const epoch = projectionEpoch;
        if (!(await surfaceLease.verify(run.runId))) {
          if (epoch === projectionEpoch) goalSurfaceConflict.value = true;
          return;
        }
        // AI owns the data patch, not the user's current keyboard focus in Chat.
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

    if (nativeSession && projectedRunId === run.runId) {
      if (goalManualHandoff.value || pendingOwnerAttempt || submitted)
        throw new Error('Goal revision is frozen by the native owner');
      if (!(await surfaceLease.verify(run.runId))) {
        if (epoch === projectionEpoch) goalSurfaceConflict.value = true;
        return;
      }
      if (epoch !== projectionEpoch) return;
      nativeSession.setEditingBlocked(false);
      applyNativeProjection(nativeSession, projection, existing);
      recordNativePatch(run.runId, projection);
      projectedRevision = projection.revision;
      projectedMode = projection.mode;
      submitted = null;
      goalOwnerSubmitted.value = false;
      // AI owns the data patch, not the user's current keyboard focus in Chat.
      return;
    }

    const restored = restoredSession(run.runId);
    if (!restored && !nativeSurface.isAvailable()) {
      goalSurfaceConflict.value = true;
      return;
    }
    if (!(await surfaceLease.claim(run.runId))) {
      if (epoch === projectionEpoch) goalSurfaceConflict.value = true;
      return;
    }
    if (epoch !== projectionEpoch) return;
    let session: GoalNativeEditSession;
    try {
      session = restored
        ? nativeSurface.reclaimControlledCreate(run.runId, restored.session, restored.snapshot)
        : await nativeSurface.openControlledCreate(run.runId);
    } catch (error) {
      if (epoch !== projectionEpoch) return;
      void surfaceLease.release();
      if (!nativeSurface.isAvailable()) {
        goalSurfaceConflict.value = true;
        return;
      }
      throw error;
    }
    if (epoch !== projectionEpoch) {
      session.requestCancel();
      return;
    }
    goalSurfaceConflict.value = false;
    goalManualHandoff.value = false;
    goalDraftPreserved.value = false;
    try {
      applyNativeProjection(session, projection, existing);
    } catch (error) {
      session.releaseControl();
      throw error;
    }
    recordNativePatch(run.runId, projection);
    nativeSession = session;
    goalSurfaceReady.value = true;
    projectedRunId = run.runId;
    projectedRevision = projection.revision;
    projectedMode = projection.mode;
    submitted = null;
    goalOwnerSubmitted.value = false;
  }

  async function continueGoalSurfaceControl(): Promise<void> {
    if (pendingRestart) {
      if (goalSurfaceRecovering.value) return;
      goalSurfaceRecovering.value = true;
      const pending = pendingRestart;
      try {
        let fresh: AIWorkflowRunView | null;
        if (pending.runId) fresh = await options.workflowRuntime.get({ runId: pending.runId });
        else {
          const matches = (
            await options.workflowRuntime.list({
              conversationId: options.chatConversationId.value,
            })
          ).filter((item) => item.startRequestId === pending.source.attemptId);
          fresh = matches.length === 1 ? matches[0]! : null;
        }
        if (
          pendingRestart !== pending ||
          !fresh ||
          fresh.kind !== 'goal.create' ||
          fresh.conversationId !== options.chatConversationId.value
        )
          return;
        pending.epoch = ++projectionEpoch;
        await adoptGoalRestart(fresh);
        await projectRun(fresh);
      } catch {
        /* Uncertain start remains read-only until its correlated run can be read. */
      } finally {
        goalSurfaceRecovering.value = false;
      }
      return;
    }
    if (goalSurfaceControlLost.value) {
      if (goalSurfaceRecovering.value || goalAgentResuming.value) return;
      const run = goalWorkflowRun.value;
      if (!run) return;
      goalSurfaceRecovering.value = true;
      const epoch = projectionEpoch;
      try {
        const fresh = await options.workflowRuntime.get({ runId: run.runId });
        if (
          epoch !== projectionEpoch ||
          !fresh ||
          fresh.kind !== 'goal.create' ||
          fresh.runId !== run.runId ||
          fresh.conversationId !== run.conversationId
        )
          return;
        if (fresh.status === 'failed') {
          await projectRun(fresh);
          return;
        }
        if (fresh.status !== 'running' && fresh.status !== 'suspended') return;
        if (!(await surfaceLease.claim(run.runId)) || epoch !== projectionEpoch) return;
        // Preserve owner-first replay if any save has already been attempted.
        if (pendingOwnerAttempt || submitted || fresh.result?.referenceMap.goal) return;
        goalSurfaceControlLost.value = false;
        nativeSession?.setEditingBlocked(false);
        goalSurfaceConflict.value = false;
        goalSurfaceReady.value = Boolean(nativeSession);
        await projectRun(fresh);
      } catch {
        // Stay read-only on an unavailable snapshot/authority; retry is explicit.
      } finally {
        goalSurfaceRecovering.value = false;
      }
      return;
    }
    // Recheck the actual owner on every click, not the earlier conflict snapshot.
    if (goalAgentResuming.value || !nativeSurface.isAvailable()) return;
    goalSurfaceConflict.value = false;
    await openGoalNativeReview();
  }

  function handoffGoalNativeReview(): void {
    if (goalAgentResuming.value || pendingOwnerAttempt || submitted || !nativeSession) return;
    nativeSession.releaseControl();
    nativeSession = nativeSurface.locate();
    nativeSession?.coordinateSubmit(
      () => confirmGoalAgentRun(),
      async () => {
        goalManualHandoff.value = false;
        await cancelGoalAgentRun();
      },
    );
    goalManualHandoff.value = true;
  }

  async function openGoalNativeReview(): Promise<void> {
    const run = goalWorkflowRun.value;
    if (
      !run ||
      (!goalNativeProjection(run) && !(run.status === 'running' && run.liveActions?.length)) ||
      goalAgentResuming.value ||
      submitted ||
      pendingOwnerAttempt
    )
      return;
    try {
      nativeProjection = run.status === 'running' ? projectLive(run) : projectNativeReview(run);
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
    pendingLiveProjection = null;
    appliedLiveActionIds.clear();
    projectionEpoch += 1;
    void surfaceLease.release();
    goalSurfaceConflict.value = false;
    goalSurfaceReady.value = false;
    goalSurfaceControlLost.value = false;
    goalDraftPreserved.value = false;
    if (nativeSession && !goalManualHandoff.value) {
      try {
        nativeSession.setEditingBlocked(false);
        nativeSession.requestCancel();
      } catch {
        /* Owner already retired the handle. */
      }
    }
    nativeSession = null;
    goalManualHandoff.value = false;
    projectedRunId = null;
    submitted = null;
    pendingOwnerAttempt = null;
    goalOwnerAttemptPending.value = false;
    projectedRevision = null;
    projectedMode = null;
    goalOwnerSubmitted.value = false;
  }

  function detachFailedReview(run: Extract<AIWorkflowRunView, { kind: 'goal.create' }>): void {
    projectionEpoch++;
    pendingProjection = null;
    pendingLiveProjection = null;
    void surfaceLease.release();
    // A failed planner cannot erase an uncertain/already committed owner write.
    // Keep its deterministic identities and lock instead of enabling another create.
    if (pendingOwnerAttempt || submitted || run.result?.referenceMap.goal) return;
    if (nativeSession) {
      try {
        nativeSession.detachWorkflow();
        goalDraftPreserved.value = true;
      } catch {
        try {
          nativeSession.readDraftState();
          return; // An active owner save must settle before its callbacks can be detached.
        } catch {
          /* Owner already retired the handle. */
        }
      }
    }
    nativeSession = null;
    projectedRunId = null;
    projectedRevision = null;
    projectedMode = null;
    appliedLiveActionIds.clear();
    goalSurfaceReady.value = false;
    goalSurfaceConflict.value = false;
    goalManualHandoff.value = false;
    goalSurfaceControlLost.value = false;
  }

  function prepareGoalRestart(sourceRunId: string): GoalCreateClientInput['sourceDraft'] {
    if (!goalDraftPreserved.value) return undefined;
    const session = nativeSurface.locate();
    if (!session || pendingRestart || pendingOwnerAttempt || submitted)
      throw new Error('The preserved Goal draft is unavailable for restart');
    const snapshot = session.readDraftState();
    if (snapshot.mode !== 'create' || snapshot.busy)
      throw new Error('The preserved Goal draft is busy');
    const source = {
      sourceRunId,
      attemptId: crypto.randomUUID(),
      draftRevision: snapshot.revision,
      draft: buildGoalPlanningSeed({
        native: snapshot.draft,
        labels: labelCatalog.labels.value,
        pendingLabelNames,
        keyResultRefs,
        tasks: editableTasks.value,
        knowledge: editableKnowledge.value,
      }),
    };
    session.setEditingBlocked(true);
    pendingRestart = { session, snapshot, source, epoch: ++projectionEpoch };
    goalRestartPending.value = true;
    return source;
  }

  function keepGoalRestartReadonly(): void {
    if (!pendingRestart) return;
    goalSurfaceControlLost.value = true;
    goalSurfaceConflict.value = true;
    goalSurfaceReady.value = false;
  }

  async function adoptGoalRestart(
    run: Extract<AIWorkflowRunView, { kind: 'goal.create' }>,
  ): Promise<void> {
    const pending = pendingRestart;
    if (!pending) return;
    pending.runId = run.runId;
    if (run.result?.referenceMap.goal || run.status === 'completed') {
      keepGoalRestartReadonly();
      return;
    }
    if (run.status === 'failed' || run.status === 'cancelled') {
      pending.session.setEditingBlocked(false);
      pendingRestart = null;
      goalRestartPending.value = false;
      goalSurfaceControlLost.value = false;
      goalSurfaceConflict.value = false;
      return;
    }
    if (
      !(await surfaceLease.claim(run.runId)) ||
      pendingRestart !== pending ||
      pending.epoch !== projectionEpoch
    ) {
      keepGoalRestartReadonly();
      return;
    }
    try {
      pending.session.setEditingBlocked(false);
      nativeSession = nativeSurface.reclaimControlledCreate(
        run.runId,
        pending.session,
        pending.snapshot,
      );
    } catch (error) {
      pending.session.setEditingBlocked(true);
      void surfaceLease.release();
      keepGoalRestartReadonly();
      throw error;
    }
    nativeSession.coordinateSubmit(
      async () => undefined,
      () => cancelGoalAgentRun(),
    );
    projectedRunId = run.runId;
    projectedRevision = null;
    projectedMode = 'live';
    appliedLiveActionIds.clear();
    pendingRestart = null;
    goalRestartPending.value = false;
    goalDraftPreserved.value = false;
    goalManualHandoff.value = false;
    goalSurfaceControlLost.value = false;
    goalSurfaceConflict.value = false;
    goalSurfaceReady.value = true;
  }

  function focusPreservedGoal(): Promise<void> {
    return nativeSurface.locate()?.focus('name') ?? Promise.resolve();
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
    if (!(await surfaceLease.verify(run.runId))) throw new Error('Goal panel lease was lost');
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
        keyResults: rows.map((item, index) => ({
          ...item,
          id: projectedIds[index]!,
        })),
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
    if (
      !run ||
      !goalAgentWaitingForApproval.value ||
      goalAgentResuming.value ||
      goalManualHandoff.value ||
      !normalized
    )
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
    goalAgentResuming.value = true;
    creatingGoal.value = true;
    try {
      // A verified deterministic owner save may have happened before reload.
      // Re-claim a fresh server fence for approval without creating another
      // native Goal. A competing window still prevents this ownership transfer.
      const mayContinue = submitted
        ? await surfaceLease.claim(run.runId)
        : await surfaceLease.verify(run.runId);
      if (!mayContinue) throw new Error('Goal panel lease was lost');
      if (
        !pendingOwnerAttempt &&
        !submitted &&
        (hostOptions?.title || hostOptions?.description !== undefined)
      )
        liveSession().patch({
          ...(hostOptions.title ? { name: hostOptions.title } : {}),
          ...(hostOptions.description !== undefined ? { summary: hostOptions.description } : {}),
        });
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
        if (!(await surfaceLease.verify(run.runId))) throw new Error('Goal panel lease was lost');
        let saved;
        try {
          // Only the controlled same-revision retry may temporarily release the
          // owner lock. requestSubmit synchronously takes the owner's busy lock.
          if (pendingOwnerAttempt) session.setEditingBlocked(false);
          const nativeAiLease = surfaceLease.currentGrant(run.runId);
          if (!nativeAiLease) throw new Error('Goal panel lease was lost before persistence');
          saved = await session.requestSubmit({
            nativeAiLease,
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
      if (!(await surfaceLease.verify(run.runId))) throw new Error('Goal panel lease was lost');
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
    if (pendingRestart && !pendingRestart.runId) {
      await continueGoalSurfaceControl();
      if (pendingRestart && !pendingRestart.runId) return;
    }
    const run =
      pendingRestart?.runId && pendingRestart.runId !== goalWorkflowRun.value?.runId
        ? await options.workflowRuntime.get({ runId: pendingRestart.runId })
        : goalWorkflowRun.value;
    if (!run || goalAgentResuming.value || pendingOwnerAttempt) return;
    goalAgentResuming.value = true;
    try {
      retireNativeReview();
      const next =
        run.status === 'suspended'
          ? await options.workflowRuntime.resume({
              runId: run.runId,
              command:
                run.suspension?.type === 'recovery_required'
                  ? { type: 'cancel_remaining' }
                  : { type: 'cancel' },
            })
          : await options.workflowRuntime.cancel({ runId: run.runId });
      if (next?.kind === 'goal.create' && next.status === 'cancelled') await adoptGoalRestart(next);
      await projectRun(next);
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
    projectLive,
    goalSurfaceConflict,
    goalSurfaceReady,
    goalManualHandoff,
    goalSurfaceControlLost,
    freezeGoalSurfaceControl,
    goalSurfaceRecovering,
    goalRestartPending,
    prepareGoalRestart,
    adoptGoalRestart,
    keepGoalRestartReadonly,
    focusPreservedGoal,
    continueGoalSurfaceControl,
    handoffGoalNativeReview,
    goalOwnerSubmitted,
    goalOwnerAttemptPending,
    goalAgentWaitingForClarification,
    goalAgentWaitingForApproval,
    openGoalNativeReview,
    retireNativeReview,
    goalDraftPreserved,
    detachFailedReview,
    submitGoalClarificationResponse,
    submitGoalRevisionResponse,
    confirmGoalAgentRun,
    cancelGoalAgentRun,
    reviseGoalAgentRun,
  };
}
