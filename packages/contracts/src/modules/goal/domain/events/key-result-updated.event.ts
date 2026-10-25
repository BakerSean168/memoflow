import type { GoalServerDTO } from '../../aggregates/goal-server';
import type { KeyResultServerDTO } from '../../entities/key-result-server';
import type { IdentityId } from '@memoflow/shared-primitives';

export interface KeyResultUpdatedEvent {
  identityId: IdentityId;
  goal: GoalServerDTO;
  keyResult: KeyResultServerDTO;
  changes: string[];
  previousValue: number | null;
  newValue: number | null;
  goalProgress: number;
}
