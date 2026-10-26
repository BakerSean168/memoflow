/**
 * Delete Goal Review Use Case
 *
 * 删除目标复盘记录
 */

import { GoalPolicy, GoalVersionConflictError, type IGoalRepository } from '../../../domain';
import type { GoalMutationReceipt } from '@memoflow/goal-contracts';
import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';
import { createGoalMutationReceipt } from './goal-mutation-receipt';

export class DeleteGoalReviewUseCase {
  constructor(
    private readonly goalRepository: IGoalRepository,
    private readonly goalPolicy: GoalPolicy,
  ) {}

  async execute(
    goalId: string,
    identityId: string,
    reviewId: string,
    expectedVersion: number,
  ): Promise<Result<GoalMutationReceipt>> {
    const goal = await this.goalRepository.findByIdForIdentity(identityId, goalId, {
      includeChildren: true,
    });
    if (!goal) {
      return error('NOT_FOUND', `Goal not found: ${goalId}`);
    }
    if (expectedVersion !== goal.version) {
      return error('CONFLICT', 'Goal has been modified by another client');
    }

    this.goalPolicy.ensureGoalCanBeModified(goal);

    const removed = goal.removeReview(reviewId);
    if (!removed) {
      return error('NOT_FOUND', `Review not found: ${reviewId}`);
    }

    goal.advanceVersion();
    try {
      await this.goalRepository.saveRootWithExpectedVersion(goal, expectedVersion);
    } catch (cause) {
      if (cause instanceof GoalVersionConflictError) return error('CONFLICT', cause.message);
      throw cause;
    }
    return ok(createGoalMutationReceipt(goal, { reviewIds: [removed.id] }));
  }
}
