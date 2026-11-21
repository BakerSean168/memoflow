import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusManager } from '@tanstack/vue-query';
import { ok } from '@memoflow/transport-contracts/result';
import { mountNotificationComposable } from '../test-support/notification-query-test-utils';
import { useNotificationAttentionQuery } from './useNotificationAttentionQuery';
import { nextAttentionRefresh } from './notificationAttentionRefresh';

afterEach(() => {
  focusManager.setFocused(undefined);
  vi.useRealTimers();
});

describe('owner-derived attention count', () => {
  it('shares the full count across consumers while isolating identities', async () => {
    const service = {
      getAttentionCount: vi.fn().mockResolvedValue(ok({ count: 45, nextAttentionAt: null })),
    };
    const { api: first, runtime } = mountNotificationComposable(useNotificationAttentionQuery, {
      service,
      identityScope: 'a',
    });
    const { api: second } = mountNotificationComposable(useNotificationAttentionQuery, {
      service,
      runtime,
      identityScope: 'a',
    });
    const { api: other } = mountNotificationComposable(useNotificationAttentionQuery, {
      service,
      runtime,
      identityScope: 'b',
    });
    await vi.waitFor(() => expect(other.query.isSuccess.value).toBe(true));
    expect(first.attentionCount.value).toBe(45);
    expect(second.attentionCount.value).toBe(45);
    expect(service.getAttentionCount).toHaveBeenCalledTimes(2);
    runtime.queryClient.clear();
  });

  it('refreshes at the owner deadline even when the window is not focused', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    focusManager.setFocused(false);
    const service = {
      getAttentionCount: vi
        .fn()
        .mockResolvedValueOnce(ok({ count: 0, nextAttentionAt: 12_000 }))
        .mockResolvedValue(ok({ count: 1, nextAttentionAt: null })),
    };
    const { api, runtime } = mountNotificationComposable(useNotificationAttentionQuery, {
      service,
    });
    await vi.waitFor(() => expect(api.query.isSuccess.value).toBe(true));
    expect(api.attentionCount.value).toBe(0);
    await vi.advanceTimersByTimeAsync(2_050);
    expect(api.attentionCount.value).toBe(1);
    expect(service.getAttentionCount).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(service.getAttentionCount).toHaveBeenCalledTimes(2);
    runtime.queryClient.clear();
  });

  it('backs off retained expired deadlines and has no timer without an owner deadline', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    expect(nextAttentionRefresh(9_000)).toBe(5_000);
    expect(nextAttentionRefresh(null)).toBe(false);
    expect(nextAttentionRefresh(undefined)).toBe(false);
  });
});
