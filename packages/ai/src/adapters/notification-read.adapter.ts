import type { IAINotificationReadPort } from '../server/application/ports/notification-read.port';
import {
  projectNotificationAction,
  projectNotificationInboxPage,
} from '../server/application/services/notification-owner-projection';
import type { Result } from '@memoflow/transport-contracts/result';
import { unwrap } from '@memoflow/transport-contracts/result';
import { z } from 'zod';

const UnreadCountSchema = z.object({ count: z.number().int().nonnegative() });

/**
 * Notification owner capabilities the adapter calls.
 *
 * Delivery workers and channel state stay owner-private; AI only needs the
 * inbox facts and the typed action seam.
 */
export interface NotificationReadAdapterDeps {
  getUnreadCount(identityId: string): Promise<Result<unknown>>;
  listNotifications(query: unknown): Promise<Result<unknown>>;
  executeAction(
    notificationId: string,
    actionKey: string,
    identityId: string,
  ): Promise<Result<unknown>>;
}

/** Canonical Notification Fact/Inbox adapter. */
export function createNotificationReadAdapter(
  deps: NotificationReadAdapterDeps,
): IAINotificationReadPort {
  return {
    async getUnreadSummary(input) {
      const [unreadResult, pageResult] = await Promise.all([
        deps.getUnreadCount(input.identityId),
        deps.listNotifications({
          identityId: input.identityId,
          isRead: false,
          archiveState: 'active',
          page: 1,
          limit: input.limit ?? 10,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        }),
      ]);
      const unreadCount = UnreadCountSchema.parse(unwrap(unreadResult)).count;
      return {
        unreadCount,
        items: projectNotificationInboxPage(unwrap(pageResult)),
      };
    },

    async executeAction(input) {
      const result = await deps.executeAction(
        input.notificationId,
        input.actionKey,
        input.context.identityId,
      );
      return projectNotificationAction(unwrap(result));
    },
  };
}
