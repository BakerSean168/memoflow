/**
 * Update Task Template Service
 */

import type { ITaskTemplateRepository } from '../../../domain/repositories/i-task-template-repository';
import type { ITaskInstanceRepository } from '../../../domain/repositories/i-task-instance-repository';
import { RecurrenceRule } from '../../../domain/value-objects/recurrence-rule';
import { TaskTimeConfig } from '../../../domain/value-objects/task-time-config';
import { TaskReminderConfig } from '../../../domain/value-objects/task-reminder-config';
import {
  TaskGoalBindingTrigger,
  TaskInstanceStatus,
  TaskTemplateStatus,
  TaskType,
  type RecurrenceRuleDTO,
  type TaskTemplateClientDTO,
  type TaskTimeConfigDTO,
  type UpdateTaskTemplateReq,
} from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { error, fail, ok } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import { isFiniteTaskPlan } from '../../../domain/aggregates/task-template-goal.policy';
import {
  mapTaskWriteErrorToResultError,
  type TaskWriteTransactionRunner,
} from './task-write-support';

function sameTimeConfig(
  left: TaskTimeConfigDTO | null,
  right: TaskTimeConfigDTO | null,
): boolean {
  return (
    left?.timeType === right?.timeType &&
    left?.startDate === right?.startDate &&
    left?.timePoint === right?.timePoint &&
    left?.timeRange?.start === right?.timeRange?.start &&
    left?.timeRange?.end === right?.timeRange?.end
  );
}

function sameRecurrenceRule(
  left: RecurrenceRuleDTO | null,
  right: RecurrenceRuleDTO | null,
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return (
    left.frequency === right.frequency &&
    left.interval === right.interval &&
    left.endDate === right.endDate &&
    left.occurrences === right.occurrences &&
    [...left.daysOfWeek].sort().join(',') === [...right.daysOfWeek].sort().join(',')
  );
}

export class UpdateTaskTemplateUseCase {
  private readonly logger = createLogger('UpdateTaskTemplateUseCase');
  private readonly transactionRunner: TaskWriteTransactionRunner;

  constructor(
    private readonly templateRepository: ITaskTemplateRepository,
    private readonly instanceRepository: ITaskInstanceRepository,
    transactionRunner: TaskWriteTransactionRunner,
    private readonly now: () => number = Date.now,
  ) {
    if (!transactionRunner) {
      throw new Error('TaskWriteTransactionRunner must be explicitly provided to UpdateTaskTemplateUseCase');
    }
    this.transactionRunner = transactionRunner;
  }

  async execute(
    id: string,
    identityId: string,
    request: Partial<UpdateTaskTemplateReq>,
  ): Promise<Result<TaskTemplateClientDTO>> {
    try {
      return await this.transactionRunner.run(async ({
        templateRepository,
        instanceRepository,
      }) => {
        const template = await templateRepository!.findByIdForIdentity(identityId, id);
        if (!template) {
          return error('NOT_FOUND', `TaskTemplate ${id} not found`);
        }

        // R2-5a：期望版本校验（可选；不传则跳过，向后兼容）。
        if (request.expectedVersion !== undefined && request.expectedVersion !== template.version) {
          return error(
            'CONFLICT',
            `TaskTemplate ${id} version conflict: expected ${request.expectedVersion}, current ${template.version}`,
          );
        }

        if (request.timeConfig === null) {
          return error('BAD_REQUEST', 'A task plan must keep a time configuration');
        }
        if (template.taskType === TaskType.Recurring && request.recurrenceRule === null) {
          return error('BAD_REQUEST', 'A recurring task plan must keep a recurrence rule');
        }

        const currentTimeConfig = template.timeConfig?.toDTO() ?? null;
        const currentRecurrenceRule = template.recurrenceRule?.toDTO() ?? null;
        const nextTimeConfig =
          request.timeConfig === undefined
            ? template.timeConfig
            : TaskTimeConfig.fromDTO(request.timeConfig);
        const nextRecurrenceRule =
          request.recurrenceRule === undefined
            ? template.recurrenceRule
            : request.recurrenceRule === null
              ? null
              : RecurrenceRule.fromDTO(request.recurrenceRule);
        const timeChanged =
          request.timeConfig !== undefined &&
          !sameTimeConfig(currentTimeConfig, nextTimeConfig?.toDTO() ?? null);
        const recurrenceChanged =
          request.recurrenceRule !== undefined &&
          !sameRecurrenceRule(currentRecurrenceRule, nextRecurrenceRule?.toDTO() ?? null);
        const scheduleChanged = timeChanged || recurrenceChanged;
        const importanceChanged =
          request.importance !== undefined && request.importance !== template.importance;
        const nextProgressTrigger =
          request.goalBinding === undefined
            ? template.goalBinding?.contribution?.trigger
            : request.goalBinding?.contribution?.trigger;

        if (
          nextProgressTrigger === TaskGoalBindingTrigger.PlanCompletion &&
          !isFiniteTaskPlan(template.taskType, nextRecurrenceRule)
        ) {
          return error(
            'BAD_REQUEST',
            'Whole-plan goal progress requires an end date or maximum occurrence count',
          );
        }


        const effectiveFrom = this.now();
        const instances =
          scheduleChanged || importanceChanged
            ? await instanceRepository.findByTemplateId(id, identityId)
            : [];
        const affectedPendingInstances = instances.filter(
          (instance) =>
            instance.status === TaskInstanceStatus.Pending &&
            instance.instanceDate > effectiveFrom,
        );
        const originalGenerationHorizon = template.lastGeneratedDate;

        if (request.name !== undefined) {
          template.updateTitle(request.name);
        }
        if (request.description !== undefined) {
          template.updateDescription(request.description ?? null);
        }
        if (timeChanged) {
          template.updateTimeConfig(nextTimeConfig);
        }
        if (importanceChanged && request.importance !== undefined) {
          template.updatePriority(request.importance);
        }
        if (recurrenceChanged && nextRecurrenceRule) {
          template.updateRecurrenceRule(nextRecurrenceRule);
        }
        if (request.reminderConfig !== undefined) {
          const nextReminderConfig = request.reminderConfig
            ? TaskReminderConfig.fromDTO(request.reminderConfig)
            : null;
          template.updateReminderConfig(nextReminderConfig);
        }
        if (request.completionPolicy !== undefined && request.completionPolicy !== template.completionPolicy) {
          template.updateCompletionPolicy(request.completionPolicy);
        }
        if (request.goalBinding !== undefined) {
          if (template.goalBinding) {
            template.unbindFromGoal();
          }
          if (request.goalBinding) {
            template.bindToGoal(
              request.goalBinding.goalId,
              request.goalBinding.keyResultId,
              request.goalBinding.contribution ?? null,
            );
          }
        }

        if (scheduleChanged) {
          const affectedIds = affectedPendingInstances.map((instance) => String(instance.id));
          if (affectedIds.length > 0) {
            await instanceRepository.deleteMany(identityId, affectedIds);
          }

          const affectedIdSet = new Set(affectedIds);
          instances
            .filter((instance) => !affectedIdSet.has(String(instance.id)))
            .forEach((instance) => template.addInstance(instance));

          const generationHorizon = Math.max(
            originalGenerationHorizon ?? 0,
            ...affectedPendingInstances.map((instance) => instance.instanceDate),
          );
          if (
            template.status === TaskTemplateStatus.Active &&
            nextTimeConfig &&
            generationHorizon > effectiveFrom
          ) {
            const regenerated = template.generateInstances(effectiveFrom, generationHorizon);
            if (regenerated.length > 0) {
              await instanceRepository.saveMany(regenerated);
            }
          }
        } else if (importanceChanged && request.importance !== undefined) {
          const changedInstances = affectedPendingInstances.filter((instance) =>
            instance.applyPlanProjection({
              effectiveFrom,
              importance: request.importance,
            }),
          );
          if (changedInstances.length > 0) {
            await instanceRepository.saveMany(changedInstances);
          }
        }

        // R2-5a：编辑完成 → 递增版本（乐观锁）。
        template.advanceVersion();
        await templateRepository!.save(template);
        if (request.labelIds !== undefined) {
          const labels = await templateRepository!.replaceLabels(identityId, id, request.labelIds);
          template.hydrateLabels(labels);
        }
        return ok(template.toClientDTO());
      });
    } catch (caughtError) {
      this.logger.error('Failed to update task template', { error: caughtError });
      return fail(mapTaskWriteErrorToResultError(caughtError, 'Failed to update task template'));
    }
  }

}
