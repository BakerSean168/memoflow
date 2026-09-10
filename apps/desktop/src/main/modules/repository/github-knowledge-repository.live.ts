import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import type {
  GitHubInstallationRepositoryDTO,
  KnowledgeRepositoryConnectionClientDTO,
  KnowledgeRepositoryConnectionServerDTO,
} from '@memoflow/contracts/repository';
import type { IdentityId } from '@memoflow/contracts/primitives';
import { ok, ResultErrorException } from '@memoflow/contracts/result';
// This opt-in acceptance file intentionally crosses the Desktop -> Repository
// boundary so the production service and Git runtime are exercised together.
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { IKnowledgeRepositoryConnectionRepository } from '../../../../../../packages/repository/src/server/application/ports/knowledge-repository-connection.repository';
// eslint-disable-next-line @nx/enforce-module-boundaries
import type {
  IKnowledgeNoteProjectionRepository,
  IKnowledgeWriteRequestRepository,
  KnowledgeNoteProjectionUpsert,
  KnowledgeWriteRequestProjectionSource,
  KnowledgeWriteRequestRecord,
} from '../../../../../../packages/repository/src/server/application/ports/knowledge-note-projection.repository';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { KnowledgeNoteCommitService } from '../../../../../../packages/repository/src/server/application/services/knowledge-note-commit.service';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { GitHubAppClient } from '../../../../../../packages/repository/src/server/infrastructure/services/github-app-client';
import { DesktopKnowledgeRepositoryGitRuntime } from './desktop-knowledge-repository-git.runtime';
import { DesktopKnowledgeRepositorySyncService } from './desktop-knowledge-repository-sync.service';

const REQUIRED_ENV = [
  'GITHUB_APP_ID',
  'GITHUB_APP_PRIVATE_KEY',
  'GITHUB_TEST_REPOSITORY',
  'GITHUB_TEST_INSTALLATION_ID',
] as const;

type LiveEnvironment = Record<(typeof REQUIRED_ENV)[number], string>;

function requireLiveEnvironment(): LiveEnvironment {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Live GitHub acceptance requires ${missing.join(', ')}. ` +
        'Use a dedicated private fixture repository and GitHub App installation; no personal GitHub token is accepted.',
    );
  }
  return Object.fromEntries(
    REQUIRED_ENV.map((name) => [name, process.env[name]!.trim()]),
  ) as LiveEnvironment;
}

function parseRepositoryFullName(value: string): { owner: string; name: string } {
  const parts = value.split('/');
  if (parts.length !== 2 || parts.some((part) => !/^[A-Za-z0-9_.-]+$/.test(part))) {
    throw new Error('GITHUB_TEST_REPOSITORY must be an owner/name GitHub repository');
  }
  return { owner: parts[0]!, name: parts[1]! };
}

function asIdentityId(value: string): IdentityId {
  return value as IdentityId;
}

class LiveConnectionRepository implements IKnowledgeRepositoryConnectionRepository {
  constructor(private row: KnowledgeRepositoryConnectionServerDTO) {}

  async findById(id: string): Promise<KnowledgeRepositoryConnectionServerDTO | null> {
    return id === this.row.id ? this.row : null;
  }

  async findByIdForIdentity(
    identityId: string,
    id: string,
  ): Promise<KnowledgeRepositoryConnectionServerDTO | null> {
    return identityId === this.row.identityId && id === this.row.id ? this.row : null;
  }

  async findByIdentityId(identityId: string): Promise<KnowledgeRepositoryConnectionServerDTO[]> {
    return identityId === this.row.identityId ? [this.row] : [];
  }

  async findByGithubRepositoryId(
    githubRepositoryId: string,
  ): Promise<KnowledgeRepositoryConnectionServerDTO | null> {
    return githubRepositoryId === this.row.githubRepositoryId ? this.row : null;
  }

  async findByInstallationAndGithubRepositoryId(
    installationId: string,
    githubRepositoryId: string,
  ): Promise<KnowledgeRepositoryConnectionServerDTO | null> {
    return installationId === this.row.installationId &&
      githubRepositoryId === this.row.githubRepositoryId
      ? this.row
      : null;
  }

  async listProjectionCandidates(
    _limit: number,
    _cursor?: { updatedAt: number; id: string },
  ): Promise<KnowledgeRepositoryConnectionServerDTO[]> {
    return [this.row];
  }

  async save(connection: KnowledgeRepositoryConnectionServerDTO): Promise<void> {
    this.row = connection;
  }

  async updateStatus(
    identityId: string,
    id: string,
    status: KnowledgeRepositoryConnectionServerDTO['status'],
    _error?: { code: string; message: string } | null,
  ): Promise<void> {
    if (identityId === this.row.identityId && id === this.row.id) {
      this.row = { ...this.row, status };
    }
  }
}

class LiveProjectionRepository implements IKnowledgeNoteProjectionRepository {
  private readonly notes = new Map<string, KnowledgeNoteProjectionUpsert>();

  async applySnapshot(
    _connectionId: string,
    _commitSha: string,
    notes: KnowledgeNoteProjectionUpsert[],
  ): Promise<{ id: string; relativePath: string }[]> {
    this.notes.clear();
    for (const note of notes) this.notes.set(note.relativePath, note);
    return [];
  }

  async applyChanges(
    _connectionId: string,
    _commitSha: string,
    notes: KnowledgeNoteProjectionUpsert[],
    deletedPaths: string[],
  ): Promise<void> {
    for (const note of notes) this.notes.set(note.relativePath, note);
    for (const relativePath of deletedPaths) this.notes.delete(relativePath);
  }

  async listByIdentity(): Promise<never[]> {
    return [];
  }

  async findByIdForIdentity(): Promise<null> {
    return null;
  }

  async findByPath(_connectionId: string, relativePath: string): Promise<null> {
    void relativePath;
    return null;
  }

  async loadLinkGraphSourcesForIdentity(): Promise<null> {
    return null;
  }

  async updateIndexStatusForIdentity(): Promise<boolean> {
    return false;
  }
}

class LiveWriteRequestRepository implements IKnowledgeWriteRequestRepository {
  private readonly records = new Map<string, KnowledgeWriteRequestRecord>();

  async findByIdentityAndRequestId(
    identityId: string,
    requestId: string,
  ): Promise<KnowledgeWriteRequestRecord | null> {
    const record = this.records.get(`${identityId}:${requestId}`);
    return record ?? null;
  }

  async create(record: KnowledgeWriteRequestRecord): Promise<boolean> {
    const key = `${record.identityId}:${record.requestId}`;
    if (this.records.has(key)) return false;
    this.records.set(key, record);
    return true;
  }

  async retryFailed(identityId: string, id: string, updatedAt: number): Promise<boolean> {
    for (const [key, record] of this.records) {
      if (record.identityId !== identityId || record.id !== id || record.status !== 'Failed') {
        continue;
      }
      this.records.set(key, {
        ...record,
        status: 'Pending',
        updatedAt,
        commitSha: null,
        errorCode: null,
        errorMessage: null,
        completedAt: null,
      });
      return true;
    }
    return false;
  }

  async markCommitted(identityId: string, id: string, commitSha: string): Promise<void> {
    for (const [key, record] of this.records) {
      if (record.identityId !== identityId || record.id !== id) continue;
      this.records.set(key, {
        ...record,
        status: 'Committed',
        commitSha,
        updatedAt: Date.now(),
        completedAt: Date.now(),
      });
    }
  }

  async markFailed(identityId: string, id: string, code: string, message: string): Promise<void> {
    for (const [key, record] of this.records) {
      if (record.identityId !== identityId || record.id !== id) continue;
      this.records.set(key, {
        ...record,
        status: 'Failed',
        errorCode: code,
        errorMessage: message,
        updatedAt: Date.now(),
      });
    }
  }

  async findByIdForIdentity(
    identityId: string,
    id: string,
  ): Promise<KnowledgeWriteRequestRecord | null> {
    for (const record of this.records.values()) {
      if (record.identityId === identityId && record.id === id) {
        return record;
      }
    }
    return null;
  }

  async bindProjectionSource(
    identityId: string,
    id: string,
    source: KnowledgeWriteRequestProjectionSource,
  ): Promise<boolean> {
    for (const [key, record] of this.records) {
      if (record.identityId !== identityId || record.id !== id) continue;
      if (record.projectionStatus === 'Succeeded') return false;
      this.records.set(key, {
        ...record,
        blobSha: source.blobSha,
        markdownContent: source.markdownContent,
        projectionStatus: 'Pending',
        updatedAt: Date.now(),
      });
      return true;
    }
    return false;
  }

  async markProjectionSucceeded(identityId: string, id: string, now: number): Promise<boolean> {
    for (const [key, record] of this.records) {
      if (record.identityId !== identityId || record.id !== id) continue;
      if (record.projectionStatus === 'Succeeded') return false;
      this.records.set(key, {
        ...record,
        projectionStatus: 'Succeeded',
        projectionErrorCode: null,
        projectionErrorMessage: null,
        projectionAttempts: record.projectionAttempts + 1,
        projectedAt: now,
        updatedAt: now,
      });
      return true;
    }
    return false;
  }

  async markProjectionFailed(
    identityId: string,
    id: string,
    code: string,
    message: string,
    now: number,
  ): Promise<boolean> {
    for (const [key, record] of this.records) {
      if (record.identityId !== identityId || record.id !== id) continue;
      if (record.projectionStatus === 'Succeeded') return false;
      this.records.set(key, {
        ...record,
        projectionStatus: 'Failed',
        projectionErrorCode: code,
        projectionErrorMessage: message,
        projectionAttempts: record.projectionAttempts + 1,
        projectedAt: null,
        updatedAt: now,
      });
      return true;
    }
    return false;
  }

  async markProjectionSucceededByCommit(
    connectionId: string,
    commitSha: string,
    now: number,
  ): Promise<number> {
    let updated = 0;
    for (const [key, record] of this.records) {
      if (
        record.connectionId !== connectionId ||
        record.commitSha !== commitSha ||
        record.projectionStatus === 'Succeeded'
      ) {
        continue;
      }
      this.records.set(key, {
        ...record,
        projectionStatus: 'Succeeded',
        projectionErrorCode: null,
        projectionErrorMessage: null,
        projectionAttempts: record.projectionAttempts + 1,
        projectedAt: now,
        updatedAt: now,
      });
      updated += 1;
    }
    return updated;
  }

  async listProjectionPendingOrFailedForConnection(
    connectionId: string,
    limit: number,
  ): Promise<KnowledgeWriteRequestRecord[]> {
    return [...this.records.values()]
      .filter(
        (record) =>
          record.connectionId === connectionId &&
          (record.projectionStatus === 'Pending' || record.projectionStatus === 'Failed'),
      )
      .slice(0, limit);
  }

  async listForIdentity(
    identityId: string,
    options: { connectionId?: string; limit: number },
  ): Promise<KnowledgeWriteRequestRecord[]> {
    return [...this.records.values()]
      .filter(
        (record) =>
          record.identityId === identityId &&
          (options.connectionId ? record.connectionId === options.connectionId : true),
      )
      .slice(0, options.limit);
  }
}

async function deleteFixtureNote(
  client: GitHubAppClient,
  environment: LiveEnvironment,
  repository: GitHubInstallationRepositoryDTO,
  branch: string,
  relativePath: string,
): Promise<void> {
  const token = await client.createInstallationAccessToken(
    environment.GITHUB_TEST_INSTALLATION_ID,
    repository.id,
  );
  const pathName = relativePath.split('/').map(encodeURIComponent).join('/');
  const url = `https://api.github.com/repos/${repository.fullName}/contents/${pathName}?ref=${encodeURIComponent(branch)}`;
  const current = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token.token}`,
      'user-agent': 'memoflow-github-live-acceptance',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (current.status === 404) return;
  if (!current.ok) throw new Error(`Fixture cleanup lookup failed: ${current.status}`);
  const payload = (await current.json()) as { sha?: string };
  if (!payload.sha) throw new Error('Fixture cleanup lookup returned no blob SHA');

  const deleted = await fetch(url, {
    method: 'DELETE',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token.token}`,
      'content-type': 'application/json',
      'user-agent': 'memoflow-github-live-acceptance',
      'x-github-api-version': '2022-11-28',
    },
    body: JSON.stringify({
      message: `test: remove live acceptance note ${relativePath}`,
      sha: payload.sha,
      branch,
    }),
  });
  if (!deleted.ok) {
    const detail = (await deleted.text()).slice(0, 500);
    throw new Error(`Fixture cleanup delete failed: ${deleted.status} ${detail}`);
  }
}

const environment = requireLiveEnvironment();
parseRepositoryFullName(environment.GITHUB_TEST_REPOSITORY);
const appClient = new GitHubAppClient({
  appId: environment.GITHUB_APP_ID,
  privateKey: environment.GITHUB_APP_PRIVATE_KEY,
});
const temporaryDirectories: string[] = [];
let cleanupPath: string | null = null;
let cleanupRepository: GitHubInstallationRepositoryDTO | null = null;
let cleanupBranch: string | null = null;

afterAll(async () => {
  if (cleanupPath && cleanupRepository && cleanupBranch) {
    await deleteFixtureNote(appClient, environment, cleanupRepository, cleanupBranch, cleanupPath);
  }
  await Promise.all(
    temporaryDirectories.map((directory) =>
      fs.promises.rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('live GitHub knowledge repository acceptance', () => {
  it('commits through the App, reads back from GitHub, and pulls into a Desktop Vault', async () => {
    const inventory = await appClient.getInstallationInventory(
      environment.GITHUB_TEST_INSTALLATION_ID,
    );
    expect(inventory.contentsPermission).toBe('write');
    expect(inventory.suspended).toBe(false);
    const repository = inventory.repositories.find(
      (candidate) => candidate.fullName === environment.GITHUB_TEST_REPOSITORY,
    );
    expect(
      repository,
      `Fixture ${environment.GITHUB_TEST_REPOSITORY} is not installed`,
    ).toBeDefined();
    if (!repository) throw new Error('Fixture repository was not found in the App installation');
    expect(repository.private).toBe(true);
    expect(repository.archived).toBe(false);
    expect(repository.disabled).toBe(false);
    // GitHub App inventory derives push from installation contents:write;
    // admin is often false on /installation/repositories and is not required.
    expect(repository.permissions.push).toBe(true);
    expect(repository.permissions.pull).toBe(true);
    expect(repository.defaultBranch).toBeTruthy();

    const preview = await appClient.getRepositorySnapshot(
      environment.GITHUB_TEST_INSTALLATION_ID,
      repository,
    );
    expect(preview.headSha).toMatch(/^[a-f0-9]{40,64}$/i);
    if (!preview.headSha) throw new Error('Fixture repository must have a default-branch HEAD');

    const vaultParent = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'memoflow-live-github-'));
    temporaryDirectories.push(vaultParent);
    const vaultPath = path.join(vaultParent, 'vault');
    await fs.promises.mkdir(vaultPath);
    const cloneToken = await appClient.createInstallationAccessToken(
      environment.GITHUB_TEST_INSTALLATION_ID,
      repository.id,
    );
    const gitRuntime = new DesktopKnowledgeRepositoryGitRuntime();
    const cloned = await gitRuntime.reconcile({
      rootPath: vaultPath,
      repositoryId: repository.id,
      repositoryFullName: repository.fullName,
      defaultBranch: repository.defaultBranch,
      expectedRemoteHeadSha: preview.headSha,
      action: 'CloneRemoteIntoLocal',
      token: cloneToken.token,
    });
    expect(cloned.headSha).toMatch(/^[a-f0-9]{40,64}$/i);

    const synchronizedPreview = await appClient.getRepositorySnapshot(
      environment.GITHUB_TEST_INSTALLATION_ID,
      repository,
    );
    if (!synchronizedPreview.headSha) throw new Error('Fixture HEAD disappeared after clone');

    const identityId = asIdentityId('live-github-acceptance');
    const connectionId = `live-github-connection-${randomUUID()}`;
    const now = Date.now();
    const serverConnection: KnowledgeRepositoryConnectionServerDTO = {
      id: connectionId,
      identityId,
      githubUserId: inventory.accountId,
      githubRepositoryId: repository.id,
      githubRepositoryFullName: repository.fullName,
      installationId: environment.GITHUB_TEST_INSTALLATION_ID,
      defaultBranch: repository.defaultBranch,
      status: 'Active',
      lastSyncedCommitSha: synchronizedPreview.headSha,
      lastProjectedCommitSha: synchronizedPreview.headSha,
      lastErrorCode: null,
      lastErrorMessage: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    const connectionRepository = new LiveConnectionRepository(serverConnection);
    const projectionRepository = new LiveProjectionRepository();
    const writeRequestRepository = new LiveWriteRequestRepository();
    const commitService = new KnowledgeNoteCommitService({
      connectionRepository,
      projectionRepository,
      writeRequestRepository,
      githubAppClient: appClient,
      publishMutation: () => undefined,
    });
    const proposedPath = `e2e/live-${Date.now()}-${randomUUID()}.md`;
    cleanupPath = proposedPath;
    cleanupRepository = repository;
    cleanupBranch = repository.defaultBranch;
    const requestId = `live-github-request-${randomUUID()}`;
    const committed = await commitService.create(identityId, {
      connectionId,
      proposalId: `live-github-proposal-${randomUUID()}`,
      revision: 1,
      requestId,
      proposedPath,
      title: 'Live GitHub App acceptance note',
      frontmatter: { source: 'live-github-acceptance' },
      content: 'This note verifies the production GitHub App and Desktop pull boundary.',
      reason: 'Controlled live acceptance fixture',
    });
    expect(committed.ok).toBe(true);
    if (!committed.ok)
      throw new ResultErrorException(
        'Live GitHub knowledge note commit failed',
        committed.error.code,
        undefined,
        committed.error.context,
        undefined,
        committed.error,
      );
    expect(committed.data.relativePath).toBe(proposedPath);
    expect(committed.data.commitSha).toMatch(/^[a-f0-9]{40,64}$/i);

    const changes = await appClient.getMarkdownChanges(
      environment.GITHUB_TEST_INSTALLATION_ID,
      repository,
      synchronizedPreview.headSha,
      committed.data.commitSha,
    );
    const added = changes.changes.find((change) => change.relativePath === proposedPath);
    expect(added?.status).toBe('added');
    expect(added?.markdownContent).toContain('Live GitHub App acceptance note');

    const snapshot = await appClient.getFullMarkdownSnapshot(
      environment.GITHUB_TEST_INSTALLATION_ID,
      repository,
      committed.data.commitSha,
    );
    expect(
      snapshot.files.find((file) => file.relativePath === proposedPath)?.markdownContent,
    ).toContain('production GitHub App and Desktop pull boundary');

    let connection: KnowledgeRepositoryConnectionClientDTO = {
      id: serverConnection.id,
      identityId: serverConnection.identityId,
      githubUserId: serverConnection.githubUserId,
      githubRepositoryId: serverConnection.githubRepositoryId,
      githubRepositoryFullName: serverConnection.githubRepositoryFullName,
      installationId: serverConnection.installationId,
      defaultBranch: serverConnection.defaultBranch,
      status: serverConnection.status,
      lastSyncedCommitSha: synchronizedPreview.headSha,
      lastProjectedCommitSha: synchronizedPreview.headSha,
      lastErrorCode: null,
      canSync: true,
      createdAt: serverConnection.createdAt,
      updatedAt: serverConnection.updatedAt,
    };
    const syncService = new DesktopKnowledgeRepositorySyncService({
      localVault: {
        getBinding: async () => {
          const bindingId = `LocalVaultBindingId_${randomUUID()}` as never;
          return {
            binding: {
              id: bindingId,
              knowledgeSpaceId: `KnowledgeSpaceId_${randomUUID()}` as never,
              localProfileId: 'p_live_github_acceptance',
              rootPath: vaultPath,
              displayName: 'Live GitHub acceptance vault',
              boundAt: now,
              detachedAt: null,
            },
            health: {
              bindingId,
              state: 'Available' as const,
              observedAt: now,
              detail: null,
            },
          };
        },
      },
      remote: {
        listKnowledgeRepositoryConnections: async () => ok({ connections: [connection] }),
        issueDesktopKnowledgeRepositoryToken: async () => {
          const token = await appClient.createInstallationAccessToken(
            environment.GITHUB_TEST_INSTALLATION_ID,
            repository.id,
          );
          return ok({
            token: token.token,
            repositoryId: repository.id,
            expiresAt: token.expiresAt,
          });
        },
        confirmKnowledgeRepositoryHead: async (_id, input) => {
          const current = await appClient.getRepositorySnapshot(
            environment.GITHUB_TEST_INSTALLATION_ID,
            repository,
          );
          expect(current.headSha).toBe(input.headSha);
          connection = { ...connection, lastSyncedCommitSha: input.headSha };
          return ok(connection);
        },
      },
      gitRuntime,
    });

    const pulled = await syncService.execute(identityId, { connectionId });
    expect(pulled.ok).toBe(true);
    if (!pulled.ok)
      throw new ResultErrorException(
        'Live GitHub knowledge repository sync failed',
        pulled.error.code,
        undefined,
        pulled.error.context,
        undefined,
        pulled.error,
      );
    expect(pulled.data.remoteChangesApplied).toBe(true);
    expect(pulled.data.headSha).toBe(committed.data.commitSha);
    await expect(
      fs.promises.readFile(path.join(vaultPath, proposedPath), 'utf8'),
    ).resolves.toContain('production GitHub App and Desktop pull boundary');
  }, 180_000);
});
