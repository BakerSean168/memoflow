import { describe, expect, it, vi } from 'vitest';
import { NotificationAIReadAdapter } from './notification-read.adapter';

describe('NotificationAIReadAdapter', () => {
  it('projects unread Notification Facts only', async () => {
    const repository = {
      countUnread: vi.fn(async () => 2),
      findUnread: vi.fn(async () => [
        {
          id: 'notification-1',
          title: 'Task due',
          content: 'Write draft',
          category: 'task',
          importance: 'Moderate',
          createdAt: new Date(1_000),
        },
      ]),
    };
    const adapter = new NotificationAIReadAdapter(repository as never);
    await expect(adapter.getUnreadSummary({ identityId: 'identity-1', limit: 5 })).resolves.toEqual({
      unreadCount: 2,
      items: [{
        id: 'notification-1',
        title: 'Task due',
        content: 'Write draft',
        category: 'task',
        importance: 'Moderate',
        createdAt: 1_000,
      }],
    });
    expect(repository.countUnread).toHaveBeenCalledWith('identity-1');
    expect(repository.findUnread).toHaveBeenCalledWith('identity-1', { limit: 5 });
  });
});
