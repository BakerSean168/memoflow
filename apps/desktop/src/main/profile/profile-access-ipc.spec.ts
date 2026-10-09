import { ipcMain } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileAccessChannels } from '@memoflow/contracts/electron';
import { registerProfileAccessIpc } from './profile-access-ipc';

type Handler = (_event: unknown, input?: unknown) => Promise<unknown>;

describe('registerProfileAccessIpc', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns local capabilities while cloud validation is still pending', async () => {
    const handlers = new Map<string, Handler>();
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler as Handler);
    });
    const profile = {
      profileId: 'local-1',
      profileKind: 'registered',
      cloudBinding: { cloudAccountId: 'cloud-1' },
    };
    const runtime = {
      getActiveProfileDescriptorSync: vi.fn(() => profile),
      hasPin: vi.fn(async () => false),
    };
    const cloud = {
      getState: vi.fn(async () => 'CHECKING'),
      restore: vi.fn(() => new Promise(() => undefined)),
    };
    registerProfileAccessIpc({} as never, runtime as never, cloud as never);
    await expect(handlers.get(ProfileAccessChannels.GET_SNAPSHOT)?.({})).resolves.toMatchObject({
      ok: true,
      data: {
        unlockState: 'UNLOCKED',
        cloudState: 'CHECKING',
        capabilities: { local: true, sync: false, cloudAi: false, repositoryConnection: false },
      },
    });
    expect(cloud.restore).not.toHaveBeenCalled();
  });

  it('does not publish an unlocked snapshot after the profile changes during its local reads', async () => {
    const handlers = new Map<string, Handler>();
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler as Handler);
    });
    const runtime = {
      getActiveProfileDescriptorSync: vi.fn().mockReturnValue({ profileId: 'old-profile' }),
      hasPin: vi.fn(async () => false),
    };
    const cloud = {
      getState: vi.fn(async () => {
        runtime.getActiveProfileDescriptorSync.mockReturnValue(null);
        return 'ONLINE';
      }),
    };
    registerProfileAccessIpc({} as never, runtime as never, cloud as never);
    await expect(handlers.get(ProfileAccessChannels.GET_SNAPSHOT)?.({})).resolves.toMatchObject({
      ok: true,
      data: {
        profile: null,
        unlockState: 'LOCKED',
        capabilities: { local: false, sync: false, cloudAi: false },
      },
    });
  });

  it.each([null, '../outside', { profileId: '../outside' }, { profileId: 'valid', pin: 'x' }])(
    'rejects malformed selection %j before lifecycle access',
    async (input) => {
      const handlers = new Map<string, Handler>();
      vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
        handlers.set(channel, handler as Handler);
      });
      const runtime = { openProfile: vi.fn() };
      registerProfileAccessIpc({} as never, runtime as never, {} as never);
      expect(await handlers.get(ProfileAccessChannels.SELECT)?.({}, input)).toMatchObject({
        ok: false,
        error: { code: 'INVALID_REQUEST' },
      });
      expect(runtime.openProfile).not.toHaveBeenCalled();
    },
  );

  it('passes the exact selected guest and PIN to the serialized lifecycle', async () => {
    const handlers = new Map<string, Handler>();
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler as Handler);
    });
    const runtime = {
      getActiveProfileId: () => null,
      openProfile: vi.fn().mockResolvedValue(undefined),
    };
    registerProfileAccessIpc({} as never, runtime as never, {} as never);
    expect(
      await handlers.get(ProfileAccessChannels.SELECT)?.(
        {},
        { profileId: 'second-guest', pin: '123456' },
      ),
    ).toMatchObject({ ok: true });
    expect(runtime.openProfile).toHaveBeenCalledWith('second-guest', '123456');
  });

  it('refuses to remove the active Profile', async () => {
    const handlers = new Map<string, Handler>();
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler as Handler);
    });
    const runtime = {
      getActiveProfileId: vi.fn().mockReturnValue('profile-1'),
      removeProfile: vi.fn(),
    };

    registerProfileAccessIpc({} as never, runtime as never, {} as never);
    const result = await handlers.get(ProfileAccessChannels.REMOVE)?.(
      {},
      {
        profileId: 'profile-1',
      },
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'PROFILE_ACTIVE' } });
    expect(runtime.removeProfile).not.toHaveBeenCalled();
  });

  it('removes a non-active Profile', async () => {
    const handlers = new Map<string, Handler>();
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler as Handler);
    });
    const runtime = {
      getActiveProfileId: vi.fn().mockReturnValue(null),
      removeProfile: vi.fn().mockResolvedValue(undefined),
    };

    registerProfileAccessIpc({} as never, runtime as never, {} as never);
    const result = await handlers.get(ProfileAccessChannels.REMOVE)?.(
      {},
      {
        profileId: 'profile-2',
      },
    );

    expect(result).toMatchObject({ ok: true });
    expect(runtime.removeProfile).toHaveBeenCalledWith('profile-2');
  });
});
