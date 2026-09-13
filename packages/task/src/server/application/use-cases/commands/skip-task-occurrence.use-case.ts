import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type { SkipTaskOccurrenceReq, TaskOccurrenceOperationRes } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok, error, fail } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import {
  mapTaskWriteErrorToResultError,
  type TaskWriteTransactionRunner,
} from './task-write-support';
import { reevaluateTaskPlanOutcome } from './task-plan-outcome-reevaluation';
import type { TaskOccurrenceProjectionService } from '../../services/task-occurrence-projection.service';

/** Skipped is an explicit waiver and participates in plan re-evaluation atomically. */
export class SkipTaskOccurrenceUseCase {
  private readonly logger = createLogger('SkipTaskOccurrenceUseCase');
  constructor(
    private readonly occurrenceRepository: ITaskOccurrenceRepository,
    private readonly transactionRunner: TaskWriteTransactionRunner,
    private readonly projection: TaskOccurrenceProjectionService,
  ) {
    if (!transactionRunner)
      throw new Error(
        'TaskWriteTransactionRunner must be explicitly provided to SkipTaskOccurrenceUseCase',
      );
  }

  async execute(
    id: string,
    identityId: string,
    request?: SkipTaskOccurrenceReq,
  ): Promise<Result<TaskOccurrenceOperationRes>> {
    try {
      const timeContext = await this.projection.getTimeContext(identityId);
      return await this.transactionRunner.run(async (repositories) => {
        const occurrence = await repositories.occurrenceRepository.findByIdForIdentity(identityId, id);
        if (!occurrence) return error('NOT_FOUND', `TaskOccurrence ${id} not found`);
        if (!occurrence.canSkip()) return error('VALIDATION_ERROR', 'Cannot skip this task occurrence');
        occurrence.skip(request?.reason);
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
      this.logger.error('Failed to skip task occurrence', { error: caughtError });
      return fail(mapTaskWriteErrorToResultError(caughtError, 'Failed to skip task occurrence'));
    }
  }
}
