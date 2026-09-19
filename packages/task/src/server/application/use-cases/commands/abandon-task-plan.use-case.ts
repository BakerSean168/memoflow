import type { AbandonTaskPlanReq, TaskPlanClientDTO } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { error, fail, ok } from '@memoflow/contracts/result';
import { createLogger } from '@memoflow/utils/logger';
import type { UserTimeContextPort } from '@memoflow/time';
import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import { mapTaskWriteErrorToResultError, type TaskWriteTransactionRunner } from './task-write-support';

/** Explicit user abandonment. Delete is reserved for mistaken creation. */
export class AbandonTaskPlanUseCase {
  private readonly logger = createLogger('AbandonTaskPlanUseCase');
  constructor(
    private readonly planRepository: ITaskPlanRepository,
    private readonly transactionRunner: TaskWriteTransactionRunner,
    private readonly userTimeContextPort: UserTimeContextPort,
  ) {
    if (!transactionRunner) throw new Error('TaskWriteTransactionRunner must be explicitly provided to AbandonTaskPlanUseCase');
  }

  async execute(id: string, identityId: string, request?: AbandonTaskPlanReq): Promise<Result<TaskPlanClientDTO>> {
    try {
      const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
      return await this.transactionRunner.run(async ({ planRepository }) => {
        const plan = await planRepository!.findByIdForIdentity(identityId, id);
        if (!plan) return error('NOT_FOUND', `TaskPlan ${id} not found`);
        plan.abandon(request?.reason);
        await planRepository!.save(plan);
        return ok(plan.toClientDTOAt(timeContext));
      });
    } catch (caughtError) {
      this.logger.error('Failed to abandon task plan', { error: caughtError });
      return fail(mapTaskWriteErrorToResultError(caughtError, 'Failed to abandon task plan'));
    }
  }
}
