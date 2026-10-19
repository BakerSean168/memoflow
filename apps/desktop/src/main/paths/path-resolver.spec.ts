import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProfilePathResolver, computeProfileId } from './profile-path-resolver';
import { createSharedPathResolver } from './shared-path-resolver';
import { resolveDesktopStorageRoots, type DesktopStorageRoots } from './desktop-storage-roots';
import { ensureProfileDirs } from './ensure-dirs';

describe('storage path derivation', () => {
  let root: string;
  let roots: DesktopStorageRoots;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-paths-'));
    roots = resolveDesktopStorageRoots({
      platform: 'linux',
      channel: 'test',
      home: root,
      env: { MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: root },
    });
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('hashes identities deterministically without exposing identity', () => {
    expect(computeProfileId('alice')).toBe(computeProfileId('alice'));
    expect(computeProfileId('alice')).not.toBe(computeProfileId('bob'));
    expect(computeProfileId('alice')).toMatch(/^p_[0-9a-f]{24}$/);
  });
  it('separates shared config, durable data, state and cache without writes', () => {
    const shared = createSharedPathResolver(roots);
    expect(shared.deviceIdPath).toBe(path.join(roots.dataRoot, 'shared/auth/device-id'));
    expect(shared.registryPath).toBe(path.join(roots.dataRoot, 'shared/profiles/registry.json'));
    expect(shared.runtimeConfigPath).toBe(
      path.join(roots.configRoot, 'shared/preferences/desktop-runtime.json'),
    );
    expect(shared.profileAccessWindowStatePath).toBe(
      path.join(roots.stateRoot, 'shared/ui/profile-access-window-state.json'),
    );
    expect(shared.snapshotStagingDir).toBe(path.join(roots.cacheRoot, 'snapshot-staging'));
    expect(shared.tempDir).toBe(path.join(roots.cacheRoot, 'temp'));
    expect(shared.logsDir).toBe(roots.logsDir);
    expect(fs.readdirSync(root)).toEqual([]);
  });
  it('derives redirected Windows paths using the injected platform on any test host', () => {
    const windows = resolveDesktopStorageRoots({
      platform: 'win32',
      channel: 'test',
      home: 'C:/Users/me',
      env: { APPDATA: 'R:/Roaming', LOCALAPPDATA: 'L:/Local' },
    });
    const shared = createSharedPathResolver(windows);
    const profile = createProfilePathResolver(windows, 'p_windows');
    expect(shared.registryPath).toBe(
      path.win32.join('L:/Local/MemoFlow-Test/data/shared/profiles/registry.json'),
    );
    expect(shared.runtimeConfigPath).toBe(
      path.win32.join('R:/Roaming/MemoFlow-Test/shared/preferences/desktop-runtime.json'),
    );
    expect(profile.dbPath).toBe(
      path.win32.join('L:/Local/MemoFlow-Test/data/profiles/p_windows/db/powersync.sqlite'),
    );
    expect(profile.uiDir).toBe(
      path.win32.join('L:/Local/MemoFlow-Test/state/profiles/p_windows/ui'),
    );
  });
  it('derives every Profile path under its semantic owner', () => {
    const profile = createProfilePathResolver(roots, 'p_test123');
    const data = path.join(roots.dataRoot, 'profiles/p_test123');
    const ui = path.join(roots.stateRoot, 'profiles/p_test123/ui');
    expect(profile).toEqual({
      profileId: 'p_test123',
      profileDir: data,
      authDir: path.join(data, 'auth'),
      tokensPath: path.join(data, 'auth/tokens.enc'),
      dbDir: path.join(data, 'db'),
      dbPath: path.join(data, 'db/powersync.sqlite'),
      snapshotMetaPath: path.join(data, 'db/snapshot-meta.json'),
      storageDir: path.join(data, 'storage'),
      repositoryStorageDir: path.join(data, 'storage/repository-storage'),
      knowledgeNotesDir: path.join(data, 'storage/knowledge-notes'),
      attachmentsDir: path.join(data, 'storage/attachments'),
      localVaultBindingPath: path.join(data, 'storage/local-vault-binding.json'),
      localVaultWriteLedgerPath: path.join(data, 'storage/local-vault-write-ledger.json'),
      knowledgeRepositoryAutoSyncStatePath: path.join(
        data,
        'storage/knowledge-repository-auto-sync.json',
      ),
      uiDir: ui,
      mainWindowStatePath: path.join(ui, 'main-window-state.json'),
      desktopNotificationPreferencePath: path.join(ui, 'notification-preference.json'),
    });
  });
  it('creates only directories needed to open a Profile, idempotently', () => {
    const a = createProfilePathResolver(roots, computeProfileId('alice'));
    const b = createProfilePathResolver(roots, computeProfileId('bob'));
    ensureProfileDirs(a);
    ensureProfileDirs(a);
    ensureProfileDirs(b);
    for (const profile of [a, b]) {
      for (const dir of [profile.authDir, profile.dbDir, profile.storageDir, profile.uiDir])
        expect(fs.existsSync(dir)).toBe(true);
      for (const dir of [
        profile.repositoryStorageDir,
        profile.knowledgeNotesDir,
        profile.attachmentsDir,
      ])
        expect(fs.existsSync(dir)).toBe(false);
    }
    expect(a.dbPath).not.toBe(b.dbPath);
    expect(a.tokensPath).not.toBe(b.tokensPath);
    expect(a.uiDir).not.toBe(b.uiDir);
  });
  for (const id of ['../escape', 'p_../escape', 'p_a/b', 'p_a\\b', '/tmp/profile', '', 'p_..']) {
    it(`rejects traversal: ${id}`, () =>
      expect(() => createProfilePathResolver(roots, id)).toThrow('Invalid profileId'));
  }
});
