import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSharedPathResolver } from '../paths';
import { ProfileRegistry } from './profile-registry';
import {
  IDENTITY_RESET_MARKER_FILENAME,
  identityResetMarkerPath,
  runIdentityResetOnce,
} from './identity-reset';
import type { DesktopStorageRoots } from '../paths';

describe('runIdentityResetOnce', () => {
  let rootDir: string;
  let roots: DesktopStorageRoots;

  const seed = async (relativePath: string, contents = '{}'): Promise<string> => {
    const target = path.join(rootDir, relativePath);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, contents, 'utf8');
    return target;
  };

  const remains = async (target: string): Promise<boolean> => {
    try {
      await fs.promises.lstat(target);
      return true;
    } catch {
      return false;
    }
  };

  beforeEach(async () => {
    rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'identity-reset-'));
    roots = {
      platform: 'linux',
      channel: 'test',
      configRoot: path.join(rootDir, 'config'),
      dataRoot: path.join(rootDir, 'data'),
      stateRoot: path.join(rootDir, 'state'),
      cacheRoot: path.join(rootDir, 'cache'),
      logsDir: path.join(rootDir, 'state', 'logs'),
      electronUserData: path.join(rootDir, 'config', 'electron'),
      electronSessionData: path.join(rootDir, 'data', 'chromium-session'),
    };

    await seed(
      'data/shared/profiles/registry.json',
      JSON.stringify({
        version: 2,
        activeProfileId: 'p_aaaaaaaaaaaaaaaaaaaaaaaa',
        profiles: [
          {
            profileId: 'p_aaaaaaaaaaaaaaaaaaaaaaaa',
            profileKind: 'guest',
            localOwnerId: 'owner',
            displayName: '访客 1234',
            avatarSeed: 'seed',
            keyEnvelopeId: 'key',
            identifier: null,
            cloudBinding: null,
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
    await seed('data/shared/profiles/cleanup/p_bbbbbbbbbbbbbbbbbbbbbbbb.json');
    await seed('data/shared/profiles/imports/p_aaaaaaaaaaaaaaaaaaaaaaaa/journal.json');
    await seed('data/profiles/p_aaaaaaaaaaaaaaaaaaaaaaaa/db/powersync.sqlite', 'db');
    await seed('data/profiles/p_aaaaaaaaaaaaaaaaaaaaaaaa/storage/knowledge-notes/note.md', 'note');
    await seed('data/profiles/.deleting-p_bbbbbbbbbbbbbbbbbbbbbbbb/db/powersync.sqlite', 'db');
    await seed('data/shared/secure/profile-pins/p_aaaaaaaaaaaaaaaaaaaaaaaa.json');
    await seed('data/shared/secure/profile-keys/p_aaaaaaaaaaaaaaaaaaaaaaaa.bin', 'key');
    await seed('data/shared/secure/cloud-sessions/p_aaaaaaaaaaaaaaaaaaaaaaaa.bin', 'session');
    await seed('data/shared/secure/profile-passwords/p_aaaaaaaaaaaaaaaaaaaaaaaa.json');
    await seed('state/profiles/p_aaaaaaaaaaaaaaaaaaaaaaaa/ui/main-window-state.json');
    // Out-of-scope data that must survive: device identity, global session, cache.
    await seed('data/shared/auth/device-id', 'device');
    await seed('data/chromium-session/Cookies', 'cookies');
    await seed('cache/snapshot-staging/p_aaaaaaaaaaaaaaaaaaaaaaaa/chunk', 'chunk');
  });

  afterEach(async () => fs.promises.rm(rootDir, { recursive: true, force: true }));

  it('deletes every identity-owned path and leaves unrelated data untouched', async () => {
    const outcome = await runIdentityResetOnce(roots, Date.UTC(2026, 10, 1));

    expect(outcome.executed).toBe(true);
    expect(outcome.removedPaths).toEqual([
      path.join(roots.dataRoot, 'shared', 'profiles'),
      path.join(roots.dataRoot, 'profiles'),
      path.join(roots.dataRoot, 'shared', 'secure', 'profile-pins'),
      path.join(roots.dataRoot, 'shared', 'secure', 'profile-passwords'),
      path.join(roots.dataRoot, 'shared', 'secure', 'profile-keys'),
      path.join(roots.dataRoot, 'shared', 'secure', 'cloud-sessions'),
      path.join(roots.stateRoot, 'profiles'),
    ]);
    for (const removed of outcome.removedPaths) {
      expect(await remains(removed)).toBe(false);
    }
    expect(await remains(path.join(rootDir, 'data/shared/auth/device-id'))).toBe(true);
    expect(await remains(path.join(rootDir, 'data/chromium-session/Cookies'))).toBe(true);
    expect(
      await remains(path.join(rootDir, 'cache/snapshot-staging/p_aaaaaaaaaaaaaaaaaaaaaaaa')),
    ).toBe(true);
  });

  it('writes a versioned marker outside the deleted scope', async () => {
    await runIdentityResetOnce(roots, Date.UTC(2026, 10, 1));

    const marker = identityResetMarkerPath(roots);
    expect(marker).toBe(path.join(roots.dataRoot, IDENTITY_RESET_MARKER_FILENAME));
    expect(JSON.parse(await fs.promises.readFile(marker, 'utf8'))).toEqual({
      version: 1,
      executedAt: new Date(Date.UTC(2026, 10, 1)).toISOString(),
    });
  });

  it('is a no-op once the marker exists, so data created afterwards survives', async () => {
    await runIdentityResetOnce(roots);
    const recreated = await seed(
      'data/profiles/p_cccccccccccccccccccccccc/db/powersync.sqlite',
      'db',
    );

    const second = await runIdentityResetOnce(roots);

    expect(second).toEqual({ executed: false, removedPaths: [] });
    expect(await remains(recreated)).toBe(true);
  });

  it('leaves the Profile registry empty when composed before registry load', async () => {
    await runIdentityResetOnce(roots);

    const registry = new ProfileRegistry(createSharedPathResolver(roots));
    await expect(registry.list()).resolves.toEqual([]);
    await expect(registry.getActiveProfile()).resolves.toBeNull();
  });
});
