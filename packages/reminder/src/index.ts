/**
 * @memoflow/reminder
 *
 * Reminder module runtime root.
 *
 * Public reminder contracts are centralized in
 * `@memoflow/contracts/reminder`.
 * Root exports are limited to the canonical server composition root:
 * ingredient factories, set types, module factory, runtime contribution
 * factories and port types. Client / API / Electron seams use dedicated
 * subpaths. Schedule orchestration integrations remain on their dedicated
 * `schedule-execution` / `schedule-projection` seams.
 *
 * 提醒模块运行时根。
 * 公开契约集中在 `@memoflow/contracts/reminder`。
 * 根导出仅限于规范化的服务端组合根：原料工厂、集合类型、模块工厂、
 * 运行时贡献工厂与 Port 类型。Client / API / Electron 使用独立 subpath。
 * Schedule 编排集成保留在独立的 `schedule-execution` / `schedule-projection` seam。
 */

export {
  createReminderModule,
  createReminderPrismaModule,
  createReminderPrismaRepositories,
  createReminderPowerSyncModule,
  createReminderPowerSyncRepositories,
  createReminderRuntimeContribution,
  createReminderUseCases,
  createPowerSyncClosureChecker,
  type ReminderApplicationPort,
  type ReminderModuleDependencies,
  type ReminderModuleInstance,
  type ReminderModuleRuntimeContribution,
  type ReminderModuleUseCases,
  type ReminderRuntimeContributionsInput,
  type ReminderPrismaRepositorySet,
  type ReminderPowerSyncRepositorySet,
  type ReminderSnoozeRescheduler,
  type IReminderTemplateRepository,
  type IReminderGroupRepository,
  type IReminderResponseRepository,
  type IUserReminderPreferenceRepository,
  loadPowerSyncRoutineLocalRegistrations,
  type RoutineLocalRegistrationsSnapshot,
} from './server';
// Schedule orchestration integrations are re-exported through the package root
// so host composers import only `@memoflow/reminder` (no `/schedule-*` subpath).
// 通过包根重新导出 schedule 编排集成，使宿主 composer 只导入 `@memoflow/reminder`。
export {
  createReminderScheduleExecutionSource,
  createReminderTemplateScheduledHandlerRegistration,
  createReminderPrismaScheduleExecutionCommitPort,
  createReminderPowerSyncScheduleExecutionCommitPort,
  type ReminderScheduleExecutionSource,
  type ReminderScheduleExecutionOutcome,
  type ReminderScheduleExecutionTask,
} from './schedule-execution';
export {
  createReminderScheduleProjectionSource,
  REMINDER_SCHEDULING_OWNER_TYPE,
  REMINDER_TEMPLATE_HANDLER_KEY,
  REMINDER_TEMPLATE_PAYLOAD_VERSION,
  type ReminderTemplateScheduledPayload,
  type ReminderScheduleProjectionSource,
} from './schedule-projection';
