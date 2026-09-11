import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type {
  GitHubInstallationRepositoryDTO,
  KnowledgeAttachmentProjectionClientDTO,
  KnowledgeNoteProjectionClientDTO,
  KnowledgeRemoteBindingServerDTO,
  KnowledgeProjectionCheckpoint,
  RemoteHistoryFence,
  RemoteRepositoryObservation,
} from '@memoflow/contracts/repository';
import type {
  IKnowledgeProjectionCheckpointRepository,
  IKnowledgeRemoteBindingRepository,
  IRemoteHistoryFenceRepository,
  IRemoteRepositoryObservationRepository,
} from '../ports/knowledge-remote-binding.repositories';
import type {
  IKnowledgeRepositoryLeaseRepository,
  KnowledgeRepositoryLeaseRequest,
} from '../ports/knowledge-repository-lease.repository';
import type {
  GithubWebhookDeliveryRecord,
  GithubWebhookDeliveryStatus,
  IGithubWebhookDeliveryRepository,
  IKnowledgeNoteProjectionRepository,
  KnowledgeNoteProjectionUpsert,
} from '../ports/knowledge-note-projection.repository';
import type {
  GitHubAppInstallationInventory,
  IGitHubAppClient,
} from '../ports/github-app-client.port';
import type {
  IKnowledgeAttachmentProjectionRepository,
  KnowledgeAttachmentProjectionUpsert,
} from '../ports/knowledge-attachment-projection.repository';
import type {
  IKnowledgeAttachmentContentCache,
  KnowledgeAttachmentContentCacheEntry,
} from '../ports/knowledge-attachment-content-cache.port';
import { KnowledgeRepositoryProjectionService } from './knowledge-repository-projection.service';

const webhookSecret = 'test-webhook-secret';

function connection(): KnowledgeRemoteBindingServerDTO {
  return {
    id: 'KnowledgeRemoteBindingId_550e8400-e29b-41d4-a716-446655440200' as never,
    knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440201' as never,
    identityId: 'IdentityId_11111111-1111-4111-8111-111111111111' as never,
    provider: 'GitHub',
    installationId: 'installation-1',
    repositoryId: 'repository-1',
    repositoryFullNameSnapshot: 'owner/knowledge',
    connectedAt: 1,
    disconnectedAt: null,
    version: 1,
  };
}

function githubRepository(): GitHubInstallationRepositoryDTO {
  return {
    id: 'repository-1',
    nodeId: 'R_1',
    fullName: 'owner/knowledge',
    ownerId: '42',
    private: true,
    archived: false,
    disabled: false,
    defaultBranch: 'main',
    permissions: { admin: true, push: true, pull: true },
  };
}

function inventory(): GitHubAppInstallationInventory {
  return {
    installationId: 'installation-1',
    accountId: '42',
    contentsPermission: 'write',
    suspended: false,
    repositories: [githubRepository()],
  };
}

class MemoryConnectionRepository implements IKnowledgeRemoteBindingRepository {
  readonly row = connection();
  readonly save = vi.fn(async (next: KnowledgeRemoteBindingServerDTO) => {
    Object.assign(this.row, next);
  });
  readonly listProjectionCandidates = vi.fn(async (_limit: number) => [this.row]);

  async findById(id: string) {
    return id === this.row.id ? this.row : null;
  }

  async findByIdForIdentity(identityId: string, id: string) {
    return id === this.row.id && identityId === this.row.identityId ? this.row : null;
  }

  async findByIdentityId(identityId: string) {
    return identityId === this.row.identityId ? [this.row] : [];
  }

  async findByRepositoryId(repositoryId: string) {
    return repositoryId === this.row.repositoryId ? this.row : null;
  }

  async findByInstallationAndRepositoryId(installationId: string, repositoryId: string) {
    return installationId === this.row.installationId && repositoryId === this.row.repositoryId
      ? this.row
      : null;
  }

  async markDisconnected() {
    return false;
  }
}

class MemoryObservationRepository implements IRemoteRepositoryObservationRepository {
  readonly rows = new Map<string, RemoteRepositoryObservation>();
  readonly save = vi.fn(async (row: RemoteRepositoryObservation) => {
    this.rows.set(row.bindingId, structuredClone(row));
  });
  constructor(
    initial: RemoteRepositoryObservation = {
      bindingId: connection().id,
      observedAt: 1,
      accountId: '42',
      repositoryFullName: 'owner/knowledge',
      defaultBranch: 'main',
      private: true,
      archived: false,
      disabled: false,
      contentsPermission: 'write',
      installationSuspended: false,
      eligibility: { state: 'Ready' },
    },
  ) {
    this.rows.set(initial.bindingId, structuredClone(initial));
  }
  async findByBindingId(bindingId: string) {
    return this.rows.get(bindingId) ?? null;
  }
  async findByBindingIds(bindingIds: readonly string[]) {
    return new Map(
      bindingIds.flatMap((id) => (this.rows.has(id) ? [[id, this.rows.get(id)!] as const] : [])),
    );
  }
}

class MemoryHistoryFenceRepository implements IRemoteHistoryFenceRepository {
  readonly rows = new Map<string, RemoteHistoryFence>();
  readonly save = vi.fn(async (row: RemoteHistoryFence) => {
    this.rows.set(row.bindingId, structuredClone(row));
  });
  constructor(
    initial: RemoteHistoryFence = {
      bindingId: connection().id,
      defaultBranch: 'main',
      lastConfirmedRemoteHeadSha: 'before-sha',
      confirmedAt: 1,
    },
  ) {
    this.rows.set(initial.bindingId, structuredClone(initial));
  }
  async findByBindingId(bindingId: string) {
    return this.rows.get(bindingId) ?? null;
  }
  async findByBindingIds(bindingIds: readonly string[]) {
    return new Map(
      bindingIds.flatMap((id) => (this.rows.has(id) ? [[id, this.rows.get(id)!] as const] : [])),
    );
  }
}

class MemoryProjectionCheckpointRepository implements IKnowledgeProjectionCheckpointRepository {
  readonly rows = new Map<string, KnowledgeProjectionCheckpoint>();
  readonly save = vi.fn(async (row: KnowledgeProjectionCheckpoint) => {
    this.rows.set(row.bindingId, structuredClone(row));
  });
  constructor(
    initial: KnowledgeProjectionCheckpoint = {
      bindingId: connection().id,
      branch: 'main',
      projectedCommitSha: 'before-sha',
      state: 'Ready',
      failure: null,
      lastAttemptAt: 1,
      projectedAt: 1,
    },
  ) {
    this.rows.set(initial.bindingId, structuredClone(initial));
  }
  async findByBindingId(bindingId: string) {
    return this.rows.get(bindingId) ?? null;
  }
  async findByBindingIds(bindingIds: readonly string[]) {
    return new Map(
      bindingIds.flatMap((id) => (this.rows.has(id) ? [[id, this.rows.get(id)!] as const] : [])),
    );
  }
}

let latestFourAxisRepositories: ReturnType<typeof buildFourAxisRepositories> | null = null;

function buildFourAxisRepositories() {
  return {
    observationRepository: new MemoryObservationRepository(),
    historyFenceRepository: new MemoryHistoryFenceRepository(),
    projectionCheckpointRepository: new MemoryProjectionCheckpointRepository(),
  };
}

function createFourAxisRepositories() {
  latestFourAxisRepositories = buildFourAxisRepositories();
  return latestFourAxisRepositories;
}

function latestCheckpointRepository(): MemoryProjectionCheckpointRepository {
  if (!latestFourAxisRepositories) throw new Error('four-axis repositories were not created');
  return latestFourAxisRepositories.projectionCheckpointRepository;
}

function latestObservationRepository(): MemoryObservationRepository {
  if (!latestFourAxisRepositories) throw new Error('four-axis repositories were not created');
  return latestFourAxisRepositories.observationRepository;
}

class MemoryDeliveryRepository implements IGithubWebhookDeliveryRepository {
  readonly rows = new Map<string, GithubWebhookDeliveryRecord>();

  async reserve(record: GithubWebhookDeliveryRecord) {
    if ([...this.rows.values()].some((row) => row.deliveryId === record.deliveryId)) return false;
    this.rows.set(record.id, record);
    return true;
  }

  async findById(id: string) {
    return this.rows.get(id) ?? null;
  }

  async listPending(limit: number) {
    return [...this.rows.values()]
      .filter((row) => row.status === 'Received' || row.status === 'Processing')
      .slice(0, limit);
  }

  async updateStatus(
    id: string,
    connectionId: string,
    status: GithubWebhookDeliveryStatus,
    errorMessage: string | null = null,
  ) {
    const row = this.rows.get(id);
    if (!row || row.connectionId !== connectionId) return;
    this.rows.set(id, {
      ...row,
      status,
      errorMessage,
      processedAt: ['Processed', 'Ignored', 'Failed'].includes(status) ? 1_750_000_000_000 : null,
    });
  }
}

class MemoryLeaseRepository implements IKnowledgeRepositoryLeaseRepository {
  readonly rows = new Map<string, { ownerToken: string; expiresAt: number }>();

  async tryAcquire(request: KnowledgeRepositoryLeaseRequest) {
    const current = this.rows.get(request.leaseKey);
    if (current && current.expiresAt > request.now) return false;
    this.rows.set(request.leaseKey, {
      ownerToken: request.ownerToken,
      expiresAt: request.expiresAt,
    });
    return true;
  }

  async renew(request: KnowledgeRepositoryLeaseRequest) {
    const current = this.rows.get(request.leaseKey);
    if (!current || current.ownerToken !== request.ownerToken || current.expiresAt <= request.now) {
      return false;
    }
    current.expiresAt = request.expiresAt;
    return true;
  }

  async release(leaseKey: string, ownerToken: string) {
    if (this.rows.get(leaseKey)?.ownerToken === ownerToken) this.rows.delete(leaseKey);
  }
}

class MemoryProjectionRepository implements IKnowledgeNoteProjectionRepository {
  readonly rows = new Map<string, KnowledgeNoteProjectionUpsert>();
  readonly applyChanges = vi.fn(
    async (
      _connectionId: string,
      _commitSha: string,
      notes: KnowledgeNoteProjectionUpsert[],
      deletedPaths: string[],
    ) => {
      notes.forEach((note) => this.rows.set(note.id, note));
      for (const [id, note] of this.rows) {
        if (deletedPaths.includes(note.relativePath)) this.rows.delete(id);
      }
    },
  );
  readonly applySnapshot = vi.fn(
    async (_connectionId: string, _commitSha: string, notes: KnowledgeNoteProjectionUpsert[]) => {
      const deleted = [...this.rows.values()]
        .filter((row) => !notes.some((note) => note.relativePath === row.relativePath))
        .map((row) => ({ id: row.id, relativePath: row.relativePath }));
      this.rows.clear();
      notes.forEach((note) => this.rows.set(note.id, note));
      return deleted;
    },
  );
  readonly updateIndexStatusForIdentity = vi.fn(async () => true);

  async listByIdentity() {
    return [];
  }

  async findByIdForIdentity() {
    return null;
  }

  async findByPath(_connectionId: string, relativePath: string) {
    const row = [...this.rows.values()].find(
      (candidate) => candidate.relativePath === relativePath,
    );
    return row ? this.toClient(row) : null;
  }

  async loadLinkGraphSourcesForIdentity(
    _identityId: string,
    centerProjectionId: string,
    limit: number,
  ) {
    if (!this.rows.has(centerProjectionId)) return null;
    const notes = [...this.rows.values()].slice(0, limit).map((row) => this.toClient(row));
    return { notes, truncated: this.rows.size > limit };
  }

  private toClient(row: KnowledgeNoteProjectionUpsert): KnowledgeNoteProjectionClientDTO {
    return {
      ...row,
      title: row.relativePath,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    };
  }
}

class MemoryAttachmentRepository implements IKnowledgeAttachmentProjectionRepository {
  readonly rows = new Map<string, KnowledgeAttachmentProjectionUpsert>();
  readonly applyChanges = vi.fn(
    async (
      _connectionId: string,
      _commitSha: string,
      attachments: KnowledgeAttachmentProjectionUpsert[],
      deletedPaths: string[],
    ) => {
      attachments.forEach((attachment) => this.rows.set(attachment.id, attachment));
      for (const [id, attachment] of this.rows) {
        if (deletedPaths.includes(attachment.relativePath)) this.rows.delete(id);
      }
    },
  );
  readonly applySnapshot = vi.fn(
    async (
      _connectionId: string,
      _commitSha: string,
      attachments: KnowledgeAttachmentProjectionUpsert[],
    ) => {
      this.rows.clear();
      attachments.forEach((attachment) => this.rows.set(attachment.id, attachment));
    },
  );

  async listByIdentity(identityId: string) {
    return identityId === connection().identityId
      ? [...this.rows.values()].map((row) => this.toClient(row))
      : [];
  }

  async findByIdForIdentity(identityId: string, projectionId: string) {
    const row = identityId === connection().identityId ? this.rows.get(projectionId) : null;
    return row ? this.toClient(row) : null;
  }

  private toClient(
    row: KnowledgeAttachmentProjectionUpsert,
  ): KnowledgeAttachmentProjectionClientDTO {
    return {
      ...row,
      fileName: row.relativePath.split('/').slice(-1)[0] ?? row.relativePath,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    };
  }
}

class MemoryAttachmentContentCache implements IKnowledgeAttachmentContentCache {
  readonly rows = new Map<string, KnowledgeAttachmentContentCacheEntry>();

  async find(connectionId: string, blobSha: string, now: number) {
    const key = `${connectionId}:${blobSha}`;
    const entry = this.rows.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      this.rows.delete(key);
      return null;
    }
    return { ...entry, bytes: Uint8Array.from(entry.bytes) };
  }

  async save(entry: KnowledgeAttachmentContentCacheEntry) {
    this.rows.set(`${entry.connectionId}:${entry.blobSha}`, {
      ...entry,
      bytes: Uint8Array.from(entry.bytes),
    });
  }

  async remove(connectionId: string, blobSha: string) {
    this.rows.delete(`${connectionId}:${blobSha}`);
  }
}

function githubClient(overrides: Partial<IGitHubAppClient> = {}): IGitHubAppClient {
  return {
    getInstallationInventory: vi.fn(async () => inventory()),
    getMarkdownChanges: vi.fn(async () => ({
      commitSha: 'after-sha',
      requiresFullSnapshot: false,
      changes: [
        {
          relativePath: 'notes/architecture.md',
          blobSha: 'blob-sha',
          markdownContent: '---\ntitle: Architecture\n---\n\n# Architecture',
          status: 'added' as const,
        },
      ],
    })),
    getFullMarkdownSnapshot: vi.fn(),
    getBlob: vi.fn(),
    getRepositorySnapshot: vi.fn(),
    createFileCommit: vi.fn(),
    createInstallationAccessToken: vi.fn(),
    ...overrides,
  };
}

function signedPushPayload(overrides: Record<string, unknown> = {}) {
  const rawBody = JSON.stringify({
    before: 'before-sha',
    after: 'after-sha',
    forced: false,
    ref: 'refs/heads/main',
    installation: { id: 'installation-1' },
    repository: {
      id: 'repository-1',
      full_name: 'owner/knowledge',
      default_branch: 'main',
      private: true,
    },
    ...overrides,
  });
  return {
    rawBody,
    signature: `sha256=${createHmac('sha256', webhookSecret).update(rawBody).digest('hex')}`,
  };
}

describe('KnowledgeRepositoryProjectionService', () => {
  it('verifies, deduplicates, projects, advances the cursor, and publishes an indexing event', async () => {
    const connectionRepository = new MemoryConnectionRepository();
    const deliveryRepository = new MemoryDeliveryRepository();
    const projectionRepository = new MemoryProjectionRepository();
    const publishMutation = vi.fn();
    const service = new KnowledgeRepositoryProjectionService({
      ...createFourAxisRepositories(),
      webhookSecret,
      connectionRepository,
      deliveryRepository,
      projectionRepository,
      githubAppClient: githubClient(),
      publishMutation,
      now: () => 1_750_000_000_000,
    });
    const payload = signedPushPayload();

    await expect(
      service.ingest({
        deliveryId: 'delivery-1',
        eventName: 'push',
        ...payload,
      }),
    ).resolves.toEqual({ ok: true, data: { accepted: true, duplicate: false } });

    await vi.waitFor(() => {
      expect([...deliveryRepository.rows.values()][0]?.status).toBe('Processed');
    });
    expect(projectionRepository.applyChanges).toHaveBeenCalledWith(
      connection().id,
      'after-sha',
      [
        expect.objectContaining({
          relativePath: 'notes/architecture.md',
          indexStatus: 'pending',
        }),
      ],
      [],
    );
    expect(latestCheckpointRepository().rows.get(connection().id)?.projectedCommitSha).toBe(
      'after-sha',
    );
    expect(publishMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: connectionRepository.row.identityId,
        repositoryId: connection().id,
        resourcePath: 'notes/architecture.md',
        mutation: 'created',
      }),
    );

    await expect(
      service.ingest({
        deliveryId: 'delivery-1',
        eventName: 'push',
        ...payload,
      }),
    ).resolves.toEqual({ ok: true, data: { accepted: false, duplicate: true } });
  });

  it('rejects invalid signatures before reserving work', async () => {
    const deliveryRepository = new MemoryDeliveryRepository();
    const service = new KnowledgeRepositoryProjectionService({
      ...createFourAxisRepositories(),
      webhookSecret,
      connectionRepository: new MemoryConnectionRepository(),
      deliveryRepository,
      projectionRepository: new MemoryProjectionRepository(),
      githubAppClient: githubClient(),
    });

    const result = await service.ingest({
      deliveryId: 'delivery-invalid',
      eventName: 'push',
      rawBody: '{}',
      signature: `sha256=${'0'.repeat(64)}`,
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } });
    expect(deliveryRepository.rows.size).toBe(0);
  });

  it('updates index status only through the identity/content-hash guarded repository method', async () => {
    const projectionRepository = new MemoryProjectionRepository();
    const service = new KnowledgeRepositoryProjectionService({
      ...createFourAxisRepositories(),
      webhookSecret,
      connectionRepository: new MemoryConnectionRepository(),
      deliveryRepository: new MemoryDeliveryRepository(),
      projectionRepository,
      githubAppClient: githubClient(),
    });

    await expect(
      service.updateIndexStatus('identity-1', {
        projectionId: 'projection-1',
        contentHash: 'content-hash-1',
        status: 'indexed',
      }),
    ).resolves.toEqual({ ok: true, data: { updated: true } });
    expect(projectionRepository.updateIndexStatusForIdentity).toHaveBeenCalledWith(
      'identity-1',
      'projection-1',
      'content-hash-1',
      'indexed',
    );
  });

  it('builds an identity-scoped link graph from the current projection read model', async () => {
    const projectionRepository = new MemoryProjectionRepository();
    projectionRepository.rows.set('center-note', {
      id: 'center-note',
      connectionId: connection().id,
      relativePath: 'Center.md',
      commitSha: 'commit-1',
      blobSha: 'blob-center',
      contentHash: 'hash-center',
      frontmatter: { title: 'Center' },
      markdownContent: 'Related to [[Target]].',
      indexStatus: 'indexed',
    });
    projectionRepository.rows.set('target-note', {
      id: 'target-note',
      connectionId: connection().id,
      relativePath: 'Target.md',
      commitSha: 'commit-1',
      blobSha: 'blob-target',
      contentHash: 'hash-target',
      frontmatter: { title: 'Target' },
      markdownContent: '# Target',
      indexStatus: 'indexed',
    });
    const service = new KnowledgeRepositoryProjectionService({
      ...createFourAxisRepositories(),
      webhookSecret,
      connectionRepository: new MemoryConnectionRepository(),
      deliveryRepository: new MemoryDeliveryRepository(),
      projectionRepository,
      githubAppClient: githubClient(),
    });

    await expect(
      service.getLinkGraph('identity-1', 'center-note', { depth: 1, maxNodes: 40 }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        centerProjectionId: 'center-note',
        nodes: [
          expect.objectContaining({ projectionId: 'center-note' }),
          expect.objectContaining({ projectionId: 'target-note' }),
        ],
        edges: [
          expect.objectContaining({
            sourceProjectionId: 'center-note',
            targetProjectionId: 'target-note',
          }),
        ],
      },
    });
  });

  it('serializes deliveries per connection so an older slow commit cannot overwrite the cursor', async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const getMarkdownChanges = vi.fn(
      async (
        _installationId: string,
        _repository: GitHubInstallationRepositoryDTO,
        _beforeSha: string | null,
        afterSha: string,
      ) => {
        if (afterSha === 'commit-1') await firstGate;
        return {
          commitSha: afterSha,
          requiresFullSnapshot: false,
          changes: [
            {
              relativePath: 'notes/ordered.md',
              blobSha: `blob-${afterSha}`,
              markdownContent: `# ${afterSha}`,
              status: 'modified' as const,
            },
          ],
        };
      },
    );
    const connectionRepository = new MemoryConnectionRepository();
    const deliveryRepository = new MemoryDeliveryRepository();
    const service = new KnowledgeRepositoryProjectionService({
      ...createFourAxisRepositories(),
      webhookSecret,
      connectionRepository,
      deliveryRepository,
      projectionRepository: new MemoryProjectionRepository(),
      githubAppClient: githubClient({ getMarkdownChanges }),
      publishMutation: vi.fn(),
    });

    await service.ingest({
      deliveryId: 'delivery-ordered-1',
      eventName: 'push',
      ...signedPushPayload({ after: 'commit-1' }),
    });
    await service.ingest({
      deliveryId: 'delivery-ordered-2',
      eventName: 'push',
      ...signedPushPayload({ before: 'commit-1', after: 'commit-2' }),
    });

    await vi.waitFor(() => expect(getMarkdownChanges).toHaveBeenCalledTimes(1));
    releaseFirst();
    await vi.waitFor(() => {
      expect(
        [...deliveryRepository.rows.values()].filter((row) => row.status === 'Processed'),
      ).toHaveLength(2);
    });

    expect(getMarkdownChanges.mock.calls.map((call) => call[3])).toEqual(['commit-1', 'commit-2']);
    expect(latestCheckpointRepository().rows.get(connection().id)?.projectedCommitSha).toBe(
      'commit-2',
    );
  });

  it('claims a persisted webhook delivery once across two service instances', async () => {
    const connectionRepository = new MemoryConnectionRepository();
    const deliveryRepository = new MemoryDeliveryRepository();
    const projectionRepository = new MemoryProjectionRepository();
    await deliveryRepository.reserve({
      id: 'delivery-shared',
      connectionId: connection().id,
      deliveryId: 'delivery-shared-id',
      eventName: 'push',
      beforeSha: 'before-sha',
      afterSha: 'after-sha',
      forced: false,
      status: 'Received',
      errorMessage: null,
      receivedAt: 1_750_000_000_000,
      processedAt: null,
    });
    const leaseRepository = new MemoryLeaseRepository();
    const getMarkdownChanges = vi.fn(async () => ({
      commitSha: 'after-sha',
      requiresFullSnapshot: false,
      changes: [
        {
          relativePath: 'notes/shared.md',
          blobSha: 'shared-blob',
          markdownContent: '# Shared',
          status: 'added' as const,
        },
      ],
    }));
    const fourAxis = buildFourAxisRepositories();
    const createService = () =>
      new KnowledgeRepositoryProjectionService({
        ...fourAxis,
        webhookSecret,
        connectionRepository,
        deliveryRepository,
        projectionRepository,
        githubAppClient: githubClient({ getMarkdownChanges }),
        leaseRepository,
        reconciliationIntervalMs: 0,
      });
    const first = createService();
    const second = createService();
    first.start();
    second.start();

    await vi.waitFor(() =>
      expect(deliveryRepository.rows.get('delivery-shared')?.status).toBe('Processed'),
    );
    expect(getMarkdownChanges).toHaveBeenCalledOnce();
    first.stop();
    second.stop();
  });

  it('refuses webhook delivery status updates when connectionId does not match', async () => {
    const deliveryRepository = new MemoryDeliveryRepository();
    await deliveryRepository.reserve({
      id: 'delivery-owned',
      connectionId: connection().id,
      deliveryId: 'delivery-owned-id',
      eventName: 'push',
      beforeSha: 'before-sha',
      afterSha: 'after-sha',
      forced: false,
      status: 'Received',
      errorMessage: null,
      receivedAt: 1_750_000_000_000,
      processedAt: null,
    });

    await deliveryRepository.updateStatus('delivery-owned', 'connection-other', 'Processed', null);
    expect(deliveryRepository.rows.get('delivery-owned')).toMatchObject({
      status: 'Received',
      processedAt: null,
    });

    await deliveryRepository.updateStatus('delivery-owned', connection().id, 'Processing');
    expect(deliveryRepository.rows.get('delivery-owned')?.status).toBe('Processing');
  });

  it('claims reconciliation for one instance while another observes the persisted lease', async () => {
    const connectionRepository = new MemoryConnectionRepository();
    const deliveryRepository = new MemoryDeliveryRepository();
    const projectionRepository = new MemoryProjectionRepository();
    const getRepositorySnapshot = vi.fn(async () => ({
      repositoryId: 'repository-1',
      defaultBranch: 'main',
      empty: false,
      headSha: 'new-sha',
    }));
    const getFullMarkdownSnapshot = vi.fn(async () => ({
      commitSha: 'new-sha',
      files: [
        {
          relativePath: 'notes/reconciled-shared.md',
          blobSha: 'reconciled-blob',
          markdownContent: '# Reconciled',
        },
      ],
    }));
    const leaseRepository = new MemoryLeaseRepository();
    const fourAxis = buildFourAxisRepositories();
    fourAxis.projectionCheckpointRepository.rows.set(connection().id, {
      bindingId: connection().id,
      branch: 'main',
      projectedCommitSha: 'old-sha',
      state: 'Ready',
      failure: null,
      lastAttemptAt: 1,
      projectedAt: 1,
    });
    const createService = () =>
      new KnowledgeRepositoryProjectionService({
        ...fourAxis,
        webhookSecret,
        connectionRepository,
        deliveryRepository,
        projectionRepository,
        githubAppClient: githubClient({ getRepositorySnapshot, getFullMarkdownSnapshot }),
        leaseRepository,
        reconciliationIntervalMs: 0,
      });

    await Promise.all([createService().reconcileNow(), createService().reconcileNow()]);

    expect(getRepositorySnapshot).toHaveBeenCalledOnce();
    expect(getFullMarkdownSnapshot).toHaveBeenCalledOnce();
    expect(
      fourAxis.projectionCheckpointRepository.rows.get(connection().id)?.projectedCommitSha,
    ).toBe('new-sha');
  });

  it('publishes deletion events for notes removed by a full snapshot rebuild', async () => {
    const projectionRepository = new MemoryProjectionRepository();
    projectionRepository.rows.set('old-projection', {
      id: 'old-projection',
      connectionId: connection().id,
      relativePath: 'notes/removed.md',
      commitSha: 'before-sha',
      blobSha: 'old-blob',
      contentHash: 'old-hash',
      frontmatter: {},
      markdownContent: '# Removed',
      indexStatus: 'indexed',
    });
    const publishMutation = vi.fn();
    const deliveryRepository = new MemoryDeliveryRepository();
    const service = new KnowledgeRepositoryProjectionService({
      ...createFourAxisRepositories(),
      webhookSecret,
      connectionRepository: new MemoryConnectionRepository(),
      deliveryRepository,
      projectionRepository,
      githubAppClient: githubClient({
        getMarkdownChanges: vi.fn(async () => ({
          commitSha: 'after-sha',
          requiresFullSnapshot: true,
          changes: [],
        })),
        getFullMarkdownSnapshot: vi.fn(async () => ({
          commitSha: 'after-sha',
          files: [
            {
              relativePath: 'notes/kept.md',
              blobSha: 'kept-blob',
              markdownContent: '# Kept',
            },
          ],
        })),
      }),
      publishMutation,
    });

    await service.ingest({
      deliveryId: 'delivery-snapshot',
      eventName: 'push',
      ...signedPushPayload(),
    });
    await vi.waitFor(() => {
      expect([...deliveryRepository.rows.values()][0]?.status).toBe('Processed');
    });

    expect(publishMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: 'old-projection',
        resourcePath: 'notes/removed.md',
        mutation: 'deleted',
      }),
    );
  });

  it('pauses projection when the live default branch no longer matches the connection', async () => {
    const connectionRepository = new MemoryConnectionRepository();
    const deliveryRepository = new MemoryDeliveryRepository();
    const projectionRepository = new MemoryProjectionRepository();
    const service = new KnowledgeRepositoryProjectionService({
      ...createFourAxisRepositories(),
      webhookSecret,
      connectionRepository,
      deliveryRepository,
      projectionRepository,
      githubAppClient: githubClient({
        getInstallationInventory: vi.fn(async () => ({
          ...inventory(),
          repositories: [{ ...githubRepository(), defaultBranch: 'trunk' }],
        })),
      }),
      publishMutation: vi.fn(),
    });

    await service.ingest({
      deliveryId: 'delivery-default-branch-changed',
      eventName: 'push',
      ...signedPushPayload(),
    });
    await vi.waitFor(() => {
      expect([...deliveryRepository.rows.values()][0]?.status).toBe('Failed');
    });

    expect(connectionRepository.row.disconnectedAt).toBeNull();
    expect(latestObservationRepository().rows.get(connection().id)).toMatchObject({
      eligibility: { state: 'Blocked', reason: 'DefaultBranchChanged' },
      defaultBranch: 'trunk',
    });
    expect(projectionRepository.applyChanges).not.toHaveBeenCalled();
  });

  it('does not fetch a full snapshot when reconciliation finds the projected HEAD unchanged', async () => {
    const connectionRepository = new MemoryConnectionRepository();
    const projectionRepository = new MemoryProjectionRepository();
    const getFullMarkdownSnapshot = vi.fn();
    const fourAxis = buildFourAxisRepositories();
    fourAxis.projectionCheckpointRepository.rows.set(connection().id, {
      bindingId: connection().id,
      branch: 'main',
      projectedCommitSha: 'current-sha',
      state: 'Ready',
      failure: null,
      lastAttemptAt: 1,
      projectedAt: 1,
    });
    const service = new KnowledgeRepositoryProjectionService({
      ...fourAxis,
      webhookSecret,
      connectionRepository,
      deliveryRepository: new MemoryDeliveryRepository(),
      projectionRepository,
      githubAppClient: githubClient({
        getRepositorySnapshot: vi.fn(async () => ({
          repositoryId: 'repository-1',
          defaultBranch: 'main',
          empty: false,
          headSha: 'current-sha',
        })),
        getFullMarkdownSnapshot,
      }),
    });

    await service.reconcileNow();

    expect(connectionRepository.listProjectionCandidates).toHaveBeenCalledWith(50);
    expect(getFullMarkdownSnapshot).not.toHaveBeenCalled();
    expect(projectionRepository.applySnapshot).not.toHaveBeenCalled();
    expect(connectionRepository.save).not.toHaveBeenCalled();
  });

  it('advances and wraps the reconciliation cursor so unchanged rows cannot starve later pages', async () => {
    const connectionRepository = new MemoryConnectionRepository();
    const secondConnection = {
      ...connectionRepository.row,
      id: 'connection-2',
      id: 'KnowledgeRemoteBindingId_550e8400-e29b-41d4-a716-446655440202' as never,
      repositoryId: 'repository-2',
      repositoryFullNameSnapshot: 'owner/second',
      connectedAt: 2,
    };
    connectionRepository.listProjectionCandidates
      .mockResolvedValueOnce([connectionRepository.row])
      .mockResolvedValueOnce([secondConnection])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([connectionRepository.row]);
    const service = new KnowledgeRepositoryProjectionService({
      ...createFourAxisRepositories(),
      webhookSecret,
      connectionRepository,
      deliveryRepository: new MemoryDeliveryRepository(),
      projectionRepository: new MemoryProjectionRepository(),
      githubAppClient: githubClient({
        getRepositorySnapshot: vi.fn(async () => ({
          repositoryId: 'repository-1',
          defaultBranch: 'main',
          empty: false,
          headSha: 'current-sha',
        })),
      }),
    });

    await service.reconcileNow();
    await service.reconcileNow();
    await service.reconcileNow();

    expect(connectionRepository.listProjectionCandidates.mock.calls).toEqual([
      [50],
      [50, { connectedAt: 1, id: connection().id }],
      [50, { connectedAt: 2, id: 'KnowledgeRemoteBindingId_550e8400-e29b-41d4-a716-446655440202' }],
      [50],
    ]);
  });

  it('rebuilds projections and advances the cursor when reconciliation finds a new HEAD', async () => {
    const connectionRepository = new MemoryConnectionRepository();
    const projectionRepository = new MemoryProjectionRepository();
    const publishMutation = vi.fn();
    const fourAxis = buildFourAxisRepositories();
    fourAxis.projectionCheckpointRepository.rows.set(connection().id, {
      bindingId: connection().id,
      branch: 'main',
      projectedCommitSha: 'old-sha',
      state: 'Ready',
      failure: null,
      lastAttemptAt: 1,
      projectedAt: 1,
    });
    const getFullMarkdownSnapshot = vi.fn(async () => ({
      commitSha: 'new-sha',
      files: [
        {
          relativePath: 'notes/reconciled.md',
          blobSha: 'reconciled-blob',
          markdownContent: '# Reconciled',
        },
      ],
    }));
    const service = new KnowledgeRepositoryProjectionService({
      ...fourAxis,
      webhookSecret,
      connectionRepository,
      deliveryRepository: new MemoryDeliveryRepository(),
      projectionRepository,
      githubAppClient: githubClient({
        getRepositorySnapshot: vi.fn(async () => ({
          repositoryId: 'repository-1',
          defaultBranch: 'main',
          empty: false,
          headSha: 'new-sha',
        })),
        getFullMarkdownSnapshot,
      }),
      publishMutation,
      now: () => 1_750_000_000_000,
    });

    await service.reconcileNow();

    expect(getFullMarkdownSnapshot).toHaveBeenCalledWith(
      'installation-1',
      expect.objectContaining({ id: 'repository-1' }),
      'new-sha',
    );
    expect(projectionRepository.applySnapshot).toHaveBeenCalledWith(connection().id, 'new-sha', [
      expect.objectContaining({ relativePath: 'notes/reconciled.md', indexStatus: 'pending' }),
    ]);
    expect(
      fourAxis.projectionCheckpointRepository.rows.get(connection().id)?.projectedCommitSha,
    ).toBe('new-sha');
    expect(publishMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        repositoryId: connection().id,
        resourcePath: 'notes/reconciled.md',
        mutation: 'content_updated',
      }),
    );
  });

  it('restores a force-push-paused connection after a successful full reconciliation', async () => {
    const connectionRepository = new MemoryConnectionRepository();
    const fourAxis = buildFourAxisRepositories();
    fourAxis.projectionCheckpointRepository.rows.set(connection().id, {
      bindingId: connection().id,
      branch: 'main',
      projectedCommitSha: 'old-sha',
      state: 'Failed',
      failure: {
        code: 'GITHUB_FORCE_PUSH_REQUIRES_RECONCILIATION',
        message: 'Force push requires full reconciliation',
      },
      lastAttemptAt: 1,
      projectedAt: 1,
    });
    const service = new KnowledgeRepositoryProjectionService({
      ...fourAxis,
      webhookSecret,
      connectionRepository,
      deliveryRepository: new MemoryDeliveryRepository(),
      projectionRepository: new MemoryProjectionRepository(),
      githubAppClient: githubClient({
        getRepositorySnapshot: vi.fn(async () => ({
          repositoryId: 'repository-1',
          defaultBranch: 'main',
          empty: false,
          headSha: 'rewritten-sha',
        })),
        getFullMarkdownSnapshot: vi.fn(async () => ({
          commitSha: 'rewritten-sha',
          files: [],
        })),
      }),
    });

    await service.reconcileNow();

    expect(connectionRepository.row.disconnectedAt).toBeNull();
    expect(fourAxis.projectionCheckpointRepository.rows.get(connection().id)).toMatchObject({
      state: 'Ready',
      projectedCommitSha: 'rewritten-sha',
      failure: null,
    });
  });

  it('projects attachment metadata from incremental default-branch changes', async () => {
    const connectionRepository = new MemoryConnectionRepository();
    const deliveryRepository = new MemoryDeliveryRepository();
    const attachmentRepository = new MemoryAttachmentRepository();
    const service = new KnowledgeRepositoryProjectionService({
      ...createFourAxisRepositories(),
      webhookSecret,
      connectionRepository,
      deliveryRepository,
      projectionRepository: new MemoryProjectionRepository(),
      attachmentRepository,
      githubAppClient: githubClient({
        getMarkdownChanges: vi.fn(async () => ({
          commitSha: 'after-sha',
          requiresFullSnapshot: false,
          changes: [],
          attachmentChanges: [
            {
              relativePath: 'assets/diagram.png',
              previousPath: 'assets/old-diagram.png',
              blobSha: 'attachment-blob-sha',
              byteSize: 1_024,
              mediaType: 'image/png',
              status: 'renamed' as const,
            },
          ],
        })),
      }),
    });

    await service.ingest({
      deliveryId: 'delivery-attachment',
      eventName: 'push',
      ...signedPushPayload(),
    });
    await vi.waitFor(() => {
      expect([...deliveryRepository.rows.values()][0]?.status).toBe('Processed');
    });

    expect(attachmentRepository.applyChanges).toHaveBeenCalledWith(
      connection().id,
      'after-sha',
      [
        expect.objectContaining({
          relativePath: 'assets/diagram.png',
          blobSha: 'attachment-blob-sha',
          byteSize: 1_024,
          mediaType: 'image/png',
        }),
      ],
      ['assets/old-diagram.png'],
    );
  });

  it('reads an attachment blob only for its owning identity and current projection', async () => {
    const attachmentRepository = new MemoryAttachmentRepository();
    attachmentRepository.rows.set('attachment-1', {
      id: 'attachment-1',
      connectionId: connection().id,
      relativePath: 'assets/diagram.png',
      commitSha: 'commit-1',
      blobSha: 'attachment-blob-sha',
      byteSize: 4,
      mediaType: 'image/png',
    });
    const getBlob = vi.fn(async () => ({
      blobSha: 'attachment-blob-sha',
      byteSize: 4,
      bytes: Uint8Array.from([1, 2, 3, 4]),
    }));
    const service = new KnowledgeRepositoryProjectionService({
      ...createFourAxisRepositories(),
      webhookSecret,
      connectionRepository: new MemoryConnectionRepository(),
      deliveryRepository: new MemoryDeliveryRepository(),
      projectionRepository: new MemoryProjectionRepository(),
      attachmentRepository,
      githubAppClient: githubClient({ getBlob }),
    });

    await expect(
      service.getAttachmentContent(connection().identityId, 'attachment-1'),
    ).resolves.toEqual({
      ok: true,
      data: {
        attachment: expect.objectContaining({
          id: 'attachment-1',
          relativePath: 'assets/diagram.png',
        }),
        contentBase64: 'AQIDBA==',
      },
    });
    expect(getBlob).toHaveBeenCalledWith(
      'installation-1',
      expect.objectContaining({ id: 'repository-1' }),
      'attachment-blob-sha',
      10 * 1024 * 1024,
    );

    await expect(
      service.getAttachmentContent('IdentityId_other', 'attachment-1'),
    ).resolves.toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(getBlob).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized attachment metadata before requesting GitHub', async () => {
    const attachmentRepository = new MemoryAttachmentRepository();
    attachmentRepository.rows.set('attachment-large', {
      id: 'attachment-large',
      connectionId: connection().id,
      relativePath: 'assets/large.pdf',
      commitSha: 'commit-1',
      blobSha: 'large-blob-sha',
      byteSize: 10 * 1024 * 1024 + 1,
      mediaType: 'application/pdf',
    });
    const github = githubClient();
    const service = new KnowledgeRepositoryProjectionService({
      ...createFourAxisRepositories(),
      webhookSecret,
      connectionRepository: new MemoryConnectionRepository(),
      deliveryRepository: new MemoryDeliveryRepository(),
      projectionRepository: new MemoryProjectionRepository(),
      attachmentRepository,
      githubAppClient: github,
    });

    await expect(
      service.getAttachmentContent(connection().identityId, 'attachment-large'),
    ).resolves.toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(github.getInstallationInventory).not.toHaveBeenCalled();
    expect(github.getBlob).not.toHaveBeenCalled();
  });

  it('reuses immutable attachment bytes across service instances while rechecking authorization', async () => {
    const cache = new MemoryAttachmentContentCache();
    const attachmentRepository = new MemoryAttachmentRepository();
    attachmentRepository.rows.set('attachment-cache', {
      id: 'attachment-cache',
      connectionId: connection().id,
      relativePath: 'assets/diagram.png',
      commitSha: 'commit-1',
      blobSha: 'cached-blob-sha',
      byteSize: 4,
      mediaType: 'image/png',
    });
    const firstGetBlob = vi.fn(async () => ({
      blobSha: 'cached-blob-sha',
      byteSize: 4,
      bytes: Uint8Array.from([1, 2, 3, 4]),
    }));
    const firstService = new KnowledgeRepositoryProjectionService({
      ...createFourAxisRepositories(),
      webhookSecret,
      connectionRepository: new MemoryConnectionRepository(),
      deliveryRepository: new MemoryDeliveryRepository(),
      projectionRepository: new MemoryProjectionRepository(),
      attachmentRepository,
      attachmentContentCache: cache,
      githubAppClient: githubClient({ getBlob: firstGetBlob }),
    });

    await expect(
      firstService.getAttachmentContent(connection().identityId, 'attachment-cache'),
    ).resolves.toMatchObject({ ok: true, data: { contentBase64: 'AQIDBA==' } });
    expect(firstGetBlob).toHaveBeenCalledOnce();

    const secondGetBlob = vi.fn(async () => ({
      blobSha: 'cached-blob-sha',
      byteSize: 4,
      bytes: Uint8Array.from([9, 9, 9, 9]),
    }));
    const secondInventory = vi.fn(async () => inventory());
    const secondService = new KnowledgeRepositoryProjectionService({
      ...createFourAxisRepositories(),
      webhookSecret,
      connectionRepository: new MemoryConnectionRepository(),
      deliveryRepository: new MemoryDeliveryRepository(),
      projectionRepository: new MemoryProjectionRepository(),
      attachmentRepository,
      attachmentContentCache: cache,
      githubAppClient: githubClient({
        getInstallationInventory: secondInventory,
        getBlob: secondGetBlob,
      }),
    });

    await expect(
      secondService.getAttachmentContent(connection().identityId, 'attachment-cache'),
    ).resolves.toMatchObject({ ok: true, data: { contentBase64: 'AQIDBA==' } });
    expect(secondInventory).toHaveBeenCalledOnce();
    expect(secondGetBlob).not.toHaveBeenCalled();
  });

  it('expires shared attachment bytes and refetches them from GitHub', async () => {
    let now = 1_000;
    const cache = new MemoryAttachmentContentCache();
    const attachmentRepository = new MemoryAttachmentRepository();
    attachmentRepository.rows.set('attachment-expiring', {
      id: 'attachment-expiring',
      connectionId: connection().id,
      relativePath: 'assets/diagram.png',
      commitSha: 'commit-1',
      blobSha: 'expiring-blob-sha',
      byteSize: 1,
      mediaType: 'image/png',
    });
    const getBlob = vi
      .fn()
      .mockResolvedValueOnce({
        blobSha: 'expiring-blob-sha',
        byteSize: 1,
        bytes: Uint8Array.from([1]),
      })
      .mockResolvedValueOnce({
        blobSha: 'expiring-blob-sha',
        byteSize: 1,
        bytes: Uint8Array.from([2]),
      });
    const createService = () =>
      new KnowledgeRepositoryProjectionService({
        ...createFourAxisRepositories(),
        webhookSecret,
        connectionRepository: new MemoryConnectionRepository(),
        deliveryRepository: new MemoryDeliveryRepository(),
        projectionRepository: new MemoryProjectionRepository(),
        attachmentRepository,
        attachmentContentCache: cache,
        githubAppClient: githubClient({ getBlob }),
        now: () => now,
        attachmentCacheTtlMs: 100,
      });

    await expect(
      createService().getAttachmentContent(connection().identityId, 'attachment-expiring'),
    ).resolves.toMatchObject({ ok: true, data: { contentBase64: 'AQ==' } });
    now = 2_001;
    await expect(
      createService().getAttachmentContent(connection().identityId, 'attachment-expiring'),
    ).resolves.toMatchObject({ ok: true, data: { contentBase64: 'Ag==' } });
    expect(getBlob).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent cold misses within one service instance', async () => {
    const cache = new MemoryAttachmentContentCache();
    const attachmentRepository = new MemoryAttachmentRepository();
    attachmentRepository.rows.set('attachment-concurrent', {
      id: 'attachment-concurrent',
      connectionId: connection().id,
      relativePath: 'assets/diagram.png',
      commitSha: 'commit-1',
      blobSha: 'concurrent-blob-sha',
      byteSize: 2,
      mediaType: 'image/png',
    });
    let resolveBlob:
      ((value: { blobSha: string; byteSize: number; bytes: Uint8Array }) => void) | null = null;
    const getBlob = vi.fn(
      () =>
        new Promise<{ blobSha: string; byteSize: number; bytes: Uint8Array }>((resolve) => {
          resolveBlob = resolve;
        }),
    );
    const service = new KnowledgeRepositoryProjectionService({
      ...createFourAxisRepositories(),
      webhookSecret,
      connectionRepository: new MemoryConnectionRepository(),
      deliveryRepository: new MemoryDeliveryRepository(),
      projectionRepository: new MemoryProjectionRepository(),
      attachmentRepository,
      attachmentContentCache: cache,
      githubAppClient: githubClient({ getBlob }),
    });

    const first = service.getAttachmentContent(connection().identityId, 'attachment-concurrent');
    const second = service.getAttachmentContent(connection().identityId, 'attachment-concurrent');
    await vi.waitFor(() => expect(getBlob).toHaveBeenCalledOnce());
    resolveBlob?.({
      blobSha: 'concurrent-blob-sha',
      byteSize: 2,
      bytes: Uint8Array.from([5, 6]),
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ contentBase64: 'BQY=' }),
      }),
      expect.objectContaining({
        ok: true,
        data: expect.objectContaining({ contentBase64: 'BQY=' }),
      }),
    ]);
  });

  it('falls back to GitHub when the shared cache is unavailable', async () => {
    const cache: IKnowledgeAttachmentContentCache = {
      find: vi.fn(async () => {
        throw new Error('cache offline');
      }),
      save: vi.fn(async () => {
        throw new Error('cache offline');
      }),
      remove: vi.fn(async () => undefined),
    };
    const attachmentRepository = new MemoryAttachmentRepository();
    attachmentRepository.rows.set('attachment-cache-offline', {
      id: 'attachment-cache-offline',
      connectionId: connection().id,
      relativePath: 'assets/diagram.png',
      commitSha: 'commit-1',
      blobSha: 'cache-offline-blob-sha',
      byteSize: 1,
      mediaType: 'image/png',
    });
    const getBlob = vi.fn(async () => ({
      blobSha: 'cache-offline-blob-sha',
      byteSize: 1,
      bytes: Uint8Array.from([8]),
    }));
    const service = new KnowledgeRepositoryProjectionService({
      ...createFourAxisRepositories(),
      webhookSecret,
      connectionRepository: new MemoryConnectionRepository(),
      deliveryRepository: new MemoryDeliveryRepository(),
      projectionRepository: new MemoryProjectionRepository(),
      attachmentRepository,
      attachmentContentCache: cache,
      githubAppClient: githubClient({ getBlob }),
    });

    await expect(
      service.getAttachmentContent(connection().identityId, 'attachment-cache-offline'),
    ).resolves.toMatchObject({ ok: true, data: { contentBase64: 'CA==' } });
    expect(getBlob).toHaveBeenCalledOnce();
  });

  it('never caches or returns a GitHub blob that fails integrity validation', async () => {
    const cache = new MemoryAttachmentContentCache();
    const attachmentRepository = new MemoryAttachmentRepository();
    attachmentRepository.rows.set('attachment-integrity', {
      id: 'attachment-integrity',
      connectionId: connection().id,
      relativePath: 'assets/diagram.png',
      commitSha: 'commit-1',
      blobSha: 'expected-blob-sha',
      byteSize: 1,
      mediaType: 'image/png',
    });
    const service = new KnowledgeRepositoryProjectionService({
      ...createFourAxisRepositories(),
      webhookSecret,
      connectionRepository: new MemoryConnectionRepository(),
      deliveryRepository: new MemoryDeliveryRepository(),
      projectionRepository: new MemoryProjectionRepository(),
      attachmentRepository,
      attachmentContentCache: cache,
      githubAppClient: githubClient({
        getBlob: vi.fn(async () => ({
          blobSha: 'different-blob-sha',
          byteSize: 1,
          bytes: Uint8Array.from([9]),
        })),
      }),
    });

    await expect(
      service.getAttachmentContent(connection().identityId, 'attachment-integrity'),
    ).resolves.toMatchObject({ ok: false, error: { code: 'SERVICE_UNAVAILABLE' } });
    expect(cache.rows.size).toBe(0);
  });

  it('drops invalid shared bytes and refetches a verified blob', async () => {
    const cache = new MemoryAttachmentContentCache();
    const attachmentRepository = new MemoryAttachmentRepository();
    attachmentRepository.rows.set('attachment-corrupt', {
      id: 'attachment-corrupt',
      connectionId: connection().id,
      relativePath: 'assets/diagram.png',
      commitSha: 'commit-1',
      blobSha: 'corrupt-blob-sha',
      byteSize: 2,
      mediaType: 'image/png',
    });
    await cache.save({
      connectionId: connection().id,
      blobSha: 'corrupt-blob-sha',
      byteSize: 99,
      bytes: Uint8Array.from([7]),
      cachedAt: Date.now(),
      expiresAt: Date.now() + 10_000,
    });
    const getBlob = vi.fn(async () => ({
      blobSha: 'corrupt-blob-sha',
      byteSize: 2,
      bytes: Uint8Array.from([3, 4]),
    }));
    const service = new KnowledgeRepositoryProjectionService({
      ...createFourAxisRepositories(),
      webhookSecret,
      connectionRepository: new MemoryConnectionRepository(),
      deliveryRepository: new MemoryDeliveryRepository(),
      projectionRepository: new MemoryProjectionRepository(),
      attachmentRepository,
      attachmentContentCache: cache,
      githubAppClient: githubClient({ getBlob }),
    });

    await expect(
      service.getAttachmentContent(connection().identityId, 'attachment-corrupt'),
    ).resolves.toMatchObject({ ok: true, data: { contentBase64: 'AwQ=' } });
    expect(getBlob).toHaveBeenCalledOnce();
    expect(await cache.find(connection().id, 'corrupt-blob-sha', Date.now())).toBeTruthy();
  });

  it('starts one managed reconciliation loop and stops scheduling further runs', async () => {
    vi.useFakeTimers();
    try {
      const connectionRepository = new MemoryConnectionRepository();
      const service = new KnowledgeRepositoryProjectionService({
        ...createFourAxisRepositories(),
        webhookSecret,
        connectionRepository,
        deliveryRepository: new MemoryDeliveryRepository(),
        projectionRepository: new MemoryProjectionRepository(),
        githubAppClient: githubClient({
          getRepositorySnapshot: vi.fn(async () => ({
            repositoryId: 'repository-1',
            defaultBranch: 'main',
            empty: false,
            headSha: 'current-sha',
          })),
        }),
        reconciliationIntervalMs: 1_000,
      });

      service.start();
      service.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(connectionRepository.listProjectionCandidates).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(connectionRepository.listProjectionCandidates).toHaveBeenCalledTimes(2);

      service.stop();
      await vi.advanceTimersByTimeAsync(3_000);
      expect(connectionRepository.listProjectionCandidates).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not begin startup reconciliation after stop while delivery recovery is pending', async () => {
    let releaseRecovery!: () => void;
    const recoveryGate = new Promise<void>((resolve) => {
      releaseRecovery = resolve;
    });
    const deliveryRepository = new MemoryDeliveryRepository();
    deliveryRepository.listPending = vi.fn(async () => {
      await recoveryGate;
      return [];
    });
    const connectionRepository = new MemoryConnectionRepository();
    const service = new KnowledgeRepositoryProjectionService({
      ...createFourAxisRepositories(),
      webhookSecret,
      connectionRepository,
      deliveryRepository,
      projectionRepository: new MemoryProjectionRepository(),
      githubAppClient: githubClient(),
      reconciliationIntervalMs: 0,
    });

    service.start();
    service.stop();
    releaseRecovery();
    await Promise.resolve();
    await Promise.resolve();

    expect(connectionRepository.listProjectionCandidates).not.toHaveBeenCalled();
  });
});
