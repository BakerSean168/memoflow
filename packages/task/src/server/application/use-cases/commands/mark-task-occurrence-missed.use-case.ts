import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type { MarkTaskOccurrenceMissedReq, TaskOccurrenceOperationRes } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok, error, fail } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import { mapTaskWriteErrorToResultError, type TaskWriteTransactionRunner } from './task-write-support';
import { reevaluateTaskPlanOutcome } from './task-plan-outcome-reevaluation';

/** Explicit Missed fact; strict policy may atomically close the plan as Failed. */
export class MarkTaskOccurrenceMissedUseCase {
  private readonly logger = createLogger('MarkTaskOccurrenceMissedUseCase');
  constructor(
    private readonly instanceRepository: ITaskOccurrenceRepository,
    private readonly transactionRunner: TaskWriteTransactionRunner,
  ) {
    if (!transactionRunner) throw new Error('TaskWriteTransactionRunner must be explicitly provided to MarkTaskOccurrenceMissedUseCase');
  }

  async execute(id: string, identityId: string, request?: MarkTaskOccurrenceMissedReq): Promise<Result<TaskOccurrenceOperationRes>> {
    try {
      return await this.transactionRunner.run(async (repositories) => {
        const instance = await repositories.instanceRepository.findByIdForIdentity(identityId, id);
        if (!instance) return error('NOT_FOUND', `TaskOccurrence ${id} not found`);
        if (!instance.canMarkMissed()) return error('VALIDATION_ERROR', 'Cannot mark this task instance missed');
        instance.markMissed(request?.reason);
        await repositories.instanceRepository.save(instance);
        await reevaluateTaskPlanOutcome(repositories, identityId, String(instance.templateId), instance.id);
        return ok({ instance: instance.toClientDTO() });
      });
    } catch (caughtError) {
      this.logger.error('Failed to mark task instance missed', { error: caughtError });
      return fail(mapTaskWriteErrorToResultError(caughtError, 'Failed to mark task instance missed'));
    }
  }
}
