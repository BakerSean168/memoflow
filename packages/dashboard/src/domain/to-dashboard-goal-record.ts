import type { GoalClientDTO } from '@memoflow/contracts/goal';
import type { DashboardGoalRecord } from './types';

export type DashboardGoalSource = Pick<
  GoalClientDTO,
  | 'id'
  | 'name'
  | 'status'
  | 'deletedAt'
  | 'updatedAt'
  | 'overallProgress'
  | 'target'
  | 'totalKeyResults'
>;

/** Adapts Goal's authoritative read projection without recalculating summaries. */
export function toDashboardGoalRecord(goal: DashboardGoalSource): DashboardGoalRecord {
  return {
    id: String(goal.id),
    name: goal.name,
    status: goal.status,
    deletedAt: goal.deletedAt,
    updatedAt: goal.updatedAt,
    overallProgress: goal.overallProgress,
    target: goal.target,
    totalKeyResults: goal.totalKeyResults,
  };
}
