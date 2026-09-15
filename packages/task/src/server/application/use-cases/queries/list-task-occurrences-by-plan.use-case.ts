/**
 * List Task Instances By Template Service
 */

import type { ITaskOccurrenceRepository } from '../../../domain/repositories/i-task-occurrence-repository';
import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import type { TaskOccurrenceClientDTO } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';
import type { TaskOccurrenceProjectionService } from '../../services/task-occurrence-projection.service';

export class ListTaskOccurrencesByPlanUseCase {
  constructor(
    private readonly occurrenceRepository: ITaskOccurrenceRepository,
    private readonly planRepository: ITaskPlanRepository,
    private readonly projection: TaskOccurrenceProjectionService,
  ) {}

  async execute(
    planId: string,
    identityId: string,
  ): Promise<Result<TaskOccurrenceClientDTO[]>> {
    const plan = await this.planRepository.findByIdForIdentity(identityId, planId);
    if (!plan) {
      return ok([]);
    }

    const occurrences = await this.occurrenceRepository.findByPlanId(planId, identityId);
    return ok(await this.projection.projectMany(identityId, occurrences));
  }
}
