/**
 * Cross-module cleanup capability required by Goal deletion.
 * Goal owns only this narrow requirement; Shared Relation owns the implementation.
 */
export interface GoalRelationCleanupPort {
  unlinkAllForGoal(identityId: string, goalId: string): Promise<number>;
}
