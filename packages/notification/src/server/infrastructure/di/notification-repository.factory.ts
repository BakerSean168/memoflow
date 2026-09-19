/**
 * Notification Repository Factory
 * Provides repository implementations for different data sources
 */

import type { PrismaClient } from '@memoflow/database';
import type { IElectronDatabase } from '@memoflow/contracts/electron';

import {
  NotificationPrismaRepository,
  NotificationPreferencePrismaRepository,
} from '../adapters/prisma';

import {
  PowerSyncNotificationRepository,
  PowerSyncNotificationPreferenceRepository,
} from '../adapters/powersync';

/**
 * Notification Repository Factory
 */
export class NotificationRepositoryFactory {
  /**
   * Create repositories using Prisma (for API/PostgreSQL)
   */
  static createPrismaRepositories(prisma: PrismaClient) {
    return {
      notificationRepository: new NotificationPrismaRepository(prisma),
      notificationPreferenceRepository: new NotificationPreferencePrismaRepository(prisma),
    };
  }

  /**
   * Create repositories using PowerSync database contract (Desktop)
   */
  static createPowerSyncRepositories(db: IElectronDatabase) {
    return {
      notificationRepository: new PowerSyncNotificationRepository(db),
      notificationPreferenceRepository: new PowerSyncNotificationPreferenceRepository(db),
    };
  }

  /**
   * Create repositories based on data source type.
   * Overloads provide correct narrowing so no cast is needed at call sites.
   */
  static create(dataSource: 'prisma', client: PrismaClient): ReturnType<typeof NotificationRepositoryFactory.createPrismaRepositories>;
  static create(dataSource: 'powersync', client: IElectronDatabase): ReturnType<typeof NotificationRepositoryFactory.createPowerSyncRepositories>;
  static create(...args: ['prisma', PrismaClient] | ['powersync', IElectronDatabase]) {
    const [dataSource, client] = args;
    if (dataSource === 'prisma') {
      return this.createPrismaRepositories(client);
    }
    return this.createPowerSyncRepositories(client);
  }
}
