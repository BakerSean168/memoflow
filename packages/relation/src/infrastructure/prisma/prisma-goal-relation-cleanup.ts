import type { PrismaClient } from '@memoflow/database';
import type { GoalRelationCleanupCapability } from '../../application/goal-relation-cleanup';

type Db = Pick<PrismaClient, 'relation'>;

/** Transaction-scoped Shared Relation cleanup used by Goal deletion orchestration. */
export class PrismaGoalRelationCleanupCapability implements GoalRelationCleanupCapability {
  constructor(private readonly db: Db) {}

  async unlinkAllForGoal(identityId: string, goalId: string): Promise<number> {
    const result = await this.db.relation.deleteMany({
      where: {
        identityId,
        OR: [
          { subjectType: 'goal', subjectId: goalId },
          { objectType: 'goal', objectId: goalId },
        ],
      },
    });
    return result.count;
  }
}
