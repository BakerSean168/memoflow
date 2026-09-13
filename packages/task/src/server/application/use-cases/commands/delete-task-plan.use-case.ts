/**
 * Delete Task Template Use Case
 *
 * Removes the plan and clears its generated occurrences in one write boundary.
 */

import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type { Result } from '@memoflow/contracts/result';
import { fail, ok } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import {
  mapTaskWriteErrorToResultError,
  type TaskWriteTransactionRunner,
} from './task-write-support';

/**
 * Delete Task Template Use Case
 */
export class DeleteTaskPlanUseCase {
  private readonly logger = createLogger('DeleteTaskPlanUseCase');
  private readonly transactionRunner: TaskWriteTransactionRunner;

  constructor(
    private readonly planRepository: ITaskPlanRepository,
    private readonly occurrenceRepository: ITaskOccurrenceRepository,
    transactionRunner: TaskWriteTransactionRunner,
  ) {
    if (!transactionRunner) {
      throw new Error('TaskWriteTransactionRunner must be explicitly provided to DeleteTaskPlanUseCase');
    }
    this.transactionRunner = transactionRunner;
  }

  async execute(id: string, identityId: string, soft = false): Promise<Result<void>> {
    try {
      return await this.transactionRunner.run(async ({ planRepository, occurrenceRepository }) => {
        const plan = await planRepository!.findByIdForIdentity(identityId, id);
        if (!plan) {
          // Idempotent delete: if the plan is already gone, treat it as success.
          return ok(undefined);
        }

        plan.softDelete();
        await planRepository!.save(plan);
        await occurrenceRepository.deleteByPlanId(id, identityId);

        if (!soft) {
          await planRepository!.delete(identityId, id);
        }

        return ok(undefined);
      });
    } catch (caughtError) {
      this.logger.error('Failed to delete task plan', { error: caughtError });
      return fail(
        mapTaskWriteErrorToResultError(caughtError, 'Failed to delete task plan'),
      );
    }
  }
}
