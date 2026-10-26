import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/contracts/result';
import type { NotificationClientDTO } from '@memoflow/notification-contracts';
import { createServerStateRuntime } from '@notification-ui-test-host/platform/server-state';
import { useNotificationStore } from '../stores/notification-store';
import { mountNotificationComposable } from '../test-support/notificationQueryTestUtils';
import { useNotificationListQuery } from './useNotificationListQuery';

function createNotification(overrides: Partial<NotificationClientDTO> = {}): NotificationClientDTO {
  return {
    id: 'n-1' as NotificationClientDTO['id'],
    identityId: 'identity-1' as NotificationClientDTO['identityId'],
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

function listResponse(items: NotificationClientDTO[], total = items.length) {
  return { notifications: items, total, page: 1, pageSize: 20, hasMore: false };
}

function makeService(findNotifications = vi.fn()) {
  return {
    findNotifications,
    getUnreadCount: vi.fn().mockResolvedValue(ok({ count: 0 })),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    deleteNotification: vi.fn(),
    batchDeleteNotifications: vi.fn(),
  };
}

describe('useNotificationListQuery (Query Cache authority pilot)', () => {
  beforeEach(() => {
    useNotificationStore().$reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dedupes concurrent consumers of the same list key into one request', async () => {
    const service = makeService(
      vi.fn().mockResolvedValue(ok(listResponse([createNotification()]))),
    );
    const { api: first, runtime } = mountNotificationComposable(() => useNotificationListQuery(), {
      service,
    });
    const { api: second } = mountNotificationComposable(() => useNotificationListQuery(), {
      service,
      runtime,
    });

    await vi.waitFor(() => expect(first.isLoading.value).toBe(false));
    await vi.waitFor(() => expect(second.isLoading.value).toBe(false));

    expect(service.findNotifications).toHaveBeenCalledTimes(1);
    expect(first.notifications.value).toHaveLength(1);
    expect(second.notifications.value).toHaveLength(1);
    expect(useNotificationStore().pagination).not.toHaveProperty('total');
  });

  it('keeps different list params (page vs capsule limit) on isolated keys', async () => {
    const service = makeService(
      vi.fn().mockResolvedValue(ok(listResponse([createNotification()]))),
    );
    const { api: page, runtime } = mountNotificationComposable(() => useNotificationListQuery(), {
      service,
    });
    const { api: capsule } = mountNotificationComposable(
      () => useNotificationListQuery({ page: 1, limit: 10 }),
      { service, runtime },
    );

    await vi.waitFor(() => expect(page.isLoading.value).toBe(false));
    await vi.waitFor(() => expect(capsule.isLoading.value).toBe(false));

    expect(service.findNotifications).toHaveBeenCalledTimes(2);
    expect(service.findNotifications).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(service.findNotifications).toHaveBeenCalledWith({ page: 1, limit: 10 });
  });

  it('does not refetch within the 30s stale window on remount (unread + list cached)', async () => {
    vi.useFakeTimers();
    const service = makeService(
      vi.fn().mockResolvedValue(ok(listResponse([createNotification()]))),
    );
    const runtime = createServerStateRuntime('web');

    const first = mountNotificationComposable(() => useNotificationListQuery(), {
      service,
      runtime,
    });
    await vi.waitFor(() => expect(first.api.isLoading.value).toBe(false));
    expect(service.findNotifications).toHaveBeenCalledTimes(1);

    // Remount within the 30s window → fresh cache, no refetch.
    const second = mountNotificationComposable(() => useNotificationListQuery(), {
      service,
      runtime,
    });
    await vi.waitFor(() => expect(second.api.isLoading.value).toBe(false));
    expect(service.findNotifications).toHaveBeenCalledTimes(1);

    // Past the 30s stale window → stale remount refetches once.
    await vi.advanceTimersByTimeAsync(31_000);
    const third = mountNotificationComposable(() => useNotificationListQuery(), {
      service,
      runtime,
    });
    await vi.waitFor(() => expect(third.api.isLoading.value).toBe(false));
    expect(service.findNotifications).toHaveBeenCalledTimes(2);
  });

  it('isolates caches by identity scope', async () => {
    const service = makeService(
      vi.fn().mockResolvedValue(ok(listResponse([createNotification()]))),
    );
    const { api: a, runtime } = mountNotificationComposable(() => useNotificationListQuery(), {
      service,
      identityScope: 'identity-a',
    });
    const { api: b } = mountNotificationComposable(() => useNotificationListQuery(), {
      service,
      runtime,
      identityScope: 'identity-b',
    });

    await vi.waitFor(() => expect(a.isLoading.value).toBe(false));
    await vi.waitFor(() => expect(b.isLoading.value).toBe(false));

    expect(service.findNotifications).toHaveBeenCalledTimes(2);
  });

  it('enters query error and keeps previous data when a refetch fails', async () => {
    const findNotifications = vi
      .fn()
      .mockResolvedValueOnce(ok(listResponse([createNotification()])))
      .mockResolvedValueOnce(fail({ code: 'VALIDATION_ERROR', message: 'Backend failure' }));
    const service = makeService(findNotifications);
    const { api } = mountNotificationComposable(() => useNotificationListQuery(), {
      service,
    });

    await vi.waitFor(() => expect(api.isLoading.value).toBe(false));
    expect(api.notifications.value).toHaveLength(1);

    await api.refetch();
    await vi.waitFor(() => expect(api.error.value).toBeTruthy());

    // Previous successful data is preserved on refetch error (plan §3.5); the
    // background refetch failure surfaces through the translated error field.
    expect(api.notifications.value).toHaveLength(1);
    expect(api.error.value).toBe('Please check your input');
  });

  it('tracks page through the Pinia UI state and refetches on page change', async () => {
    const service = makeService(
      vi.fn().mockResolvedValue(ok(listResponse([createNotification()]))),
    );
    const { api } = mountNotificationComposable(() => useNotificationListQuery(), {
      service,
    });

    await vi.waitFor(() => expect(api.isLoading.value).toBe(false));
    expect(service.findNotifications).toHaveBeenCalledWith({ page: 1, limit: 20 });

    useNotificationStore().setPage(2);
    await vi.waitFor(() =>
      expect(service.findNotifications).toHaveBeenCalledWith({ page: 2, limit: 20 }),
    );
  });
});
