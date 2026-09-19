/**
 * Activate Goal Use Case
 *
 * 激活目标的应用服务
 * 遵循 governance 模块 Result<T> 规范
 */

import { GoalPolicy, GoalVersionConflictError, type IGoalRepository } from '../../../domain';
import type { GoalMutationReceipt } from '@memoflow/contracts/goal';
import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import { createGoalMutationReceipt } from './goal-mutation-receipt';

/**
 * Activate Goal Use Case
 */
export class ActivateGoalUseCase {
  constructor(
    private readonly goalRepository: IGoalRepository,
    private readonly goalPolicy: GoalPolicy,
  ) {}

  async execute(
    id: string,
    identityId: string,
    expectedVersion: number,
  ): Promise<Result<GoalMutationReceipt>> {
    const goal = await this.goalRepository.findByIdForIdentity(identityId, id, {
      includeChildren: true,
    });
    if (!goal) {
      return error('NOT_FOUND', `Goal not found: ${id}`);
    }
    if (expectedVersion !== goal.version) {
      return error('CONFLICT', 'Goal has been modified by another client');
    }

    if (goal.archivedAt || goal.deletedAt) {
      return error('INVALID_STATE', 'Archived or deleted goals cannot be reactivated');
    }

    this.goalPolicy.ensureGoalCanBeActivated(goal);
    if (goal.status === 'InProgress') return ok(createGoalMutationReceipt(goal));

    goal.activate();
    goal.advanceVersion();
    try {
      await this.goalRepository.saveRootWithExpectedVersion(goal, expectedVersion);
    } catch (cause) {
      if (cause instanceof GoalVersionConflictError) return error('CONFLICT', cause.message);
      throw cause;
    }

    return ok(createGoalMutationReceipt(goal));
  }
}
