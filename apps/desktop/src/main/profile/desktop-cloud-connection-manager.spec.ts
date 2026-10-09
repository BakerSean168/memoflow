import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProfileDescriptor } from './profile-registry';
import { DesktopCloudConnectionManager } from './desktop-cloud-connection-manager';

vi.mock('../utils/api-config', () => ({ getApiBaseUrl: () => 'https://memo.test/api/v1' }));

function profile(cloudAccountId: string | null): ProfileDescriptor {
  return {
    profileId: 'profile-1',
    profileKind: cloudAccountId ? 'registered' : 'guest',
    localOwnerId: cloudAccountId ?? 'guest-1',
    displayName: 'Profile',
    avatarSeed: 'seed',
    keyEnvelopeId: 'key-1',
    identifier: cloudAccountId ? 'user@example.com' : null,
    cloudBinding: cloudAccountId ? { cloudAccountId, boundAt: 1, lastValidatedAt: null } : null,
    lastActiveAt: 1,
    createdAt: 1,
    hasSnapshot: false,
    lastSnapshotVersion: null,
    lastSnapshotHydratedAt: null,
    status: 'ready',
  };
}

const stored = {
  token: 'token-1',
  sessionId: 'session-1',
  account: { id: 'account-1', email: 'user@example.com', name: 'User', emailVerified: true },
  expiresAt: '2030-01-01T00:00:00.000Z',
};

function runtimeFixture() {
  return {
    getActiveProfileDescriptorSync: vi.fn<() => ProfileDescriptor | null>(() =>
      profile('account-1'),
    ),
    enableCloudSync: vi.fn(),
    disableCloudSync: vi.fn(),
  };
}

function remoteSession() {
  return new Response(
    JSON.stringify({
      session: { id: 'session-2', expiresAt: '2031-01-01T00:00:00.000Z' },
      user: { id: 'account-1', email: 'user@example.com', name: 'User', emailVerified: true },
    }),
  );
}

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('DesktopCloudConnectionManager', () => {
  afterEach(() => vi.useRealTimers());
  it('interrupts pending sync startup before waiting for the cloud check to stop', async () => {
    let finishConnect!: () => void;
    const runtime = runtimeFixture();
    runtime.enableCloudSync.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishConnect = resolve;
        }),
    );
    runtime.disableCloudSync.mockImplementation(async () => {
      finishConnect?.();
    });
    const manager = new DesktopCloudConnectionManager(
      { load: vi.fn().mockResolvedValue(stored), save: vi.fn() } as never,
      runtime as never,
      vi.fn().mockImplementation(async () => remoteSession()),
    );
    const checking = manager.restore(profile('account-1'));
    await vi.waitFor(() => expect(runtime.enableCloudSync).toHaveBeenCalledOnce());
    const cancelling = manager.cancel();
    try {
      await vi.waitFor(() => expect(runtime.disableCloudSync).toHaveBeenCalled(), { timeout: 300 });
    } finally {
      finishConnect();
      await Promise.all([checking, cancelling]);
    }
  });

  it('retires old validation before a new authenticated session can replace it', async () => {
    const sessions = { load: vi.fn().mockResolvedValue(stored), save: vi.fn() };
    const runtime = runtimeFixture();
    const response = deferredResponse();
    const manager = new DesktopCloudConnectionManager(
      sessions as never,
      runtime as never,
      vi.fn().mockReturnValue(response.promise),
    );
    const checking = manager.restore(profile('account-1'));
    await vi.waitFor(() => expect(sessions.load).toHaveBeenCalled());
    await manager.runAuthentication('profile-1', async () => {
      sessions.load.mockResolvedValue({ ...stored, token: 'token-2' });
    });
    response.resolve(remoteSession());
    await checking;
    expect(sessions.save).not.toHaveBeenCalled();
    expect((await sessions.load('profile-1')).token).toBe('token-2');
  });
  it('blocks concurrent refreshes until sign-out has removed the saved session', async () => {
    let finishRemove!: () => void;
    const sessions = {
      load: vi.fn().mockResolvedValue(stored),
      save: vi.fn(),
      remove: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishRemove = resolve;
          }),
      ),
    };
    const runtime = runtimeFixture();
    const response = deferredResponse();
    const fetchImpl = vi.fn().mockReturnValue(response.promise);
    const manager = new DesktopCloudConnectionManager(
      sessions as never,
      runtime as never,
      fetchImpl,
    );
    const pendingCheck = manager.restore(profile('account-1'));
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
    const signOut = manager.clearSession('profile-1');
    await vi.waitFor(() => expect(sessions.remove).toHaveBeenCalledOnce());
    await expect(manager.restore(profile('account-1'))).resolves.toBe('REAUTH_REQUIRED');
    response.resolve(remoteSession());
    await pendingCheck;
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(sessions.save).not.toHaveBeenCalled();
    sessions.load.mockResolvedValue(null);
    finishRemove();
    await expect(signOut).resolves.toEqual(stored);
    expect(runtime.enableCloudSync).not.toHaveBeenCalled();
    expect(runtime.disableCloudSync).toHaveBeenCalledOnce();
  });
  it('reads local access state without waiting for or starting a cloud request', async () => {
    const fetchImpl = vi.fn(() => new Promise<Response>(() => undefined));
    const manager = new DesktopCloudConnectionManager(
      { load: vi.fn().mockResolvedValue(stored) } as never,
      { getActiveProfileId: () => 'profile-1' } as never,
      fetchImpl,
    );
    let state: string | null = null;
    void manager.getState(profile('account-1')).then((value) => {
      state = value;
    });
    await vi.waitFor(() => expect(state).toBe('CHECKING'), { timeout: 200 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps unbound guest Profiles local-only without touching the network', async () => {
    const fetchImpl = vi.fn();
    const manager = new DesktopCloudConnectionManager(
      { load: vi.fn(), save: vi.fn() } as never,
      { enableCloudSync: vi.fn() } as never,
      fetchImpl,
    );
    await expect(manager.getState(profile(null))).resolves.toBe('UNBOUND');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('distinguishes offline, reauthentication and account mismatch', async () => {
    const sessions = { load: vi.fn().mockResolvedValue(stored), save: vi.fn() };
    const runtime = runtimeFixture();
    const offline = new DesktopCloudConnectionManager(
      sessions as never,
      runtime as never,
      vi.fn().mockRejectedValue(new Error('offline')),
    );
    await expect(offline.restore(profile('account-1'))).resolves.toBe('OFFLINE');

    const unauthorized = new DesktopCloudConnectionManager(
      sessions as never,
      runtime as never,
      vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    await expect(unauthorized.restore(profile('account-1'))).resolves.toBe('REAUTH_REQUIRED');

    const mismatch = new DesktopCloudConnectionManager(
      sessions as never,
      runtime as never,
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            session: { id: 'session-2', expiresAt: '2030-01-01T00:00:00.000Z' },
            user: { id: 'other-account', email: 'other@example.com', name: 'Other' },
          }),
          { status: 200 },
        ),
      ),
    );
    await expect(mismatch.restore(profile('account-1'))).resolves.toBe('REAUTH_REQUIRED');
  });

  it('refreshes the real session metadata and enables sync only when online', async () => {
    const sessions = {
      load: vi.fn().mockResolvedValue(stored),
      save: vi.fn(),
      getValidToken: vi.fn(),
    };
    const runtime = runtimeFixture();
    const manager = new DesktopCloudConnectionManager(
      sessions as never,
      runtime as never,
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            session: { id: 'session-2', expiresAt: '2031-01-01T00:00:00.000Z' },
            user: { id: 'account-1', email: 'user@example.com', name: 'User', emailVerified: true },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(manager.restore(profile('account-1'))).resolves.toBe('ONLINE');
    expect(sessions.save).toHaveBeenCalledWith(
      'profile-1',
      expect.objectContaining({
        sessionId: 'session-2',
        expiresAt: '2031-01-01T00:00:00.000Z',
      }),
    );
    expect(runtime.enableCloudSync).toHaveBeenCalledOnce();
  });

  it('shares an in-flight check and keeps existing sync credentials usable after a refresh', async () => {
    const sessions = {
      load: vi.fn().mockResolvedValue(stored),
      save: vi.fn(),
      getValidToken: vi.fn().mockResolvedValue('token-1'),
    };
    const runtime = runtimeFixture();
    const response = deferredResponse();
    const fetchImpl = vi
      .fn()
      .mockReturnValueOnce(response.promise)
      .mockImplementation(async () => remoteSession());
    const manager = new DesktopCloudConnectionManager(
      sessions as never,
      runtime as never,
      fetchImpl,
    );
    const first = manager.restore(profile('account-1'));
    const second = manager.restore(profile('account-1'));
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    response.resolve(remoteSession());
    expect(await Promise.all([first, second])).toEqual(['ONLINE', 'ONLINE']);
    const credentials = runtime.enableCloudSync.mock.calls[0]![0];
    await manager.restore(profile('account-1'));
    await expect(credentials.getAccessToken()).resolves.toBe('token-1');
    await expect(manager.getState(profile('account-1'))).resolves.toBe('ONLINE');
  });

  it('cancels a non-cooperative request and ignores its late response after a profile switch', async () => {
    const sessions = { load: vi.fn().mockResolvedValue(stored), save: vi.fn() };
    const runtime = runtimeFixture();
    const response = deferredResponse();
    const fetchImpl = vi.fn().mockReturnValue(response.promise);
    const manager = new DesktopCloudConnectionManager(
      sessions as never,
      runtime as never,
      fetchImpl,
    );
    const pending = manager.restore(profile('account-1'));
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
    runtime.getActiveProfileDescriptorSync.mockReturnValue(null);
    await manager.cancel();
    expect(await pending).toBe('OFFLINE');
    expect(fetchImpl.mock.calls[0]![1].signal.aborted).toBe(true);
    response.resolve(remoteSession());
    await response.promise;
    await Promise.resolve();
    expect(sessions.save).not.toHaveBeenCalled();
    expect(runtime.enableCloudSync).not.toHaveBeenCalled();
  });

  it('times out a response body that never completes and clears its deadline', async () => {
    vi.useFakeTimers();
    const response = new Response(new ReadableStream());
    const sessions = { load: vi.fn().mockResolvedValue(stored), save: vi.fn() };
    const runtime = runtimeFixture();
    const fetchImpl = vi.fn().mockResolvedValue(response);
    const manager = new DesktopCloudConnectionManager(
      sessions as never,
      runtime as never,
      fetchImpl,
    );
    const pending = manager.restore(profile('account-1'));
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toBe('OFFLINE');
    expect(vi.getTimerCount()).toBe(0);
    expect(runtime.enableCloudSync).not.toHaveBeenCalled();
  });
});
