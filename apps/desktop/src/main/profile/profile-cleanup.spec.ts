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
      // Filesystem stages now raise a structured error; credential stages are
      // reported by the caller-supplied finalize and stay raw. Both must leave
      // the durable tombstone for the next launch.
      await expect(
        new ProfileCleanup(roots, emptyPartition).remove(id, finalize),
      ).rejects.toThrow();
      expect(await new ProfileCleanup(roots, emptyPartition).isPending(id)).toBe(true);
      if (fault === 'rename' || fault === 'directory') expect(finalized).toEqual([]);
      // A restart never calls Session APIs again; recovery finishes on disk only.
      await new ProfileCleanup(roots, emptyPartition).recover(id, finalize);
      expect(finalized).toEqual(['session', 'pin', 'key', 'registry']);
      expect(await new ProfileCleanup(roots, emptyPartition).isPending(id)).toBe(false);
    } finally {
      vi.restoreAllMocks();
      await rm(root, { recursive: true, force: true });
    }
  },
);

it('clears online session data and defers the partition directory to the next cold start', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'profile-partition-cleanup-'));
  const roots = resolveDesktopStorageRoots({
    platform: 'linux',
    channel: 'test',
    home: root,
    env: { MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: root },
  });
  const id = 'p_012345678901234567890123';
  const other = 'p_098765432109876543210987';
  const staging = path.join(roots.cacheRoot, 'snapshot-staging', id);
  const profile = path.join(roots.dataRoot, 'profiles', id);
  const partitionDir = path.join(roots.electronSessionData, 'Partitions', `profile-${id}`);
  const otherPartitionDir = path.join(roots.electronSessionData, 'Partitions', `profile-${other}`);
  const partitionStorage = new Map([
    ['cookie', 'old-account'],
    ['cache', 'old-page'],
  ]);
  const clearData = vi.fn(async () => {
    partitionStorage.clear();
  });
  const clearStorageData = vi.fn(async () => undefined);
  const clearCache = vi.fn(async () => undefined);
  const clearPartition = vi.fn(() => ({ clearData, clearStorageData, clearCache }));
  const finalize = vi.fn(async () => undefined);
  try {
    await mkdir(profile, { recursive: true });
    await mkdir(staging, { recursive: true });
    await writeFile(path.join(staging, 'snapshot'), 'old-account');
    await mkdir(partitionDir, { recursive: true });
    await writeFile(path.join(partitionDir, 'Cookies'), 'session-trace');
    await mkdir(otherPartitionDir, { recursive: true });
    await writeFile(path.join(otherPartitionDir, 'Cookies'), 'other-account');

    const cleanup = new ProfileCleanup(roots, clearPartition);
    const outcome = await cleanup.remove(id, finalize);

    // Electron 44 clearData covers cookies/cache/storage in the live session;
    // the older calls are not needed when it exists.
    expect(clearPartition).toHaveBeenCalledExactlyOnceWith(`persist:profile-${id}`);
    expect(clearData).toHaveBeenCalledOnce();
    expect(clearStorageData).not.toHaveBeenCalled();
    expect(clearCache).not.toHaveBeenCalled();
    expect(partitionStorage.size).toBe(0);
    await expect(access(staging)).rejects.toThrow();
    await expect(access(profile)).rejects.toThrow();

    // The directory itself survives this launch: Windows keeps its files locked
    // by the very Session that just cleared them. Deleting it here is what #1078
    // turned into a half-deleted account.
    expect(outcome).toEqual({ partitionRemoved: false });
    await expect(access(path.join(partitionDir, 'Cookies'))).resolves.toBeUndefined();
    expect(finalize).toHaveBeenCalledOnce();
    expect(await cleanup.isPending(id)).toBe(true);

    // Phase 2: the next launch has no Session for the partition yet.
    const recovered = await new ProfileCleanup(roots, emptyPartition).recover(
      id,
      async () => undefined,
    );
    expect(recovered).toEqual({ partitionRemoved: true });
    await expect(access(partitionDir)).rejects.toThrow();
    expect(await cleanup.pending()).toEqual([]);
    // A sibling profile's partition must survive both phases.
    expect(await readFile(path.join(otherPartitionDir, 'Cookies'), 'utf8')).toBe('other-account');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('falls back to clearStorageData and clearCache when Electron exposes no clearData', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'profile-partition-legacy-'));
  const roots = resolveDesktopStorageRoots({
    platform: 'linux',
    channel: 'test',
    home: root,
    env: { MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: root },
  });
  const id = 'p_012345678901234567890123';
  const clearStorageData = vi.fn(async () => undefined);
  const clearCache = vi.fn(async () => undefined);
  const finalize = vi.fn(async () => undefined);
  try {
    const outcome = await new ProfileCleanup(roots, () => ({
      clearStorageData,
      clearCache,
    })).remove(id, finalize);
    expect(clearStorageData).toHaveBeenCalledOnce();
    expect(clearCache).toHaveBeenCalledOnce();
    expect(finalize).toHaveBeenCalledOnce();
    expect(outcome).toEqual({ partitionRemoved: true });
    expect(await new ProfileCleanup(roots, emptyPartition).pending()).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('keeps the tombstone when the partition directory is still held at cold start', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'profile-partition-dir-fault-'));
  const roots = resolveDesktopStorageRoots({
    platform: 'linux',
    channel: 'test',
    home: root,
    env: { MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: root },
  });
  const id = 'p_012345678901234567890123';
  const partitionDir = path.join(roots.electronSessionData, 'Partitions', `profile-${id}`);
  const marker = path.join(roots.dataRoot, 'shared', 'profiles', 'cleanup', `${id}.json`);
  const originalRm = fs.rm;
  vi.spyOn(fs, 'rm').mockImplementation(async (name, options) => {
    if (name === partitionDir) {
      throw Object.assign(new Error('EPERM: operation not permitted, rmdir'), { code: 'EPERM' });
    }
    return originalRm(name, options);
  });
  const finalize = vi.fn(async () => undefined);
  try {
    await mkdir(partitionDir, { recursive: true });
    await writeFile(path.join(partitionDir, 'Cookies'), 'session-trace');

    // Phase 1 never touches the directory, so a live handle cannot fail it.
    const cleanup = new ProfileCleanup(roots, emptyPartition);
    await expect(cleanup.remove(id, finalize)).resolves.toEqual({ partitionRemoved: false });
    expect(finalize).toHaveBeenCalledOnce();
    expect(await cleanup.isPending(id)).toBe(true);

    // A launch that starts while another process still holds a file must still
    // drop credentials and report the exact stage/category.
    const stale = new ProfileCleanup(roots, emptyPartition);
    await expect(stale.recover(id, finalize)).rejects.toMatchObject({
      name: 'ProfileCleanupError',
      stage: 'partition-directory',
      category: 'IN_USE',
      systemCode: 'EPERM',
    });
    // Credentials and registry still go; a locked directory must not keep a
    // ghost account alive.
    expect(finalize).toHaveBeenCalledTimes(2);
    expect(await stale.isPending(id)).toBe(true);
    expect(JSON.parse(await readFile(marker, 'utf8'))).toMatchObject({
      phase: 'partition-pending',
      lastFailure: { stage: 'partition-directory', category: 'IN_USE', systemCode: 'EPERM' },
    });

    // The next launch, with no holder, completes without a retry loop.
    vi.restoreAllMocks();
    await expect(stale.recover(id, finalize)).resolves.toEqual({ partitionRemoved: true });
    await expect(access(partitionDir)).rejects.toThrow();
    expect(await stale.pending()).toEqual([]);
  } finally {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  }
});

it('converges a tombstone whose business data is already gone and keeps neighbours', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'profile-cleanup-residue-'));
  const roots = resolveDesktopStorageRoots({
    platform: 'linux',
    channel: 'test',
    home: root,
    env: { MEMOFLOW_DESKTOP_STORAGE_TEST_ROOT: root },
  });
  // Shape of the Windows residue in #1078: business data and `.deleting-*` are
  // gone, the registry still holds a `ready` entry, credentials and the marker
  // remain, and the Chromium partition directory survives.
  const id = 'p_012345678901234567890123';
  const neighbour = 'p_098765432109876543210987';
  const partitionDir = path.join(roots.electronSessionData, 'Partitions', `profile-${id}`);
  const neighbourPartition = path.join(
    roots.electronSessionData,
    'Partitions',
    `profile-${neighbour}`,
  );
  const marker = path.join(roots.dataRoot, 'shared', 'profiles', 'cleanup', `${id}.json`);
  const neighbourDir = path.join(root, 'profiles', neighbour);
  const finalize = vi.fn(async () => undefined);
  try {
    await mkdir(path.dirname(marker), { recursive: true });
    // A legacy schemaVersion 1 tombstone must still be consumed.
    await writeFile(marker, JSON.stringify({ schemaVersion: 1, profileId: id }));
    await mkdir(partitionDir, { recursive: true });
    await writeFile(path.join(partitionDir, 'Cookies'), 'session-trace');
    await mkdir(neighbourPartition, { recursive: true });
    await writeFile(path.join(neighbourPartition, 'Cookies'), 'neighbour');
    await mkdir(neighbourDir, { recursive: true });
    await writeFile(path.join(neighbourDir, 'facts'), 'neighbour data');

    const cleanup = new ProfileCleanup(roots, emptyPartition);
    await expect(cleanup.recover(id, finalize)).resolves.toEqual({ partitionRemoved: true });
    expect(finalize).toHaveBeenCalledOnce();
    await expect(access(partitionDir)).rejects.toThrow();
    await expect(access(marker)).rejects.toThrow();
    expect(await cleanup.pending()).toEqual([]);
    expect(await readFile(path.join(neighbourDir, 'facts'), 'utf8')).toBe('neighbour data');
    expect(await readFile(path.join(neighbourPartition, 'Cookies'), 'utf8')).toBe('neighbour');
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
    partition[fault].mockRejectedValueOnce(
      Object.assign(new Error('partition unavailable'), { code: 'EBUSY' }),
    );
    const cleanup = new ProfileCleanup(roots, () => partition);
    const finalize = vi.fn(async () => undefined);
    try {
      await expect(cleanup.remove(id, finalize)).rejects.toMatchObject({
        name: 'ProfileCleanupError',
        stage: 'session-data',
        category: 'IN_USE',
        systemCode: 'EBUSY',
      });
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
