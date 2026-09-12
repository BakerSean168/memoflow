/**
 * Delete Task Template Use Case
 *
 * Removes the template and clears its generated instances in one write boundary.
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
    private readonly templateRepository: ITaskPlanRepository,
    private readonly instanceRepository: ITaskOccurrenceRepository,
    transactionRunner: TaskWriteTransactionRunner,
  ) {
    if (!transactionRunner) {
      throw new Error('TaskWriteTransactionRunner must be explicitly provided to DeleteTaskPlanUseCase');
    }
    this.transactionRunner = transactionRunner;
  }

  async execute(id: string, identityId: string, soft = false): Promise<Result<void>> {
    try {
      return await this.transactionRunner.run(async ({ templateRepository, instanceRepository }) => {
        const template = await templateRepository!.findByIdForIdentity(identityId, id);
        if (!template) {
          // Idempotent delete: if the template is already gone, treat it as success.
          return ok(undefined);
        }

        template.softDelete();
        await templateRepository!.save(template);
        await instanceRepository.deleteByTemplateId(id, identityId);

        if (!soft) {
          await templateRepository!.delete(identityId, id);
        }

        return ok(undefined);
      });
    } catch (caughtError) {
      this.logger.error('Failed to delete task template', { error: caughtError });
      return fail(
        mapTaskWriteErrorToResultError(caughtError, 'Failed to delete task template'),
      );
    }
  }
}
