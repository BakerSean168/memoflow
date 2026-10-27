import type { SchedulingPort } from '@memoflow/schedule-contracts';
import type { GoalScheduleProjectionSource } from '@memoflow/goal/schedule-projection';

export interface GoalProjector {
  upsertGoal(goalId: string, identityId: string): Promise<void>;
  deleteGoal(goalId: string, identityId: string): Promise<void>;
}

export interface CreateGoalProjectorDeps {
  readonly source: GoalScheduleProjectionSource;
  readonly schedulingPort: SchedulingPort;
}

/** Goal-owned desired scheduling set -> neutral SchedulingPort. */
export function createGoalProjector(deps: CreateGoalProjectorDeps): GoalProjector {
  return {
    async upsertGoal(goalId, identityId) {
      const plan = await deps.source.buildGoalPlan(goalId, identityId);
      await deps.schedulingPort.reconcile(plan.owner, plan.desired);
    },

    async deleteGoal(goalId, identityId) {
      await deps.schedulingPort.removeOwner(deps.source.buildGoalOwner(goalId, identityId));
    },
  };
}
