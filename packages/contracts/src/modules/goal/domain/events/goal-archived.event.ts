import type { GoalServerDTO } from '../../aggregates/goal-server';
import type { IdentityId } from '@memoflow/shared-primitives';

export interface GoalArchivedEvent {
  identityId: IdentityId;
  goal: GoalServerDTO;
  archivedAt: number;
}
