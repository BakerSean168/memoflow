/**
 * @memoflow/notification
 *
 * Notification module runtime root.
 *
 * Public notification contracts are centralized in
 * `@memoflow/contracts/notification`.
 * Root exports are limited to the canonical server composition roots:
 * ingredient factories, set types, module factory, runtime contribution
 * factories and port types. Client / API / Electron seams use dedicated
 * subpaths.
 *
 * 通知模块运行时根。
 * 公开契约集中在 `@memoflow/contracts/notification`。
 * 根导出仅限于规范化的服务端组合根：原料工厂、集合类型、模块工厂、
 * 运行时贡献工厂与 Port 类型。Client / API / Electron 使用独立 subpath。
 */

export {
  createNotificationModule,
  createNotificationPrismaModule,
  createNotificationPrismaRepositories,
  createNotificationPrismaScheduleNotificationPort,
  createNotificationPowerSyncModule,
  createNotificationPowerSyncRepositories,
  createNotificationRuntimeContribution,
  createNotificationDurableRuntime,
  createNotificationScheduleNotificationPort,
  createPowerSyncClosureChecker,
  createDefaultElectronDesktopTransport,
  type NotificationInboxPort,
  type NotificationOperationsPort,
  type NotificationOwnerCommandRegistry,
  type NotificationModuleDependencies,
  type NotificationModuleInstance,
  type NotificationModuleRuntimeContribution,
  type NotificationModuleUseCases,
  type NotificationPrismaRepositorySet,
  type NotificationPowerSyncRepositorySet,
  type NotificationReliableOperationPort,
  type NotificationRequestedWriterPort,
  type ChannelCapabilitySpec,
  type NotificationChannelDeliverer,
  type NotificationDurableRuntimePort,
  type INotificationRepository,
  type INotificationPreferenceRepository,
  type INotificationInteractionRepository,
} from './server';
// Host composers import only `@memoflow/notification`; the command / schedule
// seams are re-exported through the root so no `/commands` or
// `/schedule-execution` subpath import is needed in apps.
// 宿主 composer 只导入 `@memoflow/notification`；命令 / schedule seam 通过根重新
// 导出，apps 无需导入 `/commands` 或 `/schedule-execution` 子路径。
export { CreateNotificationUseCase } from './server/application/use-cases/commands/create-notification.use-case';
export type { ScheduleNotificationPort } from './schedule-execution';
