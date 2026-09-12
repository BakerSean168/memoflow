import type { IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import type { GoalRelationCleanupCapability } from '../../application/goal-relation-cleanup';

/** Transaction-scoped Shared Relation cleanup used by Goal deletion orchestration. */
export class PowerSyncGoalRelationCleanupCapability implements GoalRelationCleanupCapability {
  constructor(private readonly db: IElectronDatabaseTransaction) {}

  async unlinkAllForGoal(identityId: string, goalId: string): Promise<number> {
    const result = await this.db.execute(
      `DELETE FROM relations
       WHERE identity_id = ?
         AND ((subject_type = 'goal' AND subject_id = ?) OR (object_type = 'goal' AND object_id = ?))`,
      [identityId, goalId, goalId],
    );
    return Number(result.rowsAffected ?? 0);
  }
}
