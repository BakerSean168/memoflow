/**
 * Get Task Instance Service
 */

import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type { TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';
import type { TaskOccurrenceProjectionService } from '../../services/task-occurrence-projection.service';

export class GetTaskOccurrenceUseCase {
  constructor(
    private readonly occurrenceRepository: ITaskOccurrenceRepository,
    private readonly projection: TaskOccurrenceProjectionService,
  ) {}

  async execute(
    id: string,
    identityId: string,
  ): Promise<Result<TaskOccurrenceClientDTO | null>> {
    const occurrence = await this.occurrenceRepository.findByIdForIdentity(identityId, id);
    return ok(occurrence ? await this.projection.project(identityId, occurrence) : null);
  }
}
