import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { clearDesktopStorageCache } from './clear-storage-cache';
import { resolveDesktopStorageRoots } from './desktop-storage-roots';
import { createProfilePathResolver } from './profile-path-resolver';

it('clears rebuildable bytes with Electron APIs while preserving session, auth, SQLite, receipts and user files', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'clear-storage-cache-'));
  try {
    const roots = resolveDesktopStorageRoots({
      platform: 'linux',
      channel: 'test',
      home,
      env: { MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: home },
    });
    const profile = createProfilePathResolver(roots, 'p_alice');
    const preserved = [
      path.join(roots.electronSessionData, 'Cookies'),
      path.join(roots.electronSessionData, 'Local Storage/leveldb/state'),
      profile.tokensPath,
      profile.dbPath,
      path.join(roots.stateRoot, 'update/install-receipts/install-receipt.json'),
      path.join(home, 'external-vault/note.md'),
    ];
    const cached = path.join(roots.cacheRoot, 'downloads-internal/partial');
    for (const file of [...preserved, cached]) {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, 'keep');
    }
    const session = { clearCache: vi.fn(async () => undefined) };
    await clearDesktopStorageCache(roots, [session, session]);
    expect(session.clearCache).toHaveBeenCalledTimes(1);
    await expect(fs.stat(roots.cacheRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    for (const file of preserved) expect(await fs.readFile(file, 'utf8')).toBe('keep');
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});

it('refuses an overlapping roots object before clearing sessions or deleting files', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'unsafe-cache-'));
  try {
    const roots = resolveDesktopStorageRoots({
      platform: 'linux',
      channel: 'test',
      home,
      env: { MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: home },
    });
    await fs.mkdir(roots.dataRoot);
    const file = path.join(roots.dataRoot, 'keep');
    await fs.writeFile(file, 'durable');
    const session = { clearCache: vi.fn(async () => undefined) };
    await expect(
      clearDesktopStorageCache({ ...roots, cacheRoot: home }, [session]),
    ).rejects.toThrow('cache');
    expect(session.clearCache).not.toHaveBeenCalled();
    expect(await fs.readFile(file, 'utf8')).toBe('durable');
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});
