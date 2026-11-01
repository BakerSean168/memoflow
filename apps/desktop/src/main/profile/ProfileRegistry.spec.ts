import { createSharedPathResolver, resolveDesktopStorageRoots } from '../paths';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SharedPathResolver } from '../paths';
import { ProfileRegistry } from './profile-registry';

function createSharedResolver(rootDir: string): SharedPathResolver {
  return createSharedPathResolver(
    resolveDesktopStorageRoots({
      platform: 'linux',
      channel: 'test',
      home: rootDir,
      env: { MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: rootDir },
    }),
  );
}

describe('ProfileRegistry', () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'desktop-profile-registry-'));
  });

  afterEach(async () => {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  });

  it('creates independent local accounts with no cloud binding', async () => {
    const registry = new ProfileRegistry(createSharedResolver(rootDir));
    const first = await registry.createLocalAccount('Local A');
    const second = await registry.createLocalAccount('Work');

    expect(second.profileId).not.toBe(first.profileId);
    expect(second.localOwnerId).not.toBe(first.localOwnerId);
    expect(second.keyEnvelopeId).not.toBe(first.keyEnvelopeId);
    expect(second.profileKind).toBe('local');
    expect(second.cloudBinding).toBeNull();
    expect(second.identifier).toBeNull();
    expect(second.profileId).toMatch(/^p_[a-f0-9]{24}$/);
    expect(first.profileId).not.toContain('Local');
    expect(await new ProfileRegistry(createSharedResolver(rootDir)).list()).toHaveLength(2);
  });

  it('rejects a local descriptor that carries a cloud binding', async () => {
    const resolver = createSharedResolver(rootDir);
    await fs.promises.mkdir(resolver.profilesRegistryDir, { recursive: true });
    await fs.promises.writeFile(
      resolver.registryPath,
      JSON.stringify({
        version: 2,
        activeProfileId: null,
        profiles: [
          {
            profileId: 'p_aaaaaaaaaaaaaaaaaaaaaaaa',
            profileKind: 'local',
            localOwnerId: 'owner',
            displayName: 'Local',
            avatarSeed: 'seed',
            keyEnvelopeId: 'key',
            identifier: null,
            cloudBinding: { cloudAccountId: 'cloud', boundAt: 1, lastValidatedAt: null },
            lastActiveAt: 1,
            createdAt: 1,
            hasSnapshot: false,
            lastSnapshotVersion: null,
            lastSnapshotHydratedAt: null,
            status: 'ready',
          },
        ],
      }),
    );

    await expect(new ProfileRegistry(resolver).list()).rejects.toThrow(
      'Local Profile cannot have a cloud binding',
    );
  });

  it('does not publish failed writes and accepts a retry after persistence recovers', async () => {
    const registry = new ProfileRegistry(createSharedResolver(rootDir));
    const first = await registry.createLocalAccount('Local A');
    const rename = vi.spyOn(fs.promises, 'rename').mockRejectedValueOnce(new Error('disk full'));
    await expect(
      registry.updateProfileMetadata(first.profileId, { displayName: 'Lost' }),
    ).rejects.toThrow('disk full');
    rename.mockRestore();
    expect((await registry.list())[0].displayName).toBe(first.displayName);
    await registry.updateProfileMetadata(first.profileId, { displayName: 'Saved' });
    expect((await new ProfileRegistry(createSharedResolver(rootDir)).list())[0].displayName).toBe(
      'Saved',
    );
  });

  it('tracks snapshot metadata and profile status', async () => {
    const registry = new ProfileRegistry(createSharedResolver(rootDir));

    const descriptor = await registry.register('identity-1', 'Test User', 'test@example.com');
    expect(descriptor.status).toBe('pending');
    expect(descriptor.hasSnapshot).toBe(false);

    await registry.recordSnapshotHydration(descriptor.profileId, {
      version: '2026-05-18T00:00:00Z',
      hydratedAt: 123456,
    });
    await registry.markReady(descriptor.profileId);

    const reloaded = await registry.findByOwnerId('identity-1');
    expect(reloaded).not.toBeNull();
    expect(reloaded?.hasSnapshot).toBe(true);
    expect(reloaded?.lastSnapshotVersion).toBe('2026-05-18T00:00:00Z');
    expect(reloaded?.lastSnapshotHydratedAt).toBe(123456);
    expect(reloaded?.status).toBe('ready');
  });

  it('returns existing descriptor when registering the same identityId twice', async () => {
    const registry = new ProfileRegistry(createSharedResolver(rootDir));

    const first = await registry.register('identity-1', 'Alice', 'alice@example.com');
    const second = await registry.register('identity-1', 'Alice Updated', 'alice@example.com');

    expect(second.profileId).toBe(first.profileId);
    expect(second.displayName).toBe('Alice');
  });

  it('assigns different profileIds for different identityIds', async () => {
    const registry = new ProfileRegistry(createSharedResolver(rootDir));

    const a = await registry.register('identity-a', 'Alice', 'alice@example.com');
    const b = await registry.register('identity-b', 'Bob', 'bob@example.com');

    expect(a.profileId).not.toBe(b.profileId);
  });

  it('lists profiles sorted by lastActiveAt descending', async () => {
    const registry = new ProfileRegistry(createSharedResolver(rootDir));

    const a = await registry.register('identity-a', 'Alice');
    await registry.register('identity-b', 'Bob');
    await registry.touch(a.profileId);

    const list = await registry.list();
    expect(list.length).toBe(2);
    expect(list[0]!.localOwnerId).toBe('identity-a');
    expect(list[1]!.localOwnerId).toBe('identity-b');
  });

  it('removes a profile from registry and clears activeProfileId if it was active', async () => {
    const registry = new ProfileRegistry(createSharedResolver(rootDir));

    const descriptor = await registry.register('identity-1', 'Alice');
    await registry.setActiveProfile(descriptor.profileId);
    expect(await registry.getActiveProfileId()).toBe(descriptor.profileId);

    await registry.remove(descriptor.profileId);

    expect(await registry.getActiveProfileId()).toBeNull();
    expect(await registry.findByOwnerId('identity-1')).toBeNull();
  });

  it('findByIdentifier performs case-insensitive lookup', async () => {
    const registry = new ProfileRegistry(createSharedResolver(rootDir));

    await registry.register('identity-1', 'Alice', 'Alice@Example.com');

    const found = await registry.findByIdentifier('alice@example.com');
    expect(found).not.toBeNull();
    expect(found?.localOwnerId).toBe('identity-1');
  });

  it('findByIdentifier returns null for empty or whitespace-only input', async () => {
    const registry = new ProfileRegistry(createSharedResolver(rootDir));

    await registry.register('identity-1', 'Alice', 'alice@example.com');

    expect(await registry.findByIdentifier('')).toBeNull();
    expect(await registry.findByIdentifier('   ')).toBeNull();
  });

  it('finds registered profiles by their cloud account binding', async () => {
    const registry = new ProfileRegistry(createSharedResolver(rootDir));
    const registered = await registry.register('identity-1', 'Alice', 'alice@example.com');

    expect(await registry.findByCloudAccountId('identity-1')).toEqual(registered);
    expect(await registry.findByCloudAccountId('missing')).toBeNull();
  });

  it('markError sets profile status to error', async () => {
    const registry = new ProfileRegistry(createSharedResolver(rootDir));

    const descriptor = await registry.register('identity-1', 'Alice');
    await registry.markError(descriptor.profileId);

    const found = await registry.findByOwnerId('identity-1');
    expect(found?.status).toBe('error');
  });

  it('clearSnapshotState resets snapshot fields', async () => {
    const registry = new ProfileRegistry(createSharedResolver(rootDir));

    const descriptor = await registry.register('identity-1', 'Alice');
    await registry.recordSnapshotHydration(descriptor.profileId, {
      version: 'v1',
      hydratedAt: Date.now(),
    });

    let found = await registry.findByOwnerId('identity-1');
    expect(found?.hasSnapshot).toBe(true);

    await registry.clearSnapshotState(descriptor.profileId);
    found = await registry.findByOwnerId('identity-1');
    expect(found?.hasSnapshot).toBe(false);
    expect(found?.lastSnapshotVersion).toBeNull();
    expect(found?.lastSnapshotHydratedAt).toBeNull();
  });

  it('recovers from corrupt registry JSON by backing up and resetting', async () => {
    const resolver = createSharedResolver(rootDir);
    const registryDir = resolver.profilesRegistryDir;
    await fs.promises.mkdir(registryDir, { recursive: true });
    await fs.promises.writeFile(resolver.registryPath, '{invalid json!!!', 'utf8');

    const registry = new ProfileRegistry(resolver);
    const list = await registry.list();
    expect(list).toEqual([]);

    // Backup file should exist
    const files = await fs.promises.readdir(registryDir);
    const backupFiles = files.filter((f) => f.includes('.corrupt.'));
    expect(backupFiles.length).toBe(1);
  });

  it('creates registry file on first run when it does not exist', async () => {
    const resolver = createSharedResolver(rootDir);

    const registry = new ProfileRegistry(resolver);
    const list = await registry.list();
    expect(list).toEqual([]);

    expect(fs.existsSync(resolver.registryPath)).toBe(true);
  });

  it('setActiveProfile throws when profileId does not exist', async () => {
    const registry = new ProfileRegistry(createSharedResolver(rootDir));

    await expect(registry.setActiveProfile('nonexistent')).rejects.toThrow('Profile not found');
  });

  it('getActiveProfile returns null when no profile is active', async () => {
    const registry = new ProfileRegistry(createSharedResolver(rootDir));

    expect(await registry.getActiveProfile()).toBeNull();
  });

  it('register updates identifier when it changes for existing profile', async () => {
    const registry = new ProfileRegistry(createSharedResolver(rootDir));

    const first = await registry.register('identity-1', 'Alice', 'alice@old.com');
    const updated = await registry.register('identity-1', 'Alice', 'alice@new.com');

    expect(updated.profileId).toBe(first.profileId);
    expect(updated.identifier).toBe('alice@new.com');
  });

  it('persists concurrent creates without lost updates or duplicates', async () => {
    const registry = new ProfileRegistry(createSharedResolver(rootDir));
    const results = await Promise.all([
      registry.createLocalAccount('One'),
      registry.createLocalAccount('Two'),
      registry.createLocalAccount('Three'),
    ]);
    expect(new Set(results.map((profile) => profile.profileId)).size).toBe(3);
    expect(await registry.list()).toHaveLength(3);
  });

  it('creates a local account that survives a reload with its derived identity', async () => {
    const resolver = createSharedResolver(rootDir);
    const first = await new ProfileRegistry(resolver).createLocalAccount('Persisted');

    const reloaded = await new ProfileRegistry(resolver).findByOwnerId(first.localOwnerId);

    expect(reloaded?.profileId).toBe(first.profileId);
    expect(reloaded?.localOwnerId).toMatch(/^IdentityId_/);
    expect(reloaded?.avatarSeed).toBe(first.avatarSeed);
    expect(reloaded?.profileKind).toBe('local');
    expect(reloaded?.cloudBinding).toBeNull();
    expect(reloaded?.displayName).toBe('Persisted');
  });

  it('rejects legacy registry versions instead of silently migrating them', async () => {
    const resolver = createSharedResolver(rootDir);
    await fs.promises.mkdir(resolver.profilesRegistryDir, { recursive: true });
    await fs.promises.writeFile(
      resolver.registryPath,
      JSON.stringify({
        version: 1,
        activeProfileId: null,
        profiles: [],
      }),
    );

    await expect(new ProfileRegistry(resolver).list()).rejects.toThrow(
      'Unsupported Profile registry version: 1',
    );
  });
});
