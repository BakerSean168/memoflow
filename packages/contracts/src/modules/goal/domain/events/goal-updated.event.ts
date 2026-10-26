import type { GoalServerDTO } from '../../aggregates/goal-server';
import type { IdentityId } from '@memoflow/shared-primitives';

export interface GoalUpdatedEvent {
  identityId: IdentityId;
  goal: GoalServerDTO;
  changes: string[];
}
