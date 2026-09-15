/**
 * Pause Task Template Use Case
 *
 * Business flow:
 * 1. Mark the plan as paused.
 * 2. Stop future occurrence generation from the pause timestamp forward.
 * 3. Remove incomplete future occurrences that should no longer be executed.
 */

import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type { TaskPlanClientDTO } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok, error, fail } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import { createTimeFacade, type UserTimeContextPort } from '@memoflow/time';
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
    private readonly planRepository: ITaskPlanRepository,
    private readonly occurrenceRepository: ITaskOccurrenceRepository,
    transactionRunner: TaskWriteTransactionRunner,
    private readonly userTimeContextPort: UserTimeContextPort,
  ) {
    if (!transactionRunner) {
      throw new Error(
        'TaskWriteTransactionRunner must be explicitly provided to PauseTaskPlanUseCase',
      );
    }
    this.transactionRunner = transactionRunner;
  }

  async execute(
    id: string,
    identityId: string,
    _reason?: string,
  ): Promise<Result<{ plan: TaskPlanClientDTO; instancesDeleted: number }>> {
    try {
      const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
      return await this.transactionRunner.run(
        async ({ planRepository, occurrenceRepository }) => {
          const plan = await planRepository!.findByIdForIdentity(identityId, id);
          if (!plan) {
            return error('NOT_FOUND', `TaskPlan ${id} not found`);
          }

          const effectiveFrom = Date.now();
          const effectiveFromDate = createTimeFacade({ context: timeContext }).calendar.toYmd(
            effectiveFrom,
          );

          plan.pause();
          await planRepository!.save(plan);

          const instancesDeleted = await occurrenceRepository.deleteIncompleteOccurrencesFrom(
            id,
            identityId,
            effectiveFromDate,
          );

          return ok({
            plan: plan.toClientDTOAt(timeContext, false, effectiveFrom),
            instancesDeleted,
          });
        },
      );
    } catch (caughtError) {
      this.logger.error('Failed to pause task plan', { error: caughtError });
      return fail(mapTaskWriteErrorToResultError(caughtError, 'Failed to pause task plan'));
    }
  }
}
