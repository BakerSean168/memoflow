import { unwrap } from '@memoflow/contracts/result';
import type { IAINotificationReadPort } from '@memoflow/ai';
import { projectNotificationAction, projectNotificationInboxPage } from '@memoflow/ai';
import type { NotificationInboxPort } from '@memoflow/notification';
import { z } from 'zod';

const UnreadCountSchema = z.object({ count: z.number().int().nonnegative() });

/** Notification Fact/Inbox adapter. Delivery workers and channel state stay owner-private. */
export class NotificationAIReadAdapter implements IAINotificationReadPort {
  constructor(private readonly inbox: NotificationInboxPort) {}

  async getUnreadSummary(input: Parameters<IAINotificationReadPort['getUnreadSummary']>[0]) {
    const [unreadResult, pageResult] = await Promise.all([
      this.inbox.getUnreadCount(input.identityId),
      this.inbox.listNotifications({
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
  }

  async executeAction(input: Parameters<IAINotificationReadPort['executeAction']>[0]) {
    const result = await this.inbox.executeAction(
      input.notificationId,
      input.actionKey,
      input.context.identityId,
    );
    return projectNotificationAction(unwrap(result));
  }
}
