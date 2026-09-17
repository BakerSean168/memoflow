/** Explicit notification server composition root. */
import type {
  INotificationInteractionRepository,
  INotificationPreferenceRepository,
  INotificationRepository,
} from '../domain/repositories';
import {
  CreateNotificationUseCase,
  ExecuteNotificationActionUseCase,
  GetNotificationPreferenceUseCase,
  GetUnreadNotificationsUseCase,
  GetUserNotificationsUseCase,
  MarkNotificationAsReadUseCase,
  NotificationMaintenanceApplicationService,
  NotificationOwnerCommandRegistry,
  NotificationQueryApplicationService,
  UpdateNotificationPreferenceUseCase,
  createNotificationDeliveryPreferencePortableCapability,
  type NotificationDeliveryPreferencePortableCapability,
  type NotificationInboxPort,
  type NotificationOperationsPort,
  type NotificationSseDeliveryEvent,
} from '../application';
import { fail, ok } from '@memoflow/contracts/result';
import type { NotificationDurableRuntimePort } from './runtime/notification.runtime';
import { mapReceiptToTimelineEntry, runTimelineQueryWithAudit } from '@memoflow/patterns/operations';
import type {
  OperationAuditRecord,
  OperationAuditRepository,
} from '@memoflow/patterns/operations';
import { createLogger } from '@memoflow/utils/logger';
import type { UserTimeContextPort } from '@memoflow/time';

const logger = createLogger('NotificationModule');

export interface NotificationModuleRuntimeContribution {
  start(): void;
  stop(): void;
}

export type NotificationRuntimeContributionsInput =
  NotificationModuleRuntimeContribution | readonly NotificationModuleRuntimeContribution[];

export interface NotificationModuleDependencies {
  readonly notificationRepository: INotificationRepository;
  readonly preferenceRepository: INotificationPreferenceRepository;
  readonly interactionRepository: INotificationInteractionRepository;
  readonly closureChecker: (identityId: string) => Promise<boolean>;
  readonly userTimeContextPort: UserTimeContextPort;
  readonly runtimeContributions?: NotificationRuntimeContributionsInput;
  readonly durableRuntime: NotificationDurableRuntimePort;
  readonly auditRepository?: OperationAuditRepository;
  readonly ownerCommandRegistry?: NotificationOwnerCommandRegistry;
}

export interface NotificationModuleUseCases {
  readonly createNotification: CreateNotificationUseCase;
  readonly markAsRead: MarkNotificationAsReadUseCase;
  readonly getUserNotifications: GetUserNotificationsUseCase;
  readonly getUnreadNotifications: GetUnreadNotificationsUseCase;
  readonly getNotificationPreference: GetNotificationPreferenceUseCase;
  readonly updateNotificationPreference: UpdateNotificationPreferenceUseCase;
  readonly executeNotificationAction: ExecuteNotificationActionUseCase;
}

export interface NotificationModuleInstance {
  readonly notificationRepository: INotificationRepository;
  readonly preferenceRepository: INotificationPreferenceRepository;
  readonly interactionRepository: INotificationInteractionRepository;
  readonly portableCapability: NotificationDeliveryPreferencePortableCapability;
  readonly ownerCommandRegistry: NotificationOwnerCommandRegistry;
  readonly useCases: NotificationModuleUseCases;
  /** Product/Inbox capability only. */
  readonly api: NotificationInboxPort;
  /** Internal/admin diagnostics and replay capability. */
  readonly operations: NotificationOperationsPort;
  readonly durableRuntime: NotificationDurableRuntimePort;
  start(): void;
  dispose(): void;
}

export function createNotificationUseCases(
  deps: NotificationModuleDependencies,
  ownerCommandRegistry: NotificationOwnerCommandRegistry,
): NotificationModuleUseCases {
  if (!deps.closureChecker) {
    throw new Error('[FAIL-CLOSED] NotificationModule requires closureChecker dependency');
  }

  const { notificationRepository, preferenceRepository, interactionRepository } = deps;

  return {
    createNotification: new CreateNotificationUseCase(
      notificationRepository,
      preferenceRepository,
      deps.closureChecker,
      deps.userTimeContextPort,
    ),
    markAsRead: new MarkNotificationAsReadUseCase(notificationRepository),
    getUserNotifications: new GetUserNotificationsUseCase(notificationRepository),
    getUnreadNotifications: new GetUnreadNotificationsUseCase(notificationRepository),
    getNotificationPreference: new GetNotificationPreferenceUseCase(preferenceRepository),
    updateNotificationPreference: new UpdateNotificationPreferenceUseCase(preferenceRepository),
    executeNotificationAction: new ExecuteNotificationActionUseCase(
      notificationRepository,
      interactionRepository,
      ownerCommandRegistry,
    ),
  };
}

function normalizeRuntimeContributions(
  runtimeContributions?:
    NotificationModuleRuntimeContribution | ReadonlyArray<NotificationModuleRuntimeContribution>,
): readonly NotificationModuleRuntimeContribution[] {
  if (!runtimeContributions) return [];
  if (Array.isArray(runtimeContributions)) return Array.from(runtimeContributions);
  return [runtimeContributions as NotificationModuleRuntimeContribution];
}

export function createNotificationModule(
  dependencies: NotificationModuleDependencies,
): NotificationModuleInstance {
  const {
    notificationRepository,
    preferenceRepository,
    interactionRepository,
    durableRuntime,
  } = dependencies;
  const auditRepository = dependencies.auditRepository;
  const runtimeContributions = normalizeRuntimeContributions(dependencies.runtimeContributions);

  if (!dependencies.closureChecker) {
    throw new Error('[FAIL-CLOSED] NotificationModule requires an explicit closureChecker dependency.');
  }
  if (!interactionRepository) {
    throw new Error('[FAIL-CLOSED] NotificationModule requires an interactionRepository dependency.');
  }
  if (!durableRuntime) {
    throw new Error('[FAIL-CLOSED] NotificationModule requires an explicit durableRuntime dependency.');
  }

  const ownerCommandRegistry =
    dependencies.ownerCommandRegistry ?? new NotificationOwnerCommandRegistry();
  const useCases = createNotificationUseCases(dependencies, ownerCommandRegistry);
  const portableCapability =
    createNotificationDeliveryPreferencePortableCapability(preferenceRepository);
  const notificationQueryApplicationService = new NotificationQueryApplicationService(
    notificationRepository,
  );
  const notificationMaintenanceApplicationService = new NotificationMaintenanceApplicationService(
    notificationRepository,
  );
  let started = false;

  const api: NotificationInboxPort = {
    createNotification: async (data) => useCases.createNotification.execute(
      data as Parameters<CreateNotificationUseCase['execute']>[0],
    ),
    listNotifications: async (query) => notificationQueryApplicationService.listNotifications(
      query as Parameters<NotificationQueryApplicationService['listNotifications']>[0],
    ),
    getNotification: async (id, identityId) =>
      notificationQueryApplicationService.getNotification(id, identityId),
    deleteNotification: async (id, identityId) =>
      notificationMaintenanceApplicationService.deleteNotification(id, identityId),
    markAsRead: async (id, identityId) => useCases.markAsRead.execute(id, identityId),
    markAsUnread: async (id, identityId) =>
      notificationMaintenanceApplicationService.markAsUnread(id, identityId),
    archive: async (id, identityId) =>
      notificationMaintenanceApplicationService.archive(id, identityId),
    restore: async (id, identityId) =>
      notificationMaintenanceApplicationService.restore(id, identityId),
    markAllAsRead: async (identityId) => useCases.markAsRead.executeAll(identityId),
    getUnreadCount: async (identityId) => useCases.getUnreadNotifications.getCount(identityId),
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
    cleanupOldNotifications: async (data) =>
      notificationMaintenanceApplicationService.cleanupOldNotifications({
        identityId: data.identityId,
        beforeDays: data.beforeDays ?? 30,
        category: data.category as Parameters<
          NotificationMaintenanceApplicationService['cleanupOldNotifications']
        >[0]['category'],
      }),
    getPreferences: async (identityId) =>
      useCases.getNotificationPreference.executeOrCreate(identityId),
    updatePreferences: async (dto, identityId) => useCases.updateNotificationPreference.execute(
      identityId,
      dto as Parameters<UpdateNotificationPreferenceUseCase['execute']>[1],
    ),
    executeAction: async (notificationId, actionKey, identityId) =>
      useCases.executeNotificationAction.execute({ identityId, notificationId, actionKey }),
    subscribeSseEvents: (handler: (payload: NotificationSseDeliveryEvent) => void) =>
      durableRuntime.getSseAdapter().subscribe(handler),
  };

  const operations: NotificationOperationsPort = {
    queryDeadLetters: async (identityId) => ok(await durableRuntime.queryDeadLetters(identityId)),
    replayDeadLetter: async (operationId, identityId) => {
      try {
        if (!auditRepository) {
          throw new Error('[FAIL-CLOSED] notification replay requires an explicit auditRepository dependency.');
        }
        const res = await durableRuntime.replayDeadLetter(
          { identityId, operationId },
          {
            actorIdentityId: identityId,
            source: 'notification',
            operationId,
            action: 'replay',
          },
          auditRepository,
        );
        return ok(res);
      } catch (err) {
        return fail({
          code: 'NOT_FOUND',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
    getDeliveryReceipts: async (identityId, query) =>
      ok(await durableRuntime.queryReceipts(identityId, query)),
    getOperationTimeline: async (identityId, query) => {
      if (!auditRepository) {
        throw new Error('[FAIL-CLOSED] notification operation timeline requires an explicit auditRepository dependency.');
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
        throw new Error('[FAIL-CLOSED] notification operation audit requires an explicit auditRepository dependency.');
      }
      const records: OperationAuditRecord[] = await auditRepository.listByActor({
        identityId,
        source: query?.source,
        operationId: query?.operationId,
        limit: query?.limit,
      });
      return ok(records);
    },
  };

  return {
    notificationRepository,
    preferenceRepository,
    interactionRepository,
    portableCapability,
    ownerCommandRegistry,
    useCases,
    api,
    operations,
    durableRuntime,
    start(): void {
      if (started) return;
      const startedContributions: NotificationModuleRuntimeContribution[] = [];
      for (const runtime of runtimeContributions) {
        try {
          runtime.start();
          startedContributions.push(runtime);
        } catch (error) {
          for (const startedRuntime of [...startedContributions].reverse()) {
            try {
              startedRuntime.stop();
            } catch (stopError) {
              logger.error('NotificationModule: contribution stop failed during partial-start rollback', stopError);
            }
          }
          throw error;
        }
      }
      started = true;
    },
    dispose(): void {
      if (!started) return;
      for (const runtime of [...runtimeContributions].reverse()) runtime.stop();
      started = false;
    },
  };
}
