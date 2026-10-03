import { ReviewWindowResolver } from '../../services/review-window-resolver';
import type { GoalReviewSystemContext, GoalReviewWindowInput } from '@memoflow/contracts/goal';
import type { Result } from '@memoflow/contracts/result';
import { error, ok } from '@memoflow/contracts/result';
import type { IGoalRepository } from '../../../domain';
import { GoalReviewContextBuilder } from '../../services/goal-review-context-builder';
import type { UserTimeContextPort } from '@memoflow/time';

export class GetGoalReviewContextUseCase {
  constructor(
    private readonly goalRepository: IGoalRepository,
    private readonly contextBuilder: GoalReviewContextBuilder,
    private readonly userTimeContextPort: UserTimeContextPort,
    private readonly now: () => number = () => Date.now(),
    private readonly windowResolver: ReviewWindowResolver = new ReviewWindowResolver(),
  ) {}

  async execute(
    goalId: string,
    identityId: string,
    input?: GoalReviewWindowInput,
  ): Promise<Result<GoalReviewSystemContext>> {
    const goal = await this.goalRepository.findByIdForIdentity(identityId, goalId, {
      includeChildren: true,
    });
    if (!goal) return error('NOT_FOUND', `Goal not found: ${goalId}`);
    const windowEndAt = this.now();
    const timeContext = await this.userTimeContextPort.getUserTimeContext(identityId);
    const window = this.windowResolver.resolve(goal.goalReviews, input, windowEndAt, timeContext);
    if (!window.ok) return window;
    return ok(await this.contextBuilder.build(goal, window.data));
  }
}
