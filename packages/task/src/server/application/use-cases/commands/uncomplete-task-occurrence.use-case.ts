import type { TaskOccurrenceOperationRes } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { error, ok } from '@memoflow/contracts/result';
import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import { type TaskWriteRepositories, type TaskWriteTransactionRunner } from './task-write-support';
import { reevaluateTaskPlanOutcome } from './task-plan-outcome-reevaluation';
import type { TimeContext } from '@memoflow/time';
import type { TaskOccurrenceProjectionService } from '../../services/task-occurrence-projection.service';

/**
 * Uncomplete Task Instance Use Case
 *
 * R2-5b：与 complete 对齐，经由 TaskWriteTransactionRunner 提交——domain event
 * （task:occurrence-uncompleted）在事务内落 TaskGoalOutbox，撤销贡献与完成贡献
 * 走同一条 durable 通道（不再只依赖 eventBus 直连）。
 */
export class UncompleteTaskOccurrenceUseCase {
  private readonly transactionRunner: TaskWriteTransactionRunner;

  constructor(
    private readonly occurrenceRepository: ITaskOccurrenceRepository,
    transactionRunner: TaskWriteTransactionRunner,
    private readonly projection: TaskOccurrenceProjectionService,
  ) {
    if (!transactionRunner) {
      throw new Error(
        'TaskWriteTransactionRunner must be explicitly provided to UncompleteTaskOccurrenceUseCase',
      );
    }
    this.transactionRunner = transactionRunner;
  }

  async execute(id: string, identityId: string): Promise<Result<TaskOccurrenceOperationRes>> {
    const timeContext = await this.projection.getTimeContext(identityId);
    return this.transactionRunner.run((repositories) =>
      this.executeInTransaction(repositories, id, identityId, timeContext),
    );
  }

  private async executeInTransaction(
    repositories: TaskWriteRepositories,
    id: string,
    identityId: string,
    timeContext: TimeContext,
  ): Promise<Result<TaskOccurrenceOperationRes>> {
    const occurrence = await repositories.occurrenceRepository.findByIdForIdentity(identityId, id);
    if (!occurrence) {
      return error('NOT_FOUND', `TaskOccurrence ${id} not found`);
    }
    if (occurrence.status !== 'Completed') {
      return error('VALIDATION_ERROR', 'Only a completed task can be uncompleted');
    }

    occurrence.uncomplete();
    await repositories.occurrenceRepository.save(occurrence);
    await reevaluateTaskPlanOutcome(
      repositories,
      identityId,
      String(occurrence.planId),
      occurrence.id,
      timeContext,
    );
    return ok({ occurrence: this.projection.projectWithContext(occurrence, timeContext) });
  }
}
