/**
 * List Task Instances By Status Service
 */

import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type { TaskOccurrenceClientDTO, TaskOccurrenceStatus } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';

export class ListTaskOccurrencesByStatusUseCase {
  constructor(private readonly instanceRepository: ITaskOccurrenceRepository) {}

  async execute(identityId: string, status: TaskOccurrenceStatus): Promise<Result<TaskOccurrenceClientDTO[]>> {
    const instances = await this.instanceRepository.findByStatus(identityId, status);
    return ok(instances.map((i) => i.toClientDTO()));
  }
}
