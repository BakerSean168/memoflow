import {
  GoalCreateWorkflowInputSchema,
  TaskCreateWorkflowInputSchema,
  KnowledgeCaptureWorkflowInputSchema,
} from '@memoflow/contracts/ai';
import {
  GOAL_CREATE_WORKFLOW_ID,
  TASK_CREATE_WORKFLOW_ID,
  KNOWLEDGE_CAPTURE_WORKFLOW_ID,
} from '../workflows';

// Internal boundary: durable Mastra snapshots remain unknown until decoded.
export function parseWorkflowSnapshot(value: unknown): Record<string, unknown> {
  const parsed =
    typeof value === 'string'
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
          }
        })()
      : value;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
  }
  return parsed as Record<string, unknown>;
}

export function goalCreateInputFromSnapshot(snapshot: Record<string, unknown>) {
  const context = snapshot.context;
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
  }
  const parsed = GoalCreateWorkflowInputSchema.safeParse(
    (context as Record<string, unknown>).input,
  );
  if (!parsed.success) throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
  return parsed.data;
}

export function taskCreateInputFromSnapshot(snapshot: Record<string, unknown>) {
  const context = snapshot.context;
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
  }
  const parsed = TaskCreateWorkflowInputSchema.safeParse(
    (context as Record<string, unknown>).input,
  );
  if (!parsed.success) throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
  return parsed.data;
}

export function knowledgeCaptureInputFromSnapshot(snapshot: Record<string, unknown>) {
  const context = snapshot.context;
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
  }
  const parsed = KnowledgeCaptureWorkflowInputSchema.safeParse(
    (context as Record<string, unknown>).input,
  );
  if (!parsed.success) throw new Error('AI_WORKFLOW_SNAPSHOT_CORRUPT');
  return parsed.data;
}

export function workflowInputFromSnapshot(
  workflowName: string,
  rawSnapshot: unknown,
):
  | ReturnType<(typeof GoalCreateWorkflowInputSchema)['parse']>
  | ReturnType<(typeof TaskCreateWorkflowInputSchema)['parse']>
  | ReturnType<(typeof KnowledgeCaptureWorkflowInputSchema)['parse']> {
  const snapshot = parseWorkflowSnapshot(rawSnapshot);
  if (workflowName === GOAL_CREATE_WORKFLOW_ID) {
    return goalCreateInputFromSnapshot(snapshot);
  }
  if (workflowName === TASK_CREATE_WORKFLOW_ID) {
    return taskCreateInputFromSnapshot(snapshot);
  }
  if (workflowName === KNOWLEDGE_CAPTURE_WORKFLOW_ID) {
    return knowledgeCaptureInputFromSnapshot(snapshot);
  }
  throw new Error('AI_WORKFLOW_KIND_UNSUPPORTED');
}
