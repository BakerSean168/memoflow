/**
 * Create Task Template Service
 *
 * Creates a task plan (recurring task) and automatically
 * generates initial occurrences upon creation.
 */

import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import { TaskPlan } from '../../../domain/aggregates/task-plan';
import { TaskPlanSchedule, TaskReminderConfig } from '../../../domain/value-objects';
import { TaskPlanId } from '../../../domain/value-objects/task-plan-id';
import { TaskOccurrenceGenerationService } from '../../../domain/services/index';
import type { CreateTaskPlanInput, CreateTaskPlanRes } from '@memoflow/contracts/task';
import { TaskPlanStatus } from '@memoflow/contracts/task';
import { createLogger } from '@memoflow/utils/logger';
import { createTimeFacade, type TimeContext, type UserTimeContextPort } from '@memoflow/time';
import type { Result } from '@memoflow/contracts/result';
import { error, fail, ok } from '@memoflow/contracts/result';
import {
  mapTaskWriteErrorToResultError,
  type TaskWriteTransactionRunner,
} from './task-write-support';
import {
  TaskGoalBindingTrigger,
  TaskPlanScheduleKind,
  TaskRecurrenceEndKind,
} from '@memoflow/contracts/task';

/**
 * Create Task Template Service
 */
export class CreateTaskPlanUseCase {
  private readonly generationService: TaskOccurrenceGenerationService;
  private readonly logger = createLogger('CreateTaskPlanUseCase');
  private readonly transactionRunner: TaskWriteTransactionRunner;

  constructor(
    private readonly planRepository: ITaskPlanRepository,
    private readonly occurrenceRepository: ITaskOccurrenceRepository,
    transactionRunner: TaskWriteTransactionRunner,
    private readonly userTimeContextPort: UserTimeContextPort,
  ) {
    if (!transactionRunner) {
      throw new Error(
        'TaskWriteTransactionRunner must be explicitly provided to CreateTaskPlanUseCase',
      );
    }
    this.generationService = new TaskOccurrenceGenerationService();
    this.transactionRunner = transactionRunner;
  }

  private async replayExisting(
    identityId: string,
    id: string,
    planRepository: ITaskPlanRepository,
    occurrenceRepository: ITaskOccurrenceRepository,
    timeContext: TimeContext,
  ): Promise<Result<CreateTaskPlanRes> | null> {
    const existing = await planRepository.findByIdForIdentity(identityId, id);
    if (!existing) return null;

    const occurrences = await occurrenceRepository.findByPlanId(id, identityId);
    const time = createTimeFacade({ context: timeContext });
    const today = time.calendar.toYmd(Date.now());
    return ok({
      plan: existing.toClientDTOAt(timeContext),
      occurrenceCount: occurrences.length,
      todayOccurrenceCreated: occurrences.some((occurrence) => occurrence.scheduleDate === today),
    });
  }

  async execute(request: CreateTaskPlanInput): Promise<Result<CreateTaskPlanRes>> {
    let timeContext: TimeContext | null = null;
    try {
      const resolvedTimeContext = await this.userTimeContextPort.getUserTimeContext(
        request.identityId,
      );
      timeContext = resolvedTimeContext;
      return await this.transactionRunner.run(
        async ({ planRepository, occurrenceRepository }) => {
          if (request.id) {
            const replay = await this.replayExisting(
              request.identityId,
              request.id,
              planRepository!,
              occurrenceRepository,
              resolvedTimeContext,
            );
            if (replay) return replay;
          }

          const schedule = TaskPlanSchedule.create(request.schedule);
          const reminderConfig = request.reminderConfig
            ? TaskReminderConfig.fromDTO(request.reminderConfig)
            : undefined;

          const isFinitePlan =
            schedule.kind === TaskPlanScheduleKind.OneTime ||
            (schedule.recurrence != null &&
              schedule.recurrence.end.kind !== TaskRecurrenceEndKind.Never);
          if (
            request.goalBinding?.contribution?.trigger === TaskGoalBindingTrigger.PlanCompletion &&
            !isFinitePlan
          ) {
            return error(
              'BAD_REQUEST',
              'Whole-plan goal progress requires an end date or maximum occurrence count',
            );
          }

          const plan = TaskPlan.create({
            id: request.id ? TaskPlanId.of(request.id) : undefined,
            identityId: request.identityId,
            title: request.name,
            description: request.description ?? undefined,
            schedule,
            reminderConfig,
            importance: request.importance,
            completionPolicy: request.completionPolicy,
            checklist: request.checklist,
            goalBinding: request.goalBinding
              ? {
                  goalId: request.goalBinding.goalId,
                  keyResultId: request.goalBinding.keyResultId,
                  contribution: request.goalBinding.contribution ?? null,
                }
              : null,
          });

          // Materialize from canonical schedule before persistence. TaskPlan carries no
          // generation cursor; save is still required before occurrences for the FK and
          // to flush the generated domain event after the transaction commits.
          const occurrences =
            plan.status === TaskPlanStatus.Active
              ? this.generationService.generateOccurrences(plan, resolvedTimeContext)
              : [];

          await planRepository!.save(plan);
          if (request.labelIds !== undefined) {
            const labels = await planRepository!.replaceLabels(
              request.identityId,
              String(plan.id),
              request.labelIds,
            );
            plan.hydrateLabels(labels);
          }
          if (occurrences.length > 0) {
            await occurrenceRepository.saveMany(occurrences);
          }

          const time = createTimeFacade({ context: resolvedTimeContext });
          const today = time.calendar.toYmd(Date.now());
          const generation = {
            occurrenceCount: occurrences.length,
            todayOccurrenceCreated: occurrences.some((occurrence) => occurrence.scheduleDate === today),
          };

          return ok({
            plan: plan.toClientDTOAt(resolvedTimeContext),
            ...generation,
          });
        },
      );
    } catch (caughtError) {
      // The concurrent-create window is closed outside the failed transaction:
      // if another worker committed the same deterministic aggregate ID first,
      // return that durable fact as an idempotent replay.
      if (request.id && timeContext) {
        try {
          const replay = await this.replayExisting(
            request.identityId,
            request.id,
            this.planRepository,
            this.occurrenceRepository,
            timeContext,
          );
          if (replay) return replay;
        } catch {
          // Preserve the original create error if the replay lookup itself is unavailable.
        }
      }

      console.error('[CreateTaskPlan] failed', {
        message: caughtError instanceof Error ? caughtError.message : String(caughtError),
        code: (caughtError as { code?: string }).code,
        meta: (caughtError as { meta?: unknown }).meta,
        stack:
          caughtError instanceof Error
            ? caughtError.stack?.split('\n').slice(0, 6).join('\n')
            : undefined,
      });
      this.logger.error('Failed to create task plan', { error: caughtError });
      return fail(mapTaskWriteErrorToResultError(caughtError, 'Failed to create task plan'));
    }
  }
}
