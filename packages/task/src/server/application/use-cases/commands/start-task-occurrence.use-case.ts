/**
 * Start Task Instance Service
 */

import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type { TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';

export class StartTaskOccurrenceUseCase {
  constructor(private readonly instanceRepository: ITaskOccurrenceRepository) {}

  async execute(id: string, identityId: string): Promise<Result<TaskOccurrenceClientDTO>> {
    const instance = await this.instanceRepository.findByIdForIdentity(identityId, id);
    if (!instance) {
      return error('NOT_FOUND', `TaskOccurrence ${id} not found`);
    }

    if (!instance.canStart()) {
      return error('VALIDATION_ERROR', 'Cannot start this task instance');
    }

    instance.start();
    await this.instanceRepository.save(instance);

    return ok(instance.toClientDTO());
  }
}
