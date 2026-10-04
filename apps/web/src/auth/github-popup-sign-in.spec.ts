import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@memoflow/contracts/result';
import { startGithubPopupSignIn } from './github-popup-sign-in';

const service = {
  beginGithubSignIn: vi.fn(),
  getSession: vi.fn(),
};

describe('startGithubPopupSignIn', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001');
  });

  it('uses a request-scoped same-origin completion route and completes from a trusted opener message', async () => {
    const replace = vi.fn();
    const close = vi.fn();
    const popup = {
      closed: false,
      location: { replace },
      close,
    } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(popup);

    service.beginGithubSignIn.mockResolvedValue(
      ok({ url: 'https://github.com/login/oauth/authorize?client_id=test' }),
    );
    service.getSession.mockResolvedValue(
      ok({
        account: { id: 'account-1', email: 'person@example.com' },
        session: { id: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
      }),
    );

    const result = startGithubPopupSignIn(service as never);
    await Promise.resolve();
    await Promise.resolve();

    const callbackURL = new URL(service.beginGithubSignIn.mock.calls[0]![0]);
    expect(callbackURL.origin).toBe(window.location.origin);
    expect(callbackURL.pathname).toBe('/auth/popup-complete');
    expect(callbackURL.searchParams.get('provider')).toBe('github');
    expect(callbackURL.searchParams.get('requestId')).toBe('00000000-0000-4000-8000-000000000001');

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        source: popup,
        data: {
          type: 'memoflow:oauth-popup-complete',
          provider: 'github',
          requestId: '00000000-0000-4000-8000-000000000001',
        },
      }),
    );
    await Promise.resolve();
    await Promise.resolve();

    await expect(result).resolves.toEqual({ kind: 'authenticated' });
    expect(service.getSession).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('ignores completion messages from the wrong origin or request', async () => {
    const popup = {
      closed: false,
      location: { replace: vi.fn() },
      close: vi.fn(),
    } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(popup);
    service.beginGithubSignIn.mockResolvedValue(
      ok({ url: 'https://github.com/login/oauth/authorize?client_id=test' }),
    );
    service.getSession.mockResolvedValue(ok({ account: null, session: null }));

    const result = startGithubPopupSignIn(service as never, {
      timeoutMs: 1_000,
      pollIntervalMs: 750,
    });
    await Promise.resolve();
    await Promise.resolve();

    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://attacker.example',
        source: popup,
        data: {
          type: 'memoflow:oauth-popup-complete',
          provider: 'github',
          requestId: '00000000-0000-4000-8000-000000000001',
        },
      }),
    );
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: window.location.origin,
        source: popup,
        data: {
          type: 'memoflow:oauth-popup-complete',
          provider: 'github',
          requestId: 'wrong-request',
        },
      }),
    );
    await Promise.resolve();

    expect(service.getSession).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_500);
    await expect(result).resolves.toEqual({ kind: 'cancelled' });
  });
});
