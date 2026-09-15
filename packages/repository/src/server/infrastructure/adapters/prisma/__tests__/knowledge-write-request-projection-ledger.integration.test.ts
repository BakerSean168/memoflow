import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { RequestHandler } from 'express';
import { prisma } from '@memoflow/database';
import type { KnowledgeDocumentId } from '@memoflow/contracts/primitives';
import type {
  GitHubAppInstallationInventory,
  GitHubMarkdownChanges,
  GitHubFileCommitResult,
  IGitHubAppClient,
} from '../../../../application/ports/github-app-client.port';
import type {
  IKnowledgeNoteProjectionRepository,
  KnowledgeNoteProjectionClientDTO,
  KnowledgeNoteProjectionDeletion,
  KnowledgeNoteProjectionIndexStatus,
  KnowledgeNoteLinkGraphSourceSet,
  KnowledgeNoteProjectionUpsert,
} from '../../../../application/ports/knowledge-note-projection.repository';
import type { IKnowledgeRemoteBindingRepository } from '../../../../application/ports/knowledge-remote-binding.repositories';
import type { OperationAuditRecord, OperationTimelineEntry } from '@memoflow/contracts/operations';
import type { KnowledgeRemoteBindingServerDTO } from '@memoflow/contracts/repository';
import { KnowledgeDocumentIdSchema } from '@memoflow/contracts/repository';
import { KnowledgeNoteCommitService } from '../../../../application/services/knowledge-note-commit.service';
import { KnowledgeRepositoryProjectionService } from '../../../../application/services/knowledge-repository-projection.service';
import { KnowledgeProjectionEngine } from '../../../../application/services/knowledge-projection.engine';
import { createRepositoryModule } from '../../../../infrastructure/repository.module';
import { registerKnowledgeRepositoryConnectionRoutes } from '../../../../../api/routes/knowledge-repository-connection.routes';
import {
  KnowledgeProjectionCheckpointPrismaRepository,
  KnowledgeRemoteBindingPrismaRepository,
  RemoteHistoryFencePrismaRepository,
  RemoteRepositoryObservationPrismaRepository,
} from '../knowledge-remote-binding-prisma.repositories';
import { KnowledgeNoteProjectionPrismaRepository } from '../knowledge-note-projection-prisma.repository';
import { KnowledgeDocumentIdentityPrismaRepository } from '../knowledge-document-identity-prisma.repository';
import { KnowledgeRepositoryLeasePrismaRepository } from '../knowledge-repository-lease-prisma.repository';
import { KnowledgeWriteRequestPrismaRepository } from '../knowledge-write-request-prisma.repository';
import { GithubWebhookDeliveryPrismaRepository } from '../github-webhook-delivery-prisma.repository';
import { cleanAllTables } from '@memoflow/test-utils/setup/database';
import {
  PrismaOperationAuditRepository,
  createUnifiedOperationMetricsRecorder,
} from '@memoflow/patterns/operations';

const WEBHOOK_SECRET = 'integration-webhook-secret';
const WEBHOOK_SIGNATURE_HEADER = 'x-hub-signature-256';

function signWebhook(rawBody: string): string {
  const digest = createHmac('sha256', WEBHOOK_SECRET).update(rawBody, 'utf8').digest('hex');
  return `sha256=${digest}`;
}

interface Seed {
  identityId: string;
  connectionId: string;
  installationId: string;
  githubRepositoryId: string;
}

async function seedContext(): Promise<Seed> {
  const identityId = randomUUID();
  await prisma.cloudAuthUser.create({
    data: {
      id: identityId,
      email: `wr-${identityId}@example.test`,
      name: 'Write Request User',
      emailVerified: true,
    },
  });
  await prisma.account.create({
    data: {
      id: identityId,
      status: 'Active',
      profile: {},
    },
  });
  const connectionId = randomUUID();
  const knowledgeSpaceId = randomUUID();
  const installationId = `install-${identityId}`;
  const githubRepositoryId = `gh-repo-${identityId}`;
  const repositoryFullName = `user/knowledge-${identityId}`;
  const now = new Date();
  await prisma.knowledgeSpace.create({ data: { id: knowledgeSpaceId } });
  await prisma.knowledgeRemoteBinding.create({
    data: {
      id: connectionId,
      knowledgeSpaceId,
      identityId,
      provider: 'GitHub',
      installationId,
      repositoryId: githubRepositoryId,
      repositoryFullNameSnapshot: repositoryFullName,
      connectedAt: now,
    },
  });
  await prisma.remoteRepositoryObservation.create({
    data: {
      bindingId: connectionId,
      observedAt: now,
      accountId: `github-user-${identityId}`,
      repositoryFullName,
      defaultBranch: 'main',
      isPrivate: true,
      archived: false,
      disabled: false,
      contentsPermission: 'write',
      installationSuspended: false,
      eligibilityState: 'Ready',
      blockReason: null,
    },
  });
  await prisma.remoteHistoryFence.create({
    data: {
      bindingId: connectionId,
      defaultBranch: 'main',
      lastConfirmedRemoteHeadSha: 'a'.repeat(40),
      confirmedAt: now,
    },
  });
  return { identityId, connectionId, installationId, githubRepositoryId };
}

/**
 * ThrowingProjectionRepository wraps the real Prisma projection repository and
 * lets a test inject a real projection exception (`applyChanges` throws) for
 * the first call, then delegates to the real implementation. All ledger
 * transitions (Failed / Succeeded) are driven by the real services.
 *
 * `setApplyChangesGate()` provides a controllable barrier: the next call to
 * `applyChanges` suspends (still holding the connection lease) until the
 * returned release function runs. This lets a test force a real overlap between
 * two service-driven transitions on the same ledger row.
 */
class ThrowingProjectionRepository implements IKnowledgeNoteProjectionRepository {
  private pendingFailures = 0;
  private gate: Promise<void> | null = null;
  constructor(
    private readonly real: KnowledgeNoteProjectionPrismaRepository,
    private readonly delegate: IKnowledgeNoteProjectionRepository = real,
  ) {}

  failNextProjection(): void {
    this.pendingFailures += 1;
  }

  setApplyChangesGate(): () => void {
    let release!: () => void;
    this.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    return () => {
      this.gate = null;
      release();
    };
  }

  async applyChanges(
    connectionId: string,
    commitSha: string,
    projections: KnowledgeNoteProjectionUpsert[],
    deletedPaths: string[],
  ): Promise<void> {
    if (this.pendingFailures > 0) {
      this.pendingFailures -= 1;
      throw new Error('applyChanges crashed mid-transaction');
    }
    const gate = this.gate;
    if (gate) {
      this.gate = null;
      await gate;
    }
    return this.delegate.applyChanges(connectionId, commitSha, projections, deletedPaths);
  }

  applySnapshot(
    connectionId: string,
    commitSha: string,
    notes: KnowledgeNoteProjectionUpsert[],
  ): Promise<KnowledgeNoteProjectionDeletion[]> {
    return this.delegate.applySnapshot(connectionId, commitSha, notes);
  }

  listByIdentity(
    identityId: string,
    options: { connectionId?: string; query?: string; limit: number },
  ): Promise<KnowledgeNoteProjectionClientDTO[]> {
    return this.delegate.listByIdentity(identityId, options);
  }

  findByIdForIdentity(
    identityId: string,
    projectionId: string,
  ): Promise<KnowledgeNoteProjectionClientDTO | null> {
    return this.delegate.findByIdForIdentity(identityId, projectionId);
  }

  findByPath(
    connectionId: string,
    relativePath: string,
  ): Promise<KnowledgeNoteProjectionClientDTO | null> {
    return this.delegate.findByPath(connectionId, relativePath);
  }

  findLiveByDocumentId(
    connectionId: string,
    knowledgeDocumentId: KnowledgeDocumentId,
  ): Promise<KnowledgeNoteProjectionClientDTO[]> {
    return this.delegate.findLiveByDocumentId(connectionId, knowledgeDocumentId);
  }

  listLiveByConnection(connectionId: string): Promise<KnowledgeNoteProjectionClientDTO[]> {
    return this.delegate.listLiveByConnection(connectionId);
  }

  loadLinkGraphSourcesForIdentity(
    identityId: string,
    centerProjectionId: string,
    limit: number,
  ): Promise<KnowledgeNoteLinkGraphSourceSet | null> {
    return this.delegate.loadLinkGraphSourcesForIdentity(identityId, centerProjectionId, limit);
  }

  updateIndexStatusForIdentity(
    identityId: string,
    projectionId: string,
    expectedContentHash: string,
    status: KnowledgeNoteProjectionIndexStatus,
  ): Promise<boolean> {
    return this.delegate.updateIndexStatusForIdentity(
      identityId,
      projectionId,
      expectedContentHash,
      status,
    );
  }
}

/**
 * GatedConnectionRepository wraps the real connection repository and lets a test
 * suspend the connection lookup that the projection service performs after it
 * reads the write request but before it acquires the connection lease. This is
 * the controllable barrier used to stage a real late-Failed/Succeeded race on
 * one ledger row: the gated replay reads Pending, the other replay lands
 * Succeeded, then the gated replay acquires the (now free) lease and writes its
 * own late Failed transition against the real DB.
 */
class GatedConnectionRepository implements IKnowledgeRemoteBindingRepository {
  private gate: Promise<void> | null = null;
  private releaseGate: (() => void) | null = null;
  private gated = false;
  private onGated: (() => void) | null = null;

  constructor(private readonly real: KnowledgeRemoteBindingPrismaRepository) {}

  gateNextConnectionRead(): () => void {
    this.gate = new Promise<void>((resolve) => {
      this.releaseGate = resolve;
    });
    return () => {
      const release = this.releaseGate;
      this.releaseGate = null;
      this.gate = null;
      release?.();
    };
  }

  waitUntilGated(): Promise<void> {
    if (this.gated) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this.onGated = resolve;
    });
  }

  async findByIdForIdentity(
    identityId: string,
    id: string,
  ): Promise<KnowledgeRemoteBindingServerDTO | null> {
    const gate = this.gate;
    if (gate) {
      this.gate = null;
      this.gated = true;
      const resolve = this.onGated;
      this.onGated = null;
      resolve?.();
      await gate;
    }
    return this.real.findByIdForIdentity(identityId, id);
  }

  findById(id: string): Promise<KnowledgeRemoteBindingServerDTO | null> {
    return this.real.findById(id);
  }

  findByIdentityId(identityId: string): Promise<KnowledgeRemoteBindingServerDTO[]> {
    return this.real.findByIdentityId(identityId);
  }

  findByRepositoryId(repositoryId: string): Promise<KnowledgeRemoteBindingServerDTO | null> {
    return this.real.findByRepositoryId(repositoryId);
  }

  findByInstallationAndRepositoryId(
    installationId: string,
    repositoryId: string,
  ): Promise<KnowledgeRemoteBindingServerDTO | null> {
    return this.real.findByInstallationAndRepositoryId(installationId, repositoryId);
  }

  listProjectionCandidates(
    limit: number,
    cursor?: { connectedAt: number; id: string },
  ): Promise<KnowledgeRemoteBindingServerDTO[]> {
    return this.real.listProjectionCandidates(limit, cursor);
  }

  save(binding: KnowledgeRemoteBindingServerDTO): Promise<void> {
    return this.real.save(binding);
  }

  markDisconnected(identityId: string, id: string, disconnectedAt: number): Promise<boolean> {
    return this.real.markDisconnected(identityId, id, disconnectedAt);
  }
}

function createGithubAppClient(
  inventory: GitHubAppInstallationInventory,
  commitSha: string,
): IGitHubAppClient {
  return {
    getInstallationInventory: async () => inventory,
    getRepositorySnapshot: async () => ({
      repositoryId: inventory.repositories[0]?.id ?? 'repo',
      defaultBranch: 'main',
      empty: false,
      headSha: commitSha,
    }),
    getMarkdownChanges: async (): Promise<GitHubMarkdownChanges> => ({
      commitSha,
      requiresFullSnapshot: false,
      changes: [
        {
          relativePath: 'notes/webhook.md',
          blobSha: 'b'.repeat(40),
          markdownContent: '# Webhook\n\nPushed.',
          status: 'added',
        },
      ],
    }),
    getFullMarkdownSnapshot: async () => ({
      commitSha,
      files: [
        { relativePath: 'notes/webhook.md', blobSha: 'b'.repeat(40), markdownContent: '# Webhook' },
      ],
    }),
    getBlob: async () => ({ blobSha: 'b'.repeat(40), byteSize: 1, bytes: new Uint8Array() }),
    createFileCommit: async (_installationId, input): Promise<GitHubFileCommitResult> => ({
      commitSha,
      blobSha: createHmac('sha256', input.path).update(input.content).digest('hex'),
    }),
    createInstallationAccessToken: async () => ({ token: 'token', expiresAt: 1_750_000_000_000 }),
  };
}

interface TestRuntime {
  server: Server;
  baseUrl: string;
  projectionRepo: ThrowingProjectionRepository;
  connectionRepo: GatedConnectionRepository;
  writeRequestRepo: KnowledgeWriteRequestPrismaRepository;
  projectionService: KnowledgeRepositoryProjectionService;
  close(): Promise<void>;
}

async function startRuntime(
  seed: Seed,
  options: {
    metrics?: import('@memoflow/patterns/operations').UnifiedOperationMetricsRecorder;
  } = {},
): Promise<TestRuntime> {
  const connectionRepo = new GatedConnectionRepository(
    new KnowledgeRemoteBindingPrismaRepository(prisma),
  );
  const observationRepo = new RemoteRepositoryObservationPrismaRepository(prisma);
  const historyFenceRepo = new RemoteHistoryFencePrismaRepository(prisma);
  const projectionCheckpointRepo = new KnowledgeProjectionCheckpointPrismaRepository(prisma);
  const realProjectionRepo = new KnowledgeNoteProjectionPrismaRepository(prisma);
  const projectionRepo = new ThrowingProjectionRepository(realProjectionRepo);
  const documentIdentityRepo = new KnowledgeDocumentIdentityPrismaRepository(prisma);
  const writeRequestRepo = new KnowledgeWriteRequestPrismaRepository(prisma);
  const deliveryRepo = new GithubWebhookDeliveryPrismaRepository(prisma);
  const leaseRepo = new KnowledgeRepositoryLeasePrismaRepository(prisma);
  const commitSha = 'c'.repeat(40);
  const inventory: GitHubAppInstallationInventory = {
    installationId: seed.installationId,
    accountId: '42',
    contentsPermission: 'write',
    suspended: false,
    repositories: [
      {
        id: seed.githubRepositoryId,
        nodeId: `node-${seed.githubRepositoryId}`,
        fullName: `user/knowledge-${seed.identityId}`,
        ownerId: '42',
        private: true,
        archived: false,
        disabled: false,
        defaultBranch: 'main',
        permissions: { admin: false, push: true, pull: true },
      },
    ],
  };
  const githubAppClient = createGithubAppClient(inventory, commitSha);
  const projectionEngine = new KnowledgeProjectionEngine({
    projectionRepository: projectionRepo,
    documentIdentityRepository: documentIdentityRepo,
  });

  const commitService = new KnowledgeNoteCommitService({
    connectionRepository: connectionRepo,
    observationRepository: observationRepo,
    historyFenceRepository: historyFenceRepo,
    documentIdentityRepository: documentIdentityRepo,
    projectionRepository: projectionRepo,
    writeRequestRepository: writeRequestRepo,
    githubAppClient,
    leaseRepository: leaseRepo,
    closureChecker: async () => false,
    projectionEngine,
  });

  const projectionService = new KnowledgeRepositoryProjectionService({
    webhookSecret: WEBHOOK_SECRET,
    connectionRepository: connectionRepo,
    observationRepository: observationRepo,
    historyFenceRepository: historyFenceRepo,
    projectionCheckpointRepository: projectionCheckpointRepo,
    deliveryRepository: deliveryRepo,
    projectionRepository: projectionRepo,
    writeRequestRepository: writeRequestRepo,
    githubAppClient,
    leaseRepository: leaseRepo,
    reconciliationIntervalMs: 0,
    metrics: options.metrics,
    projectionEngine,
  });

  const module = createRepositoryModule({
    knowledgeRepositoryConnectionService: null,
    knowledgeRepositoryProjectionService: projectionService,
    knowledgeNoteCommitService: commitService,
    auditRepository: new PrismaOperationAuditRepository(prisma),
  });

  const app = express();
  app.use(
    express.json({
      verify: (req, _res, buffer) => {
        (req as { rawBody?: string }).rawBody = buffer.toString('utf8');
      },
    }),
  );
  const auth: RequestHandler = (req, _res, next) => {
    (req as { user?: { identityId: string } }).user = { identityId: seed.identityId };
    next();
  };
  app.use(
    registerKnowledgeRepositoryConnectionRoutes(module.api, {
      auth,
      requireEmailVerified: undefined,
    }),
  );

  const server = await new Promise<Server>((resolve) => {
    const s = createServer(app);
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    server,
    baseUrl,
    projectionRepo,
    connectionRepo,
    writeRequestRepo,
    projectionService,
    module,
    close: async () => {
      projectionService.stop();
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    },
  };
}

/**
 * Fixture helper: persists a Committed write request whose projection is still
 * Pending (the state the commit service leaves behind only while a projection
 * is in flight). This is setup, not the business path under test — the tests
 * below drive the replay route / reconcile / concurrent service transitions.
 */
async function seedPendingWriteRequest(
  runtime: TestRuntime,
  seed: Seed,
  relativePath = 'notes/pending-replay.md',
): Promise<string> {
  const writeRequestId = `knowledge-write-${randomUUID()}`;
  const now = Date.now();
  await runtime.writeRequestRepo.create({
    id: writeRequestId,
    identityId: seed.identityId,
    connectionId: seed.connectionId,
    requestId: `pending-${randomUUID()}`,
    knowledgeDocumentId: KnowledgeDocumentIdSchema.parse(`kdoc_${randomUUID()}`),
    requestHash: createHash('sha256').update(relativePath).digest('hex'),
    relativePath,
    status: 'Committed',
    commitSha: 'c'.repeat(40),
    errorCode: null,
    errorMessage: null,
    projectionStatus: 'Pending',
    projectionErrorCode: null,
    projectionErrorMessage: null,
    projectionAttempts: 0,
    projectedAt: null,
    blobSha: 'b'.repeat(40),
    markdownContent: `# Pending replay\n\n${relativePath}`,
    createdAt: now,
    updatedAt: now,
    completedAt: now,
  });
  return writeRequestId;
}

async function listLedgerDto(runtime: TestRuntime) {
  const response = await fetch(`${runtime.baseUrl}/knowledge-write-requests?limit=50`, {
    method: 'GET',
    headers: { authorization: 'Bearer test' },
  });
  const body = (await response.json()) as {
    ok: boolean;
    data?: {
      writeRequests: Array<{
        id: string;
        status: string;
        projectionStatus: string;
        projectionAttempts: number;
        projectionErrorCode: string | null;
        projectedAt: string | null;
      }>;
    };
  };
  expect(body.ok).toBe(true);
  return body.data!.writeRequests;
}

async function waitForDeliveryStatus(
  runtime: TestRuntime,
  deliveryId: string,
  expected: 'Processed' | 'Failed',
  timeoutMs = 8_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const row = await prisma.githubWebhookDelivery.findUnique({ where: { id: deliveryId } });
    if (row && row.status === expected) return;
    if (row && row.status === 'Failed' && expected !== 'Failed') {
      throw new Error(`delivery ${deliveryId} failed: ${row.errorMessage}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`timed out waiting for delivery ${deliveryId} to reach ${expected}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('Knowledge write-request projection ledger (W6-A real routes/services, real DB)', () => {
  afterAll(async () => {
    await cleanAllTables(prisma);
    await prisma.$disconnect();
  });

  it('commit via real route → real projection exception → ledger Failed → replay via real route → Succeeded', async () => {
    const seed = await seedContext();
    const runtime = await startRuntime(seed);
    runtime.projectionRepo.failNextProjection();

    // 1. Commit through the real HTTP route (createConfirmedKnowledgeNote).
    const requestId = `req-${randomUUID()}`;
    const commitResponse = await fetch(`${runtime.baseUrl}/knowledge-notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        connectionId: seed.connectionId,
        knowledgeDocumentId: KnowledgeDocumentIdSchema.parse(`kdoc_${randomUUID()}`),
        proposalId: `proposal-${randomUUID()}`,
        revision: 1,
        requestId,
        proposedPath: 'notes/failed-then-replayed.md',
        title: 'Failed then replayed',
        frontmatter: {},
        content: '# Failed then replayed\n\nFirst projection crashed.',
        reason: 'integration test',
      }),
    });
    const commitBody = (await commitResponse.json()) as {
      ok: boolean;
      data?: { requestId: string; commitSha: string; status: string };
      error?: { code: string; message: string };
    };
    if (commitResponse.status !== 200) {
      process.stdout.write(
        `DBG commit status ${commitResponse.status} body ${JSON.stringify(commitBody)}\n`,
      );
    }
    expect(commitBody.ok).toBe(true);
    expect(commitBody.data?.status).toBe('Committed');

    // 2. The real service caught the real projection exception and marked the
    //    write request Committed + Failed via the ledger.
    const listed = await fetch(`${runtime.baseUrl}/knowledge-write-requests?limit=50`, {
      method: 'GET',
      headers: { authorization: 'Bearer test' },
    });
    const ledger = (await listed.json()) as {
      ok: boolean;
      data?: {
        writeRequests: Array<{
          id: string;
          status: string;
          projectionStatus: string;
          projectionAttempts: number;
          projectionErrorCode: string | null;
        }>;
      };
    };
    expect(ledger.ok).toBe(true);
    const row = ledger.data?.writeRequests.find((r) => r.status === 'Committed');
    expect(row).toBeDefined();
    expect(row?.projectionStatus).toBe('Failed');
    expect(row?.projectionErrorCode).toBe('PROJECTION_FAILED');
    expect(row?.projectionAttempts).toBe(1);
    const writeRequestId = row!.id;

    // 3. Replay through the real route now succeeds (projection no longer throws).
    const replayResponse = await fetch(
      `${runtime.baseUrl}/knowledge-write-requests/${writeRequestId}/replay`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    );
    const replayBody = (await replayResponse.json()) as { ok: boolean; data?: { status: string } };
    expect(replayBody.ok).toBe(true);
    expect(replayBody.data?.status).toBe('Succeeded');

    // 4. The HTTP DTO now reports Succeeded with the projection row written.
    const after = await runtime.writeRequestRepo.findByIdForIdentity(
      seed.identityId,
      writeRequestId,
    );
    expect(after?.projectionStatus).toBe('Succeeded');
    expect(after?.projectionErrorCode).toBeNull();
    expect(after?.projectionAttempts).toBe(2);
    expect(after?.projectedAt).not.toBeNull();

    const projected = await prisma.knowledgeNoteProjection.findFirst({
      where: { bindingId: seed.connectionId, relativePath: 'notes/failed-then-replayed.md' },
    });
    expect(projected).not.toBeNull();
    expect(projected?.commitSha).toBe('c'.repeat(40));

    await runtime.close();
  });

  it('webhook push via real route (valid HMAC) refreshes Committed write requests to Succeeded by commit SHA', async () => {
    const seed = await seedContext();
    const runtime = await startRuntime(seed);
    // Create a write request whose projection failed so it stays non-Succeeded.
    runtime.projectionRepo.failNextProjection();
    const requestId = `req-${randomUUID()}`;
    const commitResponse = await fetch(`${runtime.baseUrl}/knowledge-notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        connectionId: seed.connectionId,
        knowledgeDocumentId: KnowledgeDocumentIdSchema.parse(`kdoc_${randomUUID()}`),
        proposalId: `proposal-${randomUUID()}`,
        revision: 1,
        requestId,
        proposedPath: 'notes/refreshed-by-webhook.md',
        title: 'Refreshed by webhook',
        frontmatter: {},
        content: '# Refreshed by webhook\n\nRefresh me.',
        reason: 'integration test',
      }),
    });
    expect(commitResponse.status).toBe(200);
    const writeRequests = await runtime.writeRequestRepo.listForIdentity(seed.identityId, {
      limit: 50,
    });
    const refreshTarget = writeRequests.find((r) => r.projectionStatus !== 'Succeeded');
    expect(refreshTarget).toBeDefined();
    const commitSha = refreshTarget!.commitSha;
    expect(commitSha).toBe('c'.repeat(40));

    // 2. Real webhook push for that commit → real ingest → real delivery processing.
    const payload = JSON.stringify({
      ref: 'refs/heads/main',
      before: 'a'.repeat(40),
      after: commitSha,
      forced: false,
      installation: { id: seed.installationId },
      repository: { id: seed.githubRepositoryId, default_branch: 'main' },
    });
    const deliveryId = `github-delivery-${randomUUID()}`;
    const webhookResponse = await fetch(`${runtime.baseUrl}/webhooks/github`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [WEBHOOK_SIGNATURE_HEADER]: signWebhook(payload),
        'x-github-delivery': deliveryId,
        'x-github-event': 'push',
      },
      body: payload,
    });
    expect(webhookResponse.status).toBe(202);
    const ingestBody = (await webhookResponse.json()) as {
      ok: boolean;
      data: { accepted: boolean; duplicate: boolean };
    };
    expect(ingestBody.ok).toBe(true);
    expect(ingestBody.data.accepted).toBe(true);
    expect(ingestBody.data.duplicate).toBe(false);

    const delivery = await prisma.githubWebhookDelivery.findFirst({
      where: { deliveryId },
    });
    expect(delivery).not.toBeNull();
    await waitForDeliveryStatus(runtime, delivery!.id, 'Processed');

    // 3. The real delivery processing refreshed the write request to Succeeded.
    const row = await runtime.writeRequestRepo.findByIdForIdentity(
      seed.identityId,
      refreshTarget!.id,
    );
    expect(row?.projectionStatus).toBe('Succeeded');
    expect(row?.projectedAt).not.toBeNull();

    await runtime.close();
  });

  it('duplicate webhook delivery is reserved once and reported as duplicate', async () => {
    const seed = await seedContext();
    const runtime = await startRuntime(seed);
    const payload = JSON.stringify({
      ref: 'refs/heads/main',
      before: 'a'.repeat(40),
      after: 'c'.repeat(40),
      forced: false,
      installation: { id: seed.installationId },
      repository: { id: seed.githubRepositoryId, default_branch: 'main' },
    });
    const deliveryId = `github-delivery-${randomUUID()}`;
    const headers = {
      'content-type': 'application/json',
      [WEBHOOK_SIGNATURE_HEADER]: signWebhook(payload),
      'x-github-delivery': deliveryId,
      'x-github-event': 'push',
    };

    const first = await fetch(`${runtime.baseUrl}/webhooks/github`, {
      method: 'POST',
      headers,
      body: payload,
    });
    const second = await fetch(`${runtime.baseUrl}/webhooks/github`, {
      method: 'POST',
      headers,
      body: payload,
    });
    const firstBody = (await first.json()) as {
      ok: boolean;
      data: { accepted: boolean; duplicate: boolean };
    };
    const secondBody = (await second.json()) as {
      ok: boolean;
      data: { accepted: boolean; duplicate: boolean };
    };
    expect(firstBody.data.accepted).toBe(true);
    expect(secondBody.data.accepted).toBe(false);
    expect(secondBody.data.duplicate).toBe(true);

    const deliveries = await prisma.githubWebhookDelivery.findMany({ where: { deliveryId } });
    expect(deliveries.length).toBe(1);

    await runtime.close();
  });

  it('replaying an already Succeeded write request is idempotent and never regresses', async () => {
    const seed = await seedContext();
    const runtime = await startRuntime(seed);
    const requestId = `req-${randomUUID()}`;
    const commitResponse = await fetch(`${runtime.baseUrl}/knowledge-notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        connectionId: seed.connectionId,
        knowledgeDocumentId: KnowledgeDocumentIdSchema.parse(`kdoc_${randomUUID()}`),
        proposalId: `proposal-${randomUUID()}`,
        revision: 1,
        requestId,
        proposedPath: 'notes/idempotent.md',
        title: 'Idempotent',
        frontmatter: {},
        content: '# Idempotent\n\nAlready projected.',
        reason: 'integration test',
      }),
    });
    expect(commitResponse.status).toBe(200);

    const listed = await fetch(`${runtime.baseUrl}/knowledge-write-requests?limit=50`, {
      method: 'GET',
      headers: { authorization: 'Bearer test' },
    });
    const ledger = (await listed.json()) as {
      ok: boolean;
      data?: {
        writeRequests: Array<{ id: string; projectionStatus: string; projectionAttempts: number }>;
      };
    };
    const row = ledger.data?.writeRequests.find((r) => r.projectionStatus === 'Succeeded');
    expect(row).toBeDefined();
    const attemptsBefore = row!.projectionAttempts;

    const first = await fetch(`${runtime.baseUrl}/knowledge-write-requests/${row!.id}/replay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const second = await fetch(`${runtime.baseUrl}/knowledge-write-requests/${row!.id}/replay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    const firstBody = (await first.json()) as { ok: boolean; data?: { status: string } };
    const secondBody = (await second.json()) as { ok: boolean; data?: { status: string } };
    expect(firstBody.data?.status).toBe('Succeeded');
    expect(secondBody.data?.status).toBe('Succeeded');

    // Idempotent: already Succeeded replay is a no-op — attempts never increment.
    const after = await runtime.writeRequestRepo.findByIdForIdentity(seed.identityId, row!.id);
    expect(after?.projectionStatus).toBe('Succeeded');
    expect(after?.projectionAttempts).toBe(attemptsBefore);

    await runtime.close();
  });

  it('replays a Pending write request through the real route and advances ledger, projection and HTTP DTO', async () => {
    const seed = await seedContext();
    const runtime = await startRuntime(seed);
    const writeRequestId = await seedPendingWriteRequest(runtime, seed);

    // Ledger and HTTP DTO both start at Committed + Pending with no attempts.
    let rows = await listLedgerDto(runtime);
    let dto = rows.find((r) => r.id === writeRequestId);
    expect(dto?.status).toBe('Committed');
    expect(dto?.projectionStatus).toBe('Pending');
    expect(dto?.projectionAttempts).toBe(0);
    expect(dto?.projectedAt).toBeNull();

    // Real replay route drives the Pending record to Succeeded.
    const replayResponse = await fetch(
      `${runtime.baseUrl}/knowledge-write-requests/${writeRequestId}/replay`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    );
    const replayBody = (await replayResponse.json()) as {
      ok: boolean;
      data?: { status: string };
    };
    expect(replayBody.ok).toBe(true);
    expect(replayBody.data?.status).toBe('Succeeded');

    // Ledger advanced, projection row written, HTTP DTO reflects both.
    const after = await runtime.writeRequestRepo.findByIdForIdentity(
      seed.identityId,
      writeRequestId,
    );
    expect(after?.projectionStatus).toBe('Succeeded');
    expect(after?.projectionErrorCode).toBeNull();
    expect(after?.projectionAttempts).toBe(1);
    expect(after?.projectedAt).not.toBeNull();

    const projected = await prisma.knowledgeNoteProjection.findFirst({
      where: { bindingId: seed.connectionId, relativePath: 'notes/pending-replay.md' },
    });
    expect(projected).not.toBeNull();
    expect(projected?.commitSha).toBe('c'.repeat(40));

    rows = await listLedgerDto(runtime);
    dto = rows.find((r) => r.id === writeRequestId);
    expect(dto?.projectionStatus).toBe('Succeeded');
    expect(dto?.projectionAttempts).toBe(1);
    expect(dto?.projectedAt).not.toBeNull();

    await runtime.close();
  });

  it('drives reconcileNow to refresh a Failed projection into Succeeded with projection row, ledger and HTTP DTO', async () => {
    const seed = await seedContext();
    const runtime = await startRuntime(seed);
    // A real commit whose immediate projection fails leaves the write request
    // Committed + Failed (attempts 1).
    runtime.projectionRepo.failNextProjection();
    const requestId = `req-${randomUUID()}`;
    const commitResponse = await fetch(`${runtime.baseUrl}/knowledge-notes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        connectionId: seed.connectionId,
        knowledgeDocumentId: KnowledgeDocumentIdSchema.parse(`kdoc_${randomUUID()}`),
        proposalId: `proposal-${randomUUID()}`,
        revision: 1,
        requestId,
        proposedPath: 'notes/refreshed-by-reconcile.md',
        title: 'Refreshed by reconcile',
        frontmatter: {},
        content: '# Refreshed by reconcile\n\nRefresh me.',
        reason: 'integration test',
      }),
    });
    expect(commitResponse.status).toBe(200);
    const rows = await runtime.writeRequestRepo.listForIdentity(seed.identityId, { limit: 50 });
    const target = rows.find((r) => r.projectionStatus === 'Failed');
    expect(target).toBeDefined();
    expect(target?.projectionErrorCode).toBe('PROJECTION_FAILED');
    expect(target?.projectionAttempts).toBe(1);

    // Explicit reconciliation refresh driven through the projection service.
    await runtime.projectionService.reconcileNow();

    // Ledger: the reconciliation applied the full snapshot and bound the write
    // request to a Succeeded projection by commit SHA.
    const after = await runtime.writeRequestRepo.findByIdForIdentity(seed.identityId, target!.id);
    expect(after?.projectionStatus).toBe('Succeeded');
    expect(after?.projectionErrorCode).toBeNull();
    expect(after?.projectionAttempts).toBe(2);
    expect(after?.projectedAt).not.toBeNull();

    // Projection row: reconcile applied the full remote snapshot.
    const projected = await prisma.knowledgeNoteProjection.findFirst({
      where: { bindingId: seed.connectionId, relativePath: 'notes/webhook.md' },
    });
    expect(projected).not.toBeNull();

    // HTTP DTO reflects the reconciled Succeeded state.
    const dtoRows = await listLedgerDto(runtime);
    const dto = dtoRows.find((r) => r.id === target!.id);
    expect(dto?.projectionStatus).toBe('Succeeded');
    expect(dto?.projectionErrorCode).toBeNull();
    expect(dto?.projectionAttempts).toBe(2);
    expect(dto?.projectedAt).not.toBeNull();

    await runtime.close();
  });

  it('concurrent service replays on the same Pending record: exactly one transition takes effect and Succeeded never regresses', async () => {
    const seed = await seedContext();
    const runtime = await startRuntime(seed);
    const writeRequestId = await seedPendingWriteRequest(runtime, seed, 'notes/race.md');

    // Replay A acquires the connection lease and suspends inside applyChanges
    // (a real barrier), while replay B is fired concurrently on the SAME
    // non-terminal (Pending) row. Both are driven by the projection service.
    const releaseGate = runtime.projectionRepo.setApplyChangesGate();
    const replayA = runtime.projectionService.replayWriteRequestProjection(
      seed.identityId,
      writeRequestId,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    const replayB = runtime.projectionService.replayWriteRequestProjection(
      seed.identityId,
      writeRequestId,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    releaseGate();

    const resultA = await replayA;
    const resultB = await replayB;
    expect(resultA.ok).toBe(true);
    expect(resultA.data?.status).toBe('Succeeded');
    // The loser is rejected by the connection lease — it never reaches the
    // ledger, so exactly one transition takes effect.
    expect(resultB.ok).toBe(false);
    expect(resultB.error.code).toBe('CONFLICT');

    const after = await runtime.writeRequestRepo.findByIdForIdentity(
      seed.identityId,
      writeRequestId,
    );
    expect(after?.projectionStatus).toBe('Succeeded');
    expect(after?.projectionErrorCode).toBeNull();
    // Exactly one transition incremented the attempt counter.
    expect(after?.projectionAttempts).toBe(1);
    expect(after?.projectedAt).not.toBeNull();

    const projected = await prisma.knowledgeNoteProjection.findFirst({
      where: { bindingId: seed.connectionId, relativePath: 'notes/race.md' },
    });
    expect(projected).not.toBeNull();

    const rows = await listLedgerDto(runtime);
    const dto = rows.find((r) => r.id === writeRequestId);
    expect(dto?.projectionStatus).toBe('Succeeded');
    expect(dto?.projectionErrorCode).toBeNull();
    expect(dto?.projectionAttempts).toBe(1);

    await runtime.close();
  });

  it('out-of-order service-driven Failed then Succeeded converges without regressing the terminal state', async () => {
    const seed = await seedContext();
    const runtime = await startRuntime(seed);
    const writeRequestId = await seedPendingWriteRequest(runtime, seed, 'notes/out-of-order.md');

    // First service replay lands a real projection failure (applyChanges throws
    // inside the real service path) → the shared Pending row becomes Failed.
    runtime.projectionRepo.failNextProjection();
    const failedReplay = await runtime.projectionService.replayWriteRequestProjection(
      seed.identityId,
      writeRequestId,
    );
    expect(failedReplay.ok).toBe(false);
    const afterFail = await runtime.writeRequestRepo.findByIdForIdentity(
      seed.identityId,
      writeRequestId,
    );
    expect(afterFail?.projectionStatus).toBe('Failed');
    expect(afterFail?.projectionErrorCode).toBe('PROJECTION_REPLAY_FAILED');
    expect(afterFail?.projectionAttempts).toBe(1);

    // A second service replay (no failure armed) lands Succeeded on the same
    // row. The terminal Succeeded state must not be regressed by the earlier
    // Failed.
    const succeededReplay = await runtime.projectionService.replayWriteRequestProjection(
      seed.identityId,
      writeRequestId,
    );
    expect(succeededReplay.ok).toBe(true);
    expect(succeededReplay.data?.status).toBe('Succeeded');

    const after = await runtime.writeRequestRepo.findByIdForIdentity(
      seed.identityId,
      writeRequestId,
    );
    expect(after?.projectionStatus).toBe('Succeeded');
    expect(after?.projectionErrorCode).toBeNull();
    expect(after?.projectionAttempts).toBe(2);
    expect(after?.projectedAt).not.toBeNull();

    const projected = await prisma.knowledgeNoteProjection.findFirst({
      where: { bindingId: seed.connectionId, relativePath: 'notes/out-of-order.md' },
    });
    expect(projected).not.toBeNull();

    const rows = await listLedgerDto(runtime);
    const dto = rows.find((r) => r.id === writeRequestId);
    expect(dto?.projectionStatus).toBe('Succeeded');
    expect(dto?.projectionErrorCode).toBeNull();
    expect(dto?.projectionAttempts).toBe(2);

    await runtime.close();
  });

  it('a late service-driven Failed on the same Pending record is written to the ledger layer and rejected by the terminal guard after Succeeded', async () => {
    const seed = await seedContext();
    const runtime = await startRuntime(seed);
    const writeRequestId = await seedPendingWriteRequest(runtime, seed, 'notes/late-failed.md');

    // Barrier: replay B reads the write request while it is still Pending (past
    // the Succeeded early return) and suspends at the connection lookup, which
    // happens before the lease acquisition — so B holds no lease yet.
    const releaseConnectionRead = runtime.connectionRepo.gateNextConnectionRead();
    const replayB = runtime.projectionService.replayWriteRequestProjection(
      seed.identityId,
      writeRequestId,
    );
    await runtime.connectionRepo.waitUntilGated();

    // Replay A runs on the same Pending record and forms Succeeded through the
    // real service path (projection row + ledger + attempts + DTO).
    const replayA = await runtime.projectionService.replayWriteRequestProjection(
      seed.identityId,
      writeRequestId,
    );
    expect(replayA.ok).toBe(true);
    expect(replayA.data?.status).toBe('Succeeded');

    // Arm a real projection exception for B's applyChanges, then let B acquire
    // the (now free) connection lease, execute the stale Pending projection with
    // a real crash, and walk markProjectionFailed. The Failed write reaches the
    // ledger layer (real DB) and is rejected by the projectionStatus != Succeeded
    // guard, so the service reports SERVICE_UNAVAILABLE and the terminal state
    // must not regress.
    runtime.projectionRepo.failNextProjection();
    releaseConnectionRead();
    const resultB = await replayB;
    expect(resultB.ok).toBe(false);
    expect(resultB.error.code).toBe('SERVICE_UNAVAILABLE');

    // Ledger row never regressed: still Succeeded, no error, single attempt.
    const after = await runtime.writeRequestRepo.findByIdForIdentity(
      seed.identityId,
      writeRequestId,
    );
    expect(after?.projectionStatus).toBe('Succeeded');
    expect(after?.projectionErrorCode).toBeNull();
    expect(after?.projectionAttempts).toBe(1);
    expect(after?.projectedAt).not.toBeNull();

    // Projection row written by A is still intact.
    const projected = await prisma.knowledgeNoteProjection.findFirst({
      where: { bindingId: seed.connectionId, relativePath: 'notes/late-failed.md' },
    });
    expect(projected).not.toBeNull();
    expect(projected?.commitSha).toBe('c'.repeat(40));

    // HTTP DTO still reports Succeeded with a single attempt.
    const rows = await listLedgerDto(runtime);
    const dto = rows.find((r) => r.id === writeRequestId);
    expect(dto?.projectionStatus).toBe('Succeeded');
    expect(dto?.projectionErrorCode).toBeNull();
    expect(dto?.projectionAttempts).toBe(1);
    expect(dto?.projectedAt).not.toBeNull();

    await runtime.close();
  });

  it('W7: unified projection timeline + audited replay via module API', async () => {
    const seed = await seedContext();
    const runtime = await startRuntime(seed);
    const writeRequestId = await seedPendingWriteRequest(runtime, seed, 'notes/w7-timeline.md');

    // Arm a real projection failure so the timeline exposes a replayable entry.
    runtime.projectionRepo.failNextProjection();
    const failedReplay = await runtime.projectionService.replayWriteRequestProjection(
      seed.identityId,
      writeRequestId,
    );
    expect(failedReplay.ok).toBe(false);

    const ctx = { identityId: seed.identityId } as never;
    const timelineRes = await runtime.module.api.queryKnowledgeTimeline(ctx);
    expect(timelineRes.ok).toBe(true);
    const entries: OperationTimelineEntry[] = timelineRes.ok ? timelineRes.data : [];
    const entry = entries.find((e) => e.operationId === writeRequestId);
    expect(entry).toBeDefined();
    expect(entry.source).toBe('knowledge-projection');
    expect(entry.status).toBe('failed');
    expect(entry.attempts).toBeGreaterThanOrEqual(1);
    expect(entry.replayable).toBe(true);

    // P1-3: the query wrote a timeline_query audit with marker + filters + resultCount.
    const queryAuditRows = await prisma.operationAuditLog.findMany({
      where: {
        actorIdentityId: seed.identityId,
        action: 'timeline_query',
        source: 'knowledge-projection',
      },
    });
    expect(queryAuditRows.length).toBeGreaterThanOrEqual(1);
    const queryAudit = queryAuditRows[0];
    expect(queryAudit.operationId).toBe('*timeline-query*');
    const queryDetails = JSON.parse(queryAudit.details as string);
    expect(queryDetails.resultCount).toBeGreaterThanOrEqual(1);
    expect(typeof queryDetails.filters).toBe('object');

    // Successful replay advances the timeline to succeeded and records audit.
    const replayRes = await runtime.module.api.replayKnowledgeWriteRequestProjection(
      ctx,
      writeRequestId,
    );
    expect(replayRes.ok).toBe(true);
    expect(replayRes.data?.status).toBe('Succeeded');

    const auditRes = await runtime.module.api.getOperationAudit(ctx);
    expect(auditRes.ok).toBe(true);
    const audit: OperationAuditRecord[] = auditRes.ok ? auditRes.data : [];
    const replayAudit = audit.find(
      (a) =>
        a.operationId === writeRequestId &&
        a.action === 'replay' &&
        a.source === 'knowledge-projection',
    );
    expect(replayAudit).toBeDefined();
    expect(replayAudit.actorIdentityId).toBe(seed.identityId);

    const timelineAfter = await runtime.module.api.queryKnowledgeTimeline(ctx);
    const entryAfter = (timelineAfter.ok ? timelineAfter.data : []).find(
      (e) => e.operationId === writeRequestId,
    );
    expect(entryAfter.status).toBe('succeeded');
    expect(entryAfter.replayable).toBe(false);

    await runtime.close();
  });

  it('P1-4: knowledge replay fails closed when auditRepository is missing (no projection, no state change)', async () => {
    const seed = await seedContext();
    const runtime = await startRuntime(seed);
    const writeRequestId = await seedPendingWriteRequest(runtime, seed, 'notes/audit-missing.md');

    const moduleWithoutAudit = createRepositoryModule({
      knowledgeRepositoryConnectionService: null,
      knowledgeRepositoryProjectionService: runtime.projectionService,
      knowledgeNoteCommitService: null,
    });

    const ctx = { identityId: seed.identityId } as never;
    const replayRes = await moduleWithoutAudit.api.replayKnowledgeWriteRequestProjection(
      ctx,
      writeRequestId,
    );
    expect(replayRes.ok).toBe(false);
    if (!replayRes.ok) {
      expect(replayRes.error.code).toBe('FAIL_CLOSED');
    }

    // No external projection ran and durable ledger state is unchanged.
    const after = await runtime.writeRequestRepo.findByIdForIdentity(
      seed.identityId,
      writeRequestId,
    );
    expect(after?.projectionStatus).toBe('Pending');
    expect(after?.projectionAttempts).toBe(0);

    const projections = await runtime.projectionRepo.listByIdentity(seed.identityId, { limit: 10 });
    expect(projections.find((p) => p.relativePath === 'notes/audit-missing.md')).toBeUndefined();

    moduleWithoutAudit.dispose();
    await runtime.close();
  });

  it('P1-4: knowledge replay audit write failure fails closed before any external projection (audit-first)', async () => {
    const seed = await seedContext();
    const runtime = await startRuntime(seed);
    const writeRequestId = await seedPendingWriteRequest(
      runtime,
      seed,
      'notes/audit-write-fail.md',
    );

    const failingAudit = {
      record: async () => {
        throw new Error('audit write failure injected');
      },
      listByActor: async () => [],
    };

    const moduleWithFailingAudit = createRepositoryModule({
      knowledgeRepositoryConnectionService: null,
      knowledgeRepositoryProjectionService: runtime.projectionService,
      knowledgeNoteCommitService: null,
      auditRepository: failingAudit as never,
    });

    const ctx = { identityId: seed.identityId } as never;
    const replayRes = await moduleWithFailingAudit.api.replayKnowledgeWriteRequestProjection(
      ctx,
      writeRequestId,
    );
    expect(replayRes.ok).toBe(false);

    // Audit-first: the external projection must NOT have run — durable state unchanged.
    const after = await runtime.writeRequestRepo.findByIdForIdentity(
      seed.identityId,
      writeRequestId,
    );
    expect(after?.projectionStatus).toBe('Pending');
    expect(after?.projectionAttempts).toBe(0);

    const projections = await runtime.projectionRepo.listByIdentity(seed.identityId, { limit: 10 });
    expect(projections.find((p) => p.relativePath === 'notes/audit-write-fail.md')).toBeUndefined();

    moduleWithFailingAudit.dispose();
    await runtime.close();
  });

  it('P1-3: knowledge timeline query fails closed when audit write fails', async () => {
    const seed = await seedContext();
    const runtime = await startRuntime(seed);

    const failingAudit = {
      record: async () => {
        throw new Error('audit write failure injected');
      },
      listByActor: async () => [],
    };

    const moduleWithFailingAudit = createRepositoryModule({
      knowledgeRepositoryConnectionService: null,
      knowledgeRepositoryProjectionService: runtime.projectionService,
      knowledgeNoteCommitService: null,
      auditRepository: failingAudit as never,
    });

    const ctx = { identityId: seed.identityId } as never;
    await expect(moduleWithFailingAudit.api.queryKnowledgeTimeline(ctx)).rejects.toThrow(
      'audit write failure injected',
    );

    moduleWithFailingAudit.dispose();
    await runtime.close();
  });

  it('P1-5: knowledge replay drives the real projection path and emits unified metric events', async () => {
    const seed = await seedContext();
    const recorder = createUnifiedOperationMetricsRecorder();
    const runtime = await startRuntime(seed, { metrics: recorder });
    const writeRequestId = await seedPendingWriteRequest(runtime, seed, 'notes/metrics-replay.md');

    const replay = await runtime.projectionService.replayWriteRequestProjection(
      seed.identityId,
      writeRequestId,
    );
    expect(replay.ok).toBe(true);

    const snap = recorder.snapshot();
    expect(snap['memoflow.knowledge.outbox.claimed']).toBe(1);
    expect(snap['memoflow.knowledge.outbox.succeeded']).toBe(1);
    expect(snap['memoflow.knowledge.worker.completed']).toBe(1);

    await runtime.close();
  });

  it('P1-5: knowledge replay failure emits failed + worker.failed, and a retry emits retried', async () => {
    const seed = await seedContext();
    const recorder = createUnifiedOperationMetricsRecorder();
    const runtime = await startRuntime(seed, { metrics: recorder });
    const writeRequestId = await seedPendingWriteRequest(runtime, seed, 'notes/metrics-fail.md');

    runtime.projectionRepo.failNextProjection();
    const replay = await runtime.projectionService.replayWriteRequestProjection(
      seed.identityId,
      writeRequestId,
    );
    expect(replay.ok).toBe(false);

    // First replay of a Pending write request is a failure, not a retry.
    const snap = recorder.snapshot();
    expect(snap['memoflow.knowledge.outbox.failed']).toBe(1);
    expect(snap['memoflow.knowledge.worker.failed']).toBe(1);
    expect(snap['memoflow.knowledge.outbox.retried']).toBeUndefined();

    // A second replay of the same (now Failed) write request is a retry.
    const retried = await runtime.projectionService.replayWriteRequestProjection(
      seed.identityId,
      writeRequestId,
    );
    expect(retried.ok).toBe(true);
    const snap2 = recorder.snapshot();
    expect(snap2['memoflow.knowledge.outbox.retried']).toBe(1);
    expect(snap2['memoflow.knowledge.outbox.succeeded']).toBe(1);
    expect(snap2['memoflow.knowledge.worker.completed']).toBe(1);

    await runtime.close();
  });
});
