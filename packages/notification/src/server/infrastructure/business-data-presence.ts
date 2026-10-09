import type { Prisma } from '@memoflow/database';

/** Notification-owned existence check, including archived facts; never reads content or initializes defaults. */
export function createNotificationBusinessDataPresence(
  db: Pick<Prisma.TransactionClient, 'notification' | 'notificationInteraction'>,
): (identityId: string) => Promise<boolean> {
  return async (identityId) => {
    if (await db.notification.findFirst({ where: { identityId }, select: { id: true } }))
      return true;
    if (await db.notificationInteraction.findFirst({ where: { identityId }, select: { id: true } }))
      return true;
    return false;
  };
}
