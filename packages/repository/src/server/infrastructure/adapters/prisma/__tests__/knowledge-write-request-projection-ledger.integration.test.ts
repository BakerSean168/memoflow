import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import express from 'express';
import type { RequestHandler } from 'express';
import { prisma } from '@memoflow/database';

import type {
  GitHubAppInstallationInventory,
  GitHubMarkdownChanges,
  IGitHubAppClient,
} from '../../../../application/ports/github-app-client.port';

import { KnowledgeDocumentIdSchema } from '@memoflow/repository-contracts';
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
import { PrismaOperationAuditRepository } from '@memoflow/patterns/operations';

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
      contentsPermission: 'read',
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
    createInstallationAccessToken: async () => ({ token: 'token', expiresAt: 1_750_000_000_000 }),
  };
}

interface TestRuntime {
  server: Server;
  baseUrl: string;
  projectionRepo: KnowledgeNoteProjectionPrismaRepository;
  connectionRepo: KnowledgeRemoteBindingPrismaRepository;
  module: ReturnType<typeof createRepositoryModule>;
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
  const connectionRepo = new KnowledgeRemoteBindingPrismaRepository(prisma);
  const observationRepo = new RemoteRepositoryObservationPrismaRepository(prisma);
  const historyFenceRepo = new RemoteHistoryFencePrismaRepository(prisma);
  const projectionCheckpointRepo = new KnowledgeProjectionCheckpointPrismaRepository(prisma);
  const projectionRepo = new KnowledgeNoteProjectionPrismaRepository(prisma);
  const documentIdentityRepo = new KnowledgeDocumentIdentityPrismaRepository(prisma);
  const writeRequestRepo = new KnowledgeWriteRequestPrismaRepository(prisma);
  const deliveryRepo = new GithubWebhookDeliveryPrismaRepository(prisma);
  const leaseRepo = new KnowledgeRepositoryLeasePrismaRepository(prisma);
  const commitSha = 'c'.repeat(40);
  const inventory: GitHubAppInstallationInventory = {
    installationId: seed.installationId,
    accountId: '42',
    contentsPermission: 'read',
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
        permissions: { admin: false, push: false, pull: true },
      },
    ],
  };
  const githubAppClient = createGithubAppClient(inventory, commitSha);
  const projectionEngine = new KnowledgeProjectionEngine({
    projectionRepository: projectionRepo,
    documentIdentityRepository: documentIdentityRepo,
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
 * Pending from a pre-read-only installation. Current tests never create GitHub commits;
 * they verify source-driven projection and preservation of historic receipts.
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

describe('Read-only knowledge projection and historic write receipts', () => {
  afterAll(async () => {
    await cleanAllTables(prisma);
    await prisma.$disconnect();
  });

  it('webhook push via real route (valid HMAC) refreshes Committed write requests to Succeeded by commit SHA', async () => {
    const seed = await seedContext();
    const runtime = await startRuntime(seed);
    const writeRequestId = await seedPendingWriteRequest(runtime, seed);
    await runtime.writeRequestRepo.markProjectionFailed(
      seed.identityId,
      writeRequestId,
      'OLD_FAILURE',
      'Historic failure',
      Date.now(),
    );
    const commitSha = 'c'.repeat(40);

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
    const row = await runtime.writeRequestRepo.findByIdForIdentity(seed.identityId, writeRequestId);
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

  it('keeps historical receipts queryable but cannot replay retired payloads into the current source', async () => {
    const seed = await seedContext();
    const runtime = await startRuntime(seed);
    try {
      const id = await seedPendingWriteRequest(runtime, seed, 'archive/old-branch.md');
      await prisma.knowledgeWriteRequest.update({
        where: { id },
        data: { commitSha: 'd'.repeat(40) },
      });
      await runtime.writeRequestRepo.markProjectionFailed(
        seed.identityId,
        id,
        'OLD_FAILURE',
        'Historic failure',
        Date.now(),
      );
      await runtime.projectionService.reconcileNow();
      expect(
        await runtime.projectionRepo.findByPath(seed.connectionId, 'notes/webhook.md'),
      ).toMatchObject({ markdownContent: '# Webhook' });
      expect(
        await runtime.projectionRepo.findByPath(seed.connectionId, 'archive/old-branch.md'),
      ).toBeNull();
      const context = { identityId: seed.identityId } as never;
      await expect(
        runtime.projectionService.replayWriteRequestProjection(seed.identityId, id),
      ).resolves.toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
      await expect(
        runtime.module.api.replayKnowledgeWriteRequestProjection(context, id),
      ).resolves.toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
      for (const path of ['/knowledge-notes', `/knowledge-write-requests/${id}/replay`]) {
        const response = await fetch(runtime.baseUrl + path, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        expect(response.status).toBe(404);
      }
      expect((await listLedgerDto(runtime)).find((entry) => entry.id === id)).toMatchObject({
        projectionStatus: 'Failed',
      });
      expect(
        await runtime.projectionRepo.findByPath(seed.connectionId, 'archive/old-branch.md'),
      ).toBeNull();
      const timeline = await runtime.module.api.queryKnowledgeTimeline(context);
      expect(timeline.ok).toBe(true);
      expect(timeline.ok && timeline.data.find((entry) => entry.operationId === id)).toMatchObject({
        status: 'failed',
        replayable: false,
      });
      expect(
        await prisma.operationAuditLog.count({
          where: {
            actorIdentityId: seed.identityId,
            action: 'timeline_query',
            source: 'knowledge-projection',
          },
        }),
      ).toBeGreaterThan(0);
    } finally {
      await runtime.close();
    }
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
      auditRepository: failingAudit as never,
    });

    const ctx = { identityId: seed.identityId } as never;
    await expect(moduleWithFailingAudit.api.queryKnowledgeTimeline(ctx)).rejects.toThrow(
      'audit write failure injected',
    );

    moduleWithFailingAudit.dispose();
    await runtime.close();
  });
});
