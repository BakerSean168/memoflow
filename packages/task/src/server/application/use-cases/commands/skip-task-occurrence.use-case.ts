import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type { SkipTaskOccurrenceReq, TaskOccurrenceOperationRes } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok, error, fail } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import { mapTaskWriteErrorToResultError, type TaskWriteTransactionRunner } from './task-write-support';
import { reevaluateTaskPlanOutcome } from './task-plan-outcome-reevaluation';
import type { TaskOccurrenceProjectionService } from '../../services/task-occurrence-projection.service';

/** Skipped is an explicit waiver and participates in plan re-evaluation atomically. */
export class SkipTaskOccurrenceUseCase {
  private readonly logger = createLogger('SkipTaskOccurrenceUseCase');
  constructor(
    private readonly instanceRepository: ITaskOccurrenceRepository,
    private readonly transactionRunner: TaskWriteTransactionRunner,
    private readonly projection: TaskOccurrenceProjectionService,
  ) {
    if (!transactionRunner) throw new Error('TaskWriteTransactionRunner must be explicitly provided to SkipTaskOccurrenceUseCase');
  }

  async execute(id: string, identityId: string, request?: SkipTaskOccurrenceReq): Promise<Result<TaskOccurrenceOperationRes>> {
    try {
      const timeContext = await this.projection.getTimeContext(identityId);
      return await this.transactionRunner.run(async (repositories) => {
        const instance = await repositories.instanceRepository.findByIdForIdentity(identityId, id);
        if (!instance) return error('NOT_FOUND', `TaskOccurrence ${id} not found`);
        if (!instance.canSkip()) return error('VALIDATION_ERROR', 'Cannot skip this task instance');
        instance.skip(request?.reason);
        await repositories.instanceRepository.save(instance);
        await reevaluateTaskPlanOutcome(
      repositories,
      identityId,
      String(instance.templateId),
      instance.id,
      timeContext,
    );
        return ok({ instance: this.projection.projectWithContext(instance, timeContext) });
      });
    } catch (caughtError) {
      this.logger.error('Failed to skip task instance', { error: caughtError });
      return fail(mapTaskWriteErrorToResultError(caughtError, 'Failed to skip task instance'));
    }
  }
}
