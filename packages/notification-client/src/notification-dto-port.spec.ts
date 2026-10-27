import { describe, expect, it } from 'vitest';
import { ok, fail } from '@memoflow/transport-contracts';
import { createMockNotification } from '@memoflow/notification-contracts/test-support/notification.mock';
import { createNotificationClientService } from './application-client';
import type { INotificationApiClient } from './application-client/ports/notification-api-client.port';

describe('Notification client DTO port', () => {
  it('returns the transport DTOs without wrapping or dropping fields', async () => {
    const notification = createMockNotification();
    const service = createNotificationClientService({
      findNotificationById: async () => ok(notification),
      markAsRead: async () => ok({ ...notification, isRead: true }),
      getUnreadCount: async () => ok({ count: 3 }),
    } as INotificationApiClient);

    const detail = await service.findNotificationById(notification.id);
    const marked = await service.markAsRead(notification.id);
    const unread = await service.getUnreadCount();

    expect(detail).toEqual(ok(notification));
    expect(detail.ok && detail.data).toBe(notification);
    expect(marked.ok && marked.data.isRead).toBe(true);
    expect(unread.ok && unread.data.count).toBe(3);
  });

  it('preserves the transport failure without constructing a client entity', async () => {
    const failure = fail({ code: 'NOT_FOUND', message: 'Notification missing' });
    const service = createNotificationClientService({
      findNotificationById: async () => failure,
    } as INotificationApiClient);

    expect(await service.findNotificationById('missing')).toBe(failure);
  });
});
