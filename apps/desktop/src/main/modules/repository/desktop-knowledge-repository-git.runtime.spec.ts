import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DesktopKnowledgeRepositoryGitRuntime,
  NodeGitProcessPort,
  type GitProcessPort,
  type GitProcessResult,
  type GitProcessRunOptions,
  type KnowledgeRepositoryGitRuntimeInput,
} from './desktop-knowledge-repository-git.runtime';

const REPOSITORY_ID = '987654321';
const REPOSITORY_FULL_NAME = 'owner/knowledge';
const TOKEN = 'github_pat_repository_secret';
const PUBLIC_REMOTE_URL = 'https://github.com/owner/knowledge.git';

interface RecordedGitCall {
  args: string[];
  options: GitProcessRunOptions;
}

class LocalRemoteGitProcessPort implements GitProcessPort {
  readonly calls: RecordedGitCall[] = [];
  private failed = false;

  constructor(
    private readonly remotePath: string,
    private readonly failOnce?: (args: readonly string[]) => boolean,
    private readonly delegate: GitProcessPort = new NodeGitProcessPort(),
  ) {}

  async run(
    args: readonly string[],
    options: GitProcessRunOptions = {},
  ): Promise<GitProcessResult> {
    this.calls.push({
      args: [...args],
      options: { ...options, env: options.env ? { ...options.env } : undefined },
    });
    if (!this.failed && this.failOnce?.(args)) {
      this.failed = true;
      throw new Error('simulated Git transport failure');
    }

    const mappedArgs = [...args];
    if (
      mappedArgs[0] === 'remote' &&
      (mappedArgs[1] === 'add' || mappedArgs[1] === 'set-url') &&
      mappedArgs.at(-1)?.startsWith('https://github.com/')
    ) {
      mappedArgs[mappedArgs.length - 1] = this.remotePath;
    }
    const result = await this.delegate.run(mappedArgs, options);
    if (
      mappedArgs[0] === 'remote' &&
      mappedArgs[1] === 'get-url' &&
      mappedArgs[2] === 'origin' &&
      result.exitCode === 0
    ) {
      return { ...result, stdout: `${PUBLIC_REMOTE_URL}\n` };
    }
    return result;
  }
}

const temporaryDirectories: string[] = [];
const realGit = new NodeGitProcessPort();

async function temporaryDirectory(label: string): Promise<string> {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), `memoflow-${label}-`));
  temporaryDirectories.push(directory);
  return directory;
}

async function createBareRemote(): Promise<string> {
  const remote = await temporaryDirectory('git-remote');
  await realGit.run(['init', '--bare', '--initial-branch', 'main'], { cwd: remote });
  return remote;
}

async function seedRemote(remote: string, files: Record<string, string>): Promise<string> {
  const worktree = await temporaryDirectory('git-seed');
  await realGit.run(['init', '--initial-branch', 'main'], { cwd: worktree });
  await realGit.run(['config', '--local', 'user.name', 'MemoFlow Test'], { cwd: worktree });
  await realGit.run(['config', '--local', 'user.email', 'test@memoflow.local'], { cwd: worktree });
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(worktree, relativePath);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, content, 'utf8');
  }
  await realGit.run(['add', '-A'], { cwd: worktree });
  await realGit.run(['commit', '-m', 'seed remote'], { cwd: worktree });
  await realGit.run(['remote', 'add', 'origin', remote], { cwd: worktree });
  await realGit.run(['push', '--set-upstream', 'origin', 'main'], { cwd: worktree });
  return (await realGit.run(['rev-parse', 'HEAD'], { cwd: worktree })).stdout.trim();
}

async function cloneRemoteWorktree(remote: string): Promise<string> {
  const parent = await temporaryDirectory('git-remote-worktree');
  const worktree = path.join(parent, 'worktree');
  await realGit.run(['clone', '--branch', 'main', remote, worktree]);
  await realGit.run(['config', '--local', 'user.name', 'MemoFlow Test'], { cwd: worktree });
  await realGit.run(['config', '--local', 'user.email', 'test@memoflow.local'], { cwd: worktree });
  return worktree;
}

async function commitAndPush(
  worktree: string,
  files: Record<string, string>,
  message: string,
): Promise<string> {
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(worktree, relativePath);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, content, 'utf8');
  }
  await realGit.run(['add', '-A'], { cwd: worktree });
  await realGit.run(['commit', '-m', message], { cwd: worktree });
  await realGit.run(['push', 'origin', 'main'], { cwd: worktree });
  return (await realGit.run(['rev-parse', 'HEAD'], { cwd: worktree })).stdout.trim();
}

function input(
  rootPath: string,
  overrides: Partial<KnowledgeRepositoryGitRuntimeInput> = {},
): KnowledgeRepositoryGitRuntimeInput {
  return {
    rootPath,
    repositoryId: REPOSITORY_ID,
    repositoryFullName: REPOSITORY_FULL_NAME,
    defaultBranch: 'main',
    expectedRemoteHeadSha: null,
    action: 'InitializeRemoteFromLocal',
    token: TOKEN,
    ...overrides,
  };
}

async function removeDirectoryQuietly(directory: string): Promise<void> {
  // Residual 1332: Windows can keep git index locks briefly after process exit (EBUSY).
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fs.promises.rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code)
          : '';
      if (code !== 'EBUSY' && code !== 'EPERM' && code !== 'ENOTEMPTY') {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => removeDirectoryQuietly(directory)),
  );
});

// Residual 1332: real multi-git flows exceed default 5s under concurrent suite load.
describe('DesktopKnowledgeRepositoryGitRuntime', { timeout: 30_000 }, () => {
  it('initializes and pushes a real local repository without persisting credentials', async () => {
    const remote = await createBareRemote();
    const vault = await temporaryDirectory('git-vault');
    await fs.promises.writeFile(path.join(vault, 'notes.md'), '# Local knowledge\n', 'utf8');
    const git = new LocalRemoteGitProcessPort(remote);
    const runtime = new DesktopKnowledgeRepositoryGitRuntime(git);

    const result = await runtime.reconcile(input(vault));

    const localHead = (await realGit.run(['rev-parse', 'HEAD'], { cwd: vault })).stdout.trim();
    const remoteHead = (
      await realGit.run(['--git-dir', remote, 'rev-parse', 'refs/heads/main'])
    ).stdout.trim();
    expect(result.headSha).toBe(localHead);
    expect(remoteHead).toBe(localHead);

    const manifestText = await fs.promises.readFile(
      path.join(vault, '.memory-flow', 'repository.json'),
      'utf8',
    );
    expect(JSON.parse(manifestText)).toEqual({
      schemaVersion: 1,
      repositoryId: REPOSITORY_ID,
      capabilities: { markdown: true, attachments: true },
    });
    const scaffold = [
      manifestText,
      await fs.promises.readFile(path.join(vault, 'README.md'), 'utf8'),
      await fs.promises.readFile(path.join(vault, '.gitignore'), 'utf8'),
    ].join('\n');
    expect(scaffold).not.toContain(TOKEN);
    expect(scaffold).not.toContain(vault);
    expect(Object.keys(JSON.parse(manifestText))).toEqual([
      'schemaVersion',
      'repositoryId',
      'capabilities',
    ]);

    const serializedArguments = JSON.stringify(git.calls.map((call) => call.args));
    expect(serializedArguments).not.toContain(TOKEN);
    expect(serializedArguments).not.toContain(
      Buffer.from(`x-access-token:${TOKEN}`).toString('base64'),
    );
    expect(git.calls.some((call) => call.args.includes('--force'))).toBe(false);
    const networkCalls = git.calls.filter((call) =>
      ['fetch', 'ls-remote', 'push'].includes(call.args[0] ?? ''),
    );
    expect(networkCalls.length).toBeGreaterThan(0);
    for (const call of networkCalls) {
      expect(call.options.env?.GIT_TERMINAL_PROMPT).toBe('0');
      expect(call.options.env?.GIT_CONFIG_VALUE_1).toMatch(/^AUTHORIZATION: basic /);
      expect(JSON.stringify(call.options.env)).not.toContain(TOKEN);
    }
    const localOnlyCalls = git.calls.filter((call) =>
      ['init', 'config', 'add', 'commit'].includes(call.args[0] ?? ''),
    );
    expect(localOnlyCalls.every((call) => call.options.env === undefined)).toBe(true);
    const gitConfig = await fs.promises.readFile(path.join(vault, '.git', 'config'), 'utf8');
    expect(gitConfig).not.toContain(TOKEN);
    expect(gitConfig).not.toContain('AUTHORIZATION');
  });

  it('extends a scaffold-only remote without losing local Vault content', async () => {
    const remote = await createBareRemote();
    const scaffoldHead = await seedRemote(remote, { '.gitignore': '.DS_Store\n' });
    const vault = await temporaryDirectory('scaffold-remote-vault');
    await fs.promises.mkdir(path.join(vault, 'notes'));
    await fs.promises.writeFile(path.join(vault, 'notes', 'local.md'), '# Local note\n', 'utf8');
    const git = new LocalRemoteGitProcessPort(remote);
    const runtime = new DesktopKnowledgeRepositoryGitRuntime(git);

    const result = await runtime.reconcile(input(vault, { expectedRemoteHeadSha: scaffoldHead }));

    expect(result.headSha).not.toBe(scaffoldHead);
    const remoteNote = await realGit.run([
      '--git-dir',
      remote,
      'show',
      'refs/heads/main:notes/local.md',
    ]);
    expect(remoteNote.stdout).toBe('# Local note\n');
    expect(git.calls.some((call) => call.args.includes('--force'))).toBe(false);
  });

  it('rejects an existing foreign Git repository', async () => {
    const remote = await createBareRemote();
    const vault = await temporaryDirectory('foreign-git-vault');
    await realGit.run(['init', '--initial-branch', 'main'], { cwd: vault });
    const runtime = new DesktopKnowledgeRepositoryGitRuntime(new LocalRemoteGitProcessPort(remote));

    await expect(runtime.reconcile(input(vault))).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('existing Git repository'),
    });
  });

  it('defers when another Git process holds a repository lock', async () => {
    const remote = await createBareRemote();
    const vault = await temporaryDirectory('locked-git-vault');
    await fs.promises.mkdir(path.join(vault, '.git'));
    await fs.promises.writeFile(path.join(vault, '.git', 'index.lock'), 'locked', 'utf8');
    const runtime = new DesktopKnowledgeRepositoryGitRuntime(new LocalRemoteGitProcessPort(remote));

    await expect(runtime.reconcile(input(vault))).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('Another Git process'),
    });
  });

  it('rejects a stale remote HEAD and can resume the app-owned partial clone', async () => {
    const remote = await createBareRemote();
    const actualHead = await seedRemote(remote, { 'remote-note.md': '# Remote knowledge\n' });
    const vault = await temporaryDirectory('stale-head-vault');
    const git = new LocalRemoteGitProcessPort(remote);
    const runtime = new DesktopKnowledgeRepositoryGitRuntime(git);
    const cloneInput = input(vault, {
      action: 'CloneRemoteIntoLocal',
      expectedRemoteHeadSha: 'b'.repeat(40),
    });

    await expect(runtime.reconcile(cloneInput)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('changed after the reconciliation preview'),
    });
    await expect(
      fs.promises.readFile(path.join(vault, '.git', 'memoflow-repository.json'), 'utf8'),
    ).resolves.toContain(REPOSITORY_ID);

    const result = await runtime.reconcile({ ...cloneInput, expectedRemoteHeadSha: actualHead });

    expect(result.headSha).toMatch(/^[a-f0-9]{40,64}$/i);
    await expect(fs.promises.readFile(path.join(vault, 'remote-note.md'), 'utf8')).resolves.toBe(
      '# Remote knowledge\n',
    );
  });

  it('does not overwrite local files when a remote checkout would collide', async () => {
    const remote = await createBareRemote();
    const remoteHead = await seedRemote(remote, { 'notes/collision.md': 'remote\n' });
    const vault = await temporaryDirectory('collision-vault');
    await fs.promises.mkdir(path.join(vault, 'notes'), { recursive: true });
    await fs.promises.writeFile(path.join(vault, 'notes', 'collision.md'), 'local\n', 'utf8');
    const runtime = new DesktopKnowledgeRepositoryGitRuntime(new LocalRemoteGitProcessPort(remote));

    await expect(
      runtime.reconcile(
        input(vault, {
          action: 'CloneRemoteIntoLocal',
          expectedRemoteHeadSha: remoteHead,
        }),
      ),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('would overwrite a local file'),
    });
    await expect(
      fs.promises.readFile(path.join(vault, 'notes', 'collision.md'), 'utf8'),
    ).resolves.toBe('local\n');
  });

  it('retries an app-owned clone after a failed push without force pushing', async () => {
    const remote = await createBareRemote();
    const remoteHead = await seedRemote(remote, { 'remote-note.md': '# Remote knowledge\n' });
    const vault = await temporaryDirectory('retry-vault');
    const git = new LocalRemoteGitProcessPort(remote, (args) => args[0] === 'push');
    const runtime = new DesktopKnowledgeRepositoryGitRuntime(git);
    const cloneInput = input(vault, {
      action: 'CloneRemoteIntoLocal',
      expectedRemoteHeadSha: remoteHead,
    });

    await expect(runtime.reconcile(cloneInput)).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    });
    const localHeadBeforeRetry = (
      await realGit.run(['rev-parse', 'HEAD'], { cwd: vault })
    ).stdout.trim();

    const result = await runtime.reconcile(cloneInput);

    expect(result.headSha).toBe(localHeadBeforeRetry);
    const remoteHeadAfterRetry = (
      await realGit.run(['--git-dir', remote, 'rev-parse', 'refs/heads/main'])
    ).stdout.trim();
    expect(remoteHeadAfterRetry).toBe(localHeadBeforeRetry);
    expect(git.calls.some((call) => call.args.includes('--force'))).toBe(false);
  });

  it('creates a durable local commit before any online synchronization command', async () => {
    const remote = await createBareRemote();
    const vault = await temporaryDirectory('offline-queue-vault');
    await fs.promises.writeFile(path.join(vault, 'note.md'), 'initial\n', 'utf8');
    const git = new LocalRemoteGitProcessPort(remote);
    const runtime = new DesktopKnowledgeRepositoryGitRuntime(git);
    await runtime.reconcile(input(vault));
    const remoteHeadBefore = (
      await realGit.run(['--git-dir', remote, 'rev-parse', 'refs/heads/main'])
    ).stdout.trim();
    git.calls.length = 0;
    await fs.promises.writeFile(path.join(vault, 'note.md'), 'offline edit\n', 'utf8');

    const prepared = await runtime.prepareSynchronization({
      rootPath: vault,
      repositoryId: REPOSITORY_ID,
      repositoryFullName: REPOSITORY_FULL_NAME,
      defaultBranch: 'main',
      lastConfirmedRemoteHeadSha: remoteHeadBefore,
    });

    expect(prepared.localCommitCreated).toBe(true);
    expect(prepared.headSha).not.toBe(remoteHeadBefore);
    expect(
      git.calls.some((call) => ['fetch', 'ls-remote', 'push'].includes(call.args[0] ?? '')),
    ).toBe(false);
    const remoteHeadAfter = (
      await realGit.run(['--git-dir', remote, 'rev-parse', 'refs/heads/main'])
    ).stdout.trim();
    expect(remoteHeadAfter).toBe(remoteHeadBefore);
  });

  it('pushes local commits without force and keeps credentials out of repository config', async () => {
    const remote = await createBareRemote();
    const vault = await temporaryDirectory('continuous-push-vault');
    await fs.promises.writeFile(path.join(vault, 'note.md'), 'initial\n', 'utf8');
    const git = new LocalRemoteGitProcessPort(remote);
    const runtime = new DesktopKnowledgeRepositoryGitRuntime(git);
    const initialized = await runtime.reconcile(input(vault));
    git.calls.length = 0;
    await fs.promises.writeFile(path.join(vault, 'note.md'), 'local edit\n', 'utf8');

    const result = await runtime.synchronize({
      rootPath: vault,
      repositoryId: REPOSITORY_ID,
      repositoryFullName: REPOSITORY_FULL_NAME,
      defaultBranch: 'main',
      lastConfirmedRemoteHeadSha: initialized.headSha,
      token: TOKEN,
    });

    expect(result).toMatchObject({
      outcome: 'Pushed',
      localCommitCreated: true,
      remoteChangesApplied: false,
      pushed: true,
    });
    const remoteHead = (
      await realGit.run(['--git-dir', remote, 'rev-parse', 'refs/heads/main'])
    ).stdout.trim();
    expect(remoteHead).toBe(result.headSha);
    expect(git.calls.some((call) => call.args.includes('--force'))).toBe(false);
    const config = await fs.promises.readFile(path.join(vault, '.git', 'config'), 'utf8');
    expect(config).not.toContain(TOKEN);
    expect(config).not.toContain('AUTHORIZATION');
  });

  it('updates the managed origin after the GitHub repository is renamed', async () => {
    const remote = await createBareRemote();
    const vault = await temporaryDirectory('renamed-repository-vault');
    await fs.promises.writeFile(path.join(vault, 'note.md'), 'initial\n', 'utf8');
    const runtime = new DesktopKnowledgeRepositoryGitRuntime(new LocalRemoteGitProcessPort(remote));
    const initialized = await runtime.reconcile(input(vault));
    await fs.promises.writeFile(path.join(vault, 'note.md'), 'renamed repository edit\n', 'utf8');

    const renamedGit = new LocalRemoteGitProcessPort(remote);
    const renamedRuntime = new DesktopKnowledgeRepositoryGitRuntime(renamedGit);
    const result = await renamedRuntime.synchronize({
      rootPath: vault,
      repositoryId: REPOSITORY_ID,
      repositoryFullName: 'owner/renamed-knowledge',
      defaultBranch: 'main',
      lastConfirmedRemoteHeadSha: initialized.headSha,
      token: TOKEN,
    });

    expect(result.outcome).toBe('Pushed');
    expect(
      renamedGit.calls.some(
        (call) =>
          call.args[0] === 'remote' &&
          call.args[1] === 'set-url' &&
          call.args.at(-1) === 'https://github.com/owner/renamed-knowledge.git',
      ),
    ).toBe(true);
  });

  it('fast-forwards a local Vault when GitHub is ahead', async () => {
    const remote = await createBareRemote();
    const vault = await temporaryDirectory('continuous-pull-vault');
    await fs.promises.writeFile(path.join(vault, 'local.md'), 'local\n', 'utf8');
    const runtime = new DesktopKnowledgeRepositoryGitRuntime(new LocalRemoteGitProcessPort(remote));
    const initialized = await runtime.reconcile(input(vault));
    const remoteWorktree = await cloneRemoteWorktree(remote);
    const remoteHead = await commitAndPush(
      remoteWorktree,
      { 'remote.md': 'remote change\n' },
      'remote change',
    );

    const result = await runtime.synchronize({
      rootPath: vault,
      repositoryId: REPOSITORY_ID,
      repositoryFullName: REPOSITORY_FULL_NAME,
      defaultBranch: 'main',
      lastConfirmedRemoteHeadSha: initialized.headSha,
      token: TOKEN,
    });

    expect(result).toEqual({
      outcome: 'Pulled',
      headSha: remoteHead,
      localCommitCreated: false,
      remoteChangesApplied: true,
      pushed: false,
    });
    await expect(fs.promises.readFile(path.join(vault, 'remote.md'), 'utf8')).resolves.toBe(
      'remote change\n',
    );
  });

  it('rebases diverged local commits onto GitHub and pushes the combined history', async () => {
    const remote = await createBareRemote();
    const vault = await temporaryDirectory('continuous-rebase-vault');
    await fs.promises.writeFile(path.join(vault, 'base.md'), 'base\n', 'utf8');
    const git = new LocalRemoteGitProcessPort(remote);
    const runtime = new DesktopKnowledgeRepositoryGitRuntime(git);
    const initialized = await runtime.reconcile(input(vault));
    const remoteWorktree = await cloneRemoteWorktree(remote);
    await commitAndPush(remoteWorktree, { 'remote.md': 'remote\n' }, 'remote change');
    await fs.promises.writeFile(path.join(vault, 'local.md'), 'local\n', 'utf8');

    const result = await runtime.synchronize({
      rootPath: vault,
      repositoryId: REPOSITORY_ID,
      repositoryFullName: REPOSITORY_FULL_NAME,
      defaultBranch: 'main',
      lastConfirmedRemoteHeadSha: initialized.headSha,
      token: TOKEN,
    });

    expect(result).toMatchObject({
      outcome: 'RebasedAndPushed',
      localCommitCreated: true,
      remoteChangesApplied: true,
      pushed: true,
    });
    await expect(fs.promises.readFile(path.join(vault, 'remote.md'), 'utf8')).resolves.toBe(
      'remote\n',
    );
    await expect(fs.promises.readFile(path.join(vault, 'local.md'), 'utf8')).resolves.toBe(
      'local\n',
    );
    const remoteHead = (
      await realGit.run(['--git-dir', remote, 'rev-parse', 'refs/heads/main'])
    ).stdout.trim();
    expect(remoteHead).toBe(result.headSha);
    expect(git.calls.some((call) => call.args.includes('--force'))).toBe(false);
  });

  it('pauses a conflicting rebase and preserves both versions for external resolution', async () => {
    const remote = await createBareRemote();
    const vault = await temporaryDirectory('continuous-conflict-vault');
    await fs.promises.writeFile(path.join(vault, 'shared.md'), 'base\n', 'utf8');
    const runtime = new DesktopKnowledgeRepositoryGitRuntime(new LocalRemoteGitProcessPort(remote));
    const initialized = await runtime.reconcile(input(vault));
    const remoteWorktree = await cloneRemoteWorktree(remote);
    const remoteHead = await commitAndPush(
      remoteWorktree,
      { 'shared.md': 'remote version\n' },
      'remote conflict',
    );
    await fs.promises.writeFile(path.join(vault, 'shared.md'), 'local version\n', 'utf8');

    await expect(
      runtime.synchronize({
        rootPath: vault,
        repositoryId: REPOSITORY_ID,
        repositoryFullName: REPOSITORY_FULL_NAME,
        defaultBranch: 'main',
        lastConfirmedRemoteHeadSha: initialized.headSha,
        token: TOKEN,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      context: {
        remoteHeadSha: remoteHead,
        conflictingPaths: ['shared.md'],
        rebaseInProgress: true,
      },
    });
    const conflictedContent = await fs.promises.readFile(path.join(vault, 'shared.md'), 'utf8');
    expect(conflictedContent).toContain('local version');
    expect(conflictedContent).toContain('remote version');
    await expect(fs.promises.stat(path.join(vault, '.git', 'rebase-merge'))).resolves.toBeDefined();
    await expect(
      runtime.prepareSynchronization({
        rootPath: vault,
        repositoryId: REPOSITORY_ID,
        repositoryFullName: REPOSITORY_FULL_NAME,
        defaultBranch: 'main',
        lastConfirmedRemoteHeadSha: initialized.headSha,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      context: { conflictingPaths: ['shared.md'], rebaseInProgress: true },
    });
    const remoteHeadAfter = (
      await realGit.run(['--git-dir', remote, 'rev-parse', 'refs/heads/main'])
    ).stdout.trim();
    expect(remoteHeadAfter).toBe(remoteHead);
  });

  it('pauses when the GitHub default branch history was force-pushed', async () => {
    const remote = await createBareRemote();
    const vault = await temporaryDirectory('force-push-vault');
    await fs.promises.writeFile(path.join(vault, 'original.md'), 'original\n', 'utf8');
    const git = new LocalRemoteGitProcessPort(remote);
    const runtime = new DesktopKnowledgeRepositoryGitRuntime(git);
    const initialized = await runtime.reconcile(input(vault));
    const remoteWorktree = await cloneRemoteWorktree(remote);
    await realGit.run(['checkout', '--orphan', 'rewritten'], { cwd: remoteWorktree });
    await realGit.run(['rm', '-rf', '.'], { cwd: remoteWorktree });
    await fs.promises.writeFile(path.join(remoteWorktree, 'replacement.md'), 'replacement\n');
    await realGit.run(['add', '-A'], { cwd: remoteWorktree });
    await realGit.run(['commit', '-m', 'rewrite history'], { cwd: remoteWorktree });
    await realGit.run(['push', '--force', 'origin', 'HEAD:main'], { cwd: remoteWorktree });
    const rewrittenHead = (
      await realGit.run(['--git-dir', remote, 'rev-parse', 'refs/heads/main'])
    ).stdout.trim();
    git.calls.length = 0;

    await expect(
      runtime.synchronize({
        rootPath: vault,
        repositoryId: REPOSITORY_ID,
        repositoryFullName: REPOSITORY_FULL_NAME,
        defaultBranch: 'main',
        lastConfirmedRemoteHeadSha: initialized.headSha,
        token: TOKEN,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: expect.stringContaining('history was rewritten'),
      context: {
        remoteHeadSha: rewrittenHead,
        conflictingPaths: [],
        rebaseInProgress: false,
      },
    });
    expect(git.calls.some((call) => call.args.includes('--force'))).toBe(false);
    await expect(fs.promises.readFile(path.join(vault, 'original.md'), 'utf8')).resolves.toBe(
      'original\n',
    );
    await expect(
      fs.promises.access(path.join(vault, '.git', 'rebase-merge')),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('disables repository hooks and excludes manually staged runtime files', async () => {
    const remote = await createBareRemote();
    const vault = await temporaryDirectory('continuous-safety-vault');
    await fs.promises.writeFile(path.join(vault, 'note.md'), 'initial\n', 'utf8');
    const runtime = new DesktopKnowledgeRepositoryGitRuntime(new LocalRemoteGitProcessPort(remote));
    const initialized = await runtime.reconcile(input(vault));
    const hookOutput = path.join(vault, 'hook-ran.txt');
    const hookPath = path.join(vault, '.git', 'hooks', 'pre-commit');
    await fs.promises.writeFile(hookPath, `#!/bin/sh\nprintf ran > "${hookOutput}"\n`, 'utf8');
    await fs.promises.chmod(hookPath, 0o700);
    await fs.promises.mkdir(path.join(vault, '.obsidian'), { recursive: true });
    await fs.promises.writeFile(path.join(vault, '.obsidian', 'app.json'), '{}\n', 'utf8');
    await realGit.run(['add', '-f', '.obsidian/app.json'], { cwd: vault });
    await fs.promises.writeFile(path.join(vault, 'note.md'), 'safe edit\n', 'utf8');

    await runtime.synchronize({
      rootPath: vault,
      repositoryId: REPOSITORY_ID,
      repositoryFullName: REPOSITORY_FULL_NAME,
      defaultBranch: 'main',
      lastConfirmedRemoteHeadSha: initialized.headSha,
      token: TOKEN,
    });

    await expect(fs.promises.access(hookOutput)).rejects.toMatchObject({ code: 'ENOENT' });
    const remoteTree = await realGit.run([
      '--git-dir',
      remote,
      'ls-tree',
      '-r',
      '--name-only',
      'refs/heads/main',
    ]);
    expect(remoteTree.stdout).not.toContain('.obsidian/app.json');
  });
});
