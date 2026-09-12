/**
 * Complete Task Instance Service
 */

import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import type { CompleteTaskOccurrenceReq, TaskOccurrenceOperationRes } from '@memoflow/contracts/task';
import { TaskOccurrenceStatus } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok, error, fail } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import {
  mapTaskWriteErrorToResultError,
  type TaskWriteRepositories,
  type TaskWriteTransactionRunner,
} from './task-write-support';
import { reevaluateTaskPlanOutcome } from './task-plan-outcome-reevaluation';
import type { TimeContext } from '@memoflow/time';
import type { TaskOccurrenceProjectionService } from '../../services/task-occurrence-projection.service';

/**
 * Complete Task Instance Service
 *
 * 完成任务实例，并在发布 `task:instance-completed` 前把跨模块订阅方（Goal）
 * 所需的判定信息填齐（ADR-033 范式 A：payload 自包含）。判定逻辑本属 Task，
 * 因此从旧的 desktop handler 迁到这里，事件发布前算好。
 */
export class CompleteTaskOccurrenceUseCase {
  private readonly logger = createLogger('CompleteTaskOccurrenceUseCase');
  private readonly transactionRunner: TaskWriteTransactionRunner;

  constructor(
    private readonly instanceRepository: ITaskOccurrenceRepository,
    private readonly templateRepository: ITaskPlanRepository,
    transactionRunner: TaskWriteTransactionRunner,
    private readonly projection: TaskOccurrenceProjectionService,
  ) {
    if (!transactionRunner) {
      throw new Error('TaskWriteTransactionRunner must be explicitly provided to CompleteTaskOccurrenceUseCase');
    }
    this.transactionRunner = transactionRunner;
  }

  async execute(
    id: string,
    identityId: string,
    request?: CompleteTaskOccurrenceReq,
  ): Promise<Result<TaskOccurrenceOperationRes>> {
    try {
      const timeContext = await this.projection.getTimeContext(identityId);
      return await this.transactionRunner.run((repositories) =>
        this.executeInTransaction(repositories, id, identityId, timeContext, request),
      );
    } catch (caughtError) {
      this.logger.error('Failed to complete task instance', { error: caughtError });
      return fail(
        mapTaskWriteErrorToResultError(caughtError, 'Failed to complete task instance'),
      );
    }
  }

  private async executeInTransaction(
    repositories: TaskWriteRepositories,
    id: string,
    identityId: string,
    timeContext: TimeContext,
    request?: CompleteTaskOccurrenceReq,
  ): Promise<Result<TaskOccurrenceOperationRes>> {
    const instance = await repositories.instanceRepository.findByIdForIdentity(identityId, id);
    if (!instance) {
      return error('NOT_FOUND', `TaskOccurrence ${id} not found`);
    }

    if (instance.status === TaskOccurrenceStatus.Completed) {
      return ok({
        instance: this.projection.projectWithContext(instance, timeContext),
      });
    }

    if (!instance.canComplete()) {
      return error('VALIDATION_ERROR', 'Cannot complete this task instance');
    }

    const template = await repositories.templateRepository!.findByIdForIdentity(
      identityId,
      String(instance.templateId),
    );
    const goalContext = {
      taskTitle: template?.title ?? '',
      goalBinding: template?.goalBinding?.toDTO() ?? null,
    };

    // Mark as completed（goalContext 会被嵌入领域事件的 payload）
    instance.complete(request?.duration, request?.note, request?.rating, goalContext);
    await repositories.instanceRepository.save(instance);
    await reevaluateTaskPlanOutcome(
      repositories,
      identityId,
      String(instance.templateId),
      instance.id,
      timeContext,
    );

    return ok({
      instance: this.projection.projectWithContext(instance, timeContext),
    });
  }


}
