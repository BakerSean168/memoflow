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
  const runtime = { disableCloudSync: vi.fn() };
  const sessions = {
    load: vi.fn(),
    remove: vi.fn(),
  };
  const cloudConnection = {
    begin: vi.fn().mockResolvedValue(ok({ attemptId: 'attempt-1' })),
    getCurrent: vi.fn().mockReturnValue(ok(null)),
    getStatus: vi.fn().mockReturnValue(ok({ attemptId: 'attempt-1' })),
    cancel: vi.fn().mockReturnValue(ok(undefined)),
    clearForProfile: vi.fn(),
  };
  registerCloudAuthIpc(
    registry as never,
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

    await handlers.get(CloudAuthChannels.CLOUD_CONNECTION_BEGIN)?.({});
    await handlers.get(CloudAuthChannels.CLOUD_CONNECTION_CURRENT)?.({});
    await handlers.get(CloudAuthChannels.CLOUD_CONNECTION_STATUS)?.({}, {
      attemptId: 'attempt-1',
    } as never);
    await handlers.get(CloudAuthChannels.CLOUD_CONNECTION_CANCEL)?.({}, {
      attemptId: 'attempt-1',
    } as never);

    expect(cloudConnection.begin).toHaveBeenCalledOnce();
    expect(cloudConnection.getCurrent).toHaveBeenCalledOnce();
    expect(cloudConnection.getStatus).toHaveBeenCalledWith('attempt-1');
    expect(cloudConnection.cancel).toHaveBeenCalledWith('attempt-1');
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
});
