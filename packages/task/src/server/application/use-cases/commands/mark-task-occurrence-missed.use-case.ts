import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type {
  MarkTaskOccurrenceMissedReq,
  TaskOccurrenceOperationRes,
} from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok, error, fail } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import {
  mapTaskWriteErrorToResultError,
  type TaskWriteTransactionRunner,
} from './task-write-support';
import { reevaluateTaskPlanOutcome } from './task-plan-outcome-reevaluation';
import type { TaskOccurrenceProjectionService } from '../../services/task-occurrence-projection.service';

/** Explicit Missed fact; strict policy may atomically close the plan as Failed. */
export class MarkTaskOccurrenceMissedUseCase {
  private readonly logger = createLogger('MarkTaskOccurrenceMissedUseCase');
  constructor(
    private readonly occurrenceRepository: ITaskOccurrenceRepository,
    private readonly transactionRunner: TaskWriteTransactionRunner,
    private readonly projection: TaskOccurrenceProjectionService,
  ) {
    if (!transactionRunner)
      throw new Error(
        'TaskWriteTransactionRunner must be explicitly provided to MarkTaskOccurrenceMissedUseCase',
      );
  }

  async execute(
    id: string,
    identityId: string,
    request?: MarkTaskOccurrenceMissedReq,
  ): Promise<Result<TaskOccurrenceOperationRes>> {
    try {
      const timeContext = await this.projection.getTimeContext(identityId);
      return await this.transactionRunner.run(async (repositories) => {
        const occurrence = await repositories.occurrenceRepository.findByIdForIdentity(identityId, id);
        if (!occurrence) return error('NOT_FOUND', `TaskOccurrence ${id} not found`);
        if (!occurrence.canMarkMissed())
          return error('VALIDATION_ERROR', 'Cannot mark this task occurrence missed');
        occurrence.markMissed(request?.reason);
        await repositories.occurrenceRepository.save(occurrence);
        await reevaluateTaskPlanOutcome(
          repositories,
          identityId,
          String(occurrence.planId),
          occurrence.id,
          timeContext,
        );
        return ok({ occurrence: this.projection.projectWithContext(occurrence, timeContext) });
      });
    } catch (caughtError) {
      this.logger.error('Failed to mark task occurrence missed', { error: caughtError });
      return fail(
        mapTaskWriteErrorToResultError(caughtError, 'Failed to mark task occurrence missed'),
      );
    }
  }
}
