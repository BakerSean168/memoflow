import { ipcMain } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudAuthChannels } from '@memoflow/desktop-contracts';
import { ok, ResultErrorException } from '@memoflow/transport-contracts/result';
import { registerCloudAuthIpc } from './cloud-auth-ipc';

vi.mock('../utils/api-config', () => ({
  getApiBaseUrl: () => 'https://api.memo.test/api/v1',
}));

type Handler = (_event: unknown, input?: never) => unknown;

function registerFixture() {
  const handlers = new Map<string, Handler>();
  vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
    handlers.set(channel, handler as Handler);
  });
  const registry = {
    getActiveProfile: vi.fn().mockResolvedValue({ profileId: 'profile-1' }),
  };
  const runtime = {
    disableCloudSync: vi.fn(),
    runExclusive: <T>(fn: () => Promise<T>) => fn(),
    getActiveProfileDescriptorSync: vi.fn(() => ({
      profileId: 'profile-1',
      cloudBinding: { cloudAccountId: 'account-1' },
    })),
    signOutActiveProfile: vi.fn(
      async (invalidate: (descriptor: { profileId: string; profileKind: string }) => Promise<void>) => {
        await invalidate({ profileId: 'profile-1', profileKind: 'registered' });
      },
    ),
  };
  const sessions = {
    load: vi.fn(),
    remove: vi.fn(),
  };
  const cloudConnection = {
    begin: vi.fn().mockResolvedValue(ok({ attemptId: '8c7e083e-1b4c-42e6-901f-979d9a7b8b32' })),
    beginWithoutProfile: vi
      .fn()
      .mockResolvedValue(ok({ attemptId: '8c7e083e-1b4c-42e6-901f-979d9a7b8b32' })),
    getCurrent: vi.fn().mockReturnValue(ok(null)),
    getStatus: vi.fn().mockReturnValue(ok({ attemptId: '8c7e083e-1b4c-42e6-901f-979d9a7b8b32' })),
    cancel: vi.fn().mockReturnValue(ok(undefined)),
    clearForProfile: vi.fn(),
    cancelForProfile: vi.fn(),
  };
  const signIn = {
    signIn: vi.fn().mockResolvedValue(ok({ profileId: 'profile-cloud' })),
    signUp: vi.fn().mockResolvedValue(ok({ profileId: 'profile-cloud' })),
    openPasswordRecovery: vi.fn().mockResolvedValue(ok(undefined)),
  };
  registerCloudAuthIpc(
    registry as never,
    runtime as never,
    sessions as never,
    {
      clearSession: async (profileId: string) => {
        const stored = await sessions.load(profileId);
        await sessions.remove(profileId);
        await runtime.disableCloudSync();
        return stored;
      },
    },
    cloudConnection as never,
    signIn as never,
  );
  return { handlers, runtime, sessions, cloudConnection, signIn };
}

describe('registerCloudAuthIpc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('registers only session, disconnect, and cloud connection channels', () => {
    const { handlers } = registerFixture();

    expect([...handlers.keys()].sort()).toEqual([...Object.values(CloudAuthChannels)].sort());
    expect(Object.keys(CloudAuthChannels)).toEqual([
      'SIGN_OUT',
      'SIGN_OUT_ACCOUNT',
      'SESSION',
      'SIGN_IN',
      'SIGN_UP',
      'FORGOT_PASSWORD',
      'GITHUB_SIGN_IN_BEGIN',
      'CLOUD_CONNECTION_BEGIN',
      'CLOUD_CONNECTION_CURRENT',
      'CLOUD_CONNECTION_STATUS',
      'CLOUD_CONNECTION_CANCEL',
    ]);
  });

  it('forwards a valid sign-in to the cloud sign-in service and rejects malformed input', async () => {
    const { handlers, signIn } = registerFixture();

    expect(
      await handlers.get(CloudAuthChannels.SIGN_IN)?.({}, {
        email: 'person@example.com',
        password: 'cloud-password',
        remember: true,
      } as never),
    ).toEqual({ ok: true, data: { profileId: 'profile-cloud' } });
    expect(signIn.signIn).toHaveBeenCalledWith({
      email: 'person@example.com',
      password: 'cloud-password',
      remember: true,
    });

    expect(
      await handlers.get(CloudAuthChannels.SIGN_IN)?.({}, {
        email: 'not-an-email',
        password: '',
        remember: true,
      } as never),
    ).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } });
    expect(signIn.signIn).toHaveBeenCalledTimes(1);
  });

  it('starts the GitHub attempt without an origin Profile and opens the recovery page', async () => {
    const { handlers, cloudConnection, signIn } = registerFixture();

    await handlers.get(CloudAuthChannels.GITHUB_SIGN_IN_BEGIN)?.({}, { remember: false } as never);
    expect(cloudConnection.beginWithoutProfile).toHaveBeenCalledWith({ remember: false });

    await handlers.get(CloudAuthChannels.FORGOT_PASSWORD)?.({});
    expect(signIn.openPasswordRecovery).toHaveBeenCalled();
  });

  it('never returns a remembered session while the local runtime is locked', async () => {
    const { handlers, runtime, sessions } = registerFixture();
    runtime.getActiveProfileDescriptorSync.mockReturnValue(null as never);
    expect(await handlers.get(CloudAuthChannels.SESSION)?.({})).toEqual({
      ok: true,
      data: { account: null, session: null },
    });
    expect(sessions.load).not.toHaveBeenCalled();
  });

  it('does not sign out a different Profile when a queued request outlives a switch', async () => {
    const { handlers, runtime, sessions } = registerFixture();
    runtime.runExclusive = async (fn) => {
      runtime.getActiveProfileDescriptorSync.mockReturnValue({
        profileId: 'profile-2',
        cloudBinding: { cloudAccountId: 'account-2' },
      });
      return fn();
    };
    expect(await handlers.get(CloudAuthChannels.SIGN_OUT)?.({})).toMatchObject({
      ok: false,
      error: { code: 'PROFILE_CHANGED' },
    });
    expect(sessions.remove).not.toHaveBeenCalled();
  });

  it('disconnects cloud sync without locking the local Profile', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    const { handlers, runtime, sessions, cloudConnection } = registerFixture();
    sessions.load.mockResolvedValue({ token: 'token-1' });

    await handlers.get(CloudAuthChannels.SIGN_OUT)?.({});

    expect(fetch).toHaveBeenCalledWith(
      'https://api.memo.test/api/auth/sign-out',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer token-1' }),
      }),
    );
    expect(sessions.remove).toHaveBeenCalledWith('profile-1');
    expect(runtime.disableCloudSync).toHaveBeenCalledOnce();
    expect(cloudConnection.clearForProfile).toHaveBeenCalledWith('profile-1');
  });

  it('forwards recoverable cloud connection lifecycle operations', async () => {
    const { handlers, cloudConnection } = registerFixture();

    await handlers.get(CloudAuthChannels.CLOUD_CONNECTION_BEGIN)?.({}, {
      intent: 'add_account',
    } as never);
    await handlers.get(CloudAuthChannels.CLOUD_CONNECTION_CURRENT)?.({});
    await handlers.get(CloudAuthChannels.CLOUD_CONNECTION_STATUS)?.({}, {
      attemptId: '8c7e083e-1b4c-42e6-901f-979d9a7b8b32',
    } as never);
    await handlers.get(CloudAuthChannels.CLOUD_CONNECTION_CANCEL)?.({}, {
      attemptId: '8c7e083e-1b4c-42e6-901f-979d9a7b8b32',
    } as never);

    expect(cloudConnection.begin).toHaveBeenCalledOnce();
    expect(cloudConnection.getCurrent).toHaveBeenCalledOnce();
    expect(cloudConnection.getStatus).toHaveBeenCalledWith('8c7e083e-1b4c-42e6-901f-979d9a7b8b32');
    expect(cloudConnection.cancel).toHaveBeenCalledWith('8c7e083e-1b4c-42e6-901f-979d9a7b8b32');
  });

  it('finishes local sign-out even when remote revocation does not respond', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    const { handlers, sessions, runtime } = registerFixture();
    sessions.load.mockResolvedValue({ token: 'token-1' });
    let finished = false;
    void Promise.resolve(handlers.get(CloudAuthChannels.SIGN_OUT)?.({})).then(() => {
      finished = true;
    });
    await vi.waitFor(() => expect(finished).toBe(true), { timeout: 200 });
    expect(sessions.remove).toHaveBeenCalledWith('profile-1');
    expect(runtime.disableCloudSync).toHaveBeenCalledOnce();
  });

  it('signs out the active account through the runtime and invalidates its cloud session first', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    const { handlers, runtime, sessions, cloudConnection } = registerFixture();
    sessions.load.mockResolvedValue({ token: 'token-1' });

    expect(await handlers.get(CloudAuthChannels.SIGN_OUT_ACCOUNT)?.({})).toEqual({
      ok: true,
      data: null,
    });

    expect(runtime.signOutActiveProfile).toHaveBeenCalledOnce();
    expect(cloudConnection.cancelForProfile).toHaveBeenCalledWith('profile-1');
    expect(cloudConnection.clearForProfile).toHaveBeenCalledWith('profile-1');
    expect(sessions.remove).toHaveBeenCalledWith('profile-1');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.memo.test/api/auth/sign-out',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer token-1' }),
      }),
    );
  });

  it('never touches a cloud session when signing out a local account', async () => {
    const { handlers, runtime, sessions, cloudConnection } = registerFixture();
    runtime.signOutActiveProfile.mockImplementation(
      async (invalidate: (descriptor: { profileId: string; profileKind: string }) => Promise<void>) => {
        await invalidate({ profileId: 'profile-1', profileKind: 'local' });
      },
    );

    expect(await handlers.get(CloudAuthChannels.SIGN_OUT_ACCOUNT)?.({})).toEqual({
      ok: true,
      data: null,
    });

    expect(cloudConnection.cancelForProfile).toHaveBeenCalledWith('profile-1');
    expect(sessions.load).not.toHaveBeenCalled();
    expect(sessions.remove).not.toHaveBeenCalled();
  });

  it('surfaces a partial removal so the renderer can leave the dead workspace', async () => {
    const { handlers, runtime } = registerFixture();
    runtime.signOutActiveProfile.mockRejectedValue(
      new ResultErrorException('无法删除本地数据', 'SIGN_OUT_PARTIAL'),
    );

    expect(await handlers.get(CloudAuthChannels.SIGN_OUT_ACCOUNT)?.({})).toEqual({
      ok: false,
      error: { code: 'SIGN_OUT_PARTIAL', message: '无法删除本地数据' },
    });
  });

  it('reports PROFILE_NOT_ACTIVE when no account is signed in', async () => {
    const { handlers, runtime } = registerFixture();
    runtime.signOutActiveProfile.mockRejectedValue(
      new ResultErrorException('当前没有已登录的账号', 'PROFILE_NOT_ACTIVE'),
    );

    expect(await handlers.get(CloudAuthChannels.SIGN_OUT_ACCOUNT)?.({})).toMatchObject({
      ok: false,
      error: { code: 'PROFILE_NOT_ACTIVE' },
    });
  });
});
