import type { GoalServerDTO } from '../../aggregates/goal-server';
import type { IdentityId } from '@memoflow/shared-primitives';

export interface GoalStatusChangedEvent {
  identityId: IdentityId;
  goal: GoalServerDTO;
  previousStatus: string;
  newStatus: string;
}
