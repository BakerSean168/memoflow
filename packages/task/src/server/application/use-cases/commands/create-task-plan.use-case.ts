/**
 * Create Task Template Service
 *
 * Creates a task template (recurring task) and automatically
 * generates initial instances upon creation.
 */

import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import { TaskPlan } from '../../../domain/aggregates/task-plan';
import { TaskTimeConfig, RecurrenceRule, TaskReminderConfig } from '../../../domain/value-objects';
import { TaskPlanId } from '../../../domain/value-objects/task-plan-id';
import { TaskOccurrenceGenerationService } from '../../../domain/services/index';
import type { CreateTaskPlanInput, CreateTaskPlanRes } from '@memoflow/contracts/task';
import { TaskPlanStatus } from '@memoflow/contracts/task';
import { createLogger } from '@memoflow/utils/logger';
import type { Result } from '@memoflow/contracts/result';
import { error, fail, ok } from '@memoflow/contracts/result';
import {
  mapTaskWriteErrorToResultError,
  type TaskWriteTransactionRunner,
} from './task-write-support';
import { isFiniteTaskPlan } from '../../../domain/aggregates/task-plan-goal.policy';
import { TaskGoalBindingTrigger } from '@memoflow/contracts/task';

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
  ): Promise<Result<CreateTaskPlanRes> | null> {
    const existing = await templateRepository.findByIdForIdentity(identityId, id);
    if (!existing) return null;

    const instances = await instanceRepository.findByTemplateId(id, identityId);
    const now = new Date();
    return ok({
      template: existing.toClientDTO(),
      instanceCount: instances.length,
      todayInstanceCreated: instances.some((instance) => {
        if (!Number.isFinite(instance.instanceDate)) return false;
        const date = new Date(instance.instanceDate);
        return (
          date.getFullYear() === now.getFullYear() &&
          date.getMonth() === now.getMonth() &&
          date.getDate() === now.getDate()
        );
      }),
    });
  }

  async execute(request: CreateTaskPlanInput): Promise<Result<CreateTaskPlanRes>> {
    try {
      return await this.transactionRunner.run(
        async ({ templateRepository, instanceRepository }) => {
          if (request.id) {
            const replay = await this.replayExisting(
              request.identityId,
              request.id,
              templateRepository!,
              instanceRepository,
            );
            if (replay) return replay;
          }

          const timeConfig = TaskTimeConfig.fromDTO(request.timeConfig);
          const recurrenceRule = request.recurrenceRule
            ? RecurrenceRule.fromDTO(request.recurrenceRule)
            : undefined;
          const reminderConfig = request.reminderConfig
            ? TaskReminderConfig.fromDTO(request.reminderConfig)
            : undefined;

          if (
            request.goalBinding?.contribution?.trigger === TaskGoalBindingTrigger.PlanCompletion &&
            !isFiniteTaskPlan(request.taskType, recurrenceRule)
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
            taskType: request.taskType,
            timeConfig,
            recurrenceRule,
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
              ? this.generationService.generateInstances(template)
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

          const generation = {
            instanceCount: instances.length,
            todayInstanceCreated: instances.some((instance) => {
              if (!Number.isFinite(instance.instanceDate)) return false;
              const d = new Date(instance.instanceDate);
              const now = new Date();
              return (
                d.getFullYear() === now.getFullYear() &&
                d.getMonth() === now.getMonth() &&
                d.getDate() === now.getDate()
              );
            }),
          };

          return ok({
            template: template.toClientDTO(),
            ...generation,
          });
        },
      );
    } catch (caughtError) {
      // The concurrent-create window is closed outside the failed transaction:
      // if another worker committed the same deterministic aggregate ID first,
      // return that durable fact as an idempotent replay.
      if (request.id) {
        try {
          const replay = await this.replayExisting(
            request.identityId,
            request.id,
            this.templateRepository,
            this.instanceRepository,
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
