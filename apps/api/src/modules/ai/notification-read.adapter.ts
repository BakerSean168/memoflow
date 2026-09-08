import type { IAINotificationReadPort } from '@memoflow/ai';
import type { INotificationRepository } from '@memoflow/notification';

/** Notification Fact reader. Delivery workers/channels remain behind Notification ownership. */
export class NotificationAIReadAdapter implements IAINotificationReadPort {
  constructor(private readonly repository: INotificationRepository) {}

  async getUnreadSummary(input: Parameters<IAINotificationReadPort['getUnreadSummary']>[0]) {
    const [unreadCount, notifications] = await Promise.all([
      this.repository.countUnread(input.identityId),
      this.repository.findUnread(input.identityId, { limit: input.limit ?? 10 }),
    ]);
    return {
      unreadCount,
      items: notifications.map((notification) => ({
        id: String(notification.id),
        title: notification.title,
        content: notification.content,
        category: String(notification.category),
        importance: String(notification.importance),
        createdAt: notification.createdAt.getTime(),
      })),
    };
  }
}
