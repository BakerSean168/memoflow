/**
 * createNotificationModule — explicit composition root for the notification server runtime.
 * createNotificationModule —— 通知模块服务端运行时的显式组合根。
 *
 * The outer app selects concrete adapters and passes them in here.
 * This module then assembles the application layer exactly once and exposes a
 * stable facade to HTTP / IPC transports.
 *
 * 外层应用负责选择具体适配器并传入这里。
 * 组合根只做一次组装，然后向 HTTP / IPC 等传输层暴露稳定门面。
 *
 * Notification follows the governance reference pattern: one composition root
 * per module, constructor injection only, no hidden service locator.
 * 通知模块遵循治理模块参考模式：每个模块一个组合根，
 * 仅使用构造函数注入，不使用隐藏的服务定位器。
 */

import type {
  INotificationRepository,
  INotificationPreferenceRepository,
  INotificationTemplateRepository,
} from '../domain/repositories';
import {
  CreateNotificationUseCase,
  MarkNotificationAsReadUseCase,
  UpdateNotificationUseCase,
  UpdateNotificationPreferenceUseCase,
  GetUserNotificationsUseCase,
  GetUnreadNotificationsUseCase,
  GetNotificationPreferenceUseCase,
} from '../application';
import { fail, ok } from '@memoflow/contracts/result';
import {
  NotificationMaintenanceApplicationService,
  NotificationQueryApplicationService,
} from '../application';
import type {
  NotificationApplicationPort,
  NotificationSseDeliveryEvent,
} from '../application';
import type { NotificationDurableRuntimePort } from './runtime/notification.runtime';
import { mapReceiptToTimelineEntry } from '@memoflow/patterns/operations';
import type {
  OperationAuditRepository,
  OperationAuditRecord,
} from '@memoflow/patterns/operations';
import { runTimelineQueryWithAudit } from '@memoflow/patterns/operations';
import { createLogger } from '@memoflow/utils/logger';
import type { UserTimeContextPort } from '@memoflow/time';

const logger = createLogger('NotificationModule');

export interface NotificationModuleRuntimeContribution {
  start(): void;
  stop(): void;
}

export type NotificationRuntimeContributionsInput =
  | NotificationModuleRuntimeContribution
  | readonly NotificationModuleRuntimeContribution[];

export interface NotificationModuleDependencies {
  readonly notificationRepository: INotificationRepository;
  readonly preferenceRepository: INotificationPreferenceRepository;
  readonly templateRepository: INotificationTemplateRepository;
  readonly closureChecker: (identityId: string) => Promise<boolean>;
  readonly userTimeContextPort: UserTimeContextPort;
  readonly runtimeContributions?: NotificationRuntimeContributionsInput;
  readonly durableRuntime: NotificationDurableRuntimePort;
  readonly auditRepository?: OperationAuditRepository;
}

export interface NotificationModuleUseCases {
  readonly createNotification: CreateNotificationUseCase;
  readonly updateNotification: UpdateNotificationUseCase;
  readonly markAsRead: MarkNotificationAsReadUseCase;
  readonly getUserNotifications: GetUserNotificationsUseCase;
  readonly getUnreadNotifications: GetUnreadNotificationsUseCase;
  readonly getNotificationPreference: GetNotificationPreferenceUseCase;
  readonly updateNotificationPreference: UpdateNotificationPreferenceUseCase;
}

export interface NotificationModuleInstance {
  readonly notificationRepository: INotificationRepository;
  readonly preferenceRepository: INotificationPreferenceRepository;
  readonly templateRepository: INotificationTemplateRepository;
  readonly useCases: NotificationModuleUseCases;
  readonly api: NotificationApplicationPort;
  readonly durableRuntime: NotificationDurableRuntimePort;
  start(): void;
  dispose(): void;
}

export function createNotificationUseCases(
  deps: NotificationModuleDependencies,
): NotificationModuleUseCases {
  if (!deps.closureChecker) {
    throw new Error('[FAIL-CLOSED] NotificationModule requires closureChecker dependency');
  }

  const { notificationRepository, preferenceRepository } = deps;

  return {
    createNotification: new CreateNotificationUseCase(
      notificationRepository,
      preferenceRepository,
      deps.closureChecker,
      deps.userTimeContextPort,
    ),
    updateNotification: new UpdateNotificationUseCase(notificationRepository),
    markAsRead: new MarkNotificationAsReadUseCase(notificationRepository),
    getUserNotifications: new GetUserNotificationsUseCase(notificationRepository),
    getUnreadNotifications: new GetUnreadNotificationsUseCase(notificationRepository),
    getNotificationPreference: new GetNotificationPreferenceUseCase(preferenceRepository),
    updateNotificationPreference: new UpdateNotificationPreferenceUseCase(preferenceRepository),
  };
}

function normalizeRuntimeContributions(
  runtimeContributions?:
    | NotificationModuleRuntimeContribution
    | ReadonlyArray<NotificationModuleRuntimeContribution>,
): readonly NotificationModuleRuntimeContribution[] {
  if (!runtimeContributions) {
    return [];
  }

  if (Array.isArray(runtimeContributions)) {
    return Array.from(runtimeContributions);
  }

  return [runtimeContributions as NotificationModuleRuntimeContribution];
}

export function createNotificationModule(
  dependencies: NotificationModuleDependencies,
): NotificationModuleInstance {
  const { notificationRepository, preferenceRepository, templateRepository, durableRuntime } = dependencies;
  const auditRepository = dependencies.auditRepository;
  const runtimeContributions = normalizeRuntimeContributions(dependencies.runtimeContributions);

  if (!dependencies.closureChecker) {
    throw new Error(
      '[FAIL-CLOSED] NotificationModule requires an explicit closureChecker dependency.',
    );
  }

  if (!durableRuntime) {
    throw new Error(
      '[FAIL-CLOSED] NotificationModule requires an explicit durableRuntime dependency providing dead-letter, receipt, and SSE capabilities.',
    );
  }

  const useCases = createNotificationUseCases(dependencies);
  const notificationQueryApplicationService = new NotificationQueryApplicationService(
    notificationRepository,
  );
  const notificationMaintenanceApplicationService = new NotificationMaintenanceApplicationService(
    notificationRepository,
  );
  let started = false;

  const api: NotificationApplicationPort = {
    createNotification: async (data) => {
      return useCases.createNotification.execute(
        data as Parameters<CreateNotificationUseCase['execute']>[0],
      );
    },

    listNotifications: async (query) => {
      return notificationQueryApplicationService.listNotifications(
        query as Parameters<NotificationQueryApplicationService['listNotifications']>[0],
      );
    },

    getNotification: async (id, identityId) => {
      return notificationQueryApplicationService.getNotification(id, identityId);
    },

    updateNotification: async (id, identityId, data) => {
      return useCases.updateNotification.execute(
        id,
        identityId,
        data as Parameters<UpdateNotificationUseCase['execute']>[2],
      );
    },

    deleteNotification: async (id, identityId) => {
      return notificationMaintenanceApplicationService.deleteNotification(id, identityId);
    },

    markAsRead: async (id, identityId) => {
      return useCases.markAsRead.execute(id, identityId);
    },

    markAllAsRead: async (identityId) => {
      return useCases.markAsRead.executeAll(identityId);
    },

    getUnreadCount: async (identityId) => {
      return useCases.getUnreadNotifications.getCount(identityId);
    },

    batchMarkAsRead: async (data, identityId) => {
      if (data.notificationIds?.length) {
        return useCases.markAsRead.executeMany(data.notificationIds, identityId);
      }
      return ok(0);
    },

    batchDelete: async (data, identityId) => {
      if (data.notificationIds?.length) {
        return notificationMaintenanceApplicationService.batchDelete({
          notificationIds: data.notificationIds,
          identityId,
        });
      }
      return ok({ deletedCount: 0 });
    },

    cleanupOldNotifications: async (data) => {
      return notificationMaintenanceApplicationService.cleanupOldNotifications({
        identityId: data.identityId,
        beforeDays: data.beforeDays ?? 30,
        category: data.category as Parameters<
          NotificationMaintenanceApplicationService['cleanupOldNotifications']
        >[0]['category'],
      });
    },

    getPreferences: async (identityId) => {
      // Always materialize a preference row for the identity (residual 196).
      return useCases.getNotificationPreference.executeOrCreate(identityId);
    },

    updatePreferences: async (dto, identityId) => {
      return useCases.updateNotificationPreference.execute(
        identityId,
        dto as Parameters<UpdateNotificationPreferenceUseCase['execute']>[1],
      );
    },

    queryDeadLetters: async (identityId) => {
      const res = await durableRuntime.queryDeadLetters(identityId);
      return ok(res);
    },

    replayDeadLetter: async (operationId, identityId) => {
      try {
        if (!auditRepository) {
          throw new Error(
            '[FAIL-CLOSED] notification replay requires an explicit auditRepository dependency.',
          );
        }
        const res = await durableRuntime.replayDeadLetter({ identityId, operationId }, {
          actorIdentityId: identityId,
          source: 'notification',
          operationId,
          action: 'replay',
        }, auditRepository);
        return ok(res);
      } catch (err) {
        return fail({
          code: 'NOT_FOUND',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },

    getDeliveryReceipts: async (identityId, query) => {
      const res = await durableRuntime.queryReceipts(identityId, query);
      return ok(res);
    },

    getOperationTimeline: async (identityId, query) => {
      if (!auditRepository) {
        throw new Error(
          '[FAIL-CLOSED] notification operation timeline requires an explicit auditRepository dependency (timeline_query audit is mandatory).',
        );
      }
      const { entries } = await runTimelineQueryWithAudit({
        repository: auditRepository,
        source: 'notification',
        actorIdentityId: identityId,
        filters: { status: query?.status ?? null, limit: query?.limit ?? null },
        query: async () => {
          const receipts = await durableRuntime.queryReceipts(identityId, {
            limit: query?.limit,
            status: query?.status,
          });
          return receipts.map((r) => mapReceiptToTimelineEntry(r, 'notification'));
        },
      });
      return ok(entries);
    },

    getOperationAudit: async (identityId, query) => {
      if (!auditRepository) {
        throw new Error(
          '[FAIL-CLOSED] notification operation audit requires an explicit auditRepository dependency.',
        );
      }
      const records: OperationAuditRecord[] = await auditRepository.listByActor({
        identityId,
        source: query?.source,
        operationId: query?.operationId,
        limit: query?.limit,
      });
      return ok(records);
    },

    subscribeSseEvents: (handler: (payload: NotificationSseDeliveryEvent) => void) => {
      const sseAdapter = durableRuntime.getSseAdapter();
      return sseAdapter.subscribe(handler);
    },
  };

  return {
    notificationRepository,
    preferenceRepository,
    templateRepository,
    useCases,
    api,
    durableRuntime,
    start(): void {
      if (started) {
        return;
      }

      const startedContributions: NotificationModuleRuntimeContribution[] = [];
      for (const runtime of runtimeContributions) {
        try {
          runtime.start();
          startedContributions.push(runtime);
        } catch (error) {
          // Partial-start rollback: stop the already-started contributions in
          // REVERSE order (best-effort, logged), then rethrow the ORIGINAL
          // error. `started` stays false, so a later dispose() is a no-op —
          // start() owns its partial-start cleanup.
          for (const startedRuntime of [...startedContributions].reverse()) {
            try {
              startedRuntime.stop();
            } catch (stopError) {
              logger.error(
                'NotificationModule: contribution stop failed during partial-start rollback',
                stopError,
              );
            }
          }
          throw error;
        }
      }

      started = true;
    },
    dispose(): void {
      if (!started) {
        return;
      }

      for (const runtime of [...runtimeContributions].reverse()) {
        runtime.stop();
      }

      started = false;
    },
  };
}
