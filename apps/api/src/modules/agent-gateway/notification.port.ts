import { z } from 'zod';
import {
  GatewayFailureCodeSchema,
  GatewayReadError,
  NotificationMarkReadInputSchema,
  NotificationMarkReadOutputSchema,
  projectNotificationFact,
  type GatewayWritePort,
  type NotificationReadPort,
} from '@memoflow/agent-gateway';
import type { NotificationInboxPort } from '@memoflow/notification';
import type { Result } from '@memoflow/transport-contracts/result';

/** Owner page envelope; only these fields are read from `Result<unknown>`. */
const OwnerNotificationPageSchema = z.object({
  notifications: z.array(z.unknown()),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  hasMore: z.boolean(),
});
const OwnerUnreadCountSchema = z.object({ count: z.number().int().nonnegative() });

/** Owner failures become stable gateway codes; unknown codes fail closed. */
function unwrapOwner(result: Result<unknown>): unknown {
  if (!result.ok) {
    const code = GatewayFailureCodeSchema.safeParse(result.error.code);
    throw new GatewayReadError(code.success ? code.data : 'INTERNAL_ERROR');
  }
  return result.data;
}

/**
 * Binds the Notification owner's application port to the gateway read seam.
 * Ownership comes from the ExecutionContext only; the caller never supplies an
 * identity, so another owner's notifications cannot be reached.
 */
export function bindNotificationReadPort(inbox: NotificationInboxPort): NotificationReadPort {
  return {
    async getNotification(id, context) {
      const result = await inbox.getNotification(id, context.identityId);
      if (!result.ok || !result.data) return null;
      return projectNotificationFact(result.data);
    },
    async listNotifications(query, context) {
      const page = OwnerNotificationPageSchema.parse(
        unwrapOwner(await inbox.listNotifications({ ...query, identityId: context.identityId })),
      );
      return {
        items: page.notifications.map(projectNotificationFact),
        total: page.total,
        page: page.page,
        pageSize: page.pageSize,
        hasMore: page.hasMore,
      };
    },
    async getUnreadCount(context) {
      return OwnerUnreadCountSchema.parse(
        unwrapOwner(await inbox.getUnreadCount(context.identityId)),
      ).count;
    },
  };
}

/**
 * Binds `notification_mark_read`. The write authority revalidates the credential
 * immediately before the owner call; the receipt is the minimal state projection.
 */
export function bindNotificationMarkRead(
  inbox: NotificationInboxPort,
): NonNullable<GatewayWritePort['notificationMarkRead']> {
  return async (input, context, authority) => {
    const { id } = NotificationMarkReadInputSchema.parse(input);
    if (!authority.scopes.includes('notifications:write')) throw new GatewayReadError('FORBIDDEN');
    await authority.authorize();
    const fact = projectNotificationFact(
      unwrapOwner(await inbox.markAsRead(id, context.identityId)),
    );
    return NotificationMarkReadOutputSchema.parse({
      id: fact.id,
      isRead: fact.isRead,
      readAt: fact.readAt,
      version: fact.version,
      updatedAt: fact.updatedAt,
    });
  };
}
