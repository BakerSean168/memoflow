/** Goal-owned Home progress read model. */
import type { GoalHomeProgressSummary } from '@memoflow/contracts/goal';
import type { Result } from '@memoflow/contracts/result';
import { ok } from '@memoflow/contracts/result';
import type { IGoalRepository } from '../../../domain';

const HOME_GOAL_LIMIT = 5;

function normalizePercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export class GetGoalHomeSummaryUseCase {
  constructor(private readonly goalRepository: IGoalRepository) {}

  async execute(identityId: string): Promise<Result<GoalHomeProgressSummary>> {
    const activeGoals = await this.goalRepository.findByIdentityId(identityId, {
      includeChildren: true,
      systemView: 'active',
    });

    const ordered = activeGoals
      .slice()
      .sort((left, right) => Number(right.updatedAt) - Number(left.updatedAt));

    return ok({
      activeCount: activeGoals.length,
      goals: ordered.slice(0, HOME_GOAL_LIMIT).map((goal) => ({
        id: goal.id,
        name: goal.name,
        progress: normalizePercentage(goal.progress),
        status: goal.status,
        target: goal.target,
        keyResultCount: goal.keyResults.length,
      })),
    });
  }
}
