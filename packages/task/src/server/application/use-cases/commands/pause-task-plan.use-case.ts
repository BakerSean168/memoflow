/**
 * Pause Task Template Use Case
 *
 * Business flow:
 * 1. Mark the template as paused.
 * 2. Stop future instance generation from the pause timestamp forward.
 * 3. Remove incomplete future instances that should no longer be executed.
 */

import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type { TaskPlanClientDTO } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok, error, fail } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import type { UserTimeContextPort } from '@memoflow/time';
import {
  mapTaskWriteErrorToResultError,
  type TaskWriteTransactionRunner,
} from './task-write-support';

/**
 * Pause Task Template Use Case
 */
export class PauseTaskPlanUseCase {
  private readonly logger = createLogger('PauseTaskPlanUseCase');
  private readonly transactionRunner: TaskWriteTransactionRunner;

  constructor(
    private readonly templateRepository: ITaskPlanRepository,
    private readonly instanceRepository: ITaskOccurrenceRepository,
    transactionRunner: TaskWriteTransactionRunner,
    private readonly userTimeContextPort: UserTimeContextPort,
  ) {
    if (!transactionRunner) {
      throw new Error('TaskWriteTransactionRunner must be explicitly provided to PauseTaskPlanUseCase');
    }
    this.transactionRunner = transactionRunner;
  }

  async execute(
    id: string,
    identityId: string,
    _reason?: string,
  ): Promise<Result<{ template: TaskPlanClientDTO; instancesDeleted: number }>> {
    try {
      const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
      return await this.transactionRunner.run(async ({ templateRepository, instanceRepository }) => {
        const template = await templateRepository!.findByIdForIdentity(identityId, id);
        if (!template) {
          return error('NOT_FOUND', `TaskPlan ${id} not found`);
        }

        const effectiveFrom = Date.now();

        template.pause();
        await templateRepository!.save(template);

        const instancesDeleted = await instanceRepository.deleteIncompleteInstancesFrom(
          id,
          identityId,
          effectiveFrom,
        );

        return ok({
          template: template.toClientDTOAt(timeContext, false, effectiveFrom),
          instancesDeleted,
        });
      });
    } catch (caughtError) {
      this.logger.error('Failed to pause task template', { error: caughtError });
      return fail(
        mapTaskWriteErrorToResultError(caughtError, 'Failed to pause task template'),
      );
    }
  }
}
