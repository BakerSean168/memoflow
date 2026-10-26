import type { GoalServerDTO } from '../../aggregates/goal-server';
import type { IdentityId, GoalId } from '@memoflow/shared-primitives';

export interface GoalDeletedEvent {
  identityId: IdentityId;
  goalId: GoalId;
  goal: GoalServerDTO;
  isSoftDelete: boolean;
  deletedAt: number;
}
