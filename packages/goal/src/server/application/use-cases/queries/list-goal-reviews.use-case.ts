/**
 * List Goal Reviews Use Case (Query)
 *
 * 查询目标的复盘列表
 */

import type { IGoalRepository } from '../../../domain';
import type { GoalReviewClientDTO } from '@memoflow/contracts/goal';
import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';

export interface ListGoalReviewsResult {
  data: GoalReviewClientDTO[];
  total: number;
}

export class ListGoalReviewsUseCase {
  constructor(private readonly goalRepository: IGoalRepository) {}

  async execute(goalId: string, identityId: string): Promise<Result<ListGoalReviewsResult>> {
    const goal = await this.goalRepository.findByIdForIdentity(identityId, goalId, {
      includeChildren: true,
    });
    if (!goal) {
      return error('NOT_FOUND', `Goal not found: ${goalId}`);
    }

    const reviews = goal.goalReviews.map((r) => r.toClientDTO());
    return ok({
      data: reviews,
      total: reviews.length,
    });
  }
}
