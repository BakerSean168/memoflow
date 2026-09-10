/**
 * Unbind Task From Goal
 *
 * 解除任务模板与目标的绑定
 */

import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import type { TaskPlanClientDTO } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { UserTimeContextPort } from '@memoflow/time';

export class UnbindTaskFromGoalUseCase {
  constructor(
    private readonly templateRepository: ITaskPlanRepository,
    private readonly userTimeContextPort: UserTimeContextPort,
  ) {}

  async execute(templateId: string, identityId: string): Promise<Result<TaskPlanClientDTO>> {
    const template = await this.templateRepository.findByIdForIdentity(identityId, templateId);
    if (!template) {
      return error('NOT_FOUND', `TaskPlan ${templateId} not found`);
    }

    const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
    template.unbindFromGoal();
    await this.templateRepository.save(template);

    return ok(template.toClientDTOAt(timeContext));
  }
}
