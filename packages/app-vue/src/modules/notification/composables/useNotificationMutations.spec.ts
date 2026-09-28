import { describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/contracts/result';
import type { NotificationClientDTO } from '@memoflow/contracts/notification';
import { notificationQueryKeys } from '../../../platform/server-state/query-keys';
import { mountNotificationComposable } from './notificationQueryTestUtils';
import { useNotificationMutations } from './useNotificationMutations';

const SCOPE = 'identity-1';

function createNotification(overrides: Partial<NotificationClientDTO> = {}): NotificationClientDTO {
  return {
    id: 'n-1' as NotificationClientDTO['id'],
    identityId: SCOPE as NotificationClientDTO['identityId'],
    title: 'Hi',
    content: 'Body',
    type: 'Info',
    category: 'System',
    importance: 'Moderate',
    isRead: false,
    readAt: null,
    status: 'Delivered',
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...overrides,
  } as NotificationClientDTO;
}

function makeService(overrides: Record<string, ReturnType<typeof vi.fn>> = {}) {
  return {
    findNotifications: vi.fn(),
    getUnreadCount: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    deleteNotification: vi.fn(),
    batchDeleteNotifications: vi.fn(),
    executeAction: vi.fn(),
    ...overrides,
  };
}

describe('useNotificationMutations (plan §3.4 server-confirmed patch / invalidate)', () => {
  it('markAsRead success patches cached list + detail and decrements unread only when the item was unread', async () => {
    const item = createNotification();
    const readItem = createNotification({ isRead: true, readAt: 2 });
    const service = makeService({ markAsRead: vi.fn().mockResolvedValue(ok(readItem)) });
    const { api, runtime } = mountNotificationComposable(() => useNotificationMutations(), {
      service,
    });

    const listKey = notificationQueryKeys.list(SCOPE, { page: 1, limit: 20 });
    runtime.queryClient.setQueryData(listKey, {
      notifications: [item],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });
    runtime.queryClient.setQueryData(notificationQueryKeys.unread(SCOPE), { count: 1 });
    const invalidate = vi.spyOn(runtime.dispatcher, 'invalidate');

    await api.markAsRead.mutateAsync(item.id);

    const cached = runtime.queryClient.getQueryData(listKey) as {
      notifications: NotificationClientDTO[];
    };
    expect(cached.notifications[0].isRead).toBe(true);
    expect(runtime.queryClient.getQueryData(notificationQueryKeys.detail(SCOPE, item.id))).toEqual(
      readItem,
    );
    expect(runtime.queryClient.getQueryData(notificationQueryKeys.unread(SCOPE))).toEqual({
      count: 0,
    });
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'notification',
        identityScope: SCOPE,
        source: 'mutation',
        entityId: item.id,
      }),
    );
  });

  it('markAsRead does not decrement the count when the cached item was already read', async () => {
    const readItem = createNotification({ isRead: true, readAt: 2 });
    const service = makeService({ markAsRead: vi.fn().mockResolvedValue(ok(readItem)) });
    const { api, runtime } = mountNotificationComposable(() => useNotificationMutations(), {
      service,
    });

    const listKey = notificationQueryKeys.list(SCOPE, { page: 1, limit: 20 });
    runtime.queryClient.setQueryData(listKey, {
      notifications: [readItem],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });
    runtime.queryClient.setQueryData(notificationQueryKeys.unread(SCOPE), { count: 0 });

    await api.markAsRead.mutateAsync(readItem.id);

    expect(runtime.queryClient.getQueryData(notificationQueryKeys.unread(SCOPE))).toEqual({
      count: 0,
    });
  });

  it('markAsRead failure leaves the cache untouched but still dispatches an invalidation', async () => {
    const item = createNotification();
    const service = makeService({
      markAsRead: vi.fn().mockResolvedValue(fail({ code: 'VALIDATION_ERROR', message: 'nope' })),
    });
    const { api, runtime } = mountNotificationComposable(() => useNotificationMutations(), {
      service,
    });

    const listKey = notificationQueryKeys.list(SCOPE, { page: 1, limit: 20 });
    runtime.queryClient.setQueryData(listKey, {
      notifications: [item],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });
    runtime.queryClient.setQueryData(notificationQueryKeys.unread(SCOPE), { count: 1 });
    const invalidate = vi.spyOn(runtime.dispatcher, 'invalidate');

    await expect(api.markAsRead.mutateAsync(item.id)).rejects.toBeTruthy();

    const cached = runtime.queryClient.getQueryData(listKey) as {
      notifications: NotificationClientDTO[];
    };
    expect(cached.notifications[0].isRead).toBe(false);
    expect(runtime.queryClient.getQueryData(notificationQueryKeys.unread(SCOPE))).toEqual({
      count: 1,
    });
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'notification', source: 'mutation', entityId: item.id }),
    );
  });

  it('dismiss success removes the item from lists + detail and adjusts the count only when unread', async () => {
    const item = createNotification();
    const service = makeService({ deleteNotification: vi.fn().mockResolvedValue(ok(null)) });
    const { api, runtime } = mountNotificationComposable(() => useNotificationMutations(), {
      service,
    });

    const listKey = notificationQueryKeys.list(SCOPE, { page: 1, limit: 20 });
    runtime.queryClient.setQueryData(listKey, {
      notifications: [item],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });
    runtime.queryClient.setQueryData(notificationQueryKeys.detail(SCOPE, item.id), item);
    runtime.queryClient.setQueryData(notificationQueryKeys.unread(SCOPE), { count: 2 });
    const invalidate = vi.spyOn(runtime.dispatcher, 'invalidate');

    await api.dismiss.mutateAsync(item.id);

    const cached = runtime.queryClient.getQueryData(listKey) as {
      notifications: NotificationClientDTO[];
    };
    expect(cached.notifications).toHaveLength(0);
    expect(
      runtime.queryClient.getQueryData(notificationQueryKeys.detail(SCOPE, item.id)),
    ).toBeUndefined();
    expect(runtime.queryClient.getQueryData(notificationQueryKeys.unread(SCOPE))).toEqual({
      count: 1,
    });
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'notification', source: 'mutation', entityId: item.id }),
    );
  });

  it('markAllAsRead success invalidates the notification identity root (no optimistic patch)', async () => {
    const service = makeService({ markAllAsRead: vi.fn().mockResolvedValue(ok({ count: 2 })) });
    const { api, runtime } = mountNotificationComposable(() => useNotificationMutations(), {
      service,
    });
    const invalidate = vi.spyOn(runtime.dispatcher, 'invalidate');

    await api.markAllAsRead.mutateAsync();

    expect(invalidate).toHaveBeenCalledWith({
      target: 'notification',
      identityScope: SCOPE,
      source: 'mutation',
    });
  });

  it('executes a typed notification action through the client port and invalidates the fact', async () => {
    const service = makeService({
      executeAction: vi.fn().mockResolvedValue(
        ok({
          interaction: {
            id: 'interaction-1',
            idempotencyKey: 'notification:n-1:action:complete',
            identityId: SCOPE,
            notificationId: 'n-1',
            actionKey: 'complete',
            actionKind: 'owner-command',
            occurredAt: 10,
            commandReceiptId: 'routine-interaction-1',
            outcome: 'accepted',
          },
          action: {
            kind: 'owner-command',
            actionKey: 'complete',
            labelKey: 'routine.action.complete',
            owner: { type: 'routine-occurrence', id: 'occurrence-1' },
            commandKey: 'routine.complete',
            input: { routineId: 'routine-1', occurrenceKey: 'occurrence-1' },
          },
        }),
      ),
    });
    const { api, runtime } = mountNotificationComposable(() => useNotificationMutations(), {
      service,
    });
    const invalidate = vi.spyOn(runtime.dispatcher, 'invalidate');

    const result = await api.executeAction.mutateAsync({
      notificationId: 'n-1',
      actionKey: 'complete',
    });

    expect(result.interaction.outcome).toBe('accepted');
    expect(service.executeAction).toHaveBeenCalledWith({
      notificationId: 'n-1',
      actionKey: 'complete',
    });
    expect(invalidate).toHaveBeenCalledWith({
      target: 'notification',
      identityScope: SCOPE,
      source: 'mutation',
      entityId: 'n-1',
    });
  });

  it('dismissAll is a no-op for an empty selection and invalidates on success', async () => {
    const service = makeService({
      batchDeleteNotifications: vi.fn().mockResolvedValue(ok({ deleted: 2, failed: [] })),
    });
    const { api, runtime } = mountNotificationComposable(() => useNotificationMutations(), {
      service,
    });
    const invalidate = vi.spyOn(runtime.dispatcher, 'invalidate');

    await api.dismissAll.mutateAsync([]);
    expect(service.batchDeleteNotifications).not.toHaveBeenCalled();

    await api.dismissAll.mutateAsync(['n-1', 'n-2']);
    expect(service.batchDeleteNotifications).toHaveBeenCalledWith(['n-1', 'n-2']);
    expect(invalidate).toHaveBeenLastCalledWith({
      target: 'notification',
      identityScope: SCOPE,
      source: 'mutation',
    });
  });

  it('resolves identityScope at mutation begin and never at completion (P1-2)', async () => {
    const item = createNotification();
    const readItem = createNotification({ isRead: true, readAt: 2 });
    const service = makeService({ markAsRead: vi.fn().mockResolvedValue(ok(readItem)) });
    const { api, runtime } = mountNotificationComposable(() => useNotificationMutations(), {
      service,
    });

    const listKey = notificationQueryKeys.list(SCOPE, { page: 1, limit: 20 });
    runtime.queryClient.setQueryData(listKey, {
      notifications: [item],
      total: 1,
      page: 1,
      pageSize: 20,
      hasMore: false,
    });
    runtime.queryClient.setQueryData(notificationQueryKeys.unread(SCOPE), { count: 1 });
    const invalidate = vi.spyOn(runtime.dispatcher, 'invalidate');

    await api.markAsRead.mutateAsync(item.id);

    // Patch + invalidate both went to the begin-scope identity.
    const cached = runtime.queryClient.getQueryData(listKey) as {
      notifications: NotificationClientDTO[];
    };
    expect(cached.notifications[0].isRead).toBe(true);
    expect(invalidate).toHaveBeenCalledWith(
      expect.objectContaining({ identityScope: SCOPE, target: 'notification' }),
    );
  });
});
