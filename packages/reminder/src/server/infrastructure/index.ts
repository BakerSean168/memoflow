/**
 * Reminder Module - Infrastructure Server Layer.
 * 提醒模块 - 基础设施服务端层。
 *
 * Public seam: ingredient factories, set types, module factory, runtime
 * contribution factories and port types. Concrete Prisma / PowerSync adapter
 * classes do not leak through this barrel — the R1 lesson applied to the
 * goal/task migration.
 *
 * 公共 seam：仅导出原料工厂、集合类型、模块工厂、运行时贡献工厂与 Port 类型。
 * 具体 Prisma / PowerSync 适配器类不通过该 barrel 泄漏——目标/任务迁移的 R1 教训。
 */

// ============ Composition Root / 组合根 ============
export {
  createReminderModule,
  createReminderUseCases,
  type ReminderModuleDependencies,
  type ReminderModuleInstance,
  type ReminderModuleUseCases,
  type ReminderModuleRuntimeContribution,
  type ReminderRuntimeContributionsInput,
} from './reminder.module';
export type { ReminderApplicationPort } from '../application';
export type {
  IReminderTemplateRepository,
  IReminderGroupRepository,
  IReminderResponseRepository,
  IUserReminderPreferenceRepository,
} from '../domain/repositories';
export type { ReminderTransactionRunner } from '../domain/ports/reminder-transaction-runner.port';
export type { ReminderSnoozeOverrideWriter } from '../application/use-cases/commands/record-reminder-response.use-case';

// ============ PowerSync Module Factory / PowerSync 模块工厂 ============
export { createReminderPowerSyncModule } from './powersync';
export {
  createReminderPowerSyncScheduleExecutionCommitPort,
  createReminderPowerSyncScheduleExecutionSource,
} from './powersync';
export { createReminderPowerSyncScheduleProjectionSource } from './powersync';
export {
  createReminderPowerSyncRepositories,
  createPowerSyncClosureChecker,
  type ReminderPowerSyncRepositorySet,
} from './powersync';
export {
  createReminderTemplateScheduledHandlerRegistration,
  ReminderTemplateScheduledPayloadSchema,
} from './reminder-template-scheduled-handler';
export {
  createReminderScheduleExecutionSource,
  type CreateReminderScheduleExecutionSourceDeps,
} from './schedule-execution-source';
export type {
  ReminderScheduleExecutionCommitInput,
  ReminderScheduleExecutionCommitPort,
  ReminderScheduleExecutionCommitResult,
} from './schedule-execution-commit.port';
export {
  createReminderScheduleProjectionEventHandlers,
  createReminderScheduleProjectionSource,
  type ReminderScheduleProjectionEventMap,
  type ReminderScheduleProjectionHandlers,
  type ReminderScheduleProjectionPlan,
  type ReminderScheduleProjectionSource,
} from './schedule-projection-source';

// ============ Routine wall-clock lane (ROUTINE-3401) ============
export {
  ROUTINE_WALLCLOCK_HANDLER_KEY,
  ROUTINE_WALLCLOCK_PAYLOAD_VERSION,
  ROUTINE_SCHEDULING_OWNER_TYPE,
  buildRoutineWallClockIntent,
  buildRoutineWallClockOwner,
  buildRoutineWallClockPayload,
  buildRoutineWallClockSchedulingKey,
  parseRoutineWallClockPayload,
  type RoutineWallClockOccurrencePayload,
} from './routine-schedule/routine-schedule-contract';
export {
  createRoutineScheduleProjectionEventHandlers,
  createRoutineScheduleProjectionSource,
  routineScheduleProjectionEventNames,
  type RoutineOccurrenceCommittedEvent,
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
export { createInMemoryRoutineOccurrenceStore } from './routine-schedule/routine-occurrence-store.in-memory';
export {
  createInMemoryRoutineNotificationWriter,
  ROUTINE_NOTIFICATION_SOURCE,
  buildRoutineNotificationRequestedOutboxInput,
} from './routine-schedule/routine-occurrence-notification-writer';
export {
  createReminderPrismaModule,
  createReminderPrismaRepositories,
  createReminderPrismaScheduleExecutionCommitPort,
  createReminderPrismaScheduleExecutionSource,
  createReminderPrismaScheduleProjectionSource,
  type CreateReminderPrismaModuleOptions,
  type ReminderPrismaRepositorySet,
} from './prisma';

// ============ Host-used concrete consumer ============
/** Host-used by apps/api: closure worker consumer. 宿主使用：apps/api 的账户关闭 consumer。 */
export { ReminderAccountClosedConsumer } from './consumers/reminder-account-closed.consumer';

// ============ Routine protocol session persistence/recovery (ROUTINE-4201) ============
export { PrismaProtocolSessionStore } from './routine-vnext/protocol-session-store.prisma';
export { PowerSyncProtocolSessionStore } from './routine-vnext/protocol-session-store.powersync';
export {
  loadPowerSyncRoutineLocalRegistrations,
  type RoutineLocalRegistrationsSnapshot,
} from './routine-vnext/routine-local-registrations.powersync';
