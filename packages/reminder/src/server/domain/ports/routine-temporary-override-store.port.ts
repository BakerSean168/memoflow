import type { RoutineTemporaryOverride } from '../../domain/routine';

/**
 * Durable snooze/suppress runtime state for the routine wall-clock lane.
 *
 * A snooze or suppress updates the routine's temporary override; the durable
 * write is what lets the production Scheduler projection converge to the next
 * eligible occurrence. The state reader (`readRoutineScheduleSnapshot`) serves
 * the same durable row back to both projection and execution, so a persisted
 * snooze suppresses the canonical occurrence and a cleared/expired one restores
 * it — without ever rewriting the long-lived `trigger_json`.
 */
export interface RoutineTemporaryOverrideStore {
  findRoutineTemporaryOverride(input: {
    readonly identityId: string;
    readonly routineId: string;
  }): Promise<RoutineTemporaryOverride | null>;
  setRoutineTemporaryOverride(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly override: RoutineTemporaryOverride;
    readonly expectedVersion?: number;
  }): Promise<void>;
  clearRoutineTemporaryOverride(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly expectedVersion?: number;
  }): Promise<void>;
}
