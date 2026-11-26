import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
  LocalVaultGitChange,
  LocalVaultGitChanges,
  LocalVaultGitDiff,
} from '@memoflow/repository-contracts';

const runFile = promisify(execFile);
const ignored = new Set(['.git', '.obsidian', '.trash', '.Trash', 'node_modules']);
const MAX_DIFF_BYTES = 256 * 1024;

/** Porcelain -z uses repository-relative paths; rename records put the destination first. */
export function parseVaultGitStatus(
  output: string,
  repositoryRoot: string,
  vaultRoot: string,
): LocalVaultGitChange[] {
  const records = output.split('\0');
  const changes = new Map<string, LocalVaultGitChange>();
  const localPath = (gitPath: string): string | null => {
    const relative = path.relative(vaultRoot, path.resolve(repositoryRoot, gitPath));
    if (
      !relative ||
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    )
      return null;
    if (!/\.md$/i.test(relative) || relative.split(path.sep).some((part) => ignored.has(part)))
      return null;
    return relative.split(path.sep).join('/');
  };
  for (let index = 0; index < records.length; index++) {
    const record = records[index]!;
    if (record.length < 4) continue;
    const xy = record.slice(0, 2);
    const destination = localPath(record.slice(3));
    const moved = /[RC]/.test(xy);
    const previous = moved ? localPath(records[++index] ?? '') : null;
    if (!destination) {
      if (previous && xy.includes('R'))
        changes.set(previous, { relativePath: previous, status: 'deleted' });
      continue;
    }
    const status: LocalVaultGitChange['status'] =
      xy.includes('U') || xy === 'AA' || xy === 'DD'
        ? 'conflicted'
        : xy.includes('D')
          ? 'deleted'
          : xy === '??' || xy.includes('A') || xy.includes('C')
            ? 'added'
            : xy.includes('R')
              ? previous
                ? 'renamed'
                : 'added'
              : 'modified';
    changes.set(destination, {
      relativePath: destination,
      status,
      ...(status === 'renamed' && previous ? { previousPath: previous } : {}),
    });
  }
  return [...changes.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export async function readVaultGitChanges(
  vaultRoot: string,
): Promise<Pick<LocalVaultGitChanges, 'state' | 'changes'>> {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR'])
    delete env[key];
  const git = (...args: string[]) =>
    runFile(
      'git',
      ['-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-C', vaultRoot, ...args],
      { env, timeout: 10_000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8', windowsHide: true },
    );
  try {
    const root = await git('rev-parse', '--show-toplevel');
    const status = await git(
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all',
      '--ignore-submodules=all',
      '--',
      '.',
    );
    return {
      state: 'ready',
      changes: parseVaultGitStatus(status.stdout, root.stdout.trim(), vaultRoot),
    };
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? '';
    return {
      state: /not a git repository/i.test(stderr) ? 'not-repository' : 'unavailable',
      changes: [],
    };
  }
}

/**
 * Read the working-tree patch for one vault-relative Markdown path.
 *
 * `git diff HEAD` includes staged and unstaged edits; an untracked file has no
 * HEAD side, so its full content is rendered through `--no-index /dev/null`.
 * The result is bounded and never mutates the repository.
 */
export async function readVaultGitDiff(
  vaultRoot: string,
  relativePath: string,
): Promise<Pick<LocalVaultGitDiff, 'state' | 'patch' | 'truncated'>> {
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR'])
    delete env[key];
  const git = (...args: string[]) =>
    runFile(
      'git',
      ['-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false', '-C', vaultRoot, ...args],
      { env, timeout: 10_000, maxBuffer: 8 * 1024 * 1024, encoding: 'utf8', windowsHide: true },
    );
  const bound = (patch: string) => {
    const bytes = Buffer.byteLength(patch, 'utf8');
    if (bytes <= MAX_DIFF_BYTES) return { patch, truncated: false };
    return {
      patch: Buffer.from(patch, 'utf8').subarray(0, MAX_DIFF_BYTES).toString('utf8'),
      truncated: true,
    };
  };
  try {
    await git('rev-parse', '--show-toplevel');
    let patch = '';
    const tracked = await git('ls-files', '--error-unmatch', '--', relativePath).then(
      () => true,
      () => false,
    );
    if (tracked) {
      patch = (await git('diff', 'HEAD', '--no-color', '--unified=3', '--', relativePath)).stdout;
    } else {
      try {
        patch = (
          await git(
            'diff',
            '--no-index',
            '--no-color',
            '--unified=3',
            '--',
            '/dev/null',
            relativePath,
          )
        ).stdout;
      } catch (error) {
        // `--no-index` exits 1 when the file differs; the patch is still valid.
        patch = (error as { stdout?: string }).stdout ?? '';
      }
    }
    return { state: 'ready', ...bound(patch) };
  } catch (error) {
    const stderr = (error as { stderr?: string }).stderr ?? '';
    return {
      state: /not a git repository/i.test(stderr) ? 'not-repository' : 'unavailable',
      patch: '',
      truncated: false,
    };
  }
}
