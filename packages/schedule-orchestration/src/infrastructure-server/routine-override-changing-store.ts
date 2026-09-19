import type { RoutineOverrideChangedEvent } from '@memoflow/reminder/schedule-projection/routine';
import type { RoutineTemporaryOverrideStore } from '@memoflow/reminder/schedule-execution/routine';

/**
 * ROUTINE-3401: publish `routine:override-changed` after a durable snooze write.
 *
 * A persisted snooze/suppress changes the routine's desired scheduling set in
 * place (the next projectile may jump forward or reappear on expiry). Emitting
 * the override-changed signal after the durable commit lets the Routine
 * projection runtime reconcile the neutral Scheduler without waiting for the
 * next occurrence commit — the production link between a snooze action and the
 * updated durable invocation.
 */
export function createRoutineOverrideChangedPublishingStore(deps: {
  readonly store: RoutineTemporaryOverrideStore;
  readonly publish: (event: RoutineOverrideChangedEvent) => void;
}): RoutineTemporaryOverrideStore {
  return {
    async findRoutineTemporaryOverride(input) {
      return deps.store.findRoutineTemporaryOverride(input);
    },
    async setRoutineTemporaryOverride(input) {
      await deps.store.setRoutineTemporaryOverride(input);
      deps.publish({ routineId: input.routineId, identityId: input.identityId });
    },
    async clearRoutineTemporaryOverride(input) {
      await deps.store.clearRoutineTemporaryOverride(input);
      deps.publish({ routineId: input.routineId, identityId: input.identityId });
    },
  };
}