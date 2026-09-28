/** Canonical Routine vNext server infrastructure surface. */
export { createRoutinePrismaRepositories, type RoutinePrismaRepositorySet } from './prisma';
export {
  createRoutinePowerSyncRepositories,
  createPowerSyncClosureChecker,
  type RoutinePowerSyncRepositorySet,
} from './powersync';

export {
  ROUTINE_WALLCLOCK_HANDLER_KEY,
  ROUTINE_WALLCLOCK_PAYLOAD_VERSION,
  ROUTINE_ELAPSED_HANDLER_KEY,
  ROUTINE_ELAPSED_PAYLOAD_VERSION,
  ROUTINE_SCHEDULING_OWNER_TYPE,
  buildRoutineElapsedIntent,
  buildRoutineElapsedPayload,
  buildRoutineElapsedSchedulingKey,
  buildRoutineWallClockIntent,
  buildRoutineWallClockOwner,
  buildRoutineWallClockPayload,
  buildRoutineWallClockSchedulingKey,
  parseRoutineElapsedPayload,
  parseRoutineWallClockPayload,
  type RoutineElapsedOccurrencePayload,
  type RoutineWallClockOccurrencePayload,
} from './routine-schedule/routine-schedule-contract';
export {
  createRoutineScheduleProjectionEventHandlers,
  createRoutineScheduleProjectionSource,
  routineScheduleProjectionEventNames,
  type RoutineOccurrenceCommittedEvent,
  type RoutineOverrideChangedEvent,
  type RoutineScheduleChangedEvent,
  type RoutineScheduleProjectionEventMap,
  type RoutineScheduleProjectionHandlers,
  type RoutineScheduleProjectionPlan,
  type RoutineScheduleProjectionSource,
  type RoutineScheduleSnapshot,
  type RoutineScheduleStateReader,
} from './routine-schedule/routine-schedule-projection-source';
export {
  ROUTINE_OCCURRENCE_LEASE_MS,
  createRoutineWallClockExecutionSource,
  type RoutineScheduleExecutionDeps,
  type RoutineScheduleExecutionInput,
  type RoutineScheduleExecutionOutcome,
  type RoutineScheduleExecutionSource,
} from './routine-schedule/routine-schedule-execution-source';
export { createRoutineWallClockScheduledHandler } from './routine-schedule/routine-wall-clock-scheduled-handler';
export { createRoutineElapsedScheduledHandler } from './routine-schedule/routine-elapsed-scheduled-handler';
export { createInMemoryRoutineOccurrenceStore } from './routine-schedule/routine-occurrence-store.in-memory';
export {
  createInMemoryRoutineNotificationWriter,
  createRoutineOccurrenceNotificationWriter,
  ROUTINE_NOTIFICATION_SOURCE,
  buildRoutineOccurrenceNotificationRequest,
  buildRoutineNotificationRequestedOutboxInput,
} from './routine-schedule/routine-occurrence-notification-writer';
export { PrismaProtocolSessionStore } from './routine-vnext/protocol-session-store.prisma';
export { PowerSyncProtocolSessionStore } from './routine-vnext/protocol-session-store.powersync';
export { PrismaRoutineOccurrenceTruthStore } from './routine-vnext/routine-occurrence-truth-store.prisma';
export { PowerSyncRoutineOccurrenceTruthStore } from './routine-vnext/routine-occurrence-truth-store.powersync';
export {
  loadPowerSyncRoutineLocalRegistrations,
  type RoutineLocalRegistrationsSnapshot,
} from './routine-vnext/routine-local-registrations.powersync';
export { RoutineAccountClosedConsumer } from './consumers/routine-account-closed.consumer';
