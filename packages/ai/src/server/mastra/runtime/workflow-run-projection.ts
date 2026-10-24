import {
  AIWorkflowRunViewSchema,
  GoalWorkflowSuspensionSchema,
  GoalWorkflowLiveActionJournalSchema,
  GoalPlanExecutionReceiptSchema,
  TaskWorkflowSuspensionSchema,
  KnowledgeWorkflowSuspensionSchema,
  type AIWorkflowRunView,
} from '@memoflow/contracts/ai';
import {
  GOAL_CREATE_LIFECYCLE_STEP_ID,
  GoalCreateWorkflowOutputSchema,
  TASK_CREATE_LIFECYCLE_STEP_ID,
  TaskCreateWorkflowOutputSchema,
  KNOWLEDGE_CAPTURE_LIFECYCLE_STEP_ID,
  KnowledgeCaptureWorkflowOutputSchema,
} from '../workflows';
import {
  parseWorkflowSnapshot,
  goalCreateInputFromSnapshot,
  taskCreateInputFromSnapshot,
  knowledgeCaptureInputFromSnapshot,
} from './workflow-run-snapshot';
import { toAIPublicFailure } from '../../../shared/ai-public-failure';

function publicRuntimeError(error?: unknown): NonNullable<AIWorkflowRunView['failure']> {
  const failure = toAIPublicFailure(error, {
    fallbackCode: 'AI_RUNTIME_TRANSPORT_ERROR',
    fallbackMessage: 'AI runtime request failed',
  });
  return {
    code: failure.code,
    message: failure.message,
    ...(failure.details ? { details: failure.details } : {}),
    ...(failure.retryHint ? { retryHint: failure.retryHint } : {}),
  };
}

// Read-only owner-specific projections; no execution or persistence authority.
export function projectGoalCreateRun(
  row: {
    runId: string;
    resourceId?: string;
    snapshot: unknown;
    createdAt: Date;
    updatedAt: Date;
  },
  identityId: string,
): AIWorkflowRunView | null {
  if (row.resourceId !== identityId) return null;
  const snapshot = parseWorkflowSnapshot(row.snapshot);
  const workflowInput = goalCreateInputFromSnapshot(snapshot);
  const lowLevelStatus = snapshot.status;
  const context = snapshot.context as Record<string, unknown>;
  // During a running step, state.value is still engine-local. A
  // transactionally published preview is stored separately and never used
  // as execution authority. On step completion, state.value is canonical.
  const value = snapshot.value;
  const authoritative =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>).liveActions
      : undefined;
  const durableActions = GoalWorkflowLiveActionJournalSchema.parse(authoritative ?? []);
  const runningActions = GoalWorkflowLiveActionJournalSchema.parse(snapshot.goalLiveActions ?? []);
  const liveActions =
    lowLevelStatus === 'running' && runningActions.length > durableActions.length
      ? runningActions
      : durableActions;
  const lifecycle = context[GOAL_CREATE_LIFECYCLE_STEP_ID];
  const lifecycleRecord =
    lifecycle && typeof lifecycle === 'object' && !Array.isArray(lifecycle)
      ? (lifecycle as Record<string, unknown>)
      : undefined;

  return projectGoalWorkflowPublicState({
    runId: row.runId,
    conversationId: workflowInput.conversationId,
    startRequestId: workflowInput.sourceDraft?.attemptId,
    status: lowLevelStatus,
    suspension: lifecycleRecord?.suspendPayload,
    result: snapshot.result,
    liveActions,
    receipt:
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>).priorReceipt
        : undefined,
    failure:
      lowLevelStatus === 'failed' || lowLevelStatus === 'tripwire'
        ? publicRuntimeError(snapshot.error)
        : undefined,
    createdAt: new Date(row.createdAt).getTime(),
    updatedAt: new Date(row.updatedAt).getTime(),
  });
}

/** Shared read projection for the engine row and its transactionally derived event read model. */
export function projectGoalWorkflowPublicState(input: {
  runId: string;
  conversationId: string;
  startRequestId?: string;
  status: unknown;
  suspension?: unknown;
  result?: unknown;
  liveActions?: unknown;
  receipt?: unknown;
  failure?: AIWorkflowRunView['failure'];
  resourceVersion?: number;
  createdAt: number;
  updatedAt: number;
}): Extract<AIWorkflowRunView, { kind: 'goal.create' }> {
  const lowLevelStatus = input.status;
  const liveActions = GoalWorkflowLiveActionJournalSchema.parse(input.liveActions ?? []);
  let status: AIWorkflowRunView['status'];
  let suspension: AIWorkflowRunView['suspension'];
  let failure: AIWorkflowRunView['failure'];
  let result: Extract<AIWorkflowRunView, { kind: 'goal.create' }>['result'];
  if (input.receipt != null) result = GoalPlanExecutionReceiptSchema.parse(input.receipt);

  if (lowLevelStatus === 'suspended') {
    status = 'suspended';
    const parsed = GoalWorkflowSuspensionSchema.safeParse(input.suspension);
    if (!parsed.success) throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
    suspension = parsed.data;
    if (suspension.type === 'recovery_required' && suspension.receipt?.kind === 'goal.create') {
      result = suspension.receipt.receipt;
    }
  } else if (lowLevelStatus === 'canceled') {
    status = 'cancelled';
  } else if (lowLevelStatus === 'failed' || lowLevelStatus === 'tripwire') {
    status = 'failed';
    failure = input.failure ?? publicRuntimeError();
  } else if (
    lowLevelStatus === 'success' ||
    lowLevelStatus === 'bailed' ||
    lowLevelStatus === 'skipped'
  ) {
    const parsed = GoalCreateWorkflowOutputSchema.safeParse(input.result);
    if (!parsed.success) throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
    if (parsed.data.outcome === 'cancelled') {
      status = 'cancelled';
    } else {
      status = 'completed';
      result = parsed.data.receipt;
    }
  } else if (
    lowLevelStatus === 'running' ||
    lowLevelStatus === 'pending' ||
    lowLevelStatus === 'waiting'
  ) {
    status = 'running';
  } else {
    status = 'failed';
    failure = {
      code: 'AI_WORKFLOW_STATUS_UNSUPPORTED',
      message: 'AI workflow state is unsupported',
    };
  }

  const projected = AIWorkflowRunViewSchema.parse({
    runId: input.runId,
    kind: 'goal.create',
    ...(input.startRequestId ? { startRequestId: input.startRequestId } : {}),
    conversationId: input.conversationId,
    status,
    ...(suspension ? { suspension } : {}),
    ...(liveActions.length ? { liveActions } : {}),
    ...(failure ? { failure } : {}),
    ...(result ? { result } : {}),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    ...(input.resourceVersion ? { resourceVersion: input.resourceVersion } : {}),
  });
  if (projected.kind !== 'goal.create') throw new Error('Goal projection kind mismatch');
  return projected;
}

export function projectTaskCreateRun(
  row: {
    runId: string;
    resourceId?: string;
    snapshot: unknown;
    createdAt: Date;
    updatedAt: Date;
  },
  identityId: string,
): AIWorkflowRunView | null {
  if (row.resourceId !== identityId) return null;
  const snapshot = parseWorkflowSnapshot(row.snapshot);
  const workflowInput = taskCreateInputFromSnapshot(snapshot);
  const lowLevelStatus = snapshot.status;
  const context = snapshot.context as Record<string, unknown>;
  const lifecycle = context[TASK_CREATE_LIFECYCLE_STEP_ID];
  const lifecycleRecord =
    lifecycle && typeof lifecycle === 'object' && !Array.isArray(lifecycle)
      ? (lifecycle as Record<string, unknown>)
      : undefined;

  let status: AIWorkflowRunView['status'];
  let suspension: AIWorkflowRunView['suspension'];
  let failure: AIWorkflowRunView['failure'];
  let result: Extract<AIWorkflowRunView, { kind: 'task.create' }>['result'];

  if (lowLevelStatus === 'suspended') {
    status = 'suspended';
    const parsed = TaskWorkflowSuspensionSchema.safeParse(lifecycleRecord?.suspendPayload);
    if (!parsed.success) throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
    suspension = parsed.data;
    if (suspension.type === 'recovery_required' && suspension.receipt?.kind === 'task.create') {
      result = suspension.receipt.receipt;
    }
  } else if (lowLevelStatus === 'canceled') {
    status = 'cancelled';
  } else if (lowLevelStatus === 'failed' || lowLevelStatus === 'tripwire') {
    status = 'failed';
    failure = publicRuntimeError(snapshot.error);
  } else if (
    lowLevelStatus === 'success' ||
    lowLevelStatus === 'bailed' ||
    lowLevelStatus === 'skipped'
  ) {
    const parsed = TaskCreateWorkflowOutputSchema.safeParse(snapshot.result);
    if (!parsed.success) throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
    if (parsed.data.outcome === 'cancelled') {
      status = 'cancelled';
    } else {
      status = 'completed';
      result = parsed.data.receipt;
    }
  } else if (
    lowLevelStatus === 'running' ||
    lowLevelStatus === 'pending' ||
    lowLevelStatus === 'waiting'
  ) {
    status = 'running';
  } else {
    status = 'failed';
    failure = {
      code: 'AI_WORKFLOW_STATUS_UNSUPPORTED',
      message: 'AI workflow state is unsupported',
    };
  }

  return AIWorkflowRunViewSchema.parse({
    runId: row.runId,
    kind: 'task.create',
    conversationId: workflowInput.conversationId,
    status,
    ...(suspension ? { suspension } : {}),
    ...(failure ? { failure } : {}),
    ...(result ? { result } : {}),
    createdAt: new Date(row.createdAt).getTime(),
    updatedAt: new Date(row.updatedAt).getTime(),
  });
}

export function projectKnowledgeCaptureRun(
  row: {
    runId: string;
    resourceId?: string;
    snapshot: unknown;
    createdAt: Date;
    updatedAt: Date;
  },
  identityId: string,
): AIWorkflowRunView | null {
  if (row.resourceId !== identityId) return null;
  const snapshot = parseWorkflowSnapshot(row.snapshot);
  const workflowInput = knowledgeCaptureInputFromSnapshot(snapshot);
  const lowLevelStatus = snapshot.status;
  const context = snapshot.context as Record<string, unknown>;
  const lifecycle = context[KNOWLEDGE_CAPTURE_LIFECYCLE_STEP_ID];
  const lifecycleRecord =
    lifecycle && typeof lifecycle === 'object' && !Array.isArray(lifecycle)
      ? (lifecycle as Record<string, unknown>)
      : undefined;

  let status: AIWorkflowRunView['status'];
  let suspension: AIWorkflowRunView['suspension'];
  let failure: AIWorkflowRunView['failure'];
  let result: Extract<AIWorkflowRunView, { kind: 'knowledge.capture' }>['result'];

  if (lowLevelStatus === 'suspended') {
    status = 'suspended';
    const parsed = KnowledgeWorkflowSuspensionSchema.safeParse(lifecycleRecord?.suspendPayload);
    if (!parsed.success) throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
    suspension = parsed.data;
    if (
      suspension.type === 'recovery_required' &&
      suspension.receipt?.kind === 'knowledge.capture'
    ) {
      result = suspension.receipt.receipt;
    }
  } else if (lowLevelStatus === 'canceled') {
    status = 'cancelled';
  } else if (lowLevelStatus === 'failed' || lowLevelStatus === 'tripwire') {
    status = 'failed';
    failure = publicRuntimeError(snapshot.error);
  } else if (
    lowLevelStatus === 'success' ||
    lowLevelStatus === 'bailed' ||
    lowLevelStatus === 'skipped'
  ) {
    const parsed = KnowledgeCaptureWorkflowOutputSchema.safeParse(snapshot.result);
    if (!parsed.success) throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
    if (parsed.data.outcome === 'cancelled') {
      status = 'cancelled';
    } else {
      status = 'completed';
      result = parsed.data.receipt;
    }
  } else if (
    lowLevelStatus === 'running' ||
    lowLevelStatus === 'pending' ||
    lowLevelStatus === 'waiting'
  ) {
    status = 'running';
  } else {
    status = 'failed';
    failure = {
      code: 'AI_WORKFLOW_STATUS_UNSUPPORTED',
      message: 'AI workflow state is unsupported',
    };
  }

  return AIWorkflowRunViewSchema.parse({
    runId: row.runId,
    kind: 'knowledge.capture',
    conversationId: workflowInput.conversationId,
    status,
    ...(suspension ? { suspension } : {}),
    ...(failure ? { failure } : {}),
    ...(result ? { result } : {}),
    createdAt: new Date(row.createdAt).getTime(),
    updatedAt: new Date(row.updatedAt).getTime(),
  });
}
