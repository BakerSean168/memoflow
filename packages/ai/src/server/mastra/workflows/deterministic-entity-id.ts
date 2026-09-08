import { createHash } from 'node:crypto';
import { ID_PREFIXES } from '@memoflow/contracts/primitives';

export type GoalWorkflowEntityKind = 'goal' | 'key_result' | 'task_template' | 'reminder';

const prefixByKind: Readonly<Record<GoalWorkflowEntityKind, string>> = {
  goal: ID_PREFIXES.GoalId,
  key_result: ID_PREFIXES.KeyResultId,
  task_template: ID_PREFIXES.TaskPlanId,
  reminder: ID_PREFIXES.ReminderTemplateId,
};

/**
 * Stable RFC-4122-shaped UUIDv8 derived from a workflow mutation identity.
 *
 * UUIDv8 is deliberately used for an application-defined deterministic hash
 * layout. The exact bytes are part of the persisted workflow contract: changing
 * this algorithm would break replay idempotency for existing runs.
 */
function deterministicUuidV8(seed: string): string {
  const bytes = createHash('sha256').update(seed, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Deterministic child mutation identity required by ADR-052.
 * Root key: workflowRunId + revision; child key: entity kind + index.
 */
export function goalWorkflowEntityId(input: {
  workflowRunId: string;
  revision: number;
  kind: GoalWorkflowEntityKind;
  index?: number;
}): string {
  const index = input.index ?? 0;
  if (!input.workflowRunId.trim()) throw new Error('workflowRunId is required');
  if (!Number.isInteger(input.revision) || input.revision < 1) {
    throw new Error('revision must be a positive integer');
  }
  if (!Number.isInteger(index) || index < 0)
    throw new Error('index must be a non-negative integer');

  const seed = `memoflow:goal.create:v1:${input.workflowRunId}:${input.revision}:${input.kind}:${index}`;
  return `${prefixByKind[input.kind]}_${deterministicUuidV8(seed)}`;
}

export type TaskWorkflowEntityKind = 'task_template';

const taskPrefixByKind: Readonly<Record<TaskWorkflowEntityKind, string>> = {
  task_template: ID_PREFIXES.TaskPlanId,
};

/**
 * Deterministic child mutation identity for the `task.create` Mastra Workflow.
 *
 * Same RFC-4122-shaped UUIDv8 layout as goal.create but seeded under a distinct
 * workflow namespace so a task template can never collide with a goal workflow's
 * generated task template id. The seed is part of the persisted contract.
 */
export function taskWorkflowEntityId(input: {
  workflowRunId: string;
  revision: number;
  kind: TaskWorkflowEntityKind;
  index?: number;
}): string {
  const index = input.index ?? 0;
  if (!input.workflowRunId.trim()) throw new Error('workflowRunId is required');
  if (!Number.isInteger(input.revision) || input.revision < 1) {
    throw new Error('revision must be a positive integer');
  }
  if (!Number.isInteger(index) || index < 0)
    throw new Error('index must be a non-negative integer');

  const seed = `memoflow:task.create:v1:${input.workflowRunId}:${input.revision}:${input.kind}:${index}`;
  return `${taskPrefixByKind[input.kind]}_${deterministicUuidV8(seed)}`;
}

/**
 * Deterministic idempotency request id for the `knowledge.capture` Mastra
 * Workflow.
 *
 * Same RFC-4122-shaped UUIDv8 layout as goal.create/task.create but seeded
 * under a distinct workflow namespace so a knowledge-note write request can
 * never collide with a goal/task mutation request id. The seed is part of the
 * persisted workflow contract; changing it would break replay idempotency.
 */
export function knowledgeCaptureRequestId(input: {
  workflowRunId: string;
  revision: number;
}): string {
  if (!input.workflowRunId.trim()) throw new Error('workflowRunId is required');
  if (!Number.isInteger(input.revision) || input.revision < 1) {
    throw new Error('revision must be a positive integer');
  }
  const seed = `memoflow:knowledge.capture:v1:${input.workflowRunId}:${input.revision}`;
  return deterministicUuidV8(seed);
}
