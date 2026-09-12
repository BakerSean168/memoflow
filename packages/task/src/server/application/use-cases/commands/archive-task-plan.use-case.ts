/**
 * Archive Task Template Service
 */

import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import type { TaskPlanClientDTO } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { UserTimeContextPort } from '@memoflow/time';

export class ArchiveTaskPlanUseCase {
  constructor(
    private readonly templateRepository: ITaskPlanRepository,
    private readonly userTimeContextPort: UserTimeContextPort,
  ) {}

  async execute(id: string, identityId: string): Promise<Result<TaskPlanClientDTO>> {
    const template = await this.templateRepository.findByIdForIdentity(identityId, id);
    if (!template) {
      return error('NOT_FOUND', `TaskPlan ${id} not found`);
    }

    const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
    template.archive();
    await this.templateRepository.save(template);

    return ok(template.toClientDTOAt(timeContext));
  }
}
