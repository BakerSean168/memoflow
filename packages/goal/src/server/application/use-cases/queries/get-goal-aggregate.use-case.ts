/**
 * Get Goal Aggregate Use Case
 *
 * Materializes the full aggregate view: goal + keyResults + records + reviews + statistics.
 * Replaces the inline workflow previously in GoalController.getAggregate().
 */

import type { IGoalRecordRepository, IGoalRepository } from '../../../domain';
import type { GetGoalAggregateRes } from '@memoflow/goal-contracts';
import type { Result } from '@memoflow/contracts/result';
import { ok, error } from '@memoflow/contracts/result';

export class GetGoalAggregateUseCase {
  constructor(
    private readonly goalRepository: IGoalRepository,
    private readonly goalRecordRepository: IGoalRecordRepository,
  ) {}

  async execute(goalId: string, identityId: string): Promise<Result<GetGoalAggregateRes>> {
    const goal = await this.goalRepository.findByIdForIdentity(identityId, goalId, {
      includeChildren: true,
    });
    if (!goal) {
      return error('NOT_FOUND', `Goal not found: ${goalId}`);
    }

    const goalDTO = goal.toClientDTO(true);
    const records = await this.goalRecordRepository.findByGoalId(identityId, goalId, {
      orderBy: 'desc',
    });
    const keyResults = goal.keyResults.map((keyResult) => keyResult.toClientDTO());
    const reviews = goal.goalReviews.map((review) => review.toClientDTO());
    const recordDTOs = records.map((r) => r.toClientDTO(goalId));
    const completedKeyResults = goal.keyResults.filter((keyResult) =>
      keyResult.isCompleted(),
    ).length;
    const overallProgress = goal.calculateProgress();

    return ok({
      goal: goalDTO,
      keyResults,
      records: recordDTOs,
      reviews,
      statistics: {
        totalKeyResults: keyResults.length,
        completedKeyResults,
        totalRecords: recordDTOs.length,
        totalReviews: reviews.length,
        overallProgress,
      },
    });
  }
}
