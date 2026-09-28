/**
 * ROUTINE-3401 Routine wall-clock execution lane (narrow seam).
 *
 * Narrow sub-path that avoids dragging the Reminder compose roots (Prisma,
 * PowerSync, module runtime) into orchestrators that only join the durable
 * Routine execution fence.
 */
export {
  ROUTINE_OCCURRENCE_LEASE_MS,
  createRoutineScheduleExecutionSource,
  createRoutineWallClockExecutionSource,
  type RoutineScheduleExecutionDeps,
  type RoutineScheduleExecutionInput,
  type RoutineScheduleExecutionOutcome,
  type RoutineScheduleExecutionSource,
} from '../server/infrastructure/routine-schedule/routine-schedule-execution-source';
export { createRoutineWallClockScheduledHandler } from '../server/infrastructure/routine-schedule/routine-wall-clock-scheduled-handler';
export { createRoutineElapsedScheduledHandler } from '../server/infrastructure/routine-schedule/routine-elapsed-scheduled-handler';
export {
  ROUTINE_WALLCLOCK_HANDLER_KEY,
  ROUTINE_WALLCLOCK_PAYLOAD_VERSION,
  ROUTINE_ELAPSED_HANDLER_KEY,
  ROUTINE_ELAPSED_PAYLOAD_VERSION,
  buildRoutineElapsedPayload,
  buildRoutineWallClockPayload,
  parseRoutineElapsedPayload,
  parseRoutineWallClockPayload,
  type RoutineElapsedOccurrencePayload,
  type RoutineWallClockOccurrencePayload,
} from '../server/infrastructure/routine-schedule/routine-schedule-contract';
export { createInMemoryRoutineOccurrenceStore } from '../server/infrastructure/routine-schedule/routine-occurrence-store.in-memory';
export { PrismaRoutineOccurrenceStore } from '../server/infrastructure/routine-schedule/routine-occurrence-store.prisma';
export {
  createInMemoryRoutineNotificationWriter,
  ROUTINE_NOTIFICATION_SOURCE,
  buildRoutineNotificationRequestedOutboxInput,
} from '../server/infrastructure/routine-schedule/routine-occurrence-notification-writer';
export {
  PrismaRoutineOccurrenceNotificationWriter,
  mapSharedOutboxRowToReceipt,
} from '../server/infrastructure/routine-schedule/routine-occurrence-notification-writer.prisma';
export { PrismaRoutineTemporaryOverrideStore } from '../server/infrastructure/routine-schedule/routine-temporary-override-store.prisma';
export { createRoutinePrismaScheduleExecutionDeps } from '../server/infrastructure/routine-schedule/routine-schedule-execution-source.prisma';
export type {
  RoutineOccurrenceClaimInput,
  RoutineOccurrenceCommitInput,
  RoutineOccurrenceLease,
  RoutineOccurrenceStore,
  RoutineOccurrenceTransactionHandle,
  RoutineTerminalStatus,
  RoutineHistoryEntry,
} from '../server/domain/ports/routine-occurrence-store.port';
export type {
  RoutineOccurrenceNotificationWriterPort,
  RoutineOccurrenceNotificationRequestInput,
} from '../server/domain/ports/routine-occurrence-notification-writer.port';
export type { RoutineTemporaryOverrideStore } from '../server/domain/ports/routine-temporary-override-store.port';
export type { RoutineTemporaryOverride } from '../server/domain/routine';
