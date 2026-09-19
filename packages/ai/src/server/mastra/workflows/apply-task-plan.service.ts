import {
  TaskPlanExecutionReceiptSchema,
  type TaskPlanDraft,
  type TaskPlanExecutionFailure,
  type TaskPlanExecutionReceipt,
} from '@memoflow/contracts/ai';
import type { ResultError } from '@memoflow/contracts/result';
import type { CreateTaskPlanReq } from '@memoflow/contracts/task';
import { taskWorkflowEntityId } from './deterministic-entity-id';
import type { ApplyTaskPlanInput, TaskPlanMutationPort } from './task-plan-mutation.port';
import { toWorkflowFailure } from './workflow-failure';

const RETRYABLE_LEGACY_CODES = new Set([
  'DATABASE_ERROR',
  'DB_ERROR',
  'INTERNAL_ERROR',
  'NETWORK_ERROR',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'TIMEOUT',
]);

function retryableFailure(error: ResultError): boolean {
  const hint = error.failure?.retryHint;
  if (hint?.kind === 'not_retryable') return false;
  if (hint?.kind === 'transient' || hint?.kind === 'after') return true;
  return RETRYABLE_LEGACY_CODES.has(String(error.code).toUpperCase());
}

function failure(
  draftRef: TaskPlanDraft['task']['draftRef'],
  error: Pick<ResultError, 'code' | 'message' | 'failure'>,
): TaskPlanExecutionFailure {
  const safeFailure = toWorkflowFailure(error);
  return {
    operation: 'task_plan',
    draftRef,
    code: safeFailure.code,
    message: safeFailure.message,
    retryable: retryableFailure(error as ResultError),
  };
}

function throwToFailure(
  draftRef: TaskPlanDraft['task']['draftRef'],
  cause: unknown,
): TaskPlanExecutionFailure {
  const safeFailure = toWorkflowFailure(cause);
  return {
    operation: 'task_plan',
    draftRef,
    code: safeFailure.code,
    message: safeFailure.message,
    retryable: true,
  };
}

function receipt(input: {
  workflowRunId: string;
  revision: number;
  referenceMap: Record<string, string>;
  failures: TaskPlanExecutionFailure[];
}): TaskPlanExecutionReceipt {
  return TaskPlanExecutionReceiptSchema.parse({
    workflowRunId: input.workflowRunId,
    revision: input.revision,
    status:
      input.failures.length === 0
        ? 'success'
        : Object.keys(input.referenceMap).length > 0
          ? 'partial'
          : 'failed',
    referenceMap: input.referenceMap,
    failures: input.failures,
    retryable: input.failures.some((item) => item.retryable),
  });
}

function taskRequest(
  draft: TaskPlanDraft,
  id: string,
  labelIds: readonly string[],
): CreateTaskPlanReq {
  const task = draft.task;
  return {
    id: id as NonNullable<CreateTaskPlanReq['id']>,
    name: task.title,
    description: task.description ?? null,
    schedule: task.schedule,
    reminderConfig: task.reminderConfig ?? null,
    importance: task.importance,
    labelIds: [...labelIds],
    goalBinding: task.goalBinding ?? null,
  };
}

/**
 * Deterministic, restart-safe application of one approved TaskPlanDraft.
 *
 * The owner Task application port receives the canonical schedule, reminder
 * policy and goal binding unchanged. The AI workflow only keeps the durable
 * `draftRef -> TaskPlanId` receipt needed to resume a failed operation.
 */
export class ApplyTaskPlanService {
  constructor(private readonly mutations: TaskPlanMutationPort) {}

  async apply(input: ApplyTaskPlanInput): Promise<TaskPlanExecutionReceipt> {
    const { workflowRunId, draft, context } = input;
    const draftRef = draft.task.draftRef;
    const operation = 'task_plan_create';
    const expectedTaskId = taskWorkflowEntityId({
      workflowRunId,
      revision: draft.revision,
      draftRef,
      operation,
    });
    const prior =
      input.priorReceipt?.workflowRunId === workflowRunId &&
      input.priorReceipt.revision === draft.revision
        ? input.priorReceipt
        : undefined;
    const referenceMap: Record<string, string> =
      prior?.referenceMap[draftRef] === expectedTaskId ? { [draftRef]: expectedTaskId } : {};

    // Terminal duplicate approval is a read-only replay. A partial receipt
    // with this ref already persisted means the owner mutation succeeded and
    // only receipt persistence/recovery remained.
    if (referenceMap[draftRef] && prior?.status === 'success') return prior;
    if (referenceMap[draftRef]) {
      return receipt({ workflowRunId, revision: draft.revision, referenceMap, failures: [] });
    }

    let labels;
    try {
      labels = await this.mutations.resolveLabels(draft.task.labels, context);
    } catch (cause) {
      return receipt({
        workflowRunId,
        revision: draft.revision,
        referenceMap,
        failures: [throwToFailure(draftRef, cause)],
      });
    }
    if (!labels.ok) {
      return receipt({
        workflowRunId,
        revision: draft.revision,
        referenceMap,
        failures: [failure(draftRef, labels.error)],
      });
    }

    let request: CreateTaskPlanReq;
    try {
      request = taskRequest(draft, expectedTaskId, labels.data);
    } catch {
      return receipt({
        workflowRunId,
        revision: draft.revision,
        referenceMap,
        failures: [
          {
            operation: 'task_plan',
            draftRef,
            code: 'VALIDATION_ERROR',
            message: 'Invalid task plan',
            retryable: false,
          },
        ],
      });
    }

    try {
      const result = await this.mutations.createTaskPlan(request, context);
      if (!result.ok) {
        return receipt({
          workflowRunId,
          revision: draft.revision,
          referenceMap,
          failures: [failure(draftRef, result.error)],
        });
      }
      if (result.data.taskId !== expectedTaskId) {
        return receipt({
          workflowRunId,
          revision: draft.revision,
          referenceMap,
          failures: [
            {
              operation: 'task_plan',
              draftRef,
              code: 'AI_WORKFLOW_MUTATION_ID_MISMATCH',
              message: 'Task application port returned an unexpected deterministic entity ID',
              retryable: false,
            },
          ],
        });
      }
      referenceMap[draftRef] = expectedTaskId;
    } catch (cause) {
      return receipt({
        workflowRunId,
        revision: draft.revision,
        referenceMap,
        failures: [throwToFailure(draftRef, cause)],
      });
    }

    return receipt({ workflowRunId, revision: draft.revision, referenceMap, failures: [] });
  }
}
