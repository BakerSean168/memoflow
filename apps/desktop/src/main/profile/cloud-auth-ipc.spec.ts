import { ipcMain } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudAuthChannels } from '@memoflow/contracts/electron';
import { ok } from '@memoflow/contracts/result';
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
  };
  const sessions = {
    load: vi.fn(),
    remove: vi.fn(),
  };
  const cloudConnection = {
    begin: vi.fn().mockResolvedValue(ok({ attemptId: '8c7e083e-1b4c-42e6-901f-979d9a7b8b32' })),
    getCurrent: vi.fn().mockReturnValue(ok(null)),
    getStatus: vi.fn().mockReturnValue(ok({ attemptId: '8c7e083e-1b4c-42e6-901f-979d9a7b8b32' })),
    cancel: vi.fn().mockReturnValue(ok(undefined)),
    clearForProfile: vi.fn(),
  };
  registerCloudAuthIpc(
    registry as never,
    runtime as never,
    sessions as never,
    cloudConnection as never,
  );
  return { handlers, runtime, sessions, cloudConnection };
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
      'SESSION',
      'CLOUD_CONNECTION_BEGIN',
      'CLOUD_CONNECTION_CURRENT',
      'CLOUD_CONNECTION_STATUS',
      'CLOUD_CONNECTION_CANCEL',
    ]);
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
});
