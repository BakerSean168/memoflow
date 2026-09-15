import type { SchedulingPort } from '@memoflow/contracts/schedule';
import type { TaskScheduleProjectionSource } from '@memoflow/task/schedule-projection';

export interface TaskProjector {
  upsertPlan(planId: string, identityId: string): Promise<void>;
  deletePlan(planId: string, identityId: string): Promise<void>;
}

export interface CreateTaskProjectorDeps {
  readonly source: TaskScheduleProjectionSource;
  readonly schedulingPort: SchedulingPort;
}

/** Task-owned desired scheduling set -> neutral SchedulingPort. */
export function createTaskProjector(deps: CreateTaskProjectorDeps): TaskProjector {
  return {
    async upsertPlan(planId, identityId) {
      const plan = await deps.source.buildPlanProjection(planId, identityId);
      await deps.schedulingPort.reconcile(plan.owner, plan.desired);
    },

    async deletePlan(planId, identityId) {
      await deps.schedulingPort.removeOwner(deps.source.buildPlanOwner(planId, identityId));
    },
  };
}
