/**
 * Create Task Template Service
 *
 * Creates a task template (recurring task) and automatically
 * generates initial instances upon creation.
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
    private readonly templateRepository: ITaskPlanRepository,
    private readonly instanceRepository: ITaskOccurrenceRepository,
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
    templateRepository: ITaskPlanRepository,
    instanceRepository: ITaskOccurrenceRepository,
    timeContext: TimeContext,
  ): Promise<Result<CreateTaskPlanRes> | null> {
    const existing = await templateRepository.findByIdForIdentity(identityId, id);
    if (!existing) return null;

    const instances = await instanceRepository.findByTemplateId(id, identityId);
    const time = createTimeFacade({ context: timeContext });
    const today = time.calendar.toYmd(Date.now());
    return ok({
      template: existing.toClientDTOAt(timeContext),
      instanceCount: instances.length,
      todayInstanceCreated: instances.some(
        (instance) =>
          Number.isFinite(instance.instanceDate) &&
          time.calendar.toYmd(instance.instanceDate) === today,
      ),
    });
  }

  async execute(request: CreateTaskPlanInput): Promise<Result<CreateTaskPlanRes>> {
    let timeContext: TimeContext | null = null;
    try {
      const resolvedTimeContext = await this.userTimeContextPort.getUserTimeContext(request.identityId);
      timeContext = resolvedTimeContext;
      return await this.transactionRunner.run(
        async ({ templateRepository, instanceRepository }) => {
          if (request.id) {
            const replay = await this.replayExisting(
              request.identityId,
              request.id,
              templateRepository!,
              instanceRepository,
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

          const template = TaskPlan.create({
            id: request.id ? TaskPlanId.of(request.id) : undefined,
            identityId: request.identityId,
            title: request.name,
            description: request.description ?? undefined,
            schedule,
            reminderConfig,
            importance: request.importance,
            completionPolicy: request.completionPolicy,
            goalBinding: request.goalBinding
              ? {
                  goalId: request.goalBinding.goalId,
                  keyResultId: request.goalBinding.keyResultId,
                  contribution: request.goalBinding.contribution ?? null,
                }
              : null,
          });

          // R2-5a 乐观锁：模板只保存一次。顺序：先 generate（内存更新
          // lastGeneratedDate），再 save 模板（持久化模板供实例 FK），
          // 最后 saveMany 实例。
          const instances =
            template.status === TaskPlanStatus.Active
              ? this.generationService.generateInstances(template, resolvedTimeContext)
              : [];

          await templateRepository!.save(template);
          if (request.labelIds !== undefined) {
            const labels = await templateRepository!.replaceLabels(
              request.identityId,
              String(template.id),
              request.labelIds,
            );
            template.hydrateLabels(labels);
          }
          if (instances.length > 0) {
            await instanceRepository.saveMany(instances);
          }

          const time = createTimeFacade({ context: resolvedTimeContext });
          const today = time.calendar.toYmd(Date.now());
          const generation = {
            instanceCount: instances.length,
            todayInstanceCreated: instances.some(
              (instance) =>
                Number.isFinite(instance.instanceDate) &&
                time.calendar.toYmd(instance.instanceDate) === today,
            ),
          };

          return ok({
            template: template.toClientDTOAt(resolvedTimeContext),
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
            this.templateRepository,
            this.instanceRepository,
            timeContext,
          );
          if (replay) return replay;
        } catch {
          // Preserve the original create error if the replay lookup itself is unavailable.
        }
      }

      // eslint-disable-next-line no-console
      console.error('[CreateTaskPlan] failed', {
        message: caughtError instanceof Error ? caughtError.message : String(caughtError),
        code: (caughtError as { code?: string }).code,
        meta: (caughtError as { meta?: unknown }).meta,
        stack:
          caughtError instanceof Error
            ? caughtError.stack?.split('\n').slice(0, 6).join('\n')
            : undefined,
      });
      this.logger.error('Failed to create task template', { error: caughtError });
      return fail(mapTaskWriteErrorToResultError(caughtError, 'Failed to create task template'));
    }
  }
}
