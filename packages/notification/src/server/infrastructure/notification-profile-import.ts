import type { IElectronDatabase } from '@memoflow/contracts/electron';
import { createNotificationPowerSyncRepositories } from './powersync';
import type { Prisma } from '@memoflow/database';
import { createNotificationPortableCapability } from '../application/notification-portability';
import { createNotificationDeliveryPreferencePortableCapability } from '../application/notification-preference-portability';
import { NotificationPrismaRepository } from './adapters/prisma/notification-prisma.repository';
import { NotificationPreferencePrismaRepository } from './adapters/prisma/notification-preference-prisma.repository';
import { NotificationInteractionPrismaRepository } from './adapters/prisma/notification-interaction-prisma.repository';

export function createNotificationPrismaPortability(tx: Prisma.TransactionClient) {
  return {
    portableFactCapability: createNotificationPortableCapability(
      new NotificationPrismaRepository(tx),
      new NotificationInteractionPrismaRepository(tx),
    ),
    portableCapability: createNotificationDeliveryPreferencePortableCapability(
      new NotificationPreferencePrismaRepository(tx),
    ),
  };
}

export function createNotificationPowerSyncPortability(db: IElectronDatabase) {
  const repos = createNotificationPowerSyncRepositories(db);
  return {
    portableFactCapability: createNotificationPortableCapability(
      repos.notificationRepository,
      repos.notificationInteractionRepository,
    ),
    portableCapability: createNotificationDeliveryPreferencePortableCapability(
      repos.notificationPreferenceRepository,
    ),
  };
}
