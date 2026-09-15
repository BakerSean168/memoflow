/**
 * List Task Instances By Account Service
 */

import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type { TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';
import type { TaskOccurrenceProjectionService } from '../../services/task-occurrence-projection.service';

export class ListTaskOccurrencesByAccountUseCase {
  constructor(
    private readonly occurrenceRepository: ITaskOccurrenceRepository,
    private readonly projection: TaskOccurrenceProjectionService,
  ) {}

  async execute(identityId: string): Promise<Result<TaskOccurrenceClientDTO[]>> {
    const occurrences = await this.occurrenceRepository.findByIdentityId(identityId);
    return ok(await this.projection.projectMany(identityId, occurrences));
  }
}
