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
    private readonly planRepository: ITaskPlanRepository,
    private readonly userTimeContextPort: UserTimeContextPort,
  ) {}

  async execute(
    planId: string,
    identityId: string,
    request: BindToGoalReq,
  ): Promise<Result<TaskPlanClientDTO>> {
    const plan = await this.planRepository.findByIdForIdentity(identityId, planId);
    if (!plan) {
      return error('NOT_FOUND', `TaskPlan ${planId} not found`);
    }

    const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
    plan.bindToGoal(request.goalId, request.keyResultId, request.contribution ?? null);
    await this.planRepository.save(plan);

    return ok(plan.toClientDTOAt(timeContext));
  }
}
