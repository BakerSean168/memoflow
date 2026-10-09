import { mkdtemp, mkdir, writeFile, access, rm, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { vi, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { ProfileCleanup } from './profile-cleanup';
afterEach(() => vi.restoreAllMocks());

it('removes the Profile without following a link into an external vault', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'profile-external-vault-'));
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
    await new ProfileCleanup(root).remove(id, async () => undefined);
    await expect(access(imports)).rejects.toThrow();
    expect(await readFile(path.join(vault, 'notes.md'), 'utf8')).toBe('keep my notes');
    await expect(access(dir)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('keeps a durable tombstone across interrupted credential cleanup and resumes without the directory', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'profile-cleanup-'));
  const id = 'p_012345678901234567890123';
  const dir = path.join(root, 'profiles', id);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'facts'), 'data');
    const cleanup = new ProfileCleanup(root);
    await expect(
      cleanup.remove(id, async () => {
        await expect(access(dir)).rejects.toThrow();
        throw new Error('credential store unavailable');
      }),
    ).rejects.toThrow('credential store unavailable');
    const restarted = new ProfileCleanup(root);
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
      await expect(new ProfileCleanup(root).remove(id, finalize)).rejects.toThrow('injected');
      expect(await new ProfileCleanup(root).isPending(id)).toBe(true);
      if (fault === 'rename' || fault === 'directory') expect(finalized).toEqual([]);
      await new ProfileCleanup(root).remove(id, finalize);
      expect(finalized).toEqual(['session', 'pin', 'key', 'registry']);
      expect(await new ProfileCleanup(root).isPending(id)).toBe(false);
    } finally {
      vi.restoreAllMocks();
      await rm(root, { recursive: true, force: true });
    }
  },
);
