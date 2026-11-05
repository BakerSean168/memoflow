import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSharedPathResolver } from '../paths/shared-path-resolver';
import { resolveDesktopStorageRoots } from '../paths/desktop-storage-roots';
import { createProfilePathResolver } from '../paths/profile-path-resolver';
import { PROFILE_AVATAR_DATA_URL_PREFIX } from '@memoflow/desktop-contracts';
import { ProfileAvatarStore } from './profile-avatar-store';

// 1×1 transparent PNG.
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);
const PNG_DATA_URL = `${PROFILE_AVATAR_DATA_URL_PREFIX}${PNG_BYTES.toString('base64')}`;

describe('ProfileAvatarStore', () => {
  let root: string;
  let store: ProfileAvatarStore;
  let shared = createSharedPathResolver(
    resolveDesktopStorageRoots({
      platform: 'linux',
      channel: 'test',
      home: '/tmp',
      env: { MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: '/tmp' },
    }),
  );

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-avatar-'));
    shared = createSharedPathResolver(
      resolveDesktopStorageRoots({
        platform: 'linux',
        channel: 'test',
        home: root,
        env: { MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: root },
      }),
    );
    store = new ProfileAvatarStore(shared);
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('writes the avatar into the Profile storage directory and reads it back', async () => {
    const profileId = 'p_aaaaaaaaaaaaaaaaaaaaaaaa';
    await store.write(profileId, PNG_DATA_URL);

    const { avatarPath } = createProfilePathResolver(shared.roots, profileId);
    expect(fs.existsSync(avatarPath)).toBe(true);
    expect(avatarPath).toBe(path.join(root, 'data/profiles', profileId, 'storage/avatar.png'));
    await expect(store.read(profileId)).resolves.toBe(PNG_DATA_URL);
  });

  it('returns null when a Profile has no avatar yet', async () => {
    await expect(store.read('p_bbbbbbbbbbbbbbbbbbbbbbbb')).resolves.toBeNull();
  });

  it('rejects payloads that are not normalized PNG data URLs', async () => {
    await expect(
      store.write('p_cccccccccccccccccccccccc', 'data:image/jpeg;base64,AAAA'),
    ).rejects.toThrow();
    await expect(
      store.write(
        'p_cccccccccccccccccccccccc',
        `${PROFILE_AVATAR_DATA_URL_PREFIX}${Buffer.from('not a png').toString('base64')}`,
      ),
    ).rejects.toThrow();
  });
});
