export interface ReminderScheduleExecutionTask {
  readonly identityId: string;
  readonly sourceEntityId: string;
  readonly nextRunAt: Date | null;
}

export interface ReminderScheduleExecutionOutcome {
  readonly nextRunAt?: number | null;
  readonly result?: Record<string, unknown>;
}

export interface ReminderScheduleExecutionSource {
  executeReminder(task: ReminderScheduleExecutionTask): Promise<ReminderScheduleExecutionOutcome>;
}

export {
  createReminderTemplateScheduledHandlerRegistration,
  ReminderTemplateScheduledPayloadSchema,
} from '../server/infrastructure/reminder-template-scheduled-handler';

export {
  createReminderPrismaScheduleExecutionCommitPort,
  createReminderPrismaScheduleExecutionSource,
  createReminderPowerSyncScheduleExecutionCommitPort,
  createReminderPowerSyncScheduleExecutionSource,
  createReminderScheduleExecutionSource,
  type CreateReminderScheduleExecutionSourceDeps,
  type ReminderScheduleExecutionCommitInput,
  type ReminderScheduleExecutionCommitPort,
  type ReminderScheduleExecutionCommitResult,
} from '../server/infrastructure';

// ============ Routine wall-clock lane (ROUTINE-3401) ============
export {
  ROUTINE_OCCURRENCE_LEASE_MS,
  createRoutineWallClockExecutionSource,
  type RoutineScheduleExecutionDeps,
  type RoutineScheduleExecutionInput,
  type RoutineScheduleExecutionOutcome,
  type RoutineScheduleExecutionSource,
} from '../server/infrastructure/routine-schedule/routine-schedule-execution-source';
export { createRoutineWallClockScheduledHandler } from '../server/infrastructure/routine-schedule/routine-wall-clock-scheduled-handler';
export {
  ROUTINE_WALLCLOCK_HANDLER_KEY,
  ROUTINE_WALLCLOCK_PAYLOAD_VERSION,
  buildRoutineWallClockPayload,
  parseRoutineWallClockPayload,
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
export { createRoutinePrismaScheduleExecutionDeps } from '../server/infrastructure/routine-schedule/routine-schedule-execution-source.prisma';
export { PrismaRoutineTemporaryOverrideStore } from '../server/infrastructure/routine-schedule/routine-temporary-override-store.prisma';
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
