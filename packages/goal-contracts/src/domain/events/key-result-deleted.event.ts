import type { GoalServerDTO } from '../../aggregates/goal-server';
import type { KeyResultServerDTO } from '../../entities/key-result-server';
import type { IdentityId } from '@memoflow/shared-primitives';
import type { KeyResultId } from '../../value-objects/key-result-id';

export interface KeyResultDeletedEvent {
  identityId: IdentityId;
  goal: GoalServerDTO;
  keyResultId: KeyResultId;
  keyResult: KeyResultServerDTO;
}
