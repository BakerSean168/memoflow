import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { safeStorage } from 'electron';
import { WindowsUserDpapiProvider } from './wsl-dpapi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElectronProfileKeyStore } from './profile-key-store';

describe('ElectronProfileKeyStore', () => {
  const isEncryptionAvailable = vi.mocked(safeStorage.isEncryptionAvailable);
  const getSelectedStorageBackend = vi.mocked(safeStorage.getSelectedStorageBackend);
  let rootDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(WindowsUserDpapiProvider.prototype, 'isAvailable').mockReturnValue(false);
    isEncryptionAvailable.mockReturnValue(true);
    getSelectedStorageBackend.mockReturnValue('gnome_libsecret');
    rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'profile-key-store-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  });

  it('creates and reopens a stable 32-byte key through the synchronous provider', async () => {
    const store = new ElectronProfileKeyStore(rootDir);
    await store.ensure('profile-1');
    const first = await store.unlock('profile-1');
    const second = await store.unlock('profile-1');
    expect(first).toHaveLength(32);
    expect(second).toEqual(first);
  });

  it('creates and reopens the profile key through async safeStorage when sync is unavailable', async () => {
    isEncryptionAvailable.mockReturnValue(false);
    const store = new ElectronProfileKeyStore(rootDir);
    await store.ensure('profile-1');
    await expect(store.unlock('profile-1')).resolves.toHaveLength(32);
    expect(safeStorage.encryptStringAsync).toHaveBeenCalled();
    expect(safeStorage.decryptStringAsync).toHaveBeenCalled();
  });
});
