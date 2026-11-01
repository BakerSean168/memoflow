import { ipcMain } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileAccessChannels } from '@memoflow/desktop-contracts';
import { registerProfileAccessIpc } from './profile-access-ipc';

const accessLogs = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock('@memoflow/utils/logger', () => ({ createLogger: () => accessLogs }));

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
    expect(accessLogs.warn).not.toHaveBeenCalled();
  });

  it('logs the target Profile and the error when a direct selection fails', async () => {
    const handlers = new Map<string, Handler>();
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler as Handler);
    });
    const failure = new Error('Object has been destroyed');
    const registry = {
      list: vi.fn(async () => [{ profileId: 'guest-2', displayName: 'Guest Two' }]),
    };
    const runtime = {
      getActiveProfileId: () => null,
      openProfile: vi.fn().mockRejectedValue(failure),
    };
    registerProfileAccessIpc(registry as never, runtime as never, {} as never);

    expect(
      await handlers.get(ProfileAccessChannels.SELECT)?.({}, { profileId: 'guest-2' }),
    ).toMatchObject({ ok: false, error: { code: 'PROFILE_OPEN_FAILED' } });
    expect(accessLogs.warn).toHaveBeenCalledTimes(1);
    expect(accessLogs.warn).toHaveBeenCalledWith('Selected Profile could not be opened', {
      profileId: 'guest-2',
      profileName: 'Guest Two',
      error: failure,
    });
  });

  it('still reports the failure when the Profile name lookup throws', async () => {
    const handlers = new Map<string, Handler>();
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler as Handler);
    });
    const registry = {
      list: vi.fn(async () => {
        throw new Error('registry unreadable');
      }),
    };
    const runtime = {
      getActiveProfileId: () => null,
      openProfile: vi.fn().mockRejectedValue(new Error('Object has been destroyed')),
    };
    registerProfileAccessIpc(registry as never, runtime as never, {} as never);

    expect(
      await handlers.get(ProfileAccessChannels.SELECT)?.({}, { profileId: 'guest-3' }),
    ).toMatchObject({ ok: false, error: { code: 'PROFILE_OPEN_FAILED' } });
    expect(accessLogs.warn).toHaveBeenCalledWith(
      'Selected Profile could not be opened',
      expect.objectContaining({ profileId: 'guest-3', profileName: undefined }),
    );
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
