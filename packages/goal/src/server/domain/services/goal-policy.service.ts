import type { Goal } from '../aggregates/goal';
import { GoalArchivedError } from '../value-objects';

/**
 * GoalPolicy
 *
 * Cross-aggregate and external-state validations for Goal workflows.
 */
export class GoalPolicy {
  ensureGoalCanBeModified(goal: Goal): void {
    if (goal.archivedAt) {
      throw new GoalArchivedError(goal.id);
    }
  }

  /**
   * Archive is independent from Goal business lifecycle.
   * 归档与 Goal 业务生命周期相互独立；任一未归档状态都可进入归档。
   */
  ensureGoalCanBeArchived(goal: Goal): void {
    if (goal.archivedAt) {
      throw new GoalArchivedError(goal.id);
    }
  }

  /**
   * 检查目标是否可以永久删除
   * 只有已归档的目标才能被永久删除
   */
  ensureGoalCanBePermanentlyDeleted(goal: Goal): void {
    if (!goal.canBePermanentlyDeleted()) {
      throw new Error(`Goal ${goal.id} must be archived before it can be permanently deleted`);
    }
  }

  ensureGoalCanBeActivated(goal: Goal): void {
    if (goal.archivedAt) {
      throw new GoalArchivedError(goal.id);
    }
  }
}
