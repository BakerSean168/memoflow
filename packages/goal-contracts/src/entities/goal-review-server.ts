/** Goal Review V2: immutable system facts plus user reflection. */
import type { GoalReviewSystemContext } from '../value-objects/goal-review-context';
import type { TransferDate, GoalReviewId, GoalId } from '@memoflow/shared-primitives';

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
