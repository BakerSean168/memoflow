/**
 * Notification Prisma composition helpers.
 * 通知模块 Prisma 组合辅助函数。
 *
 * Host-facing ingredient seams: the repository set type, the repository
 * factory and the delegating convenience module factory. Concrete Prisma
 * adapter classes never cross the public barrel — hosts consume repositories
 * only through the port-shaped set.
 *
 * 面向宿主的组合原料：仓储集合类型、仓储工厂与委托式便捷模块工厂。
 * 具体 Prisma 适配器类不会越过公共 barrel——宿主只能通过 Port 形状的集合使用仓储。
 */

import type { PrismaClient } from '@memoflow/database';
import type { UserTimeContextPort } from '@memoflow/time';
import type { ScheduleNotificationPort } from '../../schedule-execution';
import { createNotificationScheduleNotificationPort } from './schedule-notification-port';
import {
  NotificationPreferencePrismaRepository,
  NotificationPrismaRepository,
  NotificationTemplatePrismaRepository,
  NotificationReliableOperationPrismaAdapter,
} from './adapters/prisma';
import { NotificationRequestedPrismaWriterAdapter } from './adapters/prisma/notification-requested-writer.prisma.adapter';
import type { NotificationRequestedWriterPort } from '@memoflow/contracts/notification';
import {
  createNotificationRuntimeContribution,
  type NotificationReliableOperationPort,
} from './runtime/notification.runtime';
import {
  createNotificationModule,
  type NotificationModuleInstance,
  type NotificationRuntimeContributionsInput,
} from './notification.module';

import { NotificationMetricsService, globalNotificationMetrics } from '../domain/services/notification-metrics-service';

import {
  RealInAppChannelDeliverer,
  RealDesktopChannelDeliverer,
} from './adapters/deliverers/real-channel-deliverers';

import { PrismaOperationAuditRepository } from '@memoflow/patterns/operations';
import type { INotificationRepository, INotificationPreferenceRepository, INotificationTemplateRepository } from '../domain/repositories';
import type { OperationAuditRepository } from '@memoflow/patterns/operations';

export interface CreateNotificationPrismaModuleOptions {
  readonly closureChecker: (identityId: string) => Promise<boolean>;
  readonly userTimeContextPort: UserTimeContextPort;
  readonly runtimeContributions?: NotificationRuntimeContributionsInput;
  readonly durableRuntime?: import('./runtime/notification.runtime').NotificationDurableRuntimePort;
  readonly channelDeliverer?: import('./runtime/notification.runtime').NotificationChannelDeliverer;
  readonly channelDeliverers?: Record<string, import('./runtime/notification.runtime').NotificationChannelDeliverer>;
  readonly channelCapabilities?: import('./runtime/notification.runtime').ChannelCapabilitySpec[];
  readonly desktopTransport?: unknown;
  readonly pushTransport?: unknown;
  readonly metricsService?: NotificationMetricsService;
}

/**
 * Host-facing notification repository set for the Prisma lane.
 * 面向宿主暴露的 Prisma lane 通知仓储集合。
 *
 * Contains the three domain repositories, the reliable-operation adapter
 * (the durable-runtime ingredient) and the operation audit repository.
 * `closureChecker` is intentionally NOT part of the set: it is a host-owned
 * port passed explicitly to `createNotificationPrismaModule`.
 *
 * 包含三个领域仓储、可靠操作适配器（durable-runtime 原料）与操作审计仓储。
 * `closureChecker` 刻意不在此列：它是宿主持有的 Port，由调用方显式传给
 * `createNotificationPrismaModule`。
 */
export interface NotificationPrismaRepositorySet {
  readonly notificationRepository: INotificationRepository;
  readonly notificationPreferenceRepository: INotificationPreferenceRepository;
  readonly notificationTemplateRepository: INotificationTemplateRepository;
  readonly reliableAdapter: NotificationReliableOperationPort;
  readonly requestedWriter: NotificationRequestedWriterPort;
  readonly auditRepository: OperationAuditRepository;
}

/**
 * Creates Prisma-backed notification repositories.
 * 创建基于 Prisma 的通知仓储。
 *
 * Host-level composition ingredient: selects the Prisma adapters and returns
 * the repository Port shape for the API lane.
 *
 * 宿主级组合原料：选择 Prisma 适配器并返回 API lane 的仓储 Port 形状。
 *
 * @param db - Prisma client owned by the host runtime. 宿主运行时持有的 Prisma client。
 * @param metricsService - Optional metrics service; defaults to the global instance. 可选指标服务；默认使用全局实例。
 * @returns Repository set backed by the Prisma adapters.
 *          返回基于 Prisma 适配器的仓储集合。
 */
export function createNotificationPrismaRepositories(
  db: PrismaClient,
  metricsService?: NotificationMetricsService,
): NotificationPrismaRepositorySet {
  const service = metricsService ?? globalNotificationMetrics;
  return {
    notificationRepository: new NotificationPrismaRepository(db, service),
    notificationPreferenceRepository: new NotificationPreferencePrismaRepository(db),
    notificationTemplateRepository: new NotificationTemplatePrismaRepository(db),
    reliableAdapter: new NotificationReliableOperationPrismaAdapter(db, service),
    requestedWriter: new NotificationRequestedPrismaWriterAdapter(db),
    auditRepository: new PrismaOperationAuditRepository(db),
  };
}

export function createNotificationPrismaModule(
  db: PrismaClient,
  options: CreateNotificationPrismaModuleOptions,
): NotificationModuleInstance {
  if (!options?.closureChecker) {
    throw new Error('[FAIL-CLOSED] createNotificationPrismaModule requires options.closureChecker');
  }
  if (!options.userTimeContextPort) {
    throw new Error('[FAIL-CLOSED] createNotificationPrismaModule requires options.userTimeContextPort');
  }

  const metricsService = options.metricsService ?? globalNotificationMetrics;
  const repositories = createNotificationPrismaRepositories(db, metricsService);
  const notificationRepository = repositories.notificationRepository;
  const reliableAdapter = repositories.reliableAdapter;

  const defaultDeliverers: Record<string, import('./runtime/notification.runtime').NotificationChannelDeliverer> = {
    InApp: new RealInAppChannelDeliverer(notificationRepository),
    'in-app': new RealInAppChannelDeliverer(notificationRepository),
    Desktop: new RealDesktopChannelDeliverer(options.desktopTransport),
    desktop: new RealDesktopChannelDeliverer(options.desktopTransport),
    Push: new RealDesktopChannelDeliverer(options.pushTransport),
    push: new RealDesktopChannelDeliverer(options.pushTransport),
    ...(options.channelDeliverers ?? {}),
  };

  const defaultRuntimeContribution = createNotificationRuntimeContribution({
    repository: notificationRepository,
    preferenceRepository: repositories.notificationPreferenceRepository,
    closureChecker: options.closureChecker,
    userTimeContextPort: options.userTimeContextPort,
    reliableAdapter,
    deliverer: options.channelDeliverer,
    delivererRegistry: defaultDeliverers,
    channelCapabilities: options.channelCapabilities,
    metricsService,
  });

  const durableRuntime = options.durableRuntime ?? defaultRuntimeContribution;

  return createNotificationModule({
    notificationRepository,
    preferenceRepository: repositories.notificationPreferenceRepository,
    templateRepository: repositories.notificationTemplateRepository,
    closureChecker: options.closureChecker,
    userTimeContextPort: options.userTimeContextPort,
    durableRuntime,
    runtimeContributions: options.runtimeContributions ?? [durableRuntime],
    auditRepository: repositories.auditRepository,
  });
}

export function createNotificationPrismaScheduleNotificationPort(
  db: PrismaClient,
  closureChecker: (identityId: string) => Promise<boolean>,
  userTimeContextPort: UserTimeContextPort,
): ScheduleNotificationPort {
  const repositories = createNotificationPrismaRepositories(db);

  return createNotificationScheduleNotificationPort({
    notificationRepository: repositories.notificationRepository,
    notificationPreferenceRepository: repositories.notificationPreferenceRepository,
    closureChecker,
    userTimeContextPort,
  });
}
