import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { parseVaultGitStatus, readVaultGitChanges } from './local-vault-git';
const run = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe('Vault Git observations', () => {
  it('parses NUL-delimited paths, renames, deletions and conflicts without leaking sibling files', () => {
    expect(
      parseVaultGitStatus(
        '?? vault/new note.md\0 M vault/a\nb.md\0D  vault/gone.md\0R  vault/renamed.md\0vault/old.md\0UU vault/conflict.md\0 M sibling.md\0?? vault/.obsidian/config.md\0?? vault/image.png\0',
        '/repo',
        '/repo/vault',
      ),
    ).toEqual(
      expect.arrayContaining([
        { relativePath: 'new note.md', status: 'added' },
        { relativePath: 'a\nb.md', status: 'modified' },
        { relativePath: 'gone.md', status: 'deleted' },
        { relativePath: 'renamed.md', previousPath: 'old.md', status: 'renamed' },
        { relativePath: 'conflict.md', status: 'conflicted' },
      ]),
    );
    expect(
      parseVaultGitStatus(' M sibling.md\0?? vault/../escape.md\0', '/repo', '/repo/vault'),
    ).toEqual([]);
  });
  it('reads staged, unstaged and untracked Markdown changes from an isolated repository', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'memoflow-vault-git-'));
    roots.push(root);
    const git = (...args: string[]) => run('git', ['-C', root, ...args]);
    await git('init');
    await fs.writeFile(path.join(root, 'edit.md'), '# Original');
    await fs.writeFile(path.join(root, 'delete.md'), '# Delete');
    await git('add', '.');
    await git(
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-m',
      'Fixture',
      '--no-verify',
    );
    await fs.writeFile(path.join(root, 'edit.md'), '# Changed');
    await fs.rm(path.join(root, 'delete.md'));
    await fs.writeFile(path.join(root, 'new.md'), '# New');
    await fs.writeFile(path.join(root, 'staged.md'), '# Staged');
    await git('add', 'staged.md');
    const before = (await git('status', '--porcelain=v1', '-z')).stdout;
    const indexBefore = await fs.readFile(path.join(root, '.git', 'index'));
    expect(await readVaultGitChanges(root)).toEqual({
      state: 'ready',
      changes: [
        { relativePath: 'delete.md', status: 'deleted' },
        { relativePath: 'edit.md', status: 'modified' },
        { relativePath: 'new.md', status: 'added' },
        { relativePath: 'staged.md', status: 'added' },
      ],
    });
    expect(await fs.readFile(path.join(root, '.git', 'index'))).toEqual(indexBefore);
    expect((await git('status', '--porcelain=v1', '-z')).stdout).toBe(before);
    await fs.mkdir(path.join(root, 'vault'));
    await fs.writeFile(path.join(root, 'vault', 'nested.md'), '# Nested');
    expect(await readVaultGitChanges(path.join(root, 'vault'))).toEqual({
      state: 'ready',
      changes: [{ relativePath: 'nested.md', status: 'added' }],
    });
  });
  it('distinguishes an ordinary folder from a clean Git workspace', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'memoflow-no-git-'));
    roots.push(root);
    expect(await readVaultGitChanges(root)).toEqual({ state: 'not-repository', changes: [] });
  });
});
