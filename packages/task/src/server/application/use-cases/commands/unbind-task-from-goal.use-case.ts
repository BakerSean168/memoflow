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
    private readonly planRepository: ITaskPlanRepository,
    private readonly userTimeContextPort: UserTimeContextPort,
  ) {}

  async execute(planId: string, identityId: string): Promise<Result<TaskPlanClientDTO>> {
    const plan = await this.planRepository.findByIdForIdentity(identityId, planId);
    if (!plan) {
      return error('NOT_FOUND', `TaskPlan ${planId} not found`);
    }

    const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
    plan.unbindFromGoal();
    await this.planRepository.save(plan);

    return ok(plan.toClientDTOAt(timeContext));
  }
}
