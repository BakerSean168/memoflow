import type { SchedulingPort } from '@memoflow/schedule-contracts';
import type { RoutineScheduleProjectionSource } from '@memoflow/routine/schedule-projection/routine';

export interface RoutineProjector {
  upsertRoutine(routineId: string, identityId: string): Promise<void>;
  deleteRoutine(routineId: string, identityId: string): Promise<void>;
}

export interface CreateRoutineProjectorDeps {
  readonly source: RoutineScheduleProjectionSource;
  readonly schedulingPort: SchedulingPort;
}

/** Routine-owned desired scheduling set -> neutral SchedulingPort. */
export function createRoutineProjector(deps: CreateRoutineProjectorDeps): RoutineProjector {
  return {
    async upsertRoutine(routineId, identityId) {
      const plan = await deps.source.buildRoutinePlan(routineId, identityId);
      await deps.schedulingPort.reconcile(plan.owner, plan.desired);
    },

    async deleteRoutine(routineId, identityId) {
      await deps.schedulingPort.removeOwner(deps.source.buildRoutineOwner(routineId, identityId));
    },
  };
}
