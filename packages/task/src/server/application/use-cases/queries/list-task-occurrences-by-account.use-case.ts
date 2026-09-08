/**
 * List Task Instances By Account Service
 */

import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type { TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';

export class ListTaskOccurrencesByAccountUseCase {
  constructor(private readonly instanceRepository: ITaskOccurrenceRepository) {}

  async execute(identityId: string): Promise<Result<TaskOccurrenceClientDTO[]>> {
    const instances = await this.instanceRepository.findByIdentityId(identityId);
    return ok(instances.map((i) => i.toClientDTO()));
  }
}
