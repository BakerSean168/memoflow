import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// Residual 957: isMissing/isTemporaryFile duals retired — sole repository electron vault-fs-guards.
import { isMissing, isTemporaryFile } from '@memoflow/repository/electron';
import type {
  KnowledgeRepositoryExecutableReconciliationAction,
  KnowledgeRepositorySyncConflictContext,
  KnowledgeRepositorySyncOutcome,
} from '@memoflow/contracts/repository';

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_CAPTURE_BYTES = 1024 * 1024;
const COMMIT_MESSAGE = 'chore(vault): initialize MemoFlow knowledge repository';
const SYNC_COMMIT_MESSAGE = 'chore(vault): synchronize knowledge changes';
const GIT_OWNERSHIP_MARKER = 'memoflow-repository.json';
const GIT_SYNC_STATE = 'memoflow-sync-state.json';
/**
 * Residual 1332: Git cannot open Windows `os.devNull` (`\\.\nul`) as GIT_CONFIG_GLOBAL.
 * Use platform null device names Git accepts (`NUL` / `/dev/null`).
 */
const SAFE_GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : os.devNull;
const SAFE_GIT_PROCESS_ENVIRONMENT = {
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_GLOBAL: SAFE_GIT_CONFIG_GLOBAL,
};
const REQUIRED_GITIGNORE_LINES = [
  '.obsidian/workspace*',
  '.obsidian/cache/',
  '.trash/',
  '.Trash/',
  '*.tmp',
  '*.temp',
  '*.swp',
  '*.swo',
  '*~',
  '.DS_Store',
  'Thumbs.db',
];

export interface GitProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface GitProcessRunOptions {
  cwd?: string;
  env?: Record<string, string>;
  allowedExitCodes?: readonly number[];
  timeoutMs?: number;
}

export interface GitProcessPort {
  run(args: readonly string[], options?: GitProcessRunOptions): Promise<GitProcessResult>;
}

class GitProcessError extends Error {
  constructor(
    readonly result: GitProcessResult,
    message = 'Git command failed',
  ) {
    super(message);
    this.name = 'GitProcessError';
  }
}

export class NodeGitProcessPort implements GitProcessPort {
  constructor(private readonly binary = 'git') {}

  async run(
    args: readonly string[],
    options: GitProcessRunOptions = {},
  ): Promise<GitProcessResult> {
    const allowedExitCodes = new Set(options.allowedExitCodes ?? [0]);
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    return await new Promise<GitProcessResult>((resolve, reject) => {
      const child = spawn(this.binary, [...args], {
        cwd: options.cwd,
        env: { ...process.env, ...SAFE_GIT_PROCESS_ENVIRONMENT, ...options.env },
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const capture = (current: string, chunk: Buffer): string =>
        `${current}${chunk.toString('utf8')}`.slice(-MAX_CAPTURE_BYTES);
      child.stdout.on('data', (chunk: Buffer) => {
        stdout = capture(stdout, chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = capture(stderr, chunk);
      });
      const timeout = setTimeout(() => {
        child.kill();
        if (!settled) {
          settled = true;
          reject(new Error('Git command timed out'));
        }
      }, timeoutMs);
      timeout.unref?.();
      child.once('error', (error) => {
        clearTimeout(timeout);
        if (settled) return;
        settled = true;
        reject(error);
      });
      child.once('close', (exitCode) => {
        clearTimeout(timeout);
        if (settled) return;
        settled = true;
        const result = { exitCode: exitCode ?? 1, stdout, stderr };
        if (allowedExitCodes.has(result.exitCode)) {
          resolve(result);
        } else {
          reject(new GitProcessError(result));
        }
      });
    });
  }
}

export class KnowledgeRepositoryGitRuntimeError extends Error {
  constructor(
    readonly code: 'CONFLICT' | 'UNAUTHORIZED' | 'SERVICE_UNAVAILABLE' | 'INTERNAL_ERROR',
    message: string,
    readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'KnowledgeRepositoryGitRuntimeError';
  }
}

export interface KnowledgeRepositoryGitManifest {
  schemaVersion: 1;
  repositoryId: string;
  capabilities: {
    markdown: true;
    attachments: true;
  };
}

interface KnowledgeRepositoryGitOwnershipMarker {
  schemaVersion: 1;
  repositoryId: string;
}

interface KnowledgeRepositoryGitSyncState {
  schemaVersion: 1;
  branch: string;
  localHeadSha: string;
  remoteHeadSha: string;
}

export interface KnowledgeRepositoryGitRuntimeInput {
  rootPath: string;
  repositoryId: string;
  repositoryFullName: string;
  defaultBranch: string;
  expectedRemoteHeadSha: string | null;
  action: KnowledgeRepositoryExecutableReconciliationAction;
  token: string;
}

export interface KnowledgeRepositoryGitRuntimeResult {
  headSha: string;
}

export interface KnowledgeRepositoryGitRuntimeInspection {
  headSha: string | null;
  manifest: KnowledgeRepositoryGitManifest | null;
}

export interface KnowledgeRepositoryGitRuntimePort {
  inspect(rootPath: string): Promise<KnowledgeRepositoryGitRuntimeInspection>;
  reconcile(
    input: KnowledgeRepositoryGitRuntimeInput,
  ): Promise<KnowledgeRepositoryGitRuntimeResult>;
}

export interface KnowledgeRepositorySyncGitRuntimeInput {
  rootPath: string;
  repositoryId: string;
  repositoryFullName: string;
  defaultBranch: string;
  lastConfirmedRemoteHeadSha: string;
}

export interface KnowledgeRepositorySyncGitRuntimePreparation {
  headSha: string;
  localCommitCreated: boolean;
}

export interface KnowledgeRepositorySyncGitRuntimeExecutionInput extends KnowledgeRepositorySyncGitRuntimeInput {
  token: string;
}

export interface KnowledgeRepositorySyncGitRuntimeResult {
  outcome: KnowledgeRepositorySyncOutcome;
  headSha: string;
  localCommitCreated: boolean;
  remoteChangesApplied: boolean;
  pushed: boolean;
}

export interface KnowledgeRepositorySyncGitRuntimePort {
  prepareSynchronization(
    input: KnowledgeRepositorySyncGitRuntimeInput,
  ): Promise<KnowledgeRepositorySyncGitRuntimePreparation>;
  synchronize(
    input: KnowledgeRepositorySyncGitRuntimeExecutionInput,
  ): Promise<KnowledgeRepositorySyncGitRuntimeResult>;
}

function portablePath(value: string): string {
  return value.split(path.sep).join('/');
}

function parseNullSeparated(output: string): string[] {
  return output.split('\0').filter(Boolean);
}

function replaceLiteral(value: string, search: string, replacement: string): string {
  return search.length === 0 ? value : value.split(search).join(replacement);
}

function isSyncablePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || normalized.includes('\0')) return false;
  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return false;
  if (['.git', '.obsidian', '.trash', '.Trash', 'node_modules'].includes(segments[0] ?? '')) {
    return false;
  }
  if (segments[0] === '.memory-flow') {
    return normalized === '.memory-flow/repository.json';
  }
  return !segments.some(isTemporaryFile);
}

function createRemoteUrl(fullName: string): string {
  const segments = fullName.split('/');
  if (
    segments.length !== 2 ||
    segments.some(
      (segment) =>
        !segment || segment === '.' || segment === '..' || /[\\\u0000-\u001f]/.test(segment),
    )
  ) {
    throw new KnowledgeRepositoryGitRuntimeError('CONFLICT', 'GitHub repository name is invalid');
  }
  return `https://github.com/${encodeURIComponent(segments[0]!)}/${encodeURIComponent(segments[1]!)}.git`;
}

function authEnvironment(token: string): { env: Record<string, string>; secretValues: string[] } {
  const encodedCredential = Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64');
  const authorization = `AUTHORIZATION: basic ${encodedCredential}`;
  return {
    env: {
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'credential.helper',
      GIT_CONFIG_VALUE_0: '',
      GIT_CONFIG_KEY_1: 'http.https://github.com/.extraheader',
      GIT_CONFIG_VALUE_1: authorization,
    },
    secretValues: [token, encodedCredential, authorization],
  };
}

async function writeFileIfMissing(filePath: string, content: string): Promise<void> {
  try {
    await fs.promises.writeFile(filePath, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
}

async function readSafeRegularFileIfExists(
  filePath: string,
  unsafeMessage: string,
): Promise<string | null> {
  try {
    const stat = await fs.promises.lstat(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new KnowledgeRepositoryGitRuntimeError('CONFLICT', unsafeMessage);
    }
    return await fs.promises.readFile(filePath, 'utf8');
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

export class DesktopKnowledgeRepositoryGitRuntime
  implements KnowledgeRepositoryGitRuntimePort, KnowledgeRepositorySyncGitRuntimePort
{
  constructor(private readonly git: GitProcessPort = new NodeGitProcessPort()) {}

  async inspect(rootPath: string): Promise<KnowledgeRepositoryGitRuntimeInspection> {
    const root = await this.requireRoot(rootPath);
    const manifest = await this.readManifest(root);
    if (!(await this.hasGitDirectory(root))) return { headSha: null, manifest };
    try {
      const result = await this.git.run(['rev-parse', 'HEAD'], { cwd: root });
      return { headSha: result.stdout.trim() || null, manifest };
    } catch {
      return { headSha: null, manifest };
    }
  }

  async reconcile(
    input: KnowledgeRepositoryGitRuntimeInput,
  ): Promise<KnowledgeRepositoryGitRuntimeResult> {
    const root = await this.requireRoot(input.rootPath);
    const remoteUrl = createRemoteUrl(input.repositoryFullName);
    const { env, secretValues } = authEnvironment(input.token);
    try {
      await this.validateGitRuntime(input.defaultBranch);
      await this.assertNoGitLock(root);
      if (input.action === 'CloneRemoteIntoLocal') {
        return await this.cloneRemoteIntoLocal(root, remoteUrl, input, env);
      }
      return await this.initializeRemoteFromLocal(root, remoteUrl, input, env);
    } catch (error) {
      throw this.toRuntimeError(error, root, secretValues);
    }
  }

  async prepareSynchronization(
    input: KnowledgeRepositorySyncGitRuntimeInput,
  ): Promise<KnowledgeRepositorySyncGitRuntimePreparation> {
    const root = await this.requireRoot(input.rootPath);
    const remoteUrl = createRemoteUrl(input.repositoryFullName);
    try {
      await this.validateGitRuntime(input.defaultBranch);
      await this.assertNoGitLock(root);
      await this.requireManagedRepository(root, input.repositoryId);
      await this.configureRepository(root);
      await this.ensureOrigin(root, remoteUrl);
      await this.assertNoRebaseInProgress(root);
      await this.clearSyncState(root);
      await this.assertCurrentBranch(root, input.defaultBranch);
      const localCommitCreated = await this.commitAllowedChanges(root, SYNC_COMMIT_MESSAGE);
      return { headSha: await this.requireHead(root), localCommitCreated };
    } catch (error) {
      throw this.toRuntimeError(error, root, []);
    }
  }

  async synchronize(
    input: KnowledgeRepositorySyncGitRuntimeExecutionInput,
  ): Promise<KnowledgeRepositorySyncGitRuntimeResult> {
    const root = await this.requireRoot(input.rootPath);
    const remoteUrl = createRemoteUrl(input.repositoryFullName);
    const { env, secretValues } = authEnvironment(input.token);
    try {
      await this.validateGitRuntime(input.defaultBranch);
      await this.assertNoGitLock(root);
      await this.requireManagedRepository(root, input.repositoryId);
      await this.configureRepository(root);
      await this.ensureOrigin(root, remoteUrl);
      await this.assertNoRebaseInProgress(root);
      await this.clearSyncState(root);
      await this.assertCurrentBranch(root, input.defaultBranch);

      const localCommitCreated = await this.commitAllowedChanges(root, SYNC_COMMIT_MESSAGE);
      const localHeadSha = await this.requireHead(root);
      const remoteHeadSha = await this.fetchRemoteHead(root, input.defaultBranch, env);
      await this.assertRemoteHistoryNotRewritten(
        root,
        input.lastConfirmedRemoteHeadSha,
        localHeadSha,
        remoteHeadSha,
      );
      if (localHeadSha === remoteHeadSha) {
        return {
          outcome: 'UpToDate',
          headSha: localHeadSha,
          localCommitCreated,
          remoteChangesApplied: false,
          pushed: false,
        };
      }

      if (await this.isAncestor(root, remoteHeadSha, localHeadSha)) {
        await this.pushSynchronizationHead(
          root,
          input.defaultBranch,
          env,
          localHeadSha,
          remoteHeadSha,
        );
        return {
          outcome: 'Pushed',
          headSha: localHeadSha,
          localCommitCreated,
          remoteChangesApplied: false,
          pushed: true,
        };
      }

      await this.writeSyncState(root, {
        schemaVersion: 1,
        branch: input.defaultBranch,
        localHeadSha,
        remoteHeadSha,
      });
      await this.rebaseOntoRemote(root, input.defaultBranch, localHeadSha, remoteHeadSha);
      await this.clearSyncState(root);
      const rebasedHeadSha = await this.requireHead(root);

      if (rebasedHeadSha === remoteHeadSha) {
        return {
          outcome: 'Pulled',
          headSha: rebasedHeadSha,
          localCommitCreated,
          remoteChangesApplied: true,
          pushed: false,
        };
      }

      await this.pushSynchronizationHead(
        root,
        input.defaultBranch,
        env,
        rebasedHeadSha,
        remoteHeadSha,
      );
      return {
        outcome: 'RebasedAndPushed',
        headSha: rebasedHeadSha,
        localCommitCreated,
        remoteChangesApplied: true,
        pushed: true,
      };
    } catch (error) {
      throw this.toRuntimeError(error, root, secretValues);
    }
  }

  private async validateGitRuntime(branch: string): Promise<void> {
    await this.git.run(['--version']);
    await this.git.run(['check-ref-format', '--branch', branch]);
  }

  private async requireManagedRepository(root: string, repositoryId: string): Promise<void> {
    if (!(await this.hasGitDirectory(root))) {
      throw new KnowledgeRepositoryGitRuntimeError(
        'CONFLICT',
        'Run first synchronization before syncing this Vault',
      );
    }
    const [manifest, ownership] = await Promise.all([
      this.readManifest(root),
      this.readOwnershipMarker(root),
    ]);
    if (
      manifest?.repositoryId !== repositoryId ||
      (ownership !== null && ownership.repositoryId !== repositoryId)
    ) {
      throw new KnowledgeRepositoryGitRuntimeError(
        'CONFLICT',
        'Selected Vault is not managed by this knowledge repository connection',
      );
    }
    await this.ensureOwnershipMarker(root, repositoryId);
  }

  private async assertCurrentBranch(root: string, expectedBranch: string): Promise<void> {
    const result = await this.git.run(['symbolic-ref', '--quiet', '--short', 'HEAD'], {
      cwd: root,
      allowedExitCodes: [0, 1, 128],
    });
    if (result.exitCode !== 0 || result.stdout.trim() !== expectedBranch) {
      throw new KnowledgeRepositoryGitRuntimeError(
        'CONFLICT',
        `Vault must be on the ${expectedBranch} branch before synchronization`,
      );
    }
  }

  private async hasRebaseInProgress(root: string): Promise<boolean> {
    for (const relativePath of ['.git/rebase-merge', '.git/rebase-apply']) {
      try {
        const stat = await fs.promises.lstat(path.join(root, relativePath));
        if (stat.isSymbolicLink() || !stat.isDirectory()) {
          throw new KnowledgeRepositoryGitRuntimeError(
            'CONFLICT',
            'Vault rebase metadata is unsafe',
          );
        }
        return true;
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    }
    return false;
  }

  private async assertNoRebaseInProgress(root: string): Promise<void> {
    if (await this.hasRebaseInProgress(root)) {
      throw await this.createRebaseConflictError(root);
    }
  }

  private async createRebaseConflictError(
    root: string,
  ): Promise<KnowledgeRepositoryGitRuntimeError> {
    const [state, conflicting] = await Promise.all([
      this.readSyncState(root),
      this.git.run(['diff', '--name-only', '--diff-filter=U', '-z'], { cwd: root }),
    ]);
    const context: KnowledgeRepositorySyncConflictContext = {
      localHeadSha: state?.localHeadSha ?? (await this.readHeadIfPresent(root)),
      remoteHeadSha: state?.remoteHeadSha ?? null,
      conflictingPaths: parseNullSeparated(conflicting.stdout).map(portablePath),
      rebaseInProgress: true,
    };
    return new KnowledgeRepositoryGitRuntimeError(
      'CONFLICT',
      context.conflictingPaths.length > 0
        ? 'Git rebase paused with conflicting Vault files; resolve them in Git or Obsidian, complete or abort the rebase, then retry'
        : 'Git rebase is still in progress; complete or abort it in an external Git tool, then retry',
      { ...context },
    );
  }

  private async readSyncState(root: string): Promise<KnowledgeRepositoryGitSyncState | null> {
    try {
      const content = await readSafeRegularFileIfExists(
        path.join(root, '.git', GIT_SYNC_STATE),
        'Vault Git synchronization state is unsafe',
      );
      if (content === null) return null;
      const parsed = JSON.parse(content) as Partial<KnowledgeRepositoryGitSyncState>;
      if (
        parsed.schemaVersion !== 1 ||
        typeof parsed.branch !== 'string' ||
        typeof parsed.localHeadSha !== 'string' ||
        !/^[a-f0-9]{40,64}$/i.test(parsed.localHeadSha) ||
        typeof parsed.remoteHeadSha !== 'string' ||
        !/^[a-f0-9]{40,64}$/i.test(parsed.remoteHeadSha)
      ) {
        throw new KnowledgeRepositoryGitRuntimeError(
          'CONFLICT',
          'Vault Git synchronization state is invalid',
        );
      }
      return parsed as KnowledgeRepositoryGitSyncState;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new KnowledgeRepositoryGitRuntimeError(
          'CONFLICT',
          'Vault Git synchronization state is invalid JSON',
        );
      }
      throw error;
    }
  }

  private async writeSyncState(
    root: string,
    state: KnowledgeRepositoryGitSyncState,
  ): Promise<void> {
    await this.readSyncState(root);
    await fs.promises.writeFile(
      path.join(root, '.git', GIT_SYNC_STATE),
      `${JSON.stringify(state, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
  }

  private async clearSyncState(root: string): Promise<void> {
    const statePath = path.join(root, '.git', GIT_SYNC_STATE);
    try {
      const stat = await fs.promises.lstat(statePath);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new KnowledgeRepositoryGitRuntimeError(
          'CONFLICT',
          'Vault Git synchronization state is unsafe',
        );
      }
      await fs.promises.unlink(statePath);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }

  private async fetchRemoteHead(
    root: string,
    branch: string,
    env: Record<string, string>,
  ): Promise<string> {
    await this.git.run(['fetch', '--no-tags', '--prune', 'origin', branch], { cwd: root, env });
    const result = await this.git.run(['rev-parse', `refs/remotes/origin/${branch}`], {
      cwd: root,
    });
    const headSha = result.stdout.trim();
    if (!/^[a-f0-9]{40,64}$/i.test(headSha)) {
      throw new KnowledgeRepositoryGitRuntimeError(
        'INTERNAL_ERROR',
        'GitHub default branch did not resolve to a valid commit',
      );
    }
    return headSha;
  }

  private async isAncestor(root: string, ancestor: string, descendant: string): Promise<boolean> {
    const result = await this.git.run(['merge-base', '--is-ancestor', ancestor, descendant], {
      cwd: root,
      allowedExitCodes: [0, 1],
    });
    return result.exitCode === 0;
  }

  private async assertRemoteHistoryNotRewritten(
    root: string,
    lastConfirmedRemoteHeadSha: string,
    localHeadSha: string,
    remoteHeadSha: string,
  ): Promise<void> {
    const knownCommit = await this.git.run(
      ['cat-file', '-e', `${lastConfirmedRemoteHeadSha}^{commit}`],
      {
        cwd: root,
        allowedExitCodes: [0, 1, 128],
      },
    );
    const historyPreserved =
      knownCommit.exitCode === 0 &&
      (await this.isAncestor(root, lastConfirmedRemoteHeadSha, remoteHeadSha));
    if (historyPreserved) return;

    const context: KnowledgeRepositorySyncConflictContext = {
      localHeadSha,
      remoteHeadSha,
      conflictingPaths: [],
      rebaseInProgress: false,
    };
    throw new KnowledgeRepositoryGitRuntimeError(
      'CONFLICT',
      'GitHub default-branch history was rewritten; automatic synchronization is paused until the repository is reconciled again',
      { ...context },
    );
  }

  private async rebaseOntoRemote(
    root: string,
    branch: string,
    localHeadSha: string,
    remoteHeadSha: string,
  ): Promise<void> {
    try {
      await this.git.run(['rebase', `refs/remotes/origin/${branch}`], { cwd: root });
    } catch (error) {
      if (await this.hasRebaseInProgress(root)) {
        throw await this.createRebaseConflictError(root);
      }
      throw error;
    }

    const headSha = await this.requireHead(root);
    if (headSha === localHeadSha && headSha !== remoteHeadSha) {
      throw new KnowledgeRepositoryGitRuntimeError(
        'INTERNAL_ERROR',
        'Git rebase did not incorporate the fetched GitHub HEAD',
      );
    }
  }

  private async pushSynchronizationHead(
    root: string,
    branch: string,
    env: Record<string, string>,
    localHeadSha: string,
    remoteHeadSha: string,
  ): Promise<void> {
    try {
      await this.git.run(
        ['push', '--porcelain', '--set-upstream', 'origin', `HEAD:refs/heads/${branch}`],
        { cwd: root, env },
      );
    } catch (error) {
      const detail =
        error instanceof GitProcessError ? `${error.result.stderr}\n${error.result.stdout}` : '';
      if (/non-fast-forward|fetch first|rejected/i.test(detail)) {
        const context: KnowledgeRepositorySyncConflictContext = {
          localHeadSha,
          remoteHeadSha,
          conflictingPaths: [],
          rebaseInProgress: false,
        };
        throw new KnowledgeRepositoryGitRuntimeError(
          'CONFLICT',
          'GitHub changed again while pushing; retry synchronization to rebase safely',
          { ...context },
        );
      }
      throw error;
    }
  }

  private async initializeRemoteFromLocal(
    root: string,
    remoteUrl: string,
    input: KnowledgeRepositoryGitRuntimeInput,
    env: Record<string, string>,
  ): Promise<KnowledgeRepositoryGitRuntimeResult> {
    const existingManifest = await this.readManifest(root);
    const hasGit = await this.hasGitDirectory(root);
    const ownership = hasGit ? await this.readOwnershipMarker(root) : null;
    if (
      hasGit &&
      (ownership
        ? ownership.repositoryId !== input.repositoryId
        : existingManifest?.repositoryId !== input.repositoryId)
    ) {
      throw new KnowledgeRepositoryGitRuntimeError(
        'CONFLICT',
        'An existing Git repository is already managing this Vault',
      );
    }
    await this.ensureScaffold(root, input.repositoryId);
    if (!hasGit) {
      await this.git.run(['init', '--initial-branch', input.defaultBranch], { cwd: root });
    }
    await this.ensureOwnershipMarker(root, input.repositoryId);
    await this.configureRepository(root);
    await this.ensureOrigin(root, remoteUrl);

    if (input.expectedRemoteHeadSha) {
      await this.fetchAndVerify(root, input.defaultBranch, input.expectedRemoteHeadSha, env);
      await this.git.run(['reset', '--mixed', `refs/remotes/origin/${input.defaultBranch}`], {
        cwd: root,
      });
    } else {
      await this.assertRemoteBranchStillEmpty(root, input.defaultBranch, env);
    }

    await this.commitAllowedChanges(root);
    const headSha = await this.requireHead(root);
    await this.git.run(
      ['push', '--porcelain', '--set-upstream', 'origin', `HEAD:refs/heads/${input.defaultBranch}`],
      { cwd: root, env },
    );
    return { headSha };
  }

  private async cloneRemoteIntoLocal(
    root: string,
    remoteUrl: string,
    input: KnowledgeRepositoryGitRuntimeInput,
    env: Record<string, string>,
  ): Promise<KnowledgeRepositoryGitRuntimeResult> {
    if (!input.expectedRemoteHeadSha) {
      throw new KnowledgeRepositoryGitRuntimeError(
        'CONFLICT',
        'A remote HEAD is required before cloning into the local Vault',
      );
    }
    const existingManifest = await this.readManifest(root);
    const hasGit = await this.hasGitDirectory(root);
    const ownership = hasGit ? await this.readOwnershipMarker(root) : null;
    const appOwnedRepository =
      hasGit &&
      (ownership
        ? ownership.repositoryId === input.repositoryId
        : existingManifest?.repositoryId === input.repositoryId);
    if (hasGit && !appOwnedRepository) {
      throw new KnowledgeRepositoryGitRuntimeError(
        'CONFLICT',
        'An existing Git repository is already managing this Vault',
      );
    }

    if (!hasGit) {
      await this.git.run(['init', '--initial-branch', input.defaultBranch], { cwd: root });
    }
    await this.ensureOwnershipMarker(root, input.repositoryId);
    await this.configureRepository(root);
    await this.ensureOrigin(root, remoteUrl);
    await this.fetchAndVerify(root, input.defaultBranch, input.expectedRemoteHeadSha, env);
    const remoteRef = `refs/remotes/origin/${input.defaultBranch}`;
    const currentHead = appOwnedRepository ? await this.readHeadIfPresent(root) : null;

    if (currentHead) {
      await this.git.run(['merge-base', '--is-ancestor', remoteRef, 'HEAD'], { cwd: root });
    } else {
      await this.assertCheckoutHasNoCollisions(root, remoteRef);
      await this.git.run(['checkout', '-B', input.defaultBranch, remoteRef], { cwd: root });
    }

    await this.ensureScaffold(root, input.repositoryId);
    await this.commitAllowedChanges(root);
    const headSha = await this.requireHead(root);
    await this.git.run(
      ['push', '--porcelain', '--set-upstream', 'origin', `HEAD:refs/heads/${input.defaultBranch}`],
      { cwd: root, env },
    );
    return { headSha };
  }

  private async requireRoot(rootPath: string): Promise<string> {
    const root = await fs.promises.realpath(rootPath);
    const stat = await fs.promises.stat(root);
    if (!stat.isDirectory()) {
      throw new KnowledgeRepositoryGitRuntimeError('CONFLICT', 'Selected Vault is not a directory');
    }
    return root;
  }

  private async hasGitDirectory(root: string): Promise<boolean> {
    try {
      const stat = await fs.promises.lstat(path.join(root, '.git'));
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new KnowledgeRepositoryGitRuntimeError(
          'CONFLICT',
          'Vault Git metadata is not a safe directory',
        );
      }
      return true;
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
  }

  private async assertNoGitLock(root: string): Promise<void> {
    for (const relativePath of ['.git/index.lock', '.git/HEAD.lock', '.git/packed-refs.lock']) {
      try {
        await fs.promises.access(path.join(root, relativePath));
        throw new KnowledgeRepositoryGitRuntimeError(
          'CONFLICT',
          'Another Git process is using the selected Vault',
        );
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    }
  }

  private async readManifest(root: string): Promise<KnowledgeRepositoryGitManifest | null> {
    try {
      const content = await readSafeRegularFileIfExists(
        path.join(root, '.memory-flow', 'repository.json'),
        'Knowledge repository manifest path is unsafe',
      );
      if (content === null) return null;
      const parsed = JSON.parse(content) as Partial<KnowledgeRepositoryGitManifest>;
      if (
        parsed.schemaVersion !== 1 ||
        typeof parsed.repositoryId !== 'string' ||
        parsed.capabilities?.markdown !== true ||
        parsed.capabilities?.attachments !== true
      ) {
        throw new KnowledgeRepositoryGitRuntimeError(
          'CONFLICT',
          'Knowledge repository manifest is invalid',
        );
      }
      return parsed as KnowledgeRepositoryGitManifest;
    } catch (error) {
      if (isMissing(error)) return null;
      if (error instanceof SyntaxError) {
        throw new KnowledgeRepositoryGitRuntimeError(
          'CONFLICT',
          'Knowledge repository manifest is invalid JSON',
        );
      }
      throw error;
    }
  }

  private async readOwnershipMarker(
    root: string,
  ): Promise<KnowledgeRepositoryGitOwnershipMarker | null> {
    try {
      const content = await readSafeRegularFileIfExists(
        path.join(root, '.git', GIT_OWNERSHIP_MARKER),
        'Vault Git ownership metadata is unsafe',
      );
      if (content === null) return null;
      const parsed = JSON.parse(content) as Partial<KnowledgeRepositoryGitOwnershipMarker>;
      if (parsed.schemaVersion !== 1 || typeof parsed.repositoryId !== 'string') {
        throw new KnowledgeRepositoryGitRuntimeError(
          'CONFLICT',
          'Vault Git ownership metadata is invalid',
        );
      }
      return parsed as KnowledgeRepositoryGitOwnershipMarker;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new KnowledgeRepositoryGitRuntimeError(
          'CONFLICT',
          'Vault Git ownership metadata is invalid JSON',
        );
      }
      throw error;
    }
  }

  private async ensureOwnershipMarker(root: string, repositoryId: string): Promise<void> {
    const existing = await this.readOwnershipMarker(root);
    if (existing && existing.repositoryId !== repositoryId) {
      throw new KnowledgeRepositoryGitRuntimeError(
        'CONFLICT',
        'An existing Git repository is already managing this Vault',
      );
    }
    if (existing) return;
    const marker: KnowledgeRepositoryGitOwnershipMarker = { schemaVersion: 1, repositoryId };
    await writeFileIfMissing(
      path.join(root, '.git', GIT_OWNERSHIP_MARKER),
      `${JSON.stringify(marker, null, 2)}\n`,
    );
  }

  private async ensureScaffold(root: string, repositoryId: string): Promise<void> {
    const metadataDirectory = path.join(root, '.memory-flow');
    try {
      const stat = await fs.promises.lstat(metadataDirectory);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new KnowledgeRepositoryGitRuntimeError(
          'CONFLICT',
          'Knowledge repository metadata path is unsafe',
        );
      }
    } catch (error) {
      if (!isMissing(error)) throw error;
      await fs.promises.mkdir(metadataDirectory, { mode: 0o700 });
    }

    const existingManifest = await this.readManifest(root);
    if (existingManifest && existingManifest.repositoryId !== repositoryId) {
      throw new KnowledgeRepositoryGitRuntimeError(
        'CONFLICT',
        'Vault is already bound to another knowledge repository',
      );
    }
    if (!existingManifest) {
      const manifest: KnowledgeRepositoryGitManifest = {
        schemaVersion: 1,
        repositoryId,
        capabilities: { markdown: true, attachments: true },
      };
      await writeFileIfMissing(
        path.join(metadataDirectory, 'repository.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
      );
    }

    await writeFileIfMissing(
      path.join(root, 'README.md'),
      '# MemoFlow Knowledge Repository\n\nThis private repository is synchronized from an Obsidian Vault.\n',
    );
    const gitignorePath = path.join(root, '.gitignore');
    const gitignore =
      (await readSafeRegularFileIfExists(
        gitignorePath,
        'Knowledge repository ignore file path is unsafe',
      )) ?? '';
    const existingLines = new Set(gitignore.split(/\r?\n/).map((line) => line.trim()));
    const missingLines = REQUIRED_GITIGNORE_LINES.filter((line) => !existingLines.has(line));
    if (missingLines.length > 0) {
      const prefix = gitignore.length === 0 || gitignore.endsWith('\n') ? '' : '\n';
      await fs.promises.writeFile(
        gitignorePath,
        `${gitignore}${prefix}${missingLines.join('\n')}\n`,
        { encoding: 'utf8', mode: 0o600 },
      );
    }
  }

  private async configureRepository(root: string): Promise<void> {
    const hooksDirectory = path.join(root, '.git', 'memoflow-hooks');
    try {
      const stat = await fs.promises.lstat(hooksDirectory);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new KnowledgeRepositoryGitRuntimeError(
          'CONFLICT',
          'Vault Git hooks directory is unsafe',
        );
      }
    } catch (error) {
      if (!isMissing(error)) throw error;
      await fs.promises.mkdir(hooksDirectory, { mode: 0o700 });
    }
    await this.git.run(['config', '--local', 'user.name', 'MemoFlow'], { cwd: root });
    await this.git.run(['config', '--local', 'user.email', 'git@memoflow.local'], { cwd: root });
    await this.git.run(['config', '--local', 'push.default', 'simple'], { cwd: root });
    await this.git.run(['config', '--local', 'core.hooksPath', '.git/memoflow-hooks'], {
      cwd: root,
    });
    await this.git.run(['config', '--local', 'core.fsmonitor', 'false'], { cwd: root });
  }

  private async ensureOrigin(root: string, remoteUrl: string): Promise<void> {
    const current = await this.git.run(['remote', 'get-url', 'origin'], {
      cwd: root,
      allowedExitCodes: [0, 2, 128],
    });
    if (current.exitCode !== 0 || !current.stdout.trim()) {
      await this.git.run(['remote', 'add', 'origin', remoteUrl], { cwd: root });
      return;
    }
    // Callers validate the app-owned repository-id marker before reaching
    // this point, so a changed URL is a safe GitHub rename/transfer update.
    if (current.stdout.trim() !== remoteUrl) {
      await this.git.run(['remote', 'set-url', 'origin', remoteUrl], { cwd: root });
    }
  }

  private async fetchAndVerify(
    root: string,
    branch: string,
    expectedHeadSha: string,
    env: Record<string, string>,
  ): Promise<void> {
    await this.git.run(['fetch', '--no-tags', '--prune', 'origin', branch], { cwd: root, env });
    const fetched = await this.git.run(['rev-parse', `refs/remotes/origin/${branch}`], {
      cwd: root,
    });
    if (fetched.stdout.trim() !== expectedHeadSha) {
      throw new KnowledgeRepositoryGitRuntimeError(
        'CONFLICT',
        'GitHub default branch changed after the reconciliation preview',
      );
    }
  }

  private async assertRemoteBranchStillEmpty(
    root: string,
    branch: string,
    env: Record<string, string>,
  ): Promise<void> {
    const result = await this.git.run(['ls-remote', '--heads', 'origin', `refs/heads/${branch}`], {
      cwd: root,
      env,
    });
    if (result.stdout.trim()) {
      throw new KnowledgeRepositoryGitRuntimeError(
        'CONFLICT',
        'GitHub default branch was created after the reconciliation preview',
      );
    }
  }

  private async assertCheckoutHasNoCollisions(root: string, remoteRef: string): Promise<void> {
    const remoteTree = await this.git.run(['ls-tree', '-r', '--name-only', '-z', remoteRef], {
      cwd: root,
    });
    for (const relativePath of parseNullSeparated(remoteTree.stdout)) {
      const normalized = portablePath(relativePath);
      const segments = normalized.split('/');
      if (
        !normalized ||
        normalized.startsWith('/') ||
        normalized.includes('\0') ||
        segments.some((segment) => !segment || segment === '.' || segment === '..') ||
        segments[0] === '.git'
      ) {
        throw new KnowledgeRepositoryGitRuntimeError(
          'CONFLICT',
          'GitHub repository contains an unsafe path',
        );
      }
      for (let index = 0; index < segments.length; index += 1) {
        try {
          const stat = await fs.promises.lstat(path.join(root, ...segments.slice(0, index + 1)));
          if (stat.isSymbolicLink() || index === segments.length - 1 || !stat.isDirectory()) {
            throw new KnowledgeRepositoryGitRuntimeError(
              'CONFLICT',
              `Remote path would overwrite a local file: ${normalized}`,
            );
          }
        } catch (error) {
          if (isMissing(error)) break;
          if ((error as NodeJS.ErrnoException).code === 'ENOTDIR') {
            throw new KnowledgeRepositoryGitRuntimeError(
              'CONFLICT',
              `Remote path would overwrite a local file: ${normalized}`,
            );
          }
          throw error;
        }
      }
    }
  }

  private async commitAllowedChanges(root: string, message = COMMIT_MESSAGE): Promise<boolean> {
    const [tracked, untracked] = await Promise.all([
      this.git.run(['ls-files', '-z', '--modified', '--deleted'], { cwd: root }),
      this.git.run(['ls-files', '-z', '--others', '--exclude-standard'], { cwd: root }),
    ]);
    const paths = [
      ...new Set(
        [...parseNullSeparated(tracked.stdout), ...parseNullSeparated(untracked.stdout)]
          .map(portablePath)
          .filter(isSyncablePath),
      ),
    ];
    for (let index = 0; index < paths.length; index += 200) {
      await this.git.run(['add', '-A', '--', ...paths.slice(index, index + 200)], { cwd: root });
    }
    let staged = await this.git.run(['diff', '--cached', '--name-only', '-z'], { cwd: root });
    const disallowedStagedPaths = parseNullSeparated(staged.stdout)
      .map(portablePath)
      .filter((relativePath) => !isSyncablePath(relativePath));
    for (let index = 0; index < disallowedStagedPaths.length; index += 200) {
      await this.git.run(
        ['reset', '--quiet', '--', ...disallowedStagedPaths.slice(index, index + 200)],
        { cwd: root },
      );
    }
    if (disallowedStagedPaths.length > 0) {
      staged = await this.git.run(['diff', '--cached', '--name-only', '-z'], { cwd: root });
    }
    if (!staged.stdout) return false;
    await this.git.run(['commit', '-m', message], { cwd: root });
    return true;
  }

  private async readHeadIfPresent(root: string): Promise<string | null> {
    const result = await this.git.run(['rev-parse', '--verify', 'HEAD'], {
      cwd: root,
      allowedExitCodes: [0, 128],
    });
    const head = result.stdout.trim();
    return result.exitCode === 0 && /^[a-f0-9]{40,64}$/i.test(head) ? head : null;
  }

  private async requireHead(root: string): Promise<string> {
    try {
      const result = await this.git.run(['rev-parse', 'HEAD'], { cwd: root });
      const head = result.stdout.trim();
      if (/^[a-f0-9]{40,64}$/i.test(head)) return head;
    } catch {
      // Converted to a stable product error below.
    }
    throw new KnowledgeRepositoryGitRuntimeError(
      'INTERNAL_ERROR',
      'Knowledge repository has no commit to synchronize',
    );
  }

  private toRuntimeError(
    error: unknown,
    root: string,
    secretValues: readonly string[],
  ): KnowledgeRepositoryGitRuntimeError {
    if (error instanceof KnowledgeRepositoryGitRuntimeError) return error;
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return new KnowledgeRepositoryGitRuntimeError(
        'SERVICE_UNAVAILABLE',
        'Git is not installed or is unavailable to MemoFlow',
      );
    }
    const detail =
      error instanceof GitProcessError
        ? `${error.result.stderr}\n${error.result.stdout}`
        : error instanceof Error
          ? error.message
          : 'Git operation failed';
    let sanitized = replaceLiteral(detail, root, '<vault>');
    for (const secret of secretValues) {
      sanitized = replaceLiteral(sanitized, secret, '[REDACTED]');
    }
    sanitized = sanitized.trim().slice(0, 500);
    if (/authentication failed|could not read username|403|401/i.test(sanitized)) {
      return new KnowledgeRepositoryGitRuntimeError(
        'UNAUTHORIZED',
        'GitHub repository authorization expired or was revoked',
      );
    }
    if (/non-fast-forward|fetch first|would be overwritten|conflict/i.test(sanitized)) {
      return new KnowledgeRepositoryGitRuntimeError(
        'CONFLICT',
        sanitized || 'GitHub repository changed during synchronization',
      );
    }
    if (
      /could not resolve host|failed to connect|timed out|network is unreachable/i.test(sanitized)
    ) {
      return new KnowledgeRepositoryGitRuntimeError(
        'SERVICE_UNAVAILABLE',
        'GitHub is unavailable; the local Vault was kept intact',
      );
    }
    return new KnowledgeRepositoryGitRuntimeError(
      'INTERNAL_ERROR',
      sanitized || 'Git synchronization failed',
    );
  }
}
