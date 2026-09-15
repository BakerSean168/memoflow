/**
 * Delete Task Instance Service
 */

import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type { TaskEventMap } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';
import { createTypedEventPublisher, eventBus } from '@memoflow/utils/domain';

const taskEvents = createTypedEventPublisher<Pick<TaskEventMap, 'task:occurrence-deleted'>>(eventBus);

export class DeleteTaskOccurrenceUseCase {
  constructor(private readonly occurrenceRepository: ITaskOccurrenceRepository) {}

  async execute(id: string, identityId: string): Promise<Result<void>> {
    const occurrence = await this.occurrenceRepository.findByIdForIdentity(identityId, id);

    // Delete remains idempotent: callers do not need to care whether the
    // occurrence still exists when issuing the command.
    if (occurrence) {
      await this.occurrenceRepository.delete(identityId, id);
      taskEvents.send('task:occurrence-deleted', {
        identityId: occurrence.identityId,
        taskOccurrenceId: occurrence.id,
        taskPlanId: occurrence.planId,
        deletedAt: Date.now(),
      });
    }

    return ok(undefined);
  }
}
