/** Goal Review V2: immutable system facts plus user reflection. */
import type { GoalReviewSystemContext } from '../value-objects/goal-review-context';
import type { TransferDate } from '@memoflow/shared-primitives';
import type { GoalId } from '../value-objects/goal-id';
import type { GoalReviewId } from '../value-objects/goal-review-id';

export interface GoalReviewServerDTO {
  id: GoalReviewId;
  goalId: GoalId;
  reflection: string;
  challenges: string | null;
  adjustments: string | null;
  systemContext: GoalReviewSystemContext;
  reviewedAt: TransferDate;
  createdAt: TransferDate;
  updatedAt: TransferDate;
}
