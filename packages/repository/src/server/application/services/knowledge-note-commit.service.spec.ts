import { describe, expect, it, vi } from 'vitest';
import type {
  CreateConfirmedKnowledgeNoteReq,
  GitHubInstallationRepositoryDTO,
  KnowledgeNoteProjectionClientDTO,
  KnowledgeRemoteBindingServerDTO,
} from '@memoflow/contracts/repository';
import type {
  IKnowledgeRemoteBindingRepository,
  IRemoteHistoryFenceRepository,
  IRemoteRepositoryObservationRepository,
} from '../ports/knowledge-remote-binding.repositories';
import type {
  IKnowledgeDocumentIdentityRepository,
  KnowledgeDocumentIdentityRecord,
} from '../ports/knowledge-document-identity.repository';
import type {
  IKnowledgeRepositoryLeaseRepository,
  KnowledgeRepositoryLeaseRequest,
} from '../ports/knowledge-repository-lease.repository';
import type {
  IKnowledgeNoteProjectionRepository,
  IKnowledgeWriteRequestRepository,
  KnowledgeNoteProjectionUpsert,
  KnowledgeWriteRequestRecord,
} from '../ports/knowledge-note-projection.repository';
import type { IGitHubAppClient } from '../ports/github-app-client.port';
import { GitHubAppClientFailureError } from '../ports/github-app-client.port';
import { KnowledgeNoteCommitService } from './knowledge-note-commit.service';
import { createUnifiedOperationMetricsRecorder } from '@memoflow/patterns/operations';

function connection(): KnowledgeRemoteBindingServerDTO {
  return {
    id: 'KnowledgeRemoteBindingId_550e8400-e29b-41d4-a716-446655440100' as never,
    knowledgeSpaceId: 'KnowledgeSpaceId_550e8400-e29b-41d4-a716-446655440101' as never,
    identityId: 'identity-1' as never,
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

const DOCUMENT_ID =
  'kdoc_550e8400-e29b-41d4-a716-446655440090' as CreateConfirmedKnowledgeNoteReq['knowledgeDocumentId'];

function request(overrides: Partial<CreateConfirmedKnowledgeNoteReq> = {}) {
  return {
    connectionId: connection().id,
    proposalId: 'proposal-1',
    revision: 1,
    requestId: 'request-1',
    knowledgeDocumentId: DOCUMENT_ID,
    proposedPath: 'notes/new-note.md',
    title: 'New note',
    frontmatter: { tags: ['decision'] },
    content: '# New note\n\nComplete content.',
    reason: 'Capture the decision',
    ...overrides,
  } satisfies CreateConfirmedKnowledgeNoteReq;
}

class MemoryConnectionRepository implements IKnowledgeRemoteBindingRepository {
  readonly row = connection();

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

  async listProjectionCandidates() {
    return [this.row];
  }

  async save() {}
  async markDisconnected() {
    return false;
  }
}

class MemoryObservationRepository implements IRemoteRepositoryObservationRepository {
  readonly row = {
    bindingId: connection().id,
    observedAt: 1,
    accountId: '42',
    repositoryFullName: 'owner/knowledge',
    defaultBranch: 'main',
    private: true,
    archived: false,
    disabled: false,
    contentsPermission: 'write' as const,
    installationSuspended: false,
    eligibility: { state: 'Ready' as const },
  };
  async findByBindingId(bindingId: string) {
    return bindingId === this.row.bindingId ? this.row : null;
  }
  async findByBindingIds(bindingIds: readonly string[]) {
    return bindingIds.includes(this.row.bindingId)
      ? new Map([[this.row.bindingId, this.row]])
      : new Map();
  }
  async save() {}
}

class MemoryHistoryFenceRepository implements IRemoteHistoryFenceRepository {
  readonly row = {
    bindingId: connection().id,
    defaultBranch: 'main',
    lastConfirmedRemoteHeadSha: 'f'.repeat(40),
    confirmedAt: 1,
  };
  async findByBindingId(bindingId: string) {
    return bindingId === this.row.bindingId ? this.row : null;
  }
  async findByBindingIds(bindingIds: readonly string[]) {
    return bindingIds.includes(this.row.bindingId)
      ? new Map([[this.row.bindingId, this.row]])
      : new Map();
  }
  async save() {}
}

class MemoryProjectionRepository implements IKnowledgeNoteProjectionRepository {
  readonly rows = new Map<string, KnowledgeNoteProjectionUpsert>();
  readonly applyChanges = vi.fn(
    async (_connectionId: string, _commitSha: string, notes: KnowledgeNoteProjectionUpsert[]) => {
      notes.forEach((note) => this.rows.set(note.id, note));
    },
  );
  readonly updateIndexStatusForIdentity = vi.fn(async () => true);

  async applySnapshot(
    _connectionId: string,
    _commitSha: string,
    notes: KnowledgeNoteProjectionUpsert[],
  ) {
    this.rows.clear();
    notes.forEach((note) => this.rows.set(note.id, note));
    return [];
  }

  async listByIdentity() {
    return [];
  }

  async findByIdForIdentity(_identityId: string, projectionId: string) {
    const row = this.rows.get(projectionId);
    if (!row) return null;
    return {
      ...row,
      title: row.relativePath,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    } satisfies KnowledgeNoteProjectionClientDTO;
  }

  async findByPath(_connectionId: string, relativePath: string) {
    const row = [...this.rows.values()].find(
      (candidate) => candidate.relativePath === relativePath,
    );
    if (!row) return null;
    return {
      ...row,
      title: row.relativePath,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    } satisfies KnowledgeNoteProjectionClientDTO;
  }

  async findLiveByDocumentId(_connectionId: string, knowledgeDocumentId: string) {
    return [...this.rows.values()]
      .filter((row) => row.knowledgeDocumentId === knowledgeDocumentId)
      .map((row) => ({
        ...row,
        title: row.relativePath,
        createdAt: 1,
        updatedAt: 1,
        deletedAt: null,
      })) as KnowledgeNoteProjectionClientDTO[];
  }

  async listLiveByConnection(_connectionId: string) {
    return [...this.rows.values()].map((row) => ({
      ...row,
      title: row.relativePath,
      createdAt: 1,
      updatedAt: 1,
      deletedAt: null,
    })) as KnowledgeNoteProjectionClientDTO[];
  }

  async loadLinkGraphSourcesForIdentity() {
    return null;
  }
}

class MemoryWriteRequestRepository implements IKnowledgeWriteRequestRepository {
  readonly rows = new Map<string, KnowledgeWriteRequestRecord>();

  async findByIdentityAndRequestId(identityId: string, requestId: string) {
    return (
      [...this.rows.values()].find(
        (row) => row.identityId === identityId && row.requestId === requestId,
      ) ?? null
    );
  }

  async create(record: KnowledgeWriteRequestRecord) {
    if (await this.findByIdentityAndRequestId(record.identityId, record.requestId)) return false;
    this.rows.set(record.id, record);
    return true;
  }

  async markCommitted(identityId: string, id: string, commitSha: string) {
    const row = this.rows.get(id);
    if (!row || row.identityId !== identityId) return;
    this.rows.set(id, {
      ...row,
      status: 'Committed',
      commitSha,
      updatedAt: 1_750_000_000_000,
      completedAt: 1_750_000_000_000,
    });
  }

  async retryFailed(identityId: string, id: string, updatedAt: number) {
    const row = this.rows.get(id);
    if (!row || row.identityId !== identityId || row.status !== 'Failed') return false;
    this.rows.set(id, {
      ...row,
      status: 'Pending',
      commitSha: null,
      errorCode: null,
      errorMessage: null,
      updatedAt,
      completedAt: null,
    });
    return true;
  }

  async markFailed(identityId: string, id: string, code: string, message: string) {
    const row = this.rows.get(id);
    if (!row || row.identityId !== identityId) return;
    this.rows.set(id, {
      ...row,
      status: 'Failed',
      errorCode: code,
      errorMessage: message,
      updatedAt: 1_750_000_000_000,
      completedAt: 1_750_000_000_000,
    });
  }

  async findByIdForIdentity(identityId: string, id: string) {
    const row = this.rows.get(id);
    return row && row.identityId === identityId ? row : null;
  }

  async bindProjectionSource(
    identityId: string,
    id: string,
    source: { blobSha: string; markdownContent: string },
  ) {
    const row = this.rows.get(id);
    if (!row || row.identityId !== identityId || row.projectionStatus === 'Succeeded') return false;
    this.rows.set(id, {
      ...row,
      blobSha: source.blobSha,
      markdownContent: source.markdownContent,
      projectionStatus: 'Pending',
      projectionErrorCode: null,
      projectionErrorMessage: null,
      projectionAttempts: 0,
      projectedAt: null,
    });
    return true;
  }

  async markProjectionSucceeded(identityId: string, id: string, now: number) {
    const row = this.rows.get(id);
    if (!row || row.identityId !== identityId || row.projectionStatus === 'Succeeded') return false;
    this.rows.set(id, {
      ...row,
      projectionStatus: 'Succeeded',
      projectionErrorCode: null,
      projectionErrorMessage: null,
      projectionAttempts: row.projectionAttempts + 1,
      projectedAt: now,
    });
    return true;
  }

  async markProjectionFailed(
    identityId: string,
    id: string,
    code: string,
    message: string,
    _now: number,
  ) {
    const row = this.rows.get(id);
    if (!row || row.identityId !== identityId || row.projectionStatus === 'Succeeded') return false;
    this.rows.set(id, {
      ...row,
      projectionStatus: 'Failed',
      projectionErrorCode: code,
      projectionErrorMessage: message,
      projectionAttempts: row.projectionAttempts + 1,
      projectedAt: null,
    });
    return true;
  }

  async markProjectionSucceededByCommit(connectionId: string, commitSha: string, now: number) {
    let count = 0;
    for (const [id, row] of this.rows) {
      if (row.connectionId !== connectionId || row.commitSha !== commitSha) continue;
      if (row.projectionStatus === 'Succeeded') continue;
      this.rows.set(id, {
        ...row,
        projectionStatus: 'Succeeded',
        projectionErrorCode: null,
        projectionErrorMessage: null,
        projectionAttempts: row.projectionAttempts + 1,
        projectedAt: now,
      });
      count += 1;
    }
    return count;
  }

  async listProjectionPendingOrFailedForConnection(connectionId: string, limit: number) {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.connectionId === connectionId &&
          row.status === 'Committed' &&
          (row.projectionStatus === 'Pending' || row.projectionStatus === 'Failed'),
      )
      .slice(0, limit);
  }

  async listForIdentity(identityId: string, options: { connectionId?: string; limit: number }) {
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.identityId === identityId &&
          (!options.connectionId || row.connectionId === options.connectionId),
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, options.limit);
  }
}

class MemoryDocumentIdentityRepository implements IKnowledgeDocumentIdentityRepository {
  readonly rows = new Map<string, KnowledgeDocumentIdentityRecord>();

  private key(spaceId: string, documentId: string): string {
    return `${spaceId}:${documentId}`;
  }

  async find(knowledgeSpaceId: never, knowledgeDocumentId: never) {
    return this.rows.get(this.key(knowledgeSpaceId, knowledgeDocumentId)) ?? null;
  }

  async claimForCreate(
    knowledgeSpaceId: never,
    knowledgeDocumentId: never,
    requestId: string,
    now: number,
  ) {
    const key = this.key(knowledgeSpaceId, knowledgeDocumentId);
    const existing = this.rows.get(key);
    if (existing) return existing.originRequestId === requestId;
    this.rows.set(key, {
      knowledgeSpaceId,
      knowledgeDocumentId,
      origin: 'MemoFlowCreated',
      originRequestId: requestId,
      createdAt: now,
      updatedAt: now,
    });
    return true;
  }

  async claimForAdoption(
    knowledgeSpaceId: never,
    knowledgeDocumentId: never,
    requestId: string,
    now: number,
  ) {
    const key = this.key(knowledgeSpaceId, knowledgeDocumentId);
    const existing = this.rows.get(key);
    if (existing) return existing.origin === 'Adopted' && existing.originRequestId === requestId;
    this.rows.set(key, {
      knowledgeSpaceId,
      knowledgeDocumentId,
      origin: 'Adopted',
      originRequestId: requestId,
      createdAt: now,
      updatedAt: now,
    } as never);
    return true;
  }

  async observeMarker(knowledgeSpaceId: never, knowledgeDocumentId: never, now: number) {
    const key = this.key(knowledgeSpaceId, knowledgeDocumentId);
    if (!this.rows.has(key))
      this.rows.set(key, {
        knowledgeSpaceId,
        knowledgeDocumentId,
        origin: 'ObservedMarker',
        originRequestId: null,
        createdAt: now,
        updatedAt: now,
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

function githubClient(overrides: Partial<IGitHubAppClient> = {}): IGitHubAppClient {
  return {
    getInstallationInventory: vi.fn(async () => ({
      installationId: 'installation-1',
      accountId: '42',
      contentsPermission: 'write' as const,
      suspended: false,
      repositories: [githubRepository()],
    })),
    createFileCommit: vi.fn(async () => ({
      commitSha: 'a'.repeat(40),
      blobSha: 'b'.repeat(40),
    })),
    updateFileCommit: vi.fn(async () => ({
      commitSha: 'c'.repeat(40),
      blobSha: 'd'.repeat(40),
    })),
    getMarkdownChanges: vi.fn(),
    getFullMarkdownSnapshot: vi.fn(),
    getBlob: vi.fn(),
    getRepositorySnapshot: vi.fn(),
    createInstallationAccessToken: vi.fn(),
    ...overrides,
  };
}

function createService(
  github = githubClient(),
  overrides: {
    projectionRepository?: MemoryProjectionRepository;
    writeRequestRepository?: MemoryWriteRequestRepository;
    connectionRepository?: MemoryConnectionRepository;
    leaseRepository?: IKnowledgeRepositoryLeaseRepository;
    now?: () => number;
    leaseTtlMs?: number;
    leaseRenewalIntervalMs?: number;
    closureChecker?: (identityId: string) => Promise<boolean>;
    metrics?: import('@memoflow/patterns/operations').UnifiedOperationMetricsRecorder;
  } = {},
) {
  const projectionRepository = overrides.projectionRepository ?? new MemoryProjectionRepository();
  const writeRequestRepository =
    overrides.writeRequestRepository ?? new MemoryWriteRequestRepository();
  const connectionRepository = overrides.connectionRepository ?? new MemoryConnectionRepository();
  const observationRepository = new MemoryObservationRepository();
  const historyFenceRepository = new MemoryHistoryFenceRepository();
  const documentIdentityRepository = new MemoryDocumentIdentityRepository();
  const publishMutation = vi.fn();
  return {
    github,
    projectionRepository,
    writeRequestRepository,
    documentIdentityRepository,
    publishMutation,
    service: new KnowledgeNoteCommitService({
      connectionRepository,
      observationRepository,
      historyFenceRepository,
      documentIdentityRepository,
      projectionRepository,
      writeRequestRepository,
      githubAppClient: github,
      leaseRepository: overrides.leaseRepository,
      publishMutation,
      now: overrides.now ?? (() => 1_750_000_000_000),
      leaseTtlMs: overrides.leaseTtlMs,
      leaseRenewalIntervalMs: overrides.leaseRenewalIntervalMs,
      closureChecker: overrides.closureChecker ?? (async () => false),
      metrics: overrides.metrics,
    }),
  };
}

describe('KnowledgeNoteCommitService', () => {
  it('persists the idempotency record, commits once, projects immediately, and emits indexing work', async () => {
    const { service, github, projectionRepository, writeRequestRepository, publishMutation } =
      createService();
    const input = request();

    const first = await service.create('identity-1', input);
    const retry = await service.create('identity-1', input);

    expect(first).toMatchObject({
      ok: true,
      data: {
        requestId: 'request-1',
        knowledgeDocumentId: DOCUMENT_ID,
        relativePath: 'notes/new-note.md',
        commitSha: 'a'.repeat(40),
        status: 'Committed',
      },
    });
    expect(retry).toEqual(first);
    expect(github.createFileCommit).toHaveBeenCalledOnce();
    expect(github.createFileCommit).toHaveBeenCalledWith(
      'installation-1',
      expect.objectContaining({
        content: expect.stringContaining(`memoflow_id: ${DOCUMENT_ID}`),
      }),
    );
    expect(writeRequestRepository.rows.values().next().value).toMatchObject({
      requestId: 'request-1',
      status: 'Committed',
      commitSha: 'a'.repeat(40),
    });
    expect(projectionRepository.applyChanges).toHaveBeenCalledWith(
      connection().id,
      'a'.repeat(40),
      [
        expect.objectContaining({
          relativePath: 'notes/new-note.md',
          indexStatus: 'pending',
          knowledgeDocumentId: DOCUMENT_ID,
          frontmatter: { tags: ['decision'], title: 'New note', memoflow_id: DOCUMENT_ID },
        }),
      ],
      [],
    );
    expect(publishMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        identityId: 'identity-1',
        resourceId: DOCUMENT_ID,
        resourcePath: 'notes/new-note.md',
        mutation: 'created',
      }),
    );
  });

  it('adopts an unmanaged note with one CAS metadata commit and replays the same request idempotently', async () => {
    const projectionRepository = new MemoryProjectionRepository();
    projectionRepository.rows.set('projection-existing', {
      id: 'projection-existing',
      connectionId: connection().id,
      knowledgeDocumentId: null,
      relativePath: 'notes/existing.md',
      commitSha: '1'.repeat(40),
      blobSha: '2'.repeat(40),
      contentHash: '3'.repeat(64),
      frontmatter: { title: 'Existing', tags: ['kept'] },
      markdownContent:
        '---\ntitle: Existing\ntags:\n  - kept\n---\n# Existing\n\nBody stays the same.\n',
      indexStatus: 'indexed',
    });
    const updateFileCommit = vi.fn(async () => ({
      commitSha: '4'.repeat(40),
      blobSha: '5'.repeat(40),
    }));
    const github = githubClient({ updateFileCommit });
    const { service, writeRequestRepository, documentIdentityRepository, publishMutation } =
      createService(github, { projectionRepository });
    const input = {
      projectionId: 'projection-existing',
      knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440093' as never,
      requestId: 'adopt-request-1',
      expectedBlobSha: '2'.repeat(40),
    };

    const first = await service.adopt('identity-1', input);
    const replay = await service.adopt('identity-1', input);

    expect(first).toMatchObject({
      ok: true,
      data: {
        requestId: 'adopt-request-1',
        knowledgeDocumentId: input.knowledgeDocumentId,
        relativePath: 'notes/existing.md',
        commitSha: '4'.repeat(40),
        status: 'Committed',
      },
    });
    expect(replay).toEqual(first);
    expect(updateFileCommit).toHaveBeenCalledOnce();
    expect(updateFileCommit).toHaveBeenCalledWith(
      'installation-1',
      expect.objectContaining({
        path: 'notes/existing.md',
        expectedBlobSha: '2'.repeat(40),
        requestId: 'adopt-request-1',
        content: expect.stringContaining(`memoflow_id: ${input.knowledgeDocumentId}`),
      }),
    );
    expect(updateFileCommit.mock.calls[0]?.[1].content).toContain(
      '# Existing\n\nBody stays the same.',
    );
    expect(github.createFileCommit).not.toHaveBeenCalled();
    expect(writeRequestRepository.rows.values().next().value).toMatchObject({
      requestId: 'adopt-request-1',
      knowledgeDocumentId: input.knowledgeDocumentId,
      status: 'Committed',
      projectionStatus: 'Succeeded',
    });
    expect(projectionRepository.rows.get('projection-existing')).toMatchObject({
      knowledgeDocumentId: input.knowledgeDocumentId,
      blobSha: '5'.repeat(40),
      indexStatus: 'pending',
    });
    expect([...documentIdentityRepository.rows.values()][0]).toMatchObject({
      origin: 'Adopted',
      originRequestId: 'adopt-request-1',
    });
    expect(publishMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: input.knowledgeDocumentId,
        resourcePath: 'notes/existing.md',
        mutation: 'content_updated',
      }),
    );
  });

  it('rejects adoption when the reviewed blob is stale without mutating Git', async () => {
    const projectionRepository = new MemoryProjectionRepository();
    projectionRepository.rows.set('projection-existing', {
      id: 'projection-existing',
      connectionId: connection().id,
      knowledgeDocumentId: null,
      relativePath: 'notes/existing.md',
      commitSha: '1'.repeat(40),
      blobSha: '2'.repeat(40),
      contentHash: '3'.repeat(64),
      frontmatter: {},
      markdownContent: '# Existing',
      indexStatus: 'indexed',
    });
    const github = githubClient();
    const { service } = createService(github, { projectionRepository });

    const result = await service.adopt('identity-1', {
      projectionId: 'projection-existing',
      knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440094' as never,
      requestId: 'adopt-stale',
      expectedBlobSha: '9'.repeat(40),
    });

    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(github.updateFileCommit).not.toHaveBeenCalled();
  });

  it('P1-5: write request persistence emits the unified knowledge persisted metric', async () => {
    const recorder = createUnifiedOperationMetricsRecorder();
    const { service, writeRequestRepository } = createService(githubClient(), {
      metrics: recorder,
    });

    const result = await service.create('identity-1', request());
    expect(result.ok).toBe(true);
    expect(writeRequestRepository.rows.size).toBe(1);

    const snap = recorder.snapshot();
    expect(snap['memoflow.knowledge.outbox.persisted']).toBe(1);
  });

  it('rejects request-id reuse with a different immutable proposal', async () => {
    const { service, github } = createService();
    await service.create('identity-1', request());

    const result = await service.create(
      'identity-1',
      request({ content: '# Changed after confirmation' }),
    );

    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(github.createFileCommit).toHaveBeenCalledOnce();
  });

  it('treats KnowledgeDocumentId as immutable request identity and preserves it on retry', async () => {
    const { service, github, documentIdentityRepository } = createService();
    const original = request();

    const first = await service.create('identity-1', original);
    const replay = await service.create('identity-1', original);
    const changedIdentity = await service.create(
      'identity-1',
      request({
        knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440092' as never,
      }),
    );

    expect(first).toMatchObject({ ok: true, data: { knowledgeDocumentId: DOCUMENT_ID } });
    expect(replay).toMatchObject({ ok: true, data: { knowledgeDocumentId: DOCUMENT_ID } });
    expect(changedIdentity).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(github.createFileCommit).toHaveBeenCalledOnce();
    expect(documentIdentityRepository.rows.size).toBe(1);
  });

  it('rejects different immutable content while the same request id is still in flight', async () => {
    let releaseCommit!: () => void;
    const commitGate = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    const createFileCommit = vi.fn(async () => {
      await commitGate;
      return { commitSha: 'a'.repeat(40), blobSha: 'b'.repeat(40) };
    });
    const { service } = createService(githubClient({ createFileCommit }));

    const committing = service.create('identity-1', request());
    await vi.waitFor(() => expect(createFileCommit).toHaveBeenCalledOnce());
    await expect(
      service.create('identity-1', request({ content: '# Changed during commit' })),
    ).resolves.toMatchObject({ ok: false, error: { code: 'CONFLICT' } });

    releaseCommit();
    await expect(committing).resolves.toMatchObject({ ok: true });
    expect(createFileCommit).toHaveBeenCalledOnce();
  });

  it('serializes different write requests for the same repository connection', async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const startedPaths: string[] = [];
    const createFileCommit = vi.fn(async (_installationId, input) => {
      startedPaths.push(input.path);
      if (input.path === 'notes/first.md') await firstGate;
      return {
        commitSha: input.path === 'notes/first.md' ? 'a'.repeat(40) : 'c'.repeat(40),
        blobSha: input.path === 'notes/first.md' ? 'b'.repeat(40) : 'd'.repeat(40),
      };
    });
    const { service } = createService(githubClient({ createFileCommit }));

    const first = service.create(
      'identity-1',
      request({ requestId: 'request-first', proposedPath: 'notes/first.md' }),
    );
    const second = service.create(
      'identity-1',
      request({
        requestId: 'request-second',
        knowledgeDocumentId: 'kdoc_550e8400-e29b-41d4-a716-446655440091' as never,
        proposedPath: 'notes/second.md',
      }),
    );

    await vi.waitFor(() => expect(createFileCommit).toHaveBeenCalledTimes(1));
    expect(startedPaths).toEqual(['notes/first.md']);
    releaseFirst();

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ ok: true }),
      expect.objectContaining({ ok: true }),
    ]);
    expect(startedPaths).toEqual(['notes/first.md', 'notes/second.md']);
  });

  it('coordinates writes across service instances with a persisted connection lease', async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const createFileCommit = vi.fn(async (_installationId, input) => {
      if (input.path === 'notes/first.md') await firstGate;
      return {
        commitSha: input.path === 'notes/first.md' ? 'a'.repeat(40) : 'c'.repeat(40),
        blobSha: input.path === 'notes/first.md' ? 'b'.repeat(40) : 'd'.repeat(40),
      };
    });
    const leaseRepository = new MemoryLeaseRepository();
    const connectionRepository = new MemoryConnectionRepository();
    const writeRequestRepository = new MemoryWriteRequestRepository();
    const first = createService(githubClient({ createFileCommit }), {
      connectionRepository,
      writeRequestRepository,
      leaseRepository,
    }).service;
    const second = createService(githubClient({ createFileCommit }), {
      connectionRepository,
      writeRequestRepository,
      leaseRepository,
    }).service;

    const firstRun = first.create(
      'identity-1',
      request({ requestId: 'request-first', proposedPath: 'notes/first.md' }),
    );
    await vi.waitFor(() => expect(createFileCommit).toHaveBeenCalledOnce());
    await expect(
      second.create(
        'identity-1',
        request({ requestId: 'request-second', proposedPath: 'notes/second.md' }),
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'CONFLICT' } });

    releaseFirst();
    await expect(firstRun).resolves.toMatchObject({ ok: true });
    await expect(
      second.create(
        'identity-1',
        request({ requestId: 'request-second', proposedPath: 'notes/second.md' }),
      ),
    ).resolves.toMatchObject({ ok: true });
    expect(createFileCommit).toHaveBeenCalledTimes(2);
  });

  it('resumes a pending write after lease expiry and fences the stale owner', async () => {
    let now = 1_000;
    let releaseStale!: () => void;
    const staleGate = new Promise<void>((resolve) => {
      releaseStale = resolve;
    });
    const staleCommit = vi.fn(async () => {
      await staleGate;
      return { commitSha: 'a'.repeat(40), blobSha: 'b'.repeat(40) };
    });
    const replacementCommit = vi.fn(async () => ({
      commitSha: 'c'.repeat(40),
      blobSha: 'd'.repeat(40),
    }));
    const leaseRepository = new MemoryLeaseRepository();
    const connectionRepository = new MemoryConnectionRepository();
    const writeRequestRepository = new MemoryWriteRequestRepository();
    const shared = {
      connectionRepository,
      writeRequestRepository,
      leaseRepository,
      now: () => now,
      leaseTtlMs: 1_000,
      leaseRenewalIntervalMs: 500,
    };
    const stale = createService(githubClient({ createFileCommit: staleCommit }), shared).service;
    const replacement = createService(
      githubClient({ createFileCommit: replacementCommit }),
      shared,
    ).service;

    const staleRun = stale.create('identity-1', request());
    await vi.waitFor(() => expect(staleCommit).toHaveBeenCalledOnce());
    expect(writeRequestRepository.rows.values().next().value).toMatchObject({ status: 'Pending' });
    now = 2_001;

    await expect(replacement.create('identity-1', request())).resolves.toMatchObject({
      ok: true,
      data: { commitSha: 'c'.repeat(40) },
    });
    releaseStale();
    await expect(staleRun).resolves.toMatchObject({
      ok: false,
      error: { code: 'SERVICE_UNAVAILABLE' },
    });
    expect(writeRequestRepository.rows.values().next().value).toMatchObject({
      status: 'Committed',
      commitSha: 'c'.repeat(40),
    });
  });

  it('records GitHub path conflicts as a retryable failed request', async () => {
    const github = githubClient({
      createFileCommit: vi.fn(async () => {
        throw new GitHubAppClientFailureError({ kind: 'conflict' }, 'Path already exists');
      }),
    });
    const { service, writeRequestRepository, publishMutation } = createService(github);

    const result = await service.create('identity-1', request());

    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(writeRequestRepository.rows.values().next().value).toMatchObject({
      status: 'Failed',
      errorCode: 'CONFLICT',
    });
    expect(publishMutation).not.toHaveBeenCalled();
  });

  it('atomically retries the same confirmed request after a transient GitHub failure', async () => {
    const createFileCommit = vi
      .fn()
      .mockRejectedValueOnce(
        new GitHubAppClientFailureError({ kind: 'unavailable' }, 'GitHub unavailable'),
      )
      .mockResolvedValueOnce({ commitSha: 'c'.repeat(40), blobSha: 'd'.repeat(40) });
    const { service, writeRequestRepository } = createService(githubClient({ createFileCommit }));

    await expect(service.create('identity-1', request())).resolves.toMatchObject({
      ok: false,
      error: { code: 'SERVICE_UNAVAILABLE' },
    });
    await expect(service.create('identity-1', request())).resolves.toMatchObject({
      ok: true,
      data: { commitSha: 'c'.repeat(40), status: 'Committed' },
    });

    expect(createFileCommit).toHaveBeenCalledTimes(2);
    expect(writeRequestRepository.rows.size).toBe(1);
    expect(writeRequestRepository.rows.values().next().value).toMatchObject({
      requestId: 'request-1',
      status: 'Committed',
    });
  });

  it('does not downgrade a confirmed Git commit when the rebuildable projection write fails', async () => {
    const state = createService();
    state.projectionRepository.applyChanges.mockRejectedValueOnce(
      new Error('projection database unavailable'),
    );

    await expect(state.service.create('identity-1', request())).resolves.toMatchObject({
      ok: true,
      data: { commitSha: 'a'.repeat(40), status: 'Committed' },
    });
    expect(state.writeRequestRepository.rows.values().next().value).toMatchObject({
      status: 'Committed',
      commitSha: 'a'.repeat(40),
      errorCode: null,
    });
    expect(state.publishMutation).not.toHaveBeenCalled();
  });

  it('does not create a note on a stale default-branch connection', async () => {
    const createFileCommit = vi.fn();
    const state = createService(
      githubClient({
        getInstallationInventory: vi.fn(async () => ({
          installationId: 'installation-1',
          accountId: '42',
          contentsPermission: 'write' as const,
          suspended: false,
          repositories: [{ ...githubRepository(), defaultBranch: 'trunk' }],
        })),
        createFileCommit,
      }),
    );

    await expect(state.service.create('identity-1', request())).resolves.toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(createFileCommit).not.toHaveBeenCalled();
    expect(state.writeRequestRepository.rows.size).toBe(0);
  });

  it('rejects commit request when account is closed or closure in progress', async () => {
    const closureChecker = vi.fn().mockResolvedValue(true);
    const { service, github } = createService(githubClient(), { closureChecker });

    const result = await service.create('identity-1', request());

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'Account is closed or closure in progress' },
    });
    expect(github.createFileCommit).not.toHaveBeenCalled();
  });
});

describe('Knowledge write request status ownership (residual 109)', () => {
  it('memory repository refuses status transitions for foreign identity', async () => {
    const repo = new MemoryWriteRequestRepository();
    const record = {
      id: 'kwr-1',
      identityId: 'identity-1',
      connectionId: 'conn-1',
      requestId: 'req-1',
      requestHash: 'hash',
      relativePath: 'notes/a.md',
      status: 'Pending' as const,
      commitSha: null,
      errorCode: null,
      errorMessage: null,
      projectionStatus: 'Pending' as const,
      projectionErrorCode: null,
      projectionErrorMessage: null,
      projectionAttempts: 0,
      projectedAt: null,
      blobSha: null,
      markdownContent: null,
      createdAt: 1,
      updatedAt: 1,
      completedAt: null,
    };
    await repo.create(record);

    await repo.markCommitted('identity-other', 'kwr-1', 'sha-foreign');
    expect(repo.rows.get('kwr-1')).toMatchObject({ status: 'Pending', commitSha: null });

    await repo.markFailed('identity-other', 'kwr-1', 'CONFLICT', 'nope');
    expect(repo.rows.get('kwr-1')).toMatchObject({ status: 'Pending' });

    await repo.markFailed('identity-1', 'kwr-1', 'CONFLICT', 'owned fail');
    expect(repo.rows.get('kwr-1')).toMatchObject({ status: 'Failed', errorCode: 'CONFLICT' });

    expect(await repo.retryFailed('identity-other', 'kwr-1', 2)).toBe(false);
    expect(await repo.retryFailed('identity-1', 'kwr-1', 2)).toBe(true);
    expect(repo.rows.get('kwr-1')).toMatchObject({ status: 'Pending' });

    await repo.markCommitted('identity-1', 'kwr-1', 'sha-own');
    expect(repo.rows.get('kwr-1')).toMatchObject({ status: 'Committed', commitSha: 'sha-own' });
  });
});
