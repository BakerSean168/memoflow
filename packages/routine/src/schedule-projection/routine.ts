/**
 * Routine (ROUTINE-3401) wall-clock projection lane (narrow seam).
 *
 * Narrow sub-path that avoids dragging the Reminder compose roots (Prisma,
 * PowerSync) into orchestrators that only join the durable Routine recurrence
 * projection. The full seam at ./index.ts continues to export both lanes.
 */
export {
  createRoutineScheduleProjectionEventHandlers,
  createRoutineScheduleProjectionSource,
} from '../server/infrastructure/routine-schedule/routine-schedule-projection-source';
export { ROUTINE_SCHEDULING_OWNER_TYPE } from '../server/infrastructure/routine-schedule/routine-schedule-contract';
export { createRoutinePrismaScheduleProjectionSource } from '../server/infrastructure/routine-schedule/routine-schedule-projection-source.prisma';
export { createRoutinePowerSyncScheduleProjectionSource } from '../server/infrastructure/routine-schedule/routine-schedule-projection-source.powersync';
export { createPrismaRoutineScheduleStateReader } from '../server/infrastructure/routine-schedule/routine-schedule-state-reader.prisma';
export type {
  RoutineScheduleProjectionHandlers,
  RoutineScheduleProjectionPlan,
  RoutineScheduleProjectionSource,
  RoutineScheduleSnapshot,
  RoutineScheduleStateReader,
} from '../server/infrastructure/routine-schedule/routine-schedule-projection-source';
