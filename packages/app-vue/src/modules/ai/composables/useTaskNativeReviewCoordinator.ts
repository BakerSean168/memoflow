import {
  TaskPlanDraftContentSchema,
  TaskPlanTaskSchema,
  type AIWorkflowRunView,
  type TaskPlanDraft,
  type TaskPlanTask,
} from '@memoflow/contracts/ai';
import {
  CreateTaskPlanSchema,
  TaskGoalProgressConfigurationSchema,
} from '@memoflow/contracts/task';
import { computed, onScopeDispose, ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { TASK_SERVICE_KEY } from '../../../di/keys';
import { useTaskNativeSurface } from '../../../layouts/shell/useTaskNativeSurface';
import { useLabelCatalog } from '../../../shared/composables/useLabelCatalog';
import { useStrictInject } from '../../../shared/utils/useStrictInject';
import type { TaskNativeEditSession } from '../../task/composables/taskNativeEditSession';
import { getAIErrorMessage } from './error';
import type { UseAITaskWorkflowOptions } from './types';

/** Task native review lifecycle and confirmation coordination. */
export function useTaskNativeReviewCoordinator(input: {
  options: UseAITaskWorkflowOptions;
  taskWorkflowRun: Ref<Extract<AIWorkflowRunView, { kind: 'task.create' }> | null>;
  taskAgentResuming: Ref<boolean>;
  reviewDraft: Readonly<Ref<TaskPlanDraft | null>>;
  projectRun: (run: AIWorkflowRunView | null, openNative?: boolean) => Promise<void>;
  resume: (
    command: Parameters<UseAITaskWorkflowOptions['workflowRuntime']['resume']>[0]['command'],
  ) => Promise<void>;
}) {
  const { options, taskWorkflowRun, taskAgentResuming, reviewDraft, projectRun, resume } = input;
  const { t } = useI18n();
  const nativeSurface = useTaskNativeSurface();
  const taskService = useStrictInject(TASK_SERVICE_KEY, 'TaskService');
  const labelCatalog = useLabelCatalog();
  let nativeSession: TaskNativeEditSession | null = null;
  let projectedRunId: string | null = null;
  let projectedRevision: number | null = null;
  let projectionEpoch = 0;
  let nativeProjection: Promise<void> = Promise.resolve();
  let pendingProjection: { runId: string; revision: number; promise: Promise<void> } | null = null;
  let pendingLabelNames: string[] = [];
  type OwnerAttempt = { runId: string; revision: number; taskId: string };
  let pendingOwnerAttempt: OwnerAttempt | null = null;
  let submitted: OwnerAttempt | null = null;
  const taskOwnerAttemptPending = ref(false);
  const taskOwnerSubmitted = ref(false);

  function retireNativeReview() {
    pendingProjection = null;
    ++projectionEpoch;
    try {
      nativeSession?.setEditingBlocked(false);
      nativeSession?.requestCancel();
    } catch {
      /* Already retired by owner. */
    }
    nativeSession = null;
    projectedRunId = null;
    projectedRevision = null;
    pendingOwnerAttempt = null;
    submitted = null;
    taskOwnerAttemptPending.value = false;
    taskOwnerSubmitted.value = false;
  }
  onScopeDispose(retireNativeReview);
  function liveSession(): TaskNativeEditSession {
    if (!nativeSession || projectedRunId !== taskWorkflowRun.value?.runId)
      throw new Error('Open native Task review before confirming');
    nativeSession.readDraftState();
    return nativeSession;
  }
  async function probeOwner(attempt: OwnerAttempt): Promise<boolean> {
    const owner = await taskService.getPlan(attempt.taskId);
    if (!owner.ok) {
      if (owner.error.code === 'NOT_FOUND') return false;
      throw owner.error;
    }
    if (String(owner.data.id) !== attempt.taskId)
      throw new Error('Created Task does not match workflow owner identity');
    return true;
  }
  function rememberSubmitted(attempt: OwnerAttempt) {
    submitted = attempt;
    pendingOwnerAttempt = null;
    taskOwnerAttemptPending.value = false;
    taskOwnerSubmitted.value = true;
  }
  // Equivalent restores/review clicks share the recovery probe until owner registration.
  // This is session-local in-flight work, not a cache of owner truth or NOT_FOUND.
  function projectNativeReview(
    run: Extract<AIWorkflowRunView, { kind: 'task.create' }>,
  ): Promise<void> {
    const review = run.suspension;
    if (review?.type !== 'task_draft_review') return Promise.resolve();
    if (pendingProjection?.runId === run.runId && pendingProjection.revision === review.revision)
      return pendingProjection.promise;
    const pending = {
      runId: run.runId,
      revision: review.revision,
      promise: performNativeReview(run).finally(() => {
        if (pendingProjection === pending) pendingProjection = null;
      }),
    };
    pendingProjection = pending;
    return pending.promise;
  }

  async function performNativeReview(run: Extract<AIWorkflowRunView, { kind: 'task.create' }>) {
    const review = run.suspension;
    if (review?.type !== 'task_draft_review') return;
    if (nativeSession && projectedRunId === run.runId && projectedRevision === review.revision) {
      try {
        nativeSession.readDraftState();
      } catch {
        nativeSession = null;
      }
      if (nativeSession) {
        await nativeSession.focus('title');
        return;
      }
    }
    const epoch = ++projectionEpoch;
    const attempt = {
      runId: run.runId,
      revision: review.revision,
      taskId: review.ownerCreate.taskId,
    };
    const exists = await probeOwner(attempt);
    if (epoch !== projectionEpoch) return;
    if (exists) {
      rememberSubmitted(attempt);
      return;
    }
    const labels = await labelCatalog.existingNames(review.draft.task.labels);
    if (epoch !== projectionEpoch) return;
    const session = await nativeSurface.openCreate();
    if (epoch !== projectionEpoch) {
      session.requestCancel();
      return;
    }
    session.coordinateSubmit(confirmTaskAgentRun, cancelTaskAgentRun);
    const task = review.draft.task;
    session.patch({
      title: task.title,
      description: task.description ?? '',
      importance: task.importance,
      schedule: task.schedule,
      reminderConfig: task.reminderConfig ?? null,
      labelIds: labels.flatMap((item) => (item.label ? [item.label.id] : [])),
      goalBinding: task.goalBinding
        ? {
            goalId: task.goalBinding.goalId,
            keyResultId: task.goalBinding.keyResultId,
            progressRule: TaskGoalProgressConfigurationSchema.parse(task.goalBinding).progressRule,
          }
        : null,
    });
    pendingLabelNames = labels.filter((item) => !item.label).map((item) => item.name);
    nativeSession = session;
    projectedRunId = run.runId;
    projectedRevision = review.revision;
  }
  async function openTaskNativeReview() {
    const run = taskWorkflowRun.value;
    if (
      !run ||
      run.suspension?.type !== 'task_draft_review' ||
      taskAgentResuming.value ||
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

  const taskAgentWaitingForApproval = computed(
    () =>
      taskWorkflowRun.value?.status === 'suspended' &&
      taskWorkflowRun.value.suspension?.type === 'task_draft_review',
  );
  function currentReviewDraft(): TaskPlanDraft | null {
    return reviewDraft.value;
  }

  function buildEditedDraftContent(draft: TaskPlanDraft) {
    const native = liveSession().readDraftState().draft;
    return TaskPlanDraftContentSchema.parse({
      task: {
        ...draft.task,
        title: native.title,
        description: native.description || null,
        importance: native.importance,
        schedule: native.schedule,
        reminderConfig: native.reminderConfig ?? null,
        goalBinding: native.goalBinding ?? null,
        labels: [
          ...new Set([
            ...(native.labelIds ?? []).map((id) => {
              const label = labelCatalog.labels.value.find((item) => item.id === id);
              if (!label) throw new Error('Selected Task label is unavailable');
              return label.name;
            }),
            ...pendingLabelNames,
          ]),
        ],
      },
      rationale: draft.rationale,
      warnings: [...draft.warnings],
    });
  }

  function canonicalDraftContent(draft: TaskPlanDraft) {
    const { revision: _revision, ...content } = draft;
    return TaskPlanDraftContentSchema.parse({
      ...content,
      task: { ...content.task, description: content.task.description || null },
    });
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
    await projectRun(next, false);
    if (next.kind === 'task.create' && next.suspension?.type === 'task_draft_review')
      projectedRevision = next.suspension.revision;
    return next.kind === 'task.create' ? next : null;
  }

  async function confirmTaskAgentRun(): Promise<void> {
    let run = taskWorkflowRun.value;
    if (!run || !taskAgentWaitingForApproval.value || taskAgentResuming.value) return;
    taskAgentResuming.value = true;
    try {
      if (pendingOwnerAttempt && (await probeOwner(pendingOwnerAttempt)))
        rememberSubmitted(pendingOwnerAttempt);
      if (!submitted) {
        await nativeProjection;
        const session = liveSession();
        session.setEditingBlocked(true);
        if (!pendingOwnerAttempt) run = await flushStructuredEdits();
        if (!run || run.suspension?.type !== 'task_draft_review') return;
        const review = run.suspension;
        const attempt = {
          runId: run.runId,
          revision: review.revision,
          taskId: review.ownerCreate.taskId,
        };
        const expectedDraft = session.readDraftState().draft;
        let saved;
        try {
          // requestSubmit synchronously takes the native owner's busy lock.
          session.setEditingBlocked(false);
          saved = await session.requestSubmit({
            createId: CreateTaskPlanSchema.shape.id.unwrap().parse(attempt.taskId),
            pendingLabelNames: [...pendingLabelNames],
            expectedDraft,
            onCreateAttempt: () => {
              pendingOwnerAttempt = attempt;
              taskOwnerAttemptPending.value = true;
              session.setEditingBlocked(true);
            },
          });
        } catch (error) {
          if (!pendingOwnerAttempt || !(await probeOwner(pendingOwnerAttempt))) throw error;
          rememberSubmitted(pendingOwnerAttempt);
        }
        if (saved && String(saved.id) === attempt.taskId) rememberSubmitted(attempt);
        else if (!submitted) {
          if (!pendingOwnerAttempt || !(await probeOwner(pendingOwnerAttempt))) return;
          rememberSubmitted(pendingOwnerAttempt);
        }
      }
      if (
        !run ||
        run.suspension?.type !== 'task_draft_review' ||
        submitted?.runId !== run.runId ||
        submitted.revision !== run.suspension.revision
      )
        return;
      const next = await options.workflowRuntime.resume({
        runId: run.runId,
        command: { type: 'approve' },
      });
      await projectRun(next, false);
      if (next.kind === 'task.create' && next.status === 'completed' && next.result) {
        const id = Object.values(next.result.referenceMap)[0];
        if (id) await options.openCreatedTask?.(id);
      }
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    } finally {
      taskAgentResuming.value = false;
      try {
        nativeSession?.setEditingBlocked(Boolean(pendingOwnerAttempt || submitted));
      } catch {
        /* Owner closed after persistence. */
      }
    }
  }
  async function reviseTaskAgentRun() {
    if (taskAgentResuming.value || submitted || pendingOwnerAttempt) return;
    taskAgentResuming.value = true;
    try {
      liveSession().setEditingBlocked(true);
      await flushStructuredEdits();
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    } finally {
      taskAgentResuming.value = false;
      try {
        nativeSession?.setEditingBlocked(false);
      } catch {
        /* Closed. */
      }
    }
  }
  async function cancelTaskAgentRun(): Promise<void> {
    const run = taskWorkflowRun.value;
    if (!run || taskAgentResuming.value || pendingOwnerAttempt || submitted) return;
    retireNativeReview();
    if (run.status === 'suspended') return resume({ type: 'cancel' });
    taskAgentResuming.value = true;
    try {
      await projectRun(await options.workflowRuntime.cancel({ runId: run.runId }));
    } catch (error) {
      toast.error(getAIErrorMessage(error, t, 'aiAssistant.errors.workflowExecutionFailed'));
    } finally {
      taskAgentResuming.value = false;
    }
  }
  function updateTaskDraft(task: TaskPlanTask): void {
    if (taskAgentResuming.value || pendingOwnerAttempt || submitted) return;
    const parsed = TaskPlanTaskSchema.parse(task);
    liveSession().patch({
      title: parsed.title,
      description: parsed.description ?? '',
      schedule: parsed.schedule,
      importance: parsed.importance,
      reminderConfig: parsed.reminderConfig,
      goalBinding: parsed.goalBinding
        ? {
            goalId: parsed.goalBinding.goalId,
            keyResultId: parsed.goalBinding.keyResultId,
            progressRule: TaskGoalProgressConfigurationSchema.parse(parsed.goalBinding)
              .progressRule,
          }
        : null,
    });
  }

  function project(run: Extract<AIWorkflowRunView, { kind: 'task.create' }>): Promise<void> {
    nativeProjection = projectNativeReview(run);
    return nativeProjection;
  }
  return {
    project,
    taskOwnerAttemptPending,
    taskOwnerSubmitted,
    taskAgentWaitingForApproval,
    openTaskNativeReview,
    retireNativeReview,
    confirmTaskAgentRun,
    reviseTaskAgentRun,
    cancelTaskAgentRun,
    updateTaskDraft,
  };
}
