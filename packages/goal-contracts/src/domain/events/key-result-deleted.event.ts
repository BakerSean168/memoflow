import type { GoalServerDTO } from '../../aggregates/goal-server';
import type { KeyResultServerDTO } from '../../entities/key-result-server';
import type { IdentityId, KeyResultId } from '@memoflow/shared-primitives';

export interface KeyResultDeletedEvent {
  identityId: IdentityId;
  goal: GoalServerDTO;
  keyResultId: KeyResultId;
  keyResult: KeyResultServerDTO;
}
