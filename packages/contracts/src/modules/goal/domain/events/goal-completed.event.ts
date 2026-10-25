import type { GoalServerDTO } from '../../aggregates/goal-server';
import type { IdentityId } from '@memoflow/shared-primitives';

export interface GoalCompletedEvent {
  identityId: IdentityId;
  goal: GoalServerDTO;
  finalProgress: number;
  completedAt: number;
}
