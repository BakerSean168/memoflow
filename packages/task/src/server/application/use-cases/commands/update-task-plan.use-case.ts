/**
 * Update Task Template Service
 */

import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import { TaskPlanSchedule } from '../../../domain/value-objects/task-plan-schedule';
import { TaskReminderConfig } from '../../../domain/value-objects/task-reminder-config';
import {
  TaskGoalBindingTrigger,
  TaskOccurrenceStatus,
  TaskPlanStatus,
  TaskPlanScheduleKind,
  TaskRecurrenceEndKind,
  type TaskPlanClientDTO,
  type UpdateTaskPlanReq,
} from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { error, fail, ok } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import type { UserTimeContextPort } from '@memoflow/time';
import {
  mapTaskWriteErrorToResultError,
  type TaskWriteTransactionRunner,
} from './task-write-support';

function isFiniteSchedule(schedule: TaskPlanSchedule): boolean {
  return (
    schedule.kind === TaskPlanScheduleKind.OneTime ||
    (schedule.recurrence != null && schedule.recurrence.end.kind !== TaskRecurrenceEndKind.Never)
  );
}

export class UpdateTaskPlanUseCase {
  private readonly logger = createLogger('UpdateTaskPlanUseCase');
  private readonly transactionRunner: TaskWriteTransactionRunner;

  constructor(
    private readonly templateRepository: ITaskPlanRepository,
    private readonly instanceRepository: ITaskOccurrenceRepository,
    transactionRunner: TaskWriteTransactionRunner,
    private readonly userTimeContextPort: UserTimeContextPort,
    private readonly now: () => number = Date.now,
  ) {
    if (!transactionRunner) {
      throw new Error(
        'TaskWriteTransactionRunner must be explicitly provided to UpdateTaskPlanUseCase',
      );
    }
    this.transactionRunner = transactionRunner;
  }

  async execute(
    id: string,
    identityId: string,
    request: Partial<UpdateTaskPlanReq>,
  ): Promise<Result<TaskPlanClientDTO>> {
    try {
      const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
      return await this.transactionRunner.run(
        async ({ templateRepository, instanceRepository }) => {
          const template = await templateRepository!.findByIdForIdentity(identityId, id);
          if (!template) {
            return error('NOT_FOUND', `TaskPlan ${id} not found`);
          }

          // R2-5a：期望版本校验（可选；不传则跳过，向后兼容）。
          if (
            request.expectedVersion !== undefined &&
            request.expectedVersion !== template.version
          ) {
            return error(
              'CONFLICT',
              `TaskPlan ${id} version conflict: expected ${request.expectedVersion}, current ${template.version}`,
            );
          }

          const nextSchedule =
            request.schedule === undefined
              ? template.schedule
              : TaskPlanSchedule.create(request.schedule);
          const scheduleChanged =
            request.schedule !== undefined &&
            JSON.stringify(template.schedule.toDTO()) !== JSON.stringify(nextSchedule.toDTO());
          const importanceChanged =
            request.importance !== undefined && request.importance !== template.importance;
          const nextProgressTrigger =
            request.goalBinding === undefined
              ? template.goalBinding?.contribution?.trigger
              : request.goalBinding?.contribution?.trigger;

          if (
            nextProgressTrigger === TaskGoalBindingTrigger.PlanCompletion &&
            !isFiniteSchedule(nextSchedule)
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
              instance.status === TaskOccurrenceStatus.Pending &&
              instance.instanceDate > effectiveFrom,
          );
          const originalGenerationHorizon = template.lastGeneratedDate;

          if (request.name !== undefined) {
            template.updateTitle(request.name);
          }
          if (request.description !== undefined) {
            template.updateDescription(request.description ?? null);
          }
          if (scheduleChanged) {
            template.updateSchedule(nextSchedule);
          }
          if (importanceChanged && request.importance !== undefined) {
            template.updatePriority(request.importance);
          }
          if (request.reminderConfig !== undefined) {
            const nextReminderConfig = request.reminderConfig
              ? TaskReminderConfig.fromDTO(request.reminderConfig)
              : null;
            template.updateReminderConfig(nextReminderConfig);
          }
          if (
            request.completionPolicy !== undefined &&
            request.completionPolicy !== template.completionPolicy
          ) {
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
            if (template.status === TaskPlanStatus.Active && generationHorizon > effectiveFrom) {
              const regenerated = template.generateInstances(
                effectiveFrom,
                generationHorizon,
                timeContext,
              );
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
            const labels = await templateRepository!.replaceLabels(
              identityId,
              id,
              request.labelIds,
            );
            template.hydrateLabels(labels);
          }
          return ok(template.toClientDTOAt(timeContext, false, effectiveFrom));
        },
      );
    } catch (caughtError) {
      this.logger.error('Failed to update task template', { error: caughtError });
      return fail(mapTaskWriteErrorToResultError(caughtError, 'Failed to update task template'));
    }
  }
}
