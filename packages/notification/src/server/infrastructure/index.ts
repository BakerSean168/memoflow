/**
 * Infrastructure Server Layer - Barrel Export.
 * 基础设施服务端层 - 统一导出。
 *
 * Public seam: ingredient factories, set types, module factory, runtime
 * contribution factories and port types. Concrete adapter classes do not leak
 * through this barrel. The single host-used closure consumer remains exported
 * for apps/api; it is documented, not a new leak.
 *
 * 公共 seam：仅导出原料工厂、集合类型、模块工厂、运行时贡献工厂与 Port 类型。
 * 具体适配器类不通过该 barrel 泄漏。仅保留供 apps/api 使用的 host-used 关闭
 * consumer；它是有记录的条目，而非新泄漏。
 */

// ============ Composition Root ============
export {
  createNotificationModule,
  createNotificationUseCases,
  type NotificationModuleDependencies,
  type NotificationModuleInstance,
  type NotificationModuleRuntimeContribution,
  type NotificationModuleUseCases,
  type NotificationRuntimeContributionsInput,
} from './notification.module';
export type { NotificationApplicationPort } from '../application';
export type {
  INotificationRepository,
  INotificationPreferenceRepository,
} from '../domain/repositories';

export { createNotificationPowerSyncModule } from './powersync';
export {
  createNotificationPowerSyncRepositories,
  createPowerSyncClosureChecker,
  createDefaultElectronDesktopTransport,
  type CreateNotificationPowerSyncModuleOptions,
  type NotificationPowerSyncRepositorySet,
  type DesktopTransportAckRecord,
  type DesktopTransportAckStore,
} from './powersync';
export {
  createNotificationPrismaModule,
  createNotificationPrismaRepositories,
  createNotificationPrismaScheduleNotificationPort,
  type CreateNotificationPrismaModuleOptions,
  type NotificationPrismaRepositorySet,
} from './prisma';
export {
  createNotificationScheduleNotificationPort,
  type CreateNotificationScheduleNotificationPortDeps,
} from './schedule-notification-port';
export {
  createNotificationRuntimeContribution,
  createNotificationDurableRuntime,
  type ChannelCapabilitySpec,
  type NotificationChannelDeliverer,
  type NotificationDurableRuntimePort,
  type NotificationReliableOperationPort,
} from './runtime';

// ============ Adapters still consumed by apps ============
/** @internal 仍被 apps/api 直接消费的 host-used 具体 consumer 类（closure worker 注入）。 */
export { NotificationAccountClosedConsumer } from './consumers/notification-account-closed.consumer';
