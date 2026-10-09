import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudAuthResponse } from '@memoflow/contracts';
import { DesktopCloudConnectionService } from './desktop-cloud-connection-service';
import { DesktopCloudConnectionManager } from './desktop-cloud-connection-manager';

vi.mock('../utils/api-config', () => ({ getApiBaseUrl: () => 'https://memo.test/api/v1' }));

const auth: CloudAuthResponse = {
  account: {
    id: 'account-1',
    email: 'user@example.com',
    name: 'User',
    emailVerified: true,
  },
  session: { id: 'session-1', expiresAt: '2030-01-01T00:00:00.000Z' },
  requiresEmailVerification: false,
};

function fixture() {
  const runtime = {
    getActiveProfileId: vi.fn(() => 'profile-1'),
    getActiveProfileDescriptorSync: vi.fn(() => ({ profileId: 'profile-1' })),
    disableCloudSync: vi.fn().mockResolvedValue(undefined),
    getCurrentLocalAccount: vi.fn().mockResolvedValue({
      profile: { nickname: 'Local User', avatarUrl: null, bio: null },
    }),
    bindCurrentProfile: vi.fn().mockResolvedValue(undefined),
    enableCloudSync: vi.fn().mockResolvedValue(undefined),
  };
  const sessions = {
    save: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    getValidToken: vi.fn(),
    load: vi.fn(),
  };
  const fetchImpl = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        ok: true,
        data: { profile: { nickname: 'Cloud User', avatarUrl: null, bio: null } },
      }),
      { status: 200 },
    ),
  );
  const manager = new DesktopCloudConnectionManager(sessions as never, runtime as never);
  const service = new DesktopCloudConnectionService(
    runtime as never,
    sessions as never,
    manager,
    fetchImpl,
  );
  return { service, runtime, sessions, fetchImpl, manager };
}

describe('DesktopCloudConnectionService commit point', () => {
  beforeEach(() => vi.clearAllMocks());

  it('drains an in-flight authenticated save before sign-out removes the session', async () => {
    const { service, runtime, sessions, manager } = fixture();
    let finishSave!: () => void;
    sessions.save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    const connecting = service.connect('profile-1', auth, 'token-2');
    await vi.waitFor(() => expect(sessions.save).toHaveBeenCalledOnce());
    const signingOut = manager.clearSession('profile-1');
    await Promise.resolve();
    expect(sessions.remove).not.toHaveBeenCalled();
    finishSave();
    await Promise.all([connecting, signingOut]);
    expect(sessions.save).toHaveBeenCalledBefore(sessions.remove);
    expect(sessions.remove).toHaveBeenCalledOnce();
    expect(runtime.enableCloudSync).not.toHaveBeenCalled();
  });

  it('transfers completed sync credentials from the auth attempt to the active Profile', async () => {
    const { service, runtime, sessions } = fixture();
    const attempt = new AbortController();
    sessions.getValidToken.mockResolvedValue('token-1');
    await expect(
      service.connect('profile-1', auth, 'token-1', attempt.signal),
    ).resolves.toMatchObject({ ok: true });
    const credentials = runtime.enableCloudSync.mock.calls[0]![0];
    attempt.abort();
    await expect(credentials.getAccessToken()).resolves.toBe('token-1');
    expect(runtime.disableCloudSync).toHaveBeenCalledOnce();
    runtime.getActiveProfileId.mockReturnValue('other-profile');
    await expect(credentials.getAccessToken()).resolves.toBeNull();
  });

  it('disconnects a pending sync connection when its authentication attempt is cancelled', async () => {
    const { service, runtime } = fixture();
    const attempt = new AbortController();
    let finishConnect!: () => void;
    runtime.enableCloudSync.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishConnect = resolve;
        }),
    );
    const connecting = service.connect('profile-1', auth, 'token-1', attempt.signal);
    await vi.waitFor(() => expect(runtime.enableCloudSync).toHaveBeenCalledOnce());
    runtime.disableCloudSync.mockImplementationOnce(async () => {
      finishConnect();
    });
    attempt.abort();
    await vi.waitFor(() => expect(runtime.disableCloudSync).toHaveBeenCalledTimes(2));
    await expect(connecting).resolves.toMatchObject({ ok: false });
  });

  it('revokes the new session when reconciliation fails before Profile binding', async () => {
    const { service, runtime, sessions, fetchImpl } = fixture();
    fetchImpl
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            error: { message: 'account unavailable' },
          }),
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await expect(service.connect('profile-1', auth, 'token-1')).resolves.toMatchObject({
      ok: false,
      error: { code: 'PROFILE_CLOUD_CONNECTION_FAILED' },
    });
    expect(runtime.bindCurrentProfile).not.toHaveBeenCalled();
    expect(sessions.save).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenLastCalledWith(
      'https://memo.test/api/auth/sign-out',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer token-1' }),
      }),
    );
  });

  it('keeps the registered Profile and requires reauthentication when session persistence fails', async () => {
    const { service, runtime, sessions, fetchImpl } = fixture();
    sessions.save.mockRejectedValue(new Error('secure storage unavailable'));

    await expect(service.connect('profile-1', auth, 'token-1')).resolves.toMatchObject({
      ok: false,
      error: { code: 'PROFILE_CLOUD_REAUTH_REQUIRED' },
    });
    expect(runtime.bindCurrentProfile).toHaveBeenCalledOnce();
    expect(sessions.remove).toHaveBeenCalledWith('profile-1');
    expect(runtime.enableCloudSync).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenLastCalledWith(
      'https://memo.test/api/auth/sign-out',
      expect.any(Object),
    );
  });

  it('keeps binding and the saved session when sync startup fails', async () => {
    const { service, runtime, sessions, fetchImpl } = fixture();
    runtime.enableCloudSync.mockRejectedValue(new Error('sync unavailable'));

    await expect(service.connect('profile-1', auth, 'token-1')).resolves.toMatchObject({
      ok: false,
      error: { code: 'PROFILE_CLOUD_SYNC_FAILED' },
    });
    expect(runtime.bindCurrentProfile).toHaveBeenCalledOnce();
    expect(sessions.save).toHaveBeenCalledOnce();
    expect(sessions.remove).not.toHaveBeenCalled();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('reports success only after binding, persistence and sync startup all complete', async () => {
    const { service, runtime, sessions } = fixture();

    await expect(service.connect('profile-1', auth, 'token-1')).resolves.toMatchObject({
      ok: true,
    });
    expect(runtime.bindCurrentProfile).toHaveBeenCalledBefore(sessions.save);
    expect(sessions.save).toHaveBeenCalledBefore(runtime.enableCloudSync);
  });
});
