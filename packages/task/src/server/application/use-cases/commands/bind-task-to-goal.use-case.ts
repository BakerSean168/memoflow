/**
 * Bind Task To Goal
 *
 * 将任务模板绑定至目标
 */

import { validateTaskGoalProgress } from './task-goal-progress-validation';
import type { TaskGoalMeasurementReadPort } from '../../ports';
import { TaskGoalBinding } from '../../../domain/value-objects/task-goal-binding';
import type { ITaskPlanRepository } from '../../../domain/repositories/i-task-plan-repository';
import type { TaskPlanClientDTO, BindToGoalReq } from '@memoflow/contracts/task';
import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import type { UserTimeContextPort } from '@memoflow/time';

export class BindTaskToGoalUseCase {
  constructor(
    private readonly planRepository: ITaskPlanRepository,
    private readonly userTimeContextPort: UserTimeContextPort,
    private readonly goalReadPort?: TaskGoalMeasurementReadPort,
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

    const invalidProgress = await validateTaskGoalProgress(identityId, request, this.goalReadPort);
    if (invalidProgress) return invalidProgress;
    const binding = TaskGoalBinding.create(request);
    const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
    plan.bindToGoal(request.goalId, request.keyResultId, binding.progressRule);
    await this.planRepository.save(plan);

    return ok(plan.toClientDTOAt(timeContext));
  }
}
