import type { GoalServerDTO } from '../../aggregates/goal-server';
import type { GoalReviewServerDTO } from '../../entities/goal-review-server';
import type { IdentityId } from '@memoflow/shared-primitives';

export interface ReviewAddedEvent {
  identityId: IdentityId;
  goal: GoalServerDTO;
  review: GoalReviewServerDTO;
}
