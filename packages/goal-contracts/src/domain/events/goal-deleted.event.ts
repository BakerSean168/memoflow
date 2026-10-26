import type { GoalServerDTO } from '../../aggregates/goal-server';
import type { IdentityId } from '@memoflow/shared-primitives';
import type { GoalId } from '../../value-objects/goal-id';

export interface GoalDeletedEvent {
  identityId: IdentityId;
  goalId: GoalId;
  goal: GoalServerDTO;
  isSoftDelete: boolean;
  deletedAt: number;
}
