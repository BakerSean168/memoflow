import type { TaskPlanExecutionFailure, TaskPlanExecutionReceipt } from '@memoflow/contracts/ai';
import type { ResultError } from '@memoflow/contracts/result';
import { TaskGoalBindingTrigger, type CreateTaskPlanReq } from '@memoflow/contracts/task';
import { taskWorkflowEntityId } from './deterministic-entity-id';
import { taskPlanScheduleFromDraft } from './task-plan-schedule.mapper';
import type { ApplyTaskPlanInput, TaskPlanMutationPort } from './task-plan-mutation.port';

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
  error: Pick<ResultError, 'code' | 'message' | 'failure'>,
): TaskPlanExecutionFailure {
  return {
    operation: 'task_template',
    code: String(error.code),
    message: error.message,
    retryable: retryableFailure(error as ResultError),
  };
}

function taskRequest(
  draft: import('@memoflow/contracts/ai').TaskPlanDraft,
  id: string,
  labelIds: readonly string[],
): CreateTaskPlanReq {
  const task = draft.task;
  const schedule = taskPlanScheduleFromDraft({
    cadence: task.cadence,
    startDate: task.startDate,
    timeOfDay: task.timeOfDay,
    timezone: task.timezone,
    daysOfWeek: task.daysOfWeek,
    occurrences: task.occurrences,
  });

  return {
    id: id as NonNullable<CreateTaskPlanReq['id']>,
    name: task.title,
    description: task.description ?? null,
    schedule,
    reminderConfig: null,
    importance: task.importance,
    labelIds: [...labelIds],
    goalBinding: task.goalId
      ? {
          goalId: task.goalId as NonNullable<
            NonNullable<CreateTaskPlanReq['goalBinding']>['goalId']
          >,
          keyResultId: task.keyResultId as NonNullable<
            CreateTaskPlanReq['goalBinding']
          >['keyResultId'],
          contribution:
            task.keyResultId && task.contributionValue !== null
              ? {
                  value: task.contributionValue,
                  trigger: TaskGoalBindingTrigger.EachCompletion,
                }
              : null,
        }
      : null,
  };
}

/**
 * Deterministic, restart-safe application of one approved TaskPlanDraft.
 *
 * A single task template is created under a stable aggregate ID derived from
 * `(workflowRunId, revision, kind, index)`, so a double-approve / retry replays
 * the same durable fact rather than creating a duplicate template.
 */
export class ApplyTaskPlanService {
  constructor(private readonly mutations: TaskPlanMutationPort) {}

  async apply(input: ApplyTaskPlanInput): Promise<TaskPlanExecutionReceipt> {
    const { workflowRunId, draft, context } = input;
    const prior =
      input.priorReceipt?.workflowRunId === workflowRunId &&
      input.priorReceipt.revision === draft.revision
        ? input.priorReceipt
        : undefined;

    const expectedTaskId = taskWorkflowEntityId({
      workflowRunId,
      revision: draft.revision,
      kind: 'task_template',
    });
    // Idempotency: if the prior receipt already applied this exact entity, do not
    // call the mutation port again.
    if (prior?.status === 'success' && prior.taskPlanId === expectedTaskId) {
      return prior;
    }

    const failures: TaskPlanExecutionFailure[] = [];
    let created: string | undefined =
      prior?.taskPlanId === expectedTaskId ? prior.taskPlanId : undefined;
    let taskIds: string[] = prior?.taskIds ?? [];

    if (!created) {
      const labelsResult = await this.mutations.resolveLabels(draft.task.labels, context);
      if (!labelsResult.ok) {
        const labelFailure = failure(labelsResult.error);
        return {
          workflowRunId,
          revision: draft.revision,
          status: 'failed',
          taskIds: [],
          failures: [labelFailure],
          retryable: labelFailure.retryable,
        };
      }

      let request: CreateTaskPlanReq;
      try {
        request = taskRequest(draft, expectedTaskId, labelsResult.data);
      } catch (cause) {
        return {
          workflowRunId,
          revision: draft.revision,
          status: 'failed',
          taskIds: [],
          failures: [
            {
              operation: 'task_template',
              code: 'VALIDATION_ERROR',
              message: cause instanceof Error ? cause.message : 'Invalid task plan',
              retryable: false,
            },
          ],
          retryable: false,
        };
      }
      const result = await this.mutations.createTaskPlan(request, context);
      if (result.ok) {
        if (result.data.taskId !== expectedTaskId) {
          failures.push({
            operation: 'task_template',
            code: 'AI_WORKFLOW_MUTATION_ID_MISMATCH',
            message: 'Task application port returned an unexpected deterministic entity ID',
            retryable: false,
          });
        } else {
          created = result.data.taskId;
          taskIds = [result.data.taskId];
        }
      } else {
        failures.push(failure(result.error));
      }
    }

    return {
      workflowRunId,
      revision: draft.revision,
      status: failures.length ? (created ? 'partial' : 'failed') : 'success',
      ...(created ? { taskPlanId: created } : {}),
      taskIds,
      failures,
      retryable: failures.some((item) => item.retryable),
    };
  }
}
