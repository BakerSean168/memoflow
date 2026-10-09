import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedPathResolver } from '../paths';
import { ProfileRegistry } from './profile-registry';
import { DesktopProfileRuntimeManager } from './desktop-profile-runtime-manager';
import { createFixedClock } from '@memoflow/time';
import { openPowerSyncLocalOnly } from '../database/powersync';

const mocks = vi.hoisted(() => ({
  shutdownPowerSync: vi.fn(),
  moduleRegistration: vi.fn(),
  bootstrapInit: vi.fn(),
  bootstrapDestroy: vi.fn(),
  accountRows: new Map<string, unknown[]>(),
  execute: vi.fn(),
  getOptional: vi.fn(),
  writeTransaction: vi.fn(),
}));

vi.mock('../database/powersync', () => ({
  openPowerSyncLocalOnly: vi.fn(async () => ({
    getOptional: mocks.getOptional,
    execute: mocks.execute,
    writeTransaction: mocks.writeTransaction,
  })),
  ensurePowerSyncSyncMode: vi.fn(),
  disablePowerSyncSyncMode: vi.fn(),
  shutdownPowerSync: mocks.shutdownPowerSync,
}));

vi.mock('./profile-snapshot-service', () => ({
  ProfileSnapshotService: class {
    hydrateIfNeeded = vi.fn(async () => ({
      hydrated: false,
      skippedReason: 'none',
      metadata: null,
    }));
  },
}));

vi.mock('../bootstrap', () => ({
  ElectronBootstrapper: class {
    init = mocks.bootstrapInit;
    destroy = mocks.bootstrapDestroy;
  },
}));

function sharedResolver(rootDir: string): SharedPathResolver {
  return {
    rootDir,
    sharedDir: path.join(rootDir, 'shared'),
    authDir: path.join(rootDir, 'shared', 'auth'),
    configDir: path.join(rootDir, 'shared', 'config'),
    uiDir: path.join(rootDir, 'shared', 'ui'),
    profilesRegistryDir: path.join(rootDir, 'shared', 'profiles'),
    deviceIdPath: path.join(rootDir, 'shared', 'auth', 'device-id'),
    runtimeConfigPath: path.join(rootDir, 'shared', 'config', 'desktop-runtime.json'),
    profileAccessWindowStatePath: path.join(
      rootDir,
      'shared',
      'ui',
      'profile-access-window-state.json',
    ),
    registryPath: path.join(rootDir, 'shared', 'profiles', 'registry.json'),
    cacheDir: path.join(rootDir, 'cache'),
    snapshotStagingDir: path.join(rootDir, 'cache', 'snapshot-staging'),
    downloadsDir: path.join(rootDir, 'cache', 'downloads'),
    tempDir: path.join(rootDir, 'cache', 'temp'),
    logsDir: path.join(rootDir, 'logs'),
    userFilesRootDir: path.join(rootDir, 'user-files'),
    userFilesExportsDir: path.join(rootDir, 'user-files', 'exports'),
    userFilesDownloadsDir: path.join(rootDir, 'user-files', 'downloads'),
    userFilesAttachmentsDir: path.join(rootDir, 'user-files', 'attachments'),
  };
}

describe('DesktopProfileRuntimeManager', () => {
  let rootDir: string;
  let registry: ProfileRegistry;
  let runtime: DesktopProfileRuntimeManager;

  beforeEach(async () => {
    rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'profile-runtime-'));
    registry = new ProfileRegistry(sharedResolver(rootDir));
    runtime = new DesktopProfileRuntimeManager(
      sharedResolver(rootDir),
      registry,
      createFixedClock(1_700_000_000_000),
    );
    runtime.setModuleRegistration(mocks.moduleRegistration);
    vi.clearAllMocks();
    mocks.bootstrapInit.mockResolvedValue(undefined);
    mocks.bootstrapDestroy.mockResolvedValue(undefined);
    mocks.shutdownPowerSync.mockResolvedValue(undefined);
    mocks.getOptional.mockResolvedValue(null);
    mocks.execute.mockResolvedValue(undefined);
    mocks.writeTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        getOptional: mocks.getOptional,
        execute: mocks.execute,
      }),
    );
  });

  afterEach(async () => fs.promises.rm(rootDir, { recursive: true, force: true }));

  it('creates and activates a persistent local guest Profile without cloud auth', async () => {
    const prepared = await runtime.prepareGuestProfile();
    await runtime.activatePreparedProfile();

    expect(prepared.descriptor.profileKind).toBe('guest');
    expect(prepared.descriptor.localOwnerId).toMatch(/^IdentityId_/);
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO accounts'),
      expect.arrayContaining([prepared.descriptor.localOwnerId]),
    );
    expect(runtime.getActiveProfileId()).toBe(prepared.descriptor.profileId);
    expect(mocks.moduleRegistration).toHaveBeenCalledOnce();
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO accounts'),
      expect.arrayContaining([
        expect.stringContaining(`\"nickname\":\"${prepared.descriptor.displayName}\"`),
      ]),
    );
  });

  it('locks the Profile without deleting its directory or registry entry', async () => {
    const prepared = await runtime.prepareGuestProfile();
    await runtime.activatePreparedProfile();
    await runtime.deactivateProfile();

    expect(runtime.getActiveProfileId()).toBeNull();
    expect(fs.existsSync(prepared.profileResolver.profileDir)).toBe(true);
    expect((await registry.findByOwnerId(prepared.descriptor.localOwnerId))?.profileId).toBe(
      prepared.descriptor.profileId,
    );
  });

  it('preserves the selected Profile when releasing runtime resources for shutdown', async () => {
    const prepared = await runtime.prepareGuestProfile();
    await runtime.activatePreparedProfile();

    await runtime.deactivateProfile({ preserveSelection: true });

    expect(runtime.getActiveProfileId()).toBeNull();
    expect(await registry.getActiveProfileId()).toBe(prepared.descriptor.profileId);
    expect(mocks.shutdownPowerSync).toHaveBeenCalledOnce();
  });

  it('withdraws local access after teardown even if the database close fails, and retries the close', async () => {
    await runtime.prepareGuestProfile();
    await runtime.activatePreparedProfile();
    mocks.shutdownPowerSync.mockRejectedValueOnce(new Error('database close failed'));
    await expect(runtime.deactivateProfile()).rejects.toThrow('database close failed');
    expect(runtime.getActiveProfileId()).toBeNull();
    expect(runtime.getActiveProfileAccessContext()).toBeNull();
    await runtime.deactivateProfile();
    expect(mocks.shutdownPowerSync).toHaveBeenCalledTimes(2);
    expect(mocks.bootstrapDestroy).toHaveBeenCalledTimes(1);
  });

  it('retires a prepared database after failed close before the same Profile can be activated', async () => {
    const prepared = await runtime.prepareGuestProfile();
    mocks.shutdownPowerSync.mockRejectedValueOnce(new Error('database close failed'));
    await expect(runtime.discardPreparedProfile()).rejects.toThrow('database close failed');
    expect(runtime.getCurrentIdentityId()).toBeNull();
    await expect(runtime.activatePreparedProfile()).rejects.toThrow('No prepared profile');
    const replacement = await runtime.prepareGuestProfile();
    expect(replacement).not.toBe(prepared);
    expect(mocks.shutdownPowerSync).toHaveBeenCalledTimes(2);
    await runtime.activatePreparedProfile();
  });

  it('closes a database when preparation fails before publishing its runtime', async () => {
    mocks.getOptional.mockRejectedValueOnce(new Error('adoption recovery failed'));
    await expect(runtime.prepareGuestProfile()).rejects.toThrow('adoption recovery failed');
    expect(runtime.getCurrentIdentityId()).toBeNull();
    expect(mocks.shutdownPowerSync).toHaveBeenCalledOnce();
    await runtime.prepareGuestProfile();
    await runtime.activatePreparedProfile();
    expect(runtime.getActiveProfileId()).not.toBeNull();
  });

  it('finishes a lock only after in-flight activation has been retired', async () => {
    await runtime.prepareGuestProfile();
    let finishInit!: () => void;
    mocks.bootstrapInit.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishInit = resolve;
        }),
    );
    const activation = runtime.activatePreparedProfile();
    await vi.waitFor(() => expect(mocks.bootstrapInit).toHaveBeenCalledOnce());
    let locked = false;
    const locking = runtime.deactivateProfile().then(() => {
      locked = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(locked).toBe(false);
    finishInit();
    await Promise.all([activation, locking]);
    expect(runtime.getActiveProfileId()).toBeNull();
    expect(mocks.bootstrapDestroy).toHaveBeenCalledOnce();
    expect(mocks.shutdownPowerSync).toHaveBeenCalledOnce();
  });

  it('drains preparation before locking so an earlier selection cannot activate afterward', async () => {
    const database = {
      getOptional: mocks.getOptional,
      execute: mocks.execute,
      writeTransaction: mocks.writeTransaction,
    };
    let finishOpen!: () => void;
    vi.mocked(openPowerSyncLocalOnly).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOpen = () => resolve(database as never);
        }),
    );
    const selection = runtime.prepareGuestProfile().then(() => runtime.activatePreparedProfile());
    const rejectedSelection = expect(selection).rejects.toThrow('No prepared profile');
    await vi.waitFor(() => expect(openPowerSyncLocalOnly).toHaveBeenCalledOnce());
    let locked = false;
    const locking = runtime.deactivateProfile().then(() => {
      locked = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(locked).toBe(false);
    finishOpen();
    await locking;
    await rejectedSelection;
    expect(runtime.getActiveProfileId()).toBeNull();
    expect(runtime.getCurrentIdentityId()).toBeNull();
    expect(mocks.bootstrapInit).not.toHaveBeenCalled();
    expect(mocks.shutdownPowerSync).toHaveBeenCalledOnce();
  });

  it('waits for activation started by an earlier selection before preparing the next Profile', async () => {
    let finishOpen!: () => void;
    vi.mocked(openPowerSyncLocalOnly).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishOpen = () =>
            resolve({
              getOptional: mocks.getOptional,
              execute: mocks.execute,
              writeTransaction: mocks.writeTransaction,
            } as never);
        }),
    );
    let finishInit!: () => void;
    let bootstrapFinished = false;
    let closedDuringBootstrap = false;
    mocks.bootstrapInit.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishInit = () => {
            bootstrapFinished = true;
            resolve();
          };
        }),
    );
    mocks.shutdownPowerSync.mockImplementation(async () => {
      closedDuringBootstrap ||= !bootstrapFinished;
    });
    const firstSelection = runtime
      .prepareGuestProfile()
      .then(() => runtime.activatePreparedProfile());
    await vi.waitFor(() => expect(openPowerSyncLocalOnly).toHaveBeenCalledOnce());
    const secondPreparation = runtime.prepareProfile('IdentityId_other');
    finishOpen();
    await vi.waitFor(() => expect(mocks.bootstrapInit).toHaveBeenCalledOnce());
    finishInit();
    const [, next] = await Promise.all([firstSelection, secondPreparation]);
    expect(closedDuringBootstrap).toBe(false);
    await runtime.activatePreparedProfile();
    expect(runtime.getActiveProfileId()).toBe(next.descriptor.profileId);
  });

  it('clears shell-held references before the bootstrapper destroys modules', async () => {
    const beforeDeactivation = vi.fn();
    runtime.setBeforeDeactivation(beforeDeactivation);

    await runtime.prepareGuestProfile();
    await runtime.activatePreparedProfile();
    await runtime.deactivateProfile();

    expect(beforeDeactivation).toHaveBeenCalledOnce();
    expect(beforeDeactivation.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.bootstrapDestroy.mock.invocationCallOrder[0]!,
    );
  });

  it('keeps the active Profile intact when the deactivation durability hook fails', async () => {
    const beforeDeactivation = vi.fn(async () => {
      throw new Error('routine occurrence flush failed');
    });
    runtime.setBeforeDeactivation(beforeDeactivation);

    const prepared = await runtime.prepareGuestProfile();
    await runtime.activatePreparedProfile();

    await expect(runtime.deactivateProfile()).rejects.toThrow('routine occurrence flush failed');

    expect(runtime.getActiveProfileId()).toBe(prepared.descriptor.profileId);
    expect(mocks.bootstrapDestroy).not.toHaveBeenCalled();
    expect(mocks.shutdownPowerSync).not.toHaveBeenCalled();
    expect(await registry.getActiveProfileId()).toBe(prepared.descriptor.profileId);
  });

  it('fires the deactivation hook when activation fails so stale repositories are cleared', async () => {
    const beforeDeactivation = vi.fn();
    runtime.setBeforeDeactivation(beforeDeactivation);
    mocks.bootstrapInit.mockRejectedValueOnce(new Error('init failed'));

    await runtime.prepareGuestProfile();
    await expect(runtime.activatePreparedProfile()).rejects.toThrow('init failed');

    expect(beforeDeactivation).toHaveBeenCalledOnce();
    expect(beforeDeactivation.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.shutdownPowerSync.mock.invocationCallOrder[0]!,
    );
  });

  it('keeps local access active when cloud restore fails', async () => {
    runtime.setAfterActivation(async () => {
      throw new Error('offline');
    });
    const prepared = await runtime.prepareGuestProfile();

    await expect(runtime.activatePreparedProfile()).resolves.toBeUndefined();
    expect(runtime.getActiveProfileId()).toBe(prepared.descriptor.profileId);
  });

  it('cannot activate a PIN-protected Profile without a verified local unlock', async () => {
    const prepared = await runtime.prepareGuestProfile();
    await runtime.activatePreparedProfile();
    await runtime.setCurrentProfilePin('123456');
    await runtime.deactivateProfile();

    await runtime.prepareGuestProfile();
    await expect(runtime.activatePreparedProfile()).rejects.toThrow('需要本地 PIN 解锁');

    await runtime.prepareGuestProfile();
    await runtime.preparePinUnlock(prepared.descriptor.profileId, '123456');
    await expect(runtime.activatePreparedProfile()).resolves.toBeUndefined();
    expect(runtime.getActiveProfileId()).toBe(prepared.descriptor.profileId);
  });

  it('recovers a committed tenant adoption when registry rebind was interrupted', async () => {
    const guest = await registry.ensureGuest();
    const guestOwnerId = guest.localOwnerId;
    mocks.getOptional
      .mockResolvedValueOnce({
        from_owner_id: guestOwnerId,
        to_owner_id: 'cloud-1',
        display_name: 'Cloud User',
        identifier: 'user@example.com',
        adopted_at: Date.now(),
      })
      .mockResolvedValueOnce(null);

    const prepared = await runtime.prepareGuestProfile();

    expect(prepared.descriptor.profileId).toBe(guest.profileId);
    expect(prepared.descriptor.profileKind).toBe('registered');
    expect(prepared.descriptor.localOwnerId).toBe('cloud-1');
    expect(prepared.descriptor.cloudBinding?.cloudAccountId).toBe('cloud-1');
    expect(await registry.findByOwnerId(guestOwnerId)).toBeNull();
    expect((await registry.findByOwnerId('cloud-1'))?.profileId).toBe(guest.profileId);
    expect(mocks.execute).toHaveBeenCalledWith(
      'DELETE FROM profile_adoption_journal WHERE id = ?',
      ['current'],
    );
  });

  it('rejects a cloud binding conflict before starting the adoption transaction', async () => {
    const prepared = await runtime.prepareGuestProfile();
    await runtime.activatePreparedProfile();
    await registry.register('cloud-1', 'Existing Cloud Profile', 'existing@example.com');
    mocks.writeTransaction.mockClear();

    await expect(
      runtime.bindCurrentProfile('cloud-1', 'Cloud User', 'user@example.com', true),
    ).rejects.toThrow('拒绝静默合并');

    expect(mocks.writeTransaction).not.toHaveBeenCalled();
    expect((await registry.findByOwnerId(prepared.descriptor.localOwnerId))?.profileKind).toBe(
      'guest',
    );
  });

  it('preserves the local Profile display name when adopting a cloud account', async () => {
    const prepared = await runtime.prepareGuestProfile();
    await runtime.activatePreparedProfile();
    const localDisplayName = prepared.descriptor.displayName;

    await runtime.bindCurrentProfile('cloud-1', 'Cloud Auth Name', 'user@example.com', true);

    const rebound = await registry.findByCloudAccountId('cloud-1');
    expect(rebound?.profileId).toBe(prepared.descriptor.profileId);
    expect(rebound?.displayName).toBe(localDisplayName);
    expect(rebound?.identifier).toBe('user@example.com');
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO profile_adoption_journal'),
      expect.arrayContaining([
        'current',
        prepared.descriptor.localOwnerId,
        'cloud-1',
        localDisplayName,
        'user@example.com',
      ]),
    );
  });

  it('removes a non-active Profile with its local data and secure credentials', async () => {
    const descriptor = await registry.register('cloud-1', 'Cloud User', 'user@example.com');
    const profileDir = path.join(rootDir, 'profiles', descriptor.profileId);
    const keyPath = path.join(
      rootDir,
      'shared',
      'secure',
      'profile-keys',
      `${descriptor.profileId}.bin`,
    );
    const pinPath = path.join(
      rootDir,
      'shared',
      'secure',
      'profile-pins',
      `${descriptor.profileId}.json`,
    );
    const sessionPath = path.join(
      rootDir,
      'shared',
      'secure',
      'cloud-sessions',
      `${descriptor.profileId}.bin`,
    );
    await Promise.all([
      fs.promises.mkdir(profileDir, { recursive: true }),
      fs.promises.mkdir(path.dirname(keyPath), { recursive: true }),
      fs.promises.mkdir(path.dirname(pinPath), { recursive: true }),
      fs.promises.mkdir(path.dirname(sessionPath), { recursive: true }),
    ]);
    await Promise.all([
      fs.promises.writeFile(keyPath, 'key'),
      fs.promises.writeFile(pinPath, '{}'),
      fs.promises.writeFile(sessionPath, 'session'),
    ]);

    await runtime.removeProfile(descriptor.profileId);

    expect(await registry.findByCloudAccountId('cloud-1')).toBeNull();
    expect(fs.existsSync(profileDir)).toBe(false);
    expect(fs.existsSync(keyPath)).toBe(false);
    expect(fs.existsSync(pinPath)).toBe(false);
    expect(fs.existsSync(sessionPath)).toBe(false);
  });
});
