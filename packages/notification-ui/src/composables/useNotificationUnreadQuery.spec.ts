import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fail, ok } from '@memoflow/transport-contracts/result';
import { createServerStateRuntime } from '@notification-ui-test-host/platform/server-state';
import { mountNotificationComposable } from '../test-support/notification-query-test-utils';
import { useNotificationUnreadQuery } from './useNotificationUnreadQuery';

function makeService(getUnreadCount = vi.fn()) {
  return {
    findNotifications: vi.fn(),
    getUnreadCount,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    deleteNotification: vi.fn(),
    batchDeleteNotifications: vi.fn(),
  };
}

describe('useNotificationUnreadQuery (shared unread key)', () => {
  beforeEach(() => {});

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shares one unread fetch across concurrent consumers (page + capsule + shell)', async () => {
    const service = makeService(vi.fn().mockResolvedValue(ok({ count: 3 })));
    const { api: first, runtime } = mountNotificationComposable(
      () => useNotificationUnreadQuery(),
      { service },
    );
    const { api: second } = mountNotificationComposable(() => useNotificationUnreadQuery(), {
      service,
      runtime,
    });
    const { api: third } = mountNotificationComposable(() => useNotificationUnreadQuery(), {
      service,
      runtime,
    });

    await vi.waitFor(() => expect(first.isLoading.value).toBe(false));
    await vi.waitFor(() => expect(second.isLoading.value).toBe(false));
    await vi.waitFor(() => expect(third.isLoading.value).toBe(false));

    expect(service.getUnreadCount).toHaveBeenCalledTimes(1);
    expect(first.unreadCount.value).toBe(3);
    expect(second.unreadCount.value).toBe(3);
    expect(third.unreadCount.value).toBe(3);
    expect(first.hasUnread.value).toBe(true);
  });

  it('isolates the unread cache by identity scope', async () => {
    const service = makeService(vi.fn().mockResolvedValue(ok({ count: 3 })));
    const { api: a, runtime } = mountNotificationComposable(() => useNotificationUnreadQuery(), {
      service,
      identityScope: 'identity-a',
    });
    const { api: b } = mountNotificationComposable(() => useNotificationUnreadQuery(), {
      service,
      runtime,
      identityScope: 'identity-b',
    });

    await vi.waitFor(() => expect(a.isLoading.value).toBe(false));
    await vi.waitFor(() => expect(b.isLoading.value).toBe(false));

    expect(service.getUnreadCount).toHaveBeenCalledTimes(2);
  });

  it('does not refetch within the 30s stale window on remount', async () => {
    vi.useFakeTimers();
    const service = makeService(vi.fn().mockResolvedValue(ok({ count: 1 })));
    const runtime = createServerStateRuntime('web');

    const first = mountNotificationComposable(() => useNotificationUnreadQuery(), {
      service,
      runtime,
    });
    await vi.waitFor(() => expect(first.api.isLoading.value).toBe(false));
    expect(service.getUnreadCount).toHaveBeenCalledTimes(1);

    const second = mountNotificationComposable(() => useNotificationUnreadQuery(), {
      service,
      runtime,
    });
    await vi.waitFor(() => expect(second.api.isLoading.value).toBe(false));
    expect(service.getUnreadCount).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(31_000);
    const third = mountNotificationComposable(() => useNotificationUnreadQuery(), {
      service,
      runtime,
    });
    await vi.waitFor(() => expect(third.api.isLoading.value).toBe(false));
    expect(service.getUnreadCount).toHaveBeenCalledTimes(2);
  });

  it('surfaces a translated error and keeps a zero fallback on failure', async () => {
    const service = makeService(
      vi.fn().mockResolvedValue(fail({ code: 'VALIDATION_ERROR', message: 'boom' })),
    );
    const { api } = mountNotificationComposable(() => useNotificationUnreadQuery(), {
      service,
    });

    await vi.waitFor(() => expect(api.error.value).toBeTruthy());
    expect(api.unreadCount.value).toBe(0);
    expect(api.hasUnread.value).toBe(false);
  });
});
