import { resolveDesktopStorageRoots } from '../paths';
import { mkdtemp, mkdir, writeFile, access, rm, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { vi, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { ProfileCleanup } from './profile-cleanup';
const emptyPartition = () => ({
  clearStorageData: async () => undefined,
  clearCache: async () => undefined,
});
afterEach(() => vi.restoreAllMocks());

it('removes the Profile without following a link into an external vault', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'profile-external-vault-'));
  const roots = {
    ...resolveDesktopStorageRoots({
      platform: 'linux',
      channel: 'test',
      home: root,
      env: { MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: root },
    }),
    dataRoot: root,
  };
  const id = 'p_012345678901234567890123';
  const dir = path.join(root, 'profiles', id);
  const vault = path.join(root, 'external-vault');
  try {
    await mkdir(dir, { recursive: true });
    await mkdir(vault);
    const imports = path.join(root, 'shared', 'profiles', 'imports', id);
    await mkdir(imports, { recursive: true });
    await writeFile(path.join(imports, 'pending.bin'), 'encrypted snapshot');
    await writeFile(path.join(vault, 'notes.md'), 'keep my notes');
    await symlink(vault, path.join(dir, 'vault'), 'dir');
    await new ProfileCleanup(roots, emptyPartition).remove(id, async () => undefined);
    await expect(access(imports)).rejects.toThrow();
    expect(await readFile(path.join(vault, 'notes.md'), 'utf8')).toBe('keep my notes');
    await expect(access(dir)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('keeps a durable tombstone across interrupted credential cleanup and resumes without the directory', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'profile-cleanup-'));
  const roots = {
    ...resolveDesktopStorageRoots({
      platform: 'linux',
      channel: 'test',
      home: root,
      env: { MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: root },
    }),
    dataRoot: root,
  };
  const id = 'p_012345678901234567890123';
  const dir = path.join(root, 'profiles', id);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'facts'), 'data');
    const cleanup = new ProfileCleanup(roots, emptyPartition);
    await expect(
      cleanup.remove(id, async () => {
        await expect(access(dir)).rejects.toThrow();
        throw new Error('credential store unavailable');
      }),
    ).rejects.toThrow('credential store unavailable');
    const restarted = new ProfileCleanup(roots, emptyPartition);
    expect(await restarted.pending()).toEqual([id]);
    expect(await restarted.isPending(id)).toBe(true);
    await restarted.remove(id, async () => undefined);
    expect(await restarted.pending()).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it.each(['rename', 'directory', 'session', 'pin', 'key', 'registry'] as const)(
  'resumes a failure at %s without losing credentials before directory removal',
  async (fault) => {
    const root = await mkdtemp(path.join(tmpdir(), 'profile-cleanup-fault-'));
    const roots = {
      ...resolveDesktopStorageRoots({
        platform: 'linux',
        channel: 'test',
        home: root,
        env: { MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: root },
      }),
      dataRoot: root,
    };
    const id = 'p_012345678901234567890123';
    const dir = path.join(root, 'profiles', id);
    const trash = path.join(root, 'profiles', `.deleting-${id}`);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'facts'), 'data');
    let failOnce = true;
    const originalRename = fs.rename;
    const originalRm = fs.rm;
    vi.spyOn(fs, 'rename').mockImplementation(async (from, to) => {
      if (fault === 'rename' && from === dir && failOnce) {
        failOnce = false;
        throw new Error('injected');
      }
      return originalRename(from, to);
    });
    vi.spyOn(fs, 'rm').mockImplementation(async (name, options) => {
      if (fault === 'directory' && name === trash && failOnce) {
        failOnce = false;
        throw new Error('injected');
      }
      return originalRm(name, options);
    });
    const finalized: string[] = [];
    const finalize = async () => {
      await expect(access(dir)).rejects.toThrow();
      await expect(access(trash)).rejects.toThrow();
      for (const step of ['session', 'pin', 'key', 'registry']) {
        if (fault === step && failOnce) {
          failOnce = false;
          throw new Error('injected');
        }
        if (!finalized.includes(step)) finalized.push(step);
      }
    };
    try {
      await expect(new ProfileCleanup(roots, emptyPartition).remove(id, finalize)).rejects.toThrow(
        'injected',
      );
      expect(await new ProfileCleanup(roots, emptyPartition).isPending(id)).toBe(true);
      if (fault === 'rename' || fault === 'directory') expect(finalized).toEqual([]);
      await new ProfileCleanup(roots, emptyPartition).remove(id, finalize);
      expect(finalized).toEqual(['session', 'pin', 'key', 'registry']);
      expect(await new ProfileCleanup(roots, emptyPartition).isPending(id)).toBe(false);
    } finally {
      vi.restoreAllMocks();
      await rm(root, { recursive: true, force: true });
    }
  },
);

it('clears partition and staging before finalization; re-adding the Profile has no residue', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'profile-partition-cleanup-'));
  const roots = resolveDesktopStorageRoots({
    platform: 'linux',
    channel: 'test',
    home: root,
    env: { MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: root },
  });
  const id = 'p_012345678901234567890123';
  const staging = path.join(roots.cacheRoot, 'snapshot-staging', id);
  const profile = path.join(roots.dataRoot, 'profiles', id);
  const partitionStorage = new Map([
    ['cookie', 'old-account'],
    ['cache', 'old-page'],
  ]);
  const clearStorageData = vi.fn(async () => {
    partitionStorage.delete('cookie');
  });
  const clearCache = vi.fn(async () => {
    partitionStorage.delete('cache');
  });
  const clearPartition = vi.fn(() => ({ clearStorageData, clearCache }));
  try {
    await mkdir(profile, { recursive: true });
    await mkdir(staging, { recursive: true });
    await writeFile(path.join(staging, 'snapshot'), 'old-account');
    const cleanup = new ProfileCleanup(roots, clearPartition);
    await cleanup.remove(id, async () => {
      expect(clearPartition).toHaveBeenCalledExactlyOnceWith(`persist:profile-${id}`);
      await expect(access(staging)).rejects.toThrow();
      expect(partitionStorage.size).toBe(0);
      expect(clearStorageData).toHaveBeenCalledOnce();
      expect(clearCache).toHaveBeenCalledOnce();
    });
    await mkdir(profile, { recursive: true });
    expect(await fs.readdir(profile)).toEqual([]);
    await expect(access(staging)).rejects.toThrow();
    expect(await cleanup.pending()).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it.each(['clearStorageData', 'clearCache'] as const)(
  'keeps credentials and tombstone until %s succeeds',
  async (fault) => {
    const root = await mkdtemp(path.join(tmpdir(), 'profile-partition-fault-'));
    const roots = resolveDesktopStorageRoots({
      platform: 'linux',
      channel: 'test',
      home: root,
      env: { MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: root },
    });
    const id = 'p_012345678901234567890123';
    const partition = {
      clearStorageData: vi.fn(async () => undefined),
      clearCache: vi.fn(async () => undefined),
    };
    partition[fault].mockRejectedValueOnce(new Error('partition unavailable'));
    const cleanup = new ProfileCleanup(roots, () => partition);
    const finalize = vi.fn(async () => undefined);
    try {
      await expect(cleanup.remove(id, finalize)).rejects.toThrow('partition unavailable');
      expect(finalize).not.toHaveBeenCalled();
      expect(await cleanup.isPending(id)).toBe(true);
      await cleanup.remove(id, finalize);
      expect(finalize).toHaveBeenCalledOnce();
      expect(await cleanup.isPending(id)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
