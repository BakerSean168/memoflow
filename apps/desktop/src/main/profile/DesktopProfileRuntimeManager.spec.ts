import { createSharedPathResolver, resolveDesktopStorageRoots } from '../paths';
import fs from 'node:fs';
import { session } from 'electron';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedPathResolver } from '../paths';
import { ProfileRegistry } from './profile-registry';
import { DesktopProfileRuntimeManager } from './desktop-profile-runtime-manager';
import { CloudSessionStore } from './cloud-session-store';
import { DesktopCloudConnectionManager } from './desktop-cloud-connection-manager';
import { createFixedClock } from '@memoflow/time';
import { ensurePowerSyncSyncMode, openPowerSyncLocalOnly } from '../database/powersync';

vi.mock('../utils/api-config', () => ({
  getApiBaseUrl: () => 'https://profiles.example.test/api/v1',
}));

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
  ensurePowerSyncSyncMode: vi.fn(async () => undefined),
  disablePowerSyncSyncMode: vi.fn(async () => undefined),
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
  return createSharedPathResolver(
    resolveDesktopStorageRoots({
      platform: 'linux',
      channel: 'test',
      home: rootDir,
      env: { MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: rootDir },
    }),
  );
}

const LOCAL_PASSWORD = 'local-account-password';

describe('DesktopProfileRuntimeManager', () => {
  let rootDir: string;
  let registry: ProfileRegistry;
  let runtime: DesktopProfileRuntimeManager;

  /** A cloud-bound Profile keeps its safeStorage key copy and needs no password. */
  const seedRegistered = (id = 'IdentityId_seed') => registry.register(id, 'Seed');
  const openSeeded = async (id = 'IdentityId_seed') =>
    runtime.openProfile((await seedRegistered(id)).profileId);

  const createLocal = (displayName: string) =>
    runtime.createLocalAccount(displayName, LOCAL_PASSWORD);

  it('requires the source password before invoking an inactive local reader and leaves the target active', async () => {
    const source = await createLocal('Source');
    const target = await createLocal('Target');
    await runtime.openProfile(source.profileId, LOCAL_PASSWORD);
    await runtime.openProfile(target.profileId, LOCAL_PASSWORD);
    const read = vi.fn(async () => 'read');
    await expect(
      runtime.runExclusive(() =>
        runtime.withInactiveLocalAccount(source.profileId, undefined, read),
      ),
    ).rejects.toThrow('SOURCE_PASSWORD_REQUIRED');
    await expect(
      runtime.runExclusive(() =>
        runtime.withInactiveLocalAccount(source.profileId, 'wrong-password', read),
      ),
    ).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
    expect(
      await runtime.runExclusive(() =>
        runtime.withInactiveLocalAccount(source.profileId, LOCAL_PASSWORD, read),
      ),
    ).toBe('read');
    expect(runtime.getActiveProfileId()).toBe(target.profileId);
    await expect(
      runtime.runExclusive(() =>
        runtime.withInactiveLocalAccount(target.profileId, undefined, read),
      ),
    ).rejects.toThrow('SOURCE_PROFILE_ACTIVE');
  }, 15_000);

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

  it('requires the old password, invalidates it and disables remembered unlock after change', async () => {
    const profile = await createLocal('Change password');
    await runtime.openProfile(profile.profileId, LOCAL_PASSWORD, { remember: true });
    await expect(
      runtime.setCurrentProfilePassword('replacement-password', 'incorrect-password'),
    ).rejects.toThrow();
    expect(await runtime.hasRememberedKey(profile.profileId)).toBe(true);
    await runtime.setCurrentProfilePassword('replacement-password', LOCAL_PASSWORD);
    expect(await runtime.hasRememberedKey(profile.profileId)).toBe(false);
    await runtime.deactivateProfile();
    await expect(runtime.openProfile(profile.profileId, LOCAL_PASSWORD)).rejects.toThrow();
    await expect(runtime.openProfile(profile.profileId)).rejects.toThrow();
    expect(
      (await runtime.openProfile(profile.profileId, 'replacement-password')).descriptor.profileId,
    ).toBe(profile.profileId);
  }, 15_000);

  it('opens local accounts only with their password and cannot restart one without it', async () => {
    const first = await createLocal('First');
    const second = await createLocal('Work');
    await runtime.openProfile(second.profileId, LOCAL_PASSWORD);
    await runtime.openProfile(first.profileId, LOCAL_PASSWORD);
    await expect(runtime.openProfile(second.profileId, 'wrong-password')).rejects.toThrow();
    expect(runtime.getActiveProfileId()).toBe(first.profileId);
    await runtime.openProfile(second.profileId, LOCAL_PASSWORD);
    expect(runtime.getActiveProfileId()).toBe(second.profileId);
    await runtime.deactivateProfile({ preserveSelection: true });
    expect((await runtime.getStartupProfile())?.profileId).toBe(second.profileId);
    await expect(runtime.openProfile(second.profileId)).rejects.toThrow('密码');
    await runtime.openProfile(second.profileId, LOCAL_PASSWORD);
    expect(runtime.getActiveProfileId()).toBe(second.profileId);
  }, 15_000);

  it('opens a remembered local account without its password and asks again without a copy', async () => {
    const remembered = await createLocal('Remembered');
    const notRemembered = await createLocal('Not remembered');

    await runtime.openProfile(remembered.profileId, LOCAL_PASSWORD, { remember: true });
    await runtime.deactivateProfile({ preserveSelection: true });
    await expect(runtime.openProfile(notRemembered.profileId)).rejects.toMatchObject({
      code: 'PROFILE_PASSWORD_REQUIRED',
    });
    const reopened = await runtime.openProfile(remembered.profileId);
    expect(reopened.descriptor.profileId).toBe(remembered.profileId);
    await runtime.openProfile(notRemembered.profileId, LOCAL_PASSWORD);
    expect(
      await runtime.runExclusive(() =>
        runtime.withInactiveLocalAccount(remembered.profileId, undefined, async () => 'read'),
      ),
    ).toBe('read');
  });

  it('never stores the password in the remembered key copy', async () => {
    const account = await createLocal('Remembered');
    await runtime.openProfile(account.profileId, LOCAL_PASSWORD, { remember: true });

    const copyPath = path.join(
      runtime.getSharedResolver().roots.dataRoot,
      'shared',
      'secure',
      'profile-keys',
      'remembered',
      `${account.profileId}.bin`,
    );
    const raw = await fs.promises.readFile(copyPath);
    expect(raw.includes(Buffer.from(LOCAL_PASSWORD, 'utf8'))).toBe(false);
    expect(raw.includes(Buffer.from(account.profileId, 'utf8'))).toBe(false);
  });

  it('falls back to the password state when the remembered copy cannot be unsealed', async () => {
    const account = await createLocal('Broken remember');
    await runtime.openProfile(account.profileId, LOCAL_PASSWORD, { remember: true });
    await runtime.deactivateProfile({ preserveSelection: true });
    const copyPath = path.join(
      runtime.getSharedResolver().roots.dataRoot,
      'shared',
      'secure',
      'profile-keys',
      'remembered',
      `${account.profileId}.bin`,
    );
    await fs.promises.writeFile(copyPath, Buffer.from('not an envelope'));

    await expect(runtime.openProfile(account.profileId)).rejects.toMatchObject({
      code: 'PROFILE_PASSWORD_REQUIRED',
    });
    // The unreadable copy is kept: no silent deletion of the user's choice.
    await expect(fs.promises.readFile(copyPath)).resolves.toBeTruthy();
    const reopened = await runtime.openProfile(account.profileId, LOCAL_PASSWORD);
    expect(reopened.descriptor.profileId).toBe(account.profileId);
  });

  it('never opens or reads a target database on a missing or incorrect password', async () => {
    const source = await createLocal('Source');
    const target = await createLocal('Same name');
    await runtime.openProfile(target.profileId, LOCAL_PASSWORD);
    await runtime.openProfile(source.profileId, LOCAL_PASSWORD);
    vi.clearAllMocks();
    await expect(runtime.openProfile(target.profileId)).rejects.toThrow('密码');
    await expect(runtime.openProfile(target.profileId, 'wrong-password')).rejects.toThrow('密码');
    expect(openPowerSyncLocalOnly).not.toHaveBeenCalled();
    expect(mocks.getOptional).not.toHaveBeenCalled();
    expect(mocks.bootstrapDestroy).not.toHaveBeenCalled();
    expect(runtime.getActiveProfileId()).toBe(source.profileId);
  }, 15_000);

  it('isolates two local accounts and two cloud owners while retiring each previous runtime', async () => {
    const profiles = [
      await createLocal('Same name'),
      await createLocal('Same name'),
      await registry.register('IdentityId_cloud_a', 'Same name', 'a@example.com'),
      await registry.register('IdentityId_cloud_b', 'Same name', 'b@example.com'),
    ];
    const sessions = new CloudSessionStore(path.join(rootDir, 'data'));
    for (const profile of profiles.filter((item) => item.cloudBinding)) {
      await sessions.save(profile.profileId, {
        token: 'token-' + profile.profileId,
        sessionId: 'session-' + profile.profileId,
        account: {
          id: profile.localOwnerId,
          email: profile.identifier!,
          name: profile.displayName,
          emailVerified: true,
        },
        expiresAt: '2099-01-01T00:00:00.000Z',
      });
    }
    const cloud = new DesktopCloudConnectionManager(sessions, runtime, async (_url, init) => {
      const active = runtime.getActiveProfileDescriptorSync()!;
      expect(init?.headers).toEqual({ authorization: 'Bearer token-' + active.profileId });
      return new Response(
        JSON.stringify({
          session: { id: 'session-' + active.profileId, expiresAt: '2099-01-01T00:00:00.000Z' },
          user: {
            id: active.localOwnerId,
            email: active.identifier,
            name: active.displayName,
            emailVerified: true,
          },
        }),
      );
    });
    runtime.setBeforeDeactivation(() => cloud.cancel());
    runtime.setAfterActivation(async (profile) => {
      await cloud.restore(profile);
    });
    const contexts = new Set<unknown>();
    const retiredCredentials: Array<{ getAccessToken: () => Promise<string | null> }> = [];
    const paths = new Set<string>();
    for (const [index, profile] of profiles.entries()) {
      const prepared = await runtime.openProfile(
        profile.profileId,
        profile.profileKind === 'local' ? LOCAL_PASSWORD : undefined,
      );
      expect(runtime.getCurrentIdentityId()).toBe(profile.localOwnerId);
      expect(prepared.profileResolver.dbPath).toContain(profile.profileId);
      expect(mocks.bootstrapDestroy).toHaveBeenCalledTimes(index);
      expect(mocks.shutdownPowerSync).toHaveBeenCalledTimes(index);
      if (index > 0) {
        expect(mocks.shutdownPowerSync.mock.invocationCallOrder[index - 1]).toBeLessThan(
          vi.mocked(openPowerSyncLocalOnly).mock.invocationCallOrder[index]!,
        );
      }
      for (const credentials of retiredCredentials)
        expect(await credentials.getAccessToken()).toBeNull();
      if (profile.cloudBinding) {
        expect(await cloud.getState(profile)).toBe('ONLINE');
        const credentials = vi.mocked(ensurePowerSyncSyncMode).mock.calls.at(-1)![0];
        expect(await credentials.getAccessToken()).toBe('token-' + profile.profileId);
        retiredCredentials.push(credentials);
      } else {
        expect(await sessions.load(profile.profileId)).toBeNull();
        expect(await cloud.getState(profile)).toBe('UNBOUND');
      }
      contexts.add(runtime.getActiveProfileAccessContext());
      paths.add(prepared.profileResolver.dbPath);
    }
    await runtime.openProfile(profiles[0]!.profileId, LOCAL_PASSWORD);
    for (const credentials of retiredCredentials)
      expect(await credentials.getAccessToken()).toBeNull();
    for (const profile of profiles.filter((item) => item.cloudBinding)) {
      expect((await sessions.load(profile.profileId))?.account.id).toBe(profile.localOwnerId);
    }
    expect(contexts.size).toBe(4);
    expect(paths.size).toBe(4);
    expect(new Set(profiles.map((profile) => profile.localOwnerId)).size).toBe(4);
  });

  it('creates a local account that opens only with its password and never writes safeStorage keys', async () => {
    const created = await createLocal('Local');
    expect(created.profileKind).toBe('local');
    expect(await runtime.hasCredential(created.profileId)).toBe(true);
    expect(
      fs.existsSync(
        path.join(rootDir, 'data', 'shared', 'secure', 'profile-keys', `${created.profileId}.bin`),
      ),
    ).toBe(false);

    const prepared = await runtime.openProfile(created.profileId, LOCAL_PASSWORD);

    expect(prepared.descriptor.profileKind).toBe('local');
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
    const prepared = await openSeeded();
    await runtime.deactivateProfile();

    expect(runtime.getActiveProfileId()).toBeNull();
    expect(fs.existsSync(prepared.profileResolver.profileDir)).toBe(true);
    expect((await registry.findByOwnerId(prepared.descriptor.localOwnerId))?.profileId).toBe(
      prepared.descriptor.profileId,
    );
  });

  it('preserves the selected Profile when releasing runtime resources for shutdown', async () => {
    const prepared = await openSeeded();

    await runtime.deactivateProfile({ preserveSelection: true });

    expect(runtime.getActiveProfileId()).toBeNull();
    expect(await registry.getActiveProfileId()).toBe(prepared.descriptor.profileId);
    expect(mocks.shutdownPowerSync).toHaveBeenCalledOnce();
  });

  it('withdraws local access after teardown even if the database close fails, and retries the close', async () => {
    await openSeeded();
    mocks.shutdownPowerSync.mockRejectedValueOnce(new Error('database close failed'));
    await expect(runtime.deactivateProfile()).rejects.toThrow('database close failed');
    expect(runtime.getActiveProfileId()).toBeNull();
    expect(runtime.getActiveProfileAccessContext()).toBeNull();
    await runtime.deactivateProfile();
    expect(mocks.shutdownPowerSync).toHaveBeenCalledTimes(2);
    expect(mocks.bootstrapDestroy).toHaveBeenCalledTimes(1);
  });

  it('retires a failed prepared database before retrying the same Profile', async () => {
    const profile = await createLocal('Local');
    mocks.getOptional.mockRejectedValueOnce(new Error('account read failed'));
    mocks.shutdownPowerSync.mockRejectedValueOnce(new Error('database close failed'));
    await expect(runtime.openProfile(profile.profileId, LOCAL_PASSWORD)).rejects.toThrow(
      'database close failed',
    );
    expect(runtime.getCurrentIdentityId()).toBeNull();
    const replacement = await runtime.openProfile(profile.profileId, LOCAL_PASSWORD);
    expect(replacement.descriptor.profileId).toBe(profile.profileId);
    expect(mocks.shutdownPowerSync).toHaveBeenCalledTimes(2);
    expect(mocks.bootstrapInit).toHaveBeenCalledOnce();
  });

  it('closes a database when preparation fails before publishing its runtime', async () => {
    const profile = await createLocal('Local');
    mocks.getOptional.mockRejectedValueOnce(new Error('adoption recovery failed'));
    await expect(runtime.openProfile(profile.profileId, LOCAL_PASSWORD)).rejects.toThrow(
      'adoption recovery failed',
    );
    expect(runtime.getCurrentIdentityId()).toBeNull();
    expect(mocks.shutdownPowerSync).toHaveBeenCalledOnce();
    await runtime.openProfile(profile.profileId, LOCAL_PASSWORD);
    expect(runtime.getActiveProfileId()).not.toBeNull();
  });

  it('finishes a lock only after in-flight activation has been retired', async () => {
    let finishInit!: () => void;
    mocks.bootstrapInit.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishInit = resolve;
        }),
    );
    const activation = openSeeded();
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
    const selection = openSeeded();
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
    await selection;
    expect(runtime.getActiveProfileId()).toBeNull();
    expect(runtime.getCurrentIdentityId()).toBeNull();
    expect(mocks.bootstrapInit).toHaveBeenCalledOnce();
    expect(mocks.bootstrapDestroy).toHaveBeenCalledOnce();
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
    const firstSelection = openSeeded();
    await vi.waitFor(() => expect(openPowerSyncLocalOnly).toHaveBeenCalledOnce());
    const secondProfile = await registry.register('IdentityId_other', 'Other');
    const secondPreparation = runtime.openProfile(secondProfile.profileId);
    finishOpen();
    await vi.waitFor(() => expect(mocks.bootstrapInit).toHaveBeenCalledOnce());
    finishInit();
    const [, next] = await Promise.all([firstSelection, secondPreparation]);
    expect(closedDuringBootstrap).toBe(false);
    expect(runtime.getActiveProfileId()).toBe(next.descriptor.profileId);
  });

  it('clears shell-held references before the bootstrapper destroys modules', async () => {
    const beforeDeactivation = vi.fn();
    runtime.setBeforeDeactivation(beforeDeactivation);

    await openSeeded();
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

    const prepared = await openSeeded();

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
    await expect(openSeeded()).rejects.toThrow('init failed');

    expect(beforeDeactivation).toHaveBeenCalledOnce();
    expect(beforeDeactivation.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.shutdownPowerSync.mock.invocationCallOrder[0]!,
    );
  });

  it('keeps local access active when cloud restore fails', async () => {
    runtime.setAfterActivation(async () => {
      throw new Error('offline');
    });
    const prepared = await openSeeded();
    expect(runtime.getActiveProfileId()).toBe(prepared.descriptor.profileId);
  });

  it('serializes concurrent switches and lock without leaving an active runtime', async () => {
    const first = await registry.register('IdentityId_first', 'First');
    const second = await registry.register('IdentityId_second', 'Second');
    await Promise.all([
      runtime.openProfile(first.profileId),
      runtime.openProfile(second.profileId),
      runtime.deactivateProfile(),
    ]);
    expect(runtime.getActiveProfileId()).toBeNull();
    expect(mocks.bootstrapInit).toHaveBeenCalledTimes(2);
    expect(mocks.bootstrapDestroy).toHaveBeenCalledTimes(2);
    expect(mocks.shutdownPowerSync).toHaveBeenCalledTimes(2);
  });

  it('locks on a database-close failure and retries cleanup before the next open', async () => {
    const first = await registry.register('IdentityId_first', 'First');
    const second = await registry.register('IdentityId_second', 'Second');
    await runtime.openProfile(first.profileId);
    mocks.shutdownPowerSync.mockRejectedValueOnce(new Error('close failed'));
    await expect(runtime.openProfile(second.profileId)).rejects.toThrow('close failed');
    expect(runtime.getActiveProfileId()).toBeNull();
    expect(mocks.bootstrapInit).toHaveBeenCalledTimes(1);
    await runtime.openProfile(second.profileId);
    expect(runtime.getActiveProfileId()).toBe(second.profileId);
    expect(mocks.bootstrapInit).toHaveBeenCalledTimes(2);
  });

  it('removes a non-active Profile with its local data and secure credentials', async () => {
    const descriptor = await registry.register('cloud-1', 'Cloud User', 'user@example.com');
    const profileDir = path.join(rootDir, 'data', 'profiles', descriptor.profileId);
    const keyPath = path.join(
      rootDir,
      'data',
      'shared',
      'secure',
      'profile-keys',
      `${descriptor.profileId}.bin`,
    );
    const passwordPath = path.join(
      rootDir,
      'data',
      'shared',
      'secure',
      'profile-passwords',
      `${descriptor.profileId}.json`,
    );
    const sessionPath = path.join(
      rootDir,
      'data',
      'shared',
      'secure',
      'cloud-sessions',
      `${descriptor.profileId}.bin`,
    );
    await Promise.all([
      fs.promises.mkdir(profileDir, { recursive: true }),
      fs.promises.mkdir(path.dirname(keyPath), { recursive: true }),
      fs.promises.mkdir(path.dirname(passwordPath), { recursive: true }),
      fs.promises.mkdir(path.dirname(sessionPath), { recursive: true }),
    ]);
    await Promise.all([
      fs.promises.writeFile(keyPath, 'key'),
      fs.promises.writeFile(passwordPath, '{}'),
      fs.promises.writeFile(sessionPath, 'session'),
    ]);

    const staging = path.join(rootDir, 'cache', 'snapshot-staging', descriptor.profileId);
    await fs.promises.mkdir(staging, { recursive: true });
    await fs.promises.writeFile(path.join(staging, 'old-snapshot'), 'old account');
    await runtime.removeProfile(descriptor.profileId);
    expect(session.fromPartition).toHaveBeenLastCalledWith(
      `persist:profile-${descriptor.profileId}`,
    );
    const cleared = vi.mocked(session.fromPartition).mock.results.at(-1)?.value;
    expect(cleared.clearStorageData).toHaveBeenCalledOnce();
    expect(cleared.clearCache).toHaveBeenCalledOnce();
    expect(fs.existsSync(staging)).toBe(false);

    expect(await registry.findByCloudAccountId('cloud-1')).toBeNull();
    expect(fs.existsSync(profileDir)).toBe(false);
    expect(fs.existsSync(keyPath)).toBe(false);
    expect(fs.existsSync(passwordPath)).toBe(false);
    expect(fs.existsSync(sessionPath)).toBe(false);
    const readded = await registry.register('cloud-1', 'Cloud User', 'user@example.com');
    expect(readded.profileId).toBe(descriptor.profileId);
    expect(fs.existsSync(staging)).toBe(false);
    expect(fs.existsSync(profileDir)).toBe(false);
  });

  it('refuses to sign out when no Profile is active', async () => {
    const invalidate = vi.fn(async () => undefined);

    await expect(runtime.signOutActiveProfile(invalidate)).rejects.toMatchObject({
      code: 'PROFILE_NOT_ACTIVE',
    });
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('invalidates the cloud session before deactivating, then removes the Profile like the chooser', async () => {
    const descriptor = await seedRegistered('cloud-sign-out');
    await runtime.openProfile(descriptor.profileId);
    const profileDir = path.join(rootDir, 'data', 'profiles', descriptor.profileId);
    const observed: Array<{ activeId: string | null; stillRegistered: boolean }> = [];

    await runtime.signOutActiveProfile(async (active) => {
      observed.push({
        activeId: runtime.getActiveProfileId(),
        stillRegistered: (await registry.list()).some(
          (profile) => profile.profileId === active.profileId,
        ),
      });
    });

    expect(observed).toEqual([{ activeId: descriptor.profileId, stillRegistered: true }]);
    expect(runtime.getActiveProfileId()).toBeNull();
    expect(await registry.findByCloudAccountId('cloud-sign-out')).toBeNull();
    expect(fs.existsSync(profileDir)).toBe(false);
  });

  it('reports SIGN_OUT_PARTIAL when the deactivated Profile cannot be removed', async () => {
    await openSeeded('cloud-partial');
    vi.spyOn(registry, 'remove').mockRejectedValueOnce(new Error('disk full'));

    await expect(runtime.signOutActiveProfile(async () => undefined)).rejects.toMatchObject({
      code: 'SIGN_OUT_PARTIAL',
      message: 'disk full',
    });
    expect(runtime.getActiveProfileId()).toBeNull();
  });
});
