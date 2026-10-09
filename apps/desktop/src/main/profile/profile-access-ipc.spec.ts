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

  it('rejects renderer attempts to open a PIN-protected Profile without a PIN', async () => {
    const handlers = new Map<string, Handler>();
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler as Handler);
    });
    const profile = {
      profileId: 'profile-1',
      localOwnerId: 'IdentityId_cloud-1',
      profileKind: 'registered',
      displayName: 'Cloud User',
      avatarSeed: 'seed',
      identifier: 'user@example.com',
      cloudBinding: { cloudAccountId: 'IdentityId_cloud-1' },
      lastActiveAt: 1,
    };
    const registry = { list: vi.fn().mockResolvedValue([profile]) };
    const runtime = {
      hasPin: vi.fn().mockResolvedValue(true),
      preparePinUnlock: vi.fn(),
      prepareProfile: vi.fn(),
      activatePreparedProfile: vi.fn(),
    };

    registerProfileAccessIpc(registry as never, runtime as never, { getState: vi.fn() } as never);
    const result = await handlers.get(ProfileAccessChannels.SELECT)?.(
      {},
      { profileId: 'profile-1' },
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'PIN_REQUIRED' } });
    expect(runtime.prepareProfile).not.toHaveBeenCalled();
    expect(runtime.activatePreparedProfile).not.toHaveBeenCalled();
  });

  it('verifies the PIN before preparing and activating the selected Profile', async () => {
    const handlers = new Map<string, Handler>();
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler as Handler);
    });
    const profile = {
      profileId: 'profile-1',
      localOwnerId: 'IdentityId_cloud-1',
      profileKind: 'registered',
      displayName: 'Cloud User',
      avatarSeed: 'seed',
      identifier: 'user@example.com',
      cloudBinding: { cloudAccountId: 'IdentityId_cloud-1' },
      lastActiveAt: 1,
    };
    const registry = { list: vi.fn().mockResolvedValue([profile]) };
    const runtime = {
      hasPin: vi.fn().mockResolvedValue(true),
      preparePinUnlock: vi.fn().mockResolvedValue(undefined),
      prepareProfile: vi.fn().mockResolvedValue(undefined),
      prepareGuestProfile: vi.fn(),
      activatePreparedProfile: vi.fn().mockResolvedValue(undefined),
    };

    registerProfileAccessIpc(registry as never, runtime as never, { getState: vi.fn() } as never);
    const result = await handlers.get(ProfileAccessChannels.SELECT)?.(
      {},
      {
        profileId: 'profile-1',
        pin: '123456',
      },
    );

    expect(result).toMatchObject({ ok: true });
    expect(runtime.preparePinUnlock).toHaveBeenCalledWith('profile-1', '123456');
    expect(runtime.prepareProfile).toHaveBeenCalledWith('IdentityId_cloud-1', {
      displayName: 'Cloud User',
      identifier: 'user@example.com',
    });
    expect(runtime.prepareGuestProfile).not.toHaveBeenCalled();
    expect(runtime.activatePreparedProfile).toHaveBeenCalledOnce();
  });

  it('reopens the persistent guest descriptor instead of registering its owner as cloud identity', async () => {
    const handlers = new Map<string, Handler>();
    vi.mocked(ipcMain.handle).mockImplementation((channel, handler) => {
      handlers.set(channel, handler as Handler);
    });
    const profile = {
      profileId: 'profile-guest',
      localOwnerId: 'IdentityId_guest-owner',
      profileKind: 'guest',
      displayName: 'Guest',
      avatarSeed: 'seed',
      identifier: null,
      cloudBinding: null,
      lastActiveAt: 1,
    };
    const registry = { list: vi.fn().mockResolvedValue([profile]) };
    const runtime = {
      hasPin: vi.fn().mockResolvedValue(false),
      prepareGuestProfile: vi.fn().mockResolvedValue(undefined),
      prepareProfile: vi.fn(),
      activatePreparedProfile: vi.fn().mockResolvedValue(undefined),
    };

    registerProfileAccessIpc(registry as never, runtime as never, { getState: vi.fn() } as never);
    const result = await handlers.get(ProfileAccessChannels.SELECT)?.(
      {},
      {
        profileId: 'profile-guest',
      },
    );

    expect(result).toMatchObject({ ok: true });
    expect(runtime.prepareGuestProfile).toHaveBeenCalledOnce();
    expect(runtime.prepareProfile).not.toHaveBeenCalled();
    expect(runtime.activatePreparedProfile).toHaveBeenCalledOnce();
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
