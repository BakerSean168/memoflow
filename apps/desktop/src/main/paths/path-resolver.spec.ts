import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createProfilePathResolver, computeProfileId } from './profile-path-resolver';
import { ensureProfileDirs, ensureSharedDirs } from './ensure-dirs';
import type { SharedPathResolver } from './types';

describe('profile-path-resolver', () => {
  it('computeProfileId produces deterministic output', () => {
    const id1 = computeProfileId('identity-abc');
    const id2 = computeProfileId('identity-abc');
    expect(id1).toBe(id2);
  });

  it('computeProfileId produces different outputs for different inputs', () => {
    const id1 = computeProfileId('identity-a');
    const id2 = computeProfileId('identity-b');
    expect(id1).not.toBe(id2);
  });

  it('computeProfileId starts with p_ prefix', () => {
    const id = computeProfileId('test');
    expect(id).toMatch(/^p_[0-9a-f]{24}$/);
  });

  it('createProfilePathResolver produces correct path structure', () => {
    const resolver = createProfilePathResolver('/root', 'p_test123');

    expect(resolver.profileId).toBe('p_test123');
    expect(resolver.profileDir).toBe(path.join('/root', 'profiles', 'p_test123'));
    expect(resolver.authDir).toBe(path.join('/root', 'profiles', 'p_test123', 'auth'));
    expect(resolver.tokensPath).toBe(
      path.join('/root', 'profiles', 'p_test123', 'auth', 'tokens.enc'),
    );
    expect(resolver.dbDir).toBe(path.join('/root', 'profiles', 'p_test123', 'db'));
    expect(resolver.dbPath).toBe(
      path.join('/root', 'profiles', 'p_test123', 'db', 'powersync.sqlite'),
    );
    expect(resolver.snapshotMetaPath).toBe(
      path.join('/root', 'profiles', 'p_test123', 'db', 'snapshot-meta.json'),
    );
    expect(resolver.storageDir).toBe(path.join('/root', 'profiles', 'p_test123', 'storage'));
    expect(resolver.repositoryStorageDir).toBe(
      path.join('/root', 'profiles', 'p_test123', 'storage', 'repository-storage'),
    );
    expect(resolver.knowledgeNotesDir).toBe(
      path.join('/root', 'profiles', 'p_test123', 'storage', 'knowledge-notes'),
    );
    expect(resolver.attachmentsDir).toBe(
      path.join('/root', 'profiles', 'p_test123', 'storage', 'attachments'),
    );
    expect(resolver.knowledgeRepositoryAutoSyncStatePath).toBe(
      path.join('/root', 'profiles', 'p_test123', 'storage', 'knowledge-repository-auto-sync.json'),
    );
    expect(resolver.uiDir).toBe(path.join('/root', 'profiles', 'p_test123', 'ui'));
    expect(resolver.mainWindowStatePath).toBe(
      path.join('/root', 'profiles', 'p_test123', 'ui', 'main-window-state.json'),
    );
    expect(resolver.desktopNotificationPreferencePath).toBe(
      path.join('/root', 'profiles', 'p_test123', 'ui', 'notification-preference.json'),
    );
    expect(resolver.desktopNotificationPreferencePath).not.toBe(resolver.mainWindowStatePath);
  });
});

describe('ensure-dirs', () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ensure-dirs-'));
  });

  afterEach(async () => {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  });

  it('ensureProfileDirs creates all profile subdirectories', () => {
    const resolver = createProfilePathResolver(rootDir, 'p_test');
    ensureProfileDirs(resolver);

    expect(fs.existsSync(resolver.profileDir)).toBe(true);
    expect(fs.existsSync(resolver.authDir)).toBe(true);
    expect(fs.existsSync(resolver.dbDir)).toBe(true);
    expect(fs.existsSync(resolver.storageDir)).toBe(true);
    expect(fs.existsSync(resolver.repositoryStorageDir)).toBe(true);
    expect(fs.existsSync(resolver.knowledgeNotesDir)).toBe(true);
    expect(fs.existsSync(resolver.attachmentsDir)).toBe(true);
    expect(fs.existsSync(resolver.uiDir)).toBe(true);
  });

  it('ensureProfileDirs is idempotent', () => {
    const resolver = createProfilePathResolver(rootDir, 'p_test');
    ensureProfileDirs(resolver);
    ensureProfileDirs(resolver); // Should not throw
    expect(fs.existsSync(resolver.profileDir)).toBe(true);
  });

  it('ensureSharedDirs creates all shared directories', () => {
    const userFilesRoot = path.join(rootDir, 'user-files');
    const resolver: SharedPathResolver = {
      rootDir,
      sharedDir: path.join(rootDir, 'shared'),
      authDir: path.join(rootDir, 'shared', 'auth'),
      configDir: path.join(rootDir, 'shared', 'config'),
      uiDir: path.join(rootDir, 'shared', 'ui'),
      profilesRegistryDir: path.join(rootDir, 'shared', 'profiles'),
      deviceIdPath: path.join(rootDir, 'shared', 'auth', 'device-id'),
      runtimeConfigPath: path.join(rootDir, 'shared', 'config', 'desktop-runtime.json'),
      profileAccessWindowStatePath: path.join(rootDir, 'shared', 'ui', 'profile-access-window-state.json'),
      registryPath: path.join(rootDir, 'shared', 'profiles', 'registry.json'),
      cacheDir: path.join(rootDir, 'cache'),
      snapshotStagingDir: path.join(rootDir, 'cache', 'snapshot-staging'),
      downloadsDir: path.join(rootDir, 'cache', 'downloads'),
      tempDir: path.join(rootDir, 'cache', 'temp'),
      logsDir: path.join(rootDir, 'logs'),
      userFilesRootDir: userFilesRoot,
      userFilesExportsDir: path.join(userFilesRoot, 'exports'),
      userFilesDownloadsDir: path.join(userFilesRoot, 'downloads'),
      userFilesAttachmentsDir: path.join(userFilesRoot, 'attachments'),
    };

    ensureSharedDirs(resolver);

    expect(fs.existsSync(resolver.sharedDir)).toBe(true);
    expect(fs.existsSync(resolver.authDir)).toBe(true);
    expect(fs.existsSync(resolver.configDir)).toBe(true);
    expect(fs.existsSync(resolver.uiDir)).toBe(true);
    expect(fs.existsSync(resolver.profilesRegistryDir)).toBe(true);
    expect(fs.existsSync(resolver.cacheDir)).toBe(true);
    expect(fs.existsSync(resolver.snapshotStagingDir)).toBe(true);
    expect(fs.existsSync(resolver.downloadsDir)).toBe(true);
    expect(fs.existsSync(resolver.tempDir)).toBe(true);
    expect(fs.existsSync(resolver.logsDir)).toBe(true);
    expect(fs.existsSync(resolver.userFilesRootDir)).toBe(true);
    expect(fs.existsSync(resolver.userFilesExportsDir)).toBe(true);
    expect(fs.existsSync(resolver.userFilesDownloadsDir)).toBe(true);
    expect(fs.existsSync(resolver.userFilesAttachmentsDir)).toBe(true);
  });

  it('two profiles create isolated directory trees', () => {
    const resolverA = createProfilePathResolver(rootDir, 'p_alice');
    const resolverB = createProfilePathResolver(rootDir, 'p_bob');
    ensureProfileDirs(resolverA);
    ensureProfileDirs(resolverB);

    expect(resolverA.profileDir).not.toBe(resolverB.profileDir);
    expect(fs.existsSync(resolverA.dbDir)).toBe(true);
    expect(fs.existsSync(resolverB.dbDir)).toBe(true);
  });
});
