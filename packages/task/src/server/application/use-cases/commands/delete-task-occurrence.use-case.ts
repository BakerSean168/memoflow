/**
 * Delete Task Instance Service
 */

import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type { TaskEventMap } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';
import { createTypedEventPublisher, eventBus } from '@memoflow/utils/domain';

const taskEvents = createTypedEventPublisher<Pick<TaskEventMap, 'task:instance-deleted'>>(eventBus);

export class DeleteTaskOccurrenceUseCase {
  constructor(private readonly instanceRepository: ITaskOccurrenceRepository) {}

  async execute(id: string, identityId: string): Promise<Result<void>> {
    const instance = await this.instanceRepository.findByIdForIdentity(identityId, id);

    // Delete remains idempotent: callers do not need to care whether the
    // instance still exists when issuing the command.
    if (instance) {
      await this.instanceRepository.delete(identityId, id);
      taskEvents.send('task:instance-deleted', {
        identityId: instance.identityId,
        taskOccurrenceId: instance.id,
        taskPlanId: instance.templateId,
        deletedAt: Date.now(),
      });
    }

    return ok(undefined);
  }
}
