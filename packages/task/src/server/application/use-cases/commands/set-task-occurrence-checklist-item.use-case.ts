import type {
  SetTaskOccurrenceChecklistItemReq,
  TaskOccurrenceOperationRes,
} from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { error, ok } from '@memoflow/contracts/result';
import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type { TaskOccurrenceProjectionService } from '../../services/task-occurrence-projection.service';
import type { TaskWriteRepositories, TaskWriteTransactionRunner } from './task-write-support';
import type { TimeContext } from '@memoflow/time';

/** Owner command for one occurrence checklist snapshot item. */
export class SetTaskOccurrenceChecklistItemUseCase {
  constructor(
    private readonly occurrenceRepository: ITaskOccurrenceRepository,
    private readonly transactionRunner: TaskWriteTransactionRunner,
    private readonly projection: TaskOccurrenceProjectionService,
  ) {
    if (!transactionRunner) {
      throw new Error(
        'TaskWriteTransactionRunner must be explicitly provided to SetTaskOccurrenceChecklistItemUseCase',
      );
    }
  }

  async execute(
    id: string,
    identityId: string,
    request: SetTaskOccurrenceChecklistItemReq,
  ): Promise<Result<TaskOccurrenceOperationRes>> {
    const timeContext = await this.projection.getTimeContext(identityId);
    return this.transactionRunner.run((repositories) =>
      this.executeInTransaction(repositories, id, identityId, timeContext, request),
    );
  }

  private async executeInTransaction(
    repositories: TaskWriteRepositories,
    id: string,
    identityId: string,
    timeContext: TimeContext,
    request: SetTaskOccurrenceChecklistItemReq,
  ): Promise<Result<TaskOccurrenceOperationRes>> {
    const occurrence = await repositories.occurrenceRepository.findByIdForIdentity(identityId, id);
    if (!occurrence) return error('NOT_FOUND', `TaskOccurrence ${id} not found`);

    if (occurrence.version !== request.expectedVersion) {
      return error(
        'CONFLICT',
        `TaskOccurrence ${id} version conflict: expected ${request.expectedVersion}, current ${occurrence.version}`,
      );
    }

    const item = occurrence.checklistState.find(
      (candidate) => candidate.definitionId === request.definitionId,
    );
    if (!item) {
      return error(
        'VALIDATION_ERROR',
        `Checklist item ${request.definitionId} does not belong to TaskOccurrence ${id}`,
      );
    }

    if (item.completed !== request.completed) {
      if (request.completed) occurrence.completeChecklistItem(request.definitionId);
      else occurrence.uncompleteChecklistItem(request.definitionId);
      await repositories.occurrenceRepository.save(occurrence);
    }

    return ok({ occurrence: this.projection.projectWithContext(occurrence, timeContext) });
  }
}
