import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { safeStorage } from 'electron';
import { WindowsUserDpapiProvider } from './wsl-dpapi';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudSessionStore } from './cloud-session-store';

describe('CloudSessionStore', () => {
  const isEncryptionAvailable = vi.mocked(safeStorage.isEncryptionAvailable);
  const getSelectedStorageBackend = vi.mocked(safeStorage.getSelectedStorageBackend);
  let rootDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(WindowsUserDpapiProvider.prototype, 'isAvailable').mockReturnValue(false);
    isEncryptionAvailable.mockReturnValue(true);
    getSelectedStorageBackend.mockReturnValue('gnome_libsecret');
    rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cloud-session-store-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  });

  it('persists the real Better Auth session id in profile-scoped secure storage', async () => {
    const store = new CloudSessionStore(rootDir);
    await store.save('profile-1', {
      token: 'token-1',
      sessionId: 'session-1',
      account: { id: 'account-1', email: 'user@example.com', name: 'User', emailVerified: true },
      expiresAt: '2030-01-01T00:00:00.000Z',
    });

    await expect(store.load('profile-1')).resolves.toMatchObject({
      token: 'token-1',
      sessionId: 'session-1',
    });
    await expect(store.getValidToken('profile-1')).resolves.toBe('token-1');
  });

  it('persists sessions through async safeStorage when synchronous encryption is unavailable', async () => {
    isEncryptionAvailable.mockReturnValue(false);
    const store = new CloudSessionStore(rootDir);
    await store.save('profile-1', {
      token: 'token-async',
      sessionId: 'session-async',
      account: { id: 'account-1', email: 'user@example.com', name: 'User', emailVerified: true },
      expiresAt: '2030-01-01T00:00:00.000Z',
    });

    await expect(store.load('profile-1')).resolves.toMatchObject({
      token: 'token-async',
      sessionId: 'session-async',
    });
    expect(safeStorage.encryptStringAsync).toHaveBeenCalled();
    expect(safeStorage.decryptStringAsync).toHaveBeenCalled();
  });

  it('keeps expired metadata for reauthentication state but never returns its token', async () => {
    const store = new CloudSessionStore(rootDir);
    await store.save('profile-1', {
      token: 'expired-token',
      sessionId: 'expired-session',
      account: { id: 'account-1', email: 'user@example.com', name: 'User', emailVerified: true },
      expiresAt: '2000-01-01T00:00:00.000Z',
    });

    await expect(store.load('profile-1')).resolves.toMatchObject({ sessionId: 'expired-session' });
    await expect(store.getValidToken('profile-1')).resolves.toBeNull();
  });

  it('keeps a non-remembered session in memory only and writes nothing to disk', async () => {
    const store = new CloudSessionStore(rootDir);
    await store.save(
      'profile-1',
      {
        token: 'memory-token',
        sessionId: 'memory-session',
        account: { id: 'account-1', email: 'user@example.com', name: 'User', emailVerified: true },
        expiresAt: '2030-01-01T00:00:00.000Z',
      },
      { persist: false },
    );

    await expect(store.load('profile-1')).resolves.toMatchObject({ token: 'memory-token' });
    await expect(store.getValidToken('profile-1')).resolves.toBe('memory-token');
    expect(
      fs.existsSync(path.join(rootDir, 'shared', 'secure', 'cloud-sessions', 'profile-1.bin')),
    ).toBe(false);

    // A fresh store models the next process launch: the session is gone.
    await expect(new CloudSessionStore(rootDir).load('profile-1')).resolves.toBeNull();
  });

  it('drops an older persisted copy when the same Profile signs in without remember', async () => {
    const store = new CloudSessionStore(rootDir);
    const persisted = {
      token: 'persisted-token',
      sessionId: 'persisted-session',
      account: { id: 'account-1', email: 'user@example.com', name: 'User', emailVerified: true },
      expiresAt: '2030-01-01T00:00:00.000Z',
    };
    await store.save('profile-1', persisted);
    await store.save('profile-1', { ...persisted, token: 'memory-token' }, { persist: false });

    await expect(new CloudSessionStore(rootDir).load('profile-1')).resolves.toBeNull();
    await expect(store.load('profile-1')).resolves.toMatchObject({ token: 'memory-token' });
  });
});
