import {
  AIWorkflowRunViewSchema,
  GoalWorkflowSuspensionSchema,
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

function publicRuntimeError(error?: unknown): { code: string; message: string } {
  const failure = toAIPublicFailure(error, {
    fallbackCode: 'AI_RUNTIME_TRANSPORT_ERROR',
    fallbackMessage: 'AI runtime request failed',
  });
  return { code: failure.code, message: failure.message };
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
  const lifecycle = context[GOAL_CREATE_LIFECYCLE_STEP_ID];
  const lifecycleRecord =
    lifecycle && typeof lifecycle === 'object' && !Array.isArray(lifecycle)
      ? (lifecycle as Record<string, unknown>)
      : undefined;

  let status: AIWorkflowRunView['status'];
  let suspension: AIWorkflowRunView['suspension'];
  let failure: AIWorkflowRunView['failure'];
  let result: Extract<AIWorkflowRunView, { kind: 'goal.create' }>['result'];

  if (lowLevelStatus === 'suspended') {
    status = 'suspended';
    const parsed = GoalWorkflowSuspensionSchema.safeParse(lifecycleRecord?.suspendPayload);
    if (!parsed.success) throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
    suspension = parsed.data;
    if (suspension.type === 'recovery_required' && suspension.receipt?.kind === 'goal.create') {
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
    const parsed = GoalCreateWorkflowOutputSchema.safeParse(snapshot.result);
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
    kind: 'goal.create',
    conversationId: workflowInput.conversationId,
    status,
    ...(suspension ? { suspension } : {}),
    ...(failure ? { failure } : {}),
    ...(result ? { result } : {}),
    createdAt: new Date(row.createdAt).getTime(),
    updatedAt: new Date(row.updatedAt).getTime(),
  });
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
