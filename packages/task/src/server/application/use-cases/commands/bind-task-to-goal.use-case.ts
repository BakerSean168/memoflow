/**
 * Bind Task To Goal
 *
 * 将任务模板绑定至目标
 */

import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import type { TaskPlanClientDTO, BindToGoalReq } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { UserTimeContextPort } from '@memoflow/time';

export class BindTaskToGoalUseCase {
  constructor(
    private readonly templateRepository: ITaskPlanRepository,
    private readonly userTimeContextPort: UserTimeContextPort,
  ) {}

  async execute(
    templateId: string,
    identityId: string,
    request: BindToGoalReq,
  ): Promise<Result<TaskPlanClientDTO>> {
    const template = await this.templateRepository.findByIdForIdentity(identityId, templateId);
    if (!template) {
      return error('NOT_FOUND', `TaskPlan ${templateId} not found`);
    }

    const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
    template.bindToGoal(request.goalId, request.keyResultId, request.contribution ?? null);
    await this.templateRepository.save(template);

    return ok(template.toClientDTOAt(timeContext));
  }
}
