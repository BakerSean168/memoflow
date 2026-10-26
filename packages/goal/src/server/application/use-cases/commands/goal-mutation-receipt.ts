import type  { GoalMutationReceipt, GoalRecordClientDTO } from '@memoflow/goal-contracts';
import type {
  GoalId,
  GoalRecordId,
  GoalReviewId,
  KeyResultId,
} from '@memoflow/contracts/primitives';
import type { Goal } from '../../../domain';

interface GoalMutationAffectedEntities {
  goalIds?: GoalId[];
  keyResultIds?: KeyResultId[];
  recordIds?: GoalRecordId[];
  reviewIds?: GoalReviewId[];
}

interface GoalRecordChanges {
  upserted: GoalRecordClientDTO[];
  removedIds: GoalRecordId[];
}

/** Materializes the authoritative result of one committed Goal mutation. */
export function createGoalMutationReceipt(
  goal: Goal,
  affected: GoalMutationAffectedEntities = {},
  recordChanges?: GoalRecordChanges,
): GoalMutationReceipt {
  return {
    goalId: goal.id as GoalId,
    goalVersion: goal.version,
    affectedEntityIds: {
      goalIds: affected.goalIds ?? [goal.id as GoalId],
      keyResultIds: affected.keyResultIds ?? [],
      recordIds: affected.recordIds ?? [],
      reviewIds: affected.reviewIds ?? [],
    },
    readModel: goal.toClientDTO(true),
    ...(recordChanges ? { recordChanges } : {}),
  };
}
