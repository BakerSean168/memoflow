import type { RelationRepository } from '../domain/relation-repository';

/** Structural capability consumed by Goal without making Goal own Relation. */
export interface GoalRelationCleanupCapability {
  unlinkAllForGoal(identityId: string, goalId: string): Promise<number>;
}

export function createGoalRelationCleanupCapability(
  repository: Pick<RelationRepository, 'deleteAllForEntity'>,
): GoalRelationCleanupCapability {
  return {
    unlinkAllForGoal: (identityId, goalId) =>
      repository.deleteAllForEntity(identityId, { type: 'goal', id: goalId as never }),
  };
}
