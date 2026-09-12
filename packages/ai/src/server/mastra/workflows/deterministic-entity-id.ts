import { createHash } from 'node:crypto';
import { ID_PREFIXES } from '@memoflow/contracts/primitives';
import type { GoalPlanDraftRef } from '@memoflow/contracts/ai';

export type GoalWorkflowEntityKind = 'goal' | 'key_result' | 'task_plan' | 'knowledge_document';

const prefixByKind: Readonly<Record<GoalWorkflowEntityKind, string>> = {
  goal: ID_PREFIXES.GoalId,
  key_result: ID_PREFIXES.KeyResultId,
  task_plan: ID_PREFIXES.TaskPlanId,
  knowledge_document: ID_PREFIXES.KnowledgeDocumentId,
};

/** Stable RFC-4122-shaped UUIDv8 for application-defined deterministic identities. */
function deterministicUuidV8(seed: string): string {
  const bytes = createHash('sha256').update(seed, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x80;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function assertWorkflowIdentity(input: { workflowRunId: string; revision: number }): void {
  if (!input.workflowRunId.trim()) throw new Error('workflowRunId is required');
  if (!Number.isInteger(input.revision) || input.revision < 1) {
    throw new Error('revision must be a positive integer');
  }
}

/**
 * GOAL-7208 deterministic product identity.
 *
 * ADR-099: array positions are presentation only. Child identity is derived
 * from `(workflowRunId, revision, draftRef, entity kind)` so reorder cannot
 * create a second business entity for the same reviewed draft item.
 */
export function goalWorkflowEntityId(input: {
  workflowRunId: string;
  revision: number;
  kind: GoalWorkflowEntityKind;
  draftRef: GoalPlanDraftRef;
}): string {
  assertWorkflowIdentity(input);
  if (!input.draftRef.trim()) throw new Error('draftRef is required');
  const seed = `memoflow:goal.create:v2:${input.workflowRunId}:${input.revision}:${input.draftRef}:${input.kind}`;
  return `${prefixByKind[input.kind]}_${deterministicUuidV8(seed)}`;
}

/** Durable idempotency request key for one GoalPlan child mutation. */
export function goalWorkflowMutationRequestId(input: {
  workflowRunId: string;
  revision: number;
  draftRef: GoalPlanDraftRef;
  operation: string;
}): string {
  assertWorkflowIdentity(input);
  if (!input.draftRef.trim()) throw new Error('draftRef is required');
  const operation = input.operation.trim();
  if (!operation) throw new Error('operation is required');
  return deterministicUuidV8(
    `memoflow:goal.create:v2:${input.workflowRunId}:${input.revision}:${input.draftRef}:${operation}`,
  );
}

export type TaskWorkflowEntityKind = 'task_template';

const taskPrefixByKind: Readonly<Record<TaskWorkflowEntityKind, string>> = {
  task_template: ID_PREFIXES.TaskPlanId,
};

/** Deterministic identity for the standalone `task.create` Workflow. */
export function taskWorkflowEntityId(input: {
  workflowRunId: string;
  revision: number;
  kind: TaskWorkflowEntityKind;
  index?: number;
}): string {
  const index = input.index ?? 0;
  assertWorkflowIdentity(input);
  if (!Number.isInteger(index) || index < 0)
    throw new Error('index must be a non-negative integer');

  const seed = `memoflow:task.create:v1:${input.workflowRunId}:${input.revision}:${input.kind}:${index}`;
  return `${taskPrefixByKind[input.kind]}_${deterministicUuidV8(seed)}`;
}

/** Deterministic idempotency request id for the standalone `knowledge.capture` Workflow. */
export function knowledgeCaptureRequestId(input: {
  workflowRunId: string;
  revision: number;
}): string {
  assertWorkflowIdentity(input);
  const seed = `memoflow:knowledge.capture:v1:${input.workflowRunId}:${input.revision}`;
  return deterministicUuidV8(seed);
}

/** Stable KnowledgeDocumentId for one standalone knowledge.capture Workflow. */
export function knowledgeCaptureDocumentId(input: { workflowRunId: string }): string {
  if (!input.workflowRunId.trim()) throw new Error('workflowRunId is required');
  const seed = `memoflow:knowledge.document:v1:${input.workflowRunId}`;
  return `${ID_PREFIXES.KnowledgeDocumentId}_${deterministicUuidV8(seed)}`;
}
