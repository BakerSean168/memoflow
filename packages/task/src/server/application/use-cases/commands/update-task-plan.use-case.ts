/**
 * Update Task Template Service
 */

import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import { TaskPlanSchedule } from '../../../domain/value-objects/task-plan-schedule';
import { TaskReminderConfig } from '../../../domain/value-objects/task-reminder-config';
import { TaskOccurrenceGenerationService } from '../../../domain/services/task-occurrence-generation-service';
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
import { createTimeFacade, type UserTimeContextPort } from '@memoflow/time';
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
  private readonly generationService = new TaskOccurrenceGenerationService();
  private readonly logger = createLogger('UpdateTaskPlanUseCase');
  private readonly transactionRunner: TaskWriteTransactionRunner;

  constructor(
    private readonly planRepository: ITaskPlanRepository,
    private readonly occurrenceRepository: ITaskOccurrenceRepository,
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
        async ({ planRepository, occurrenceRepository }) => {
          const plan = await planRepository!.findByIdForIdentity(identityId, id);
          if (!plan) {
            return error('NOT_FOUND', `TaskPlan ${id} not found`);
          }

          // R2-5a：期望版本校验（可选；不传则跳过，向后兼容）。
          if (
            request.expectedVersion !== undefined &&
            request.expectedVersion !== plan.version
          ) {
            return error(
              'CONFLICT',
              `TaskPlan ${id} version conflict: expected ${request.expectedVersion}, current ${plan.version}`,
            );
          }

          const nextSchedule =
            request.schedule === undefined
              ? plan.schedule
              : TaskPlanSchedule.create(request.schedule);
          const scheduleChanged =
            request.schedule !== undefined &&
            JSON.stringify(plan.schedule.toDTO()) !== JSON.stringify(nextSchedule.toDTO());
          const importanceChanged =
            request.importance !== undefined && request.importance !== plan.importance;
          const nextProgressTrigger =
            request.goalBinding === undefined
              ? plan.goalBinding?.contribution?.trigger
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
          const effectiveFromDate = createTimeFacade({ context: timeContext }).calendar.toYmd(
            effectiveFrom,
          );
          const occurrences =
            scheduleChanged || importanceChanged
              ? await occurrenceRepository.findByPlanId(id, identityId)
              : [];
          const affectedPendingInstances = occurrences.filter(
            (occurrence) =>
              occurrence.status === TaskOccurrenceStatus.Pending &&
              occurrence.scheduleDate > effectiveFromDate,
          );

          if (request.name !== undefined) {
            plan.updateTitle(request.name);
          }
          if (request.description !== undefined) {
            plan.updateDescription(request.description ?? null);
          }
          if (scheduleChanged) {
            plan.updateSchedule(nextSchedule);
          }
          if (importanceChanged && request.importance !== undefined) {
            plan.updatePriority(request.importance);
          }
          if (request.checklist !== undefined) {
            plan.updateChecklist(request.checklist);
          }
          if (request.reminderConfig !== undefined) {
            const nextReminderConfig = request.reminderConfig
              ? TaskReminderConfig.fromDTO(request.reminderConfig)
              : null;
            plan.updateReminderConfig(nextReminderConfig);
          }
          if (
            request.completionPolicy !== undefined &&
            request.completionPolicy !== plan.completionPolicy
          ) {
            plan.updateCompletionPolicy(request.completionPolicy);
          }
          if (request.goalBinding !== undefined) {
            if (plan.goalBinding) {
              plan.unbindFromGoal();
            }
            if (request.goalBinding) {
              plan.bindToGoal(
                request.goalBinding.goalId,
                request.goalBinding.keyResultId,
                request.goalBinding.contribution ?? null,
              );
            }
          }

          if (scheduleChanged) {
            const affectedIds = affectedPendingInstances.map((occurrence) => String(occurrence.id));
            if (affectedIds.length > 0) {
              await occurrenceRepository.deleteMany(identityId, affectedIds);
            }

            const affectedIdSet = new Set(affectedIds);
            const preservedInstances = occurrences.filter(
              (occurrence) => !affectedIdSet.has(String(occurrence.id)),
            );

            const generationHorizon = affectedPendingInstances.reduce(
              (latest, occurrence) =>
                Math.max(latest, Number(occurrence.scheduledStartOfDayAt(timeContext))),
              effectiveFrom,
            );
            if (plan.status === TaskPlanStatus.Active && generationHorizon > effectiveFrom) {
              const regenerated = this.generationService.generateOccurrences(plan, timeContext, {
                fromDate: effectiveFrom,
                targetDate: generationHorizon,
                existingOccurrences: preservedInstances,
                now: effectiveFrom,
              });
              if (regenerated.length > 0) {
                await occurrenceRepository.saveMany(regenerated);
              }
            }
          } else if (importanceChanged && request.importance !== undefined) {
            const changedInstances = affectedPendingInstances.filter((occurrence) =>
              occurrence.applyPlanProjection({
                effectiveFrom: effectiveFromDate,
                importance: request.importance,
              }),
            );
            if (changedInstances.length > 0) {
              await occurrenceRepository.saveMany(changedInstances);
            }
          }

          // R2-5a：编辑完成 → 递增版本（乐观锁）。
          plan.advanceVersion();
          await planRepository!.save(plan);
          if (request.labelIds !== undefined) {
            const labels = await planRepository!.replaceLabels(
              identityId,
              id,
              request.labelIds,
            );
            plan.hydrateLabels(labels);
          }
          return ok(plan.toClientDTOAt(timeContext, false, effectiveFrom));
        },
      );
    } catch (caughtError) {
      this.logger.error('Failed to update task plan', { error: caughtError });
      return fail(mapTaskWriteErrorToResultError(caughtError, 'Failed to update task plan'));
    }
  }
}
