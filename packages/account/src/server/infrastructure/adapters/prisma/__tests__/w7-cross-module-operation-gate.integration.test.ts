import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createSystemClock, createTimeContext } from '@memoflow/time';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { prisma } from '@memoflow/database';
import {
  OperationTimelineEntrySchema,
  OperationSourceSchema,
} from '@memoflow/contracts/operations';
import { buildIdempotencyKeyString } from '@memoflow/contracts/reliable-messaging';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createNotificationPrismaModule } from '@memoflow/notification/server';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createSchedulePrismaModule } from '@memoflow/schedule/server';
import { createAccountPrismaModule } from '../../../prisma';
import { cleanAllTables } from '@memoflow/test-utils/setup/database';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createRepositoryPrismaModule } from '@memoflow/repository/server';
// eslint-disable-next-line @nx/enforce-module-boundaries
import type { IGitHubAppClient } from '@memoflow/repository/server';

/**
 * W7 跨模块回归门禁 (C1)：
 * 统一 OperationTimelineEntry 契约在 Notification / Schedule rebuild /
 * Account closure / Knowledge projection 四个 durable operation owner 的真实 DB 数据上一致成立；
 * 故障注入（dead-letter / failed）后 replay 恢复状态，并把审计写入同一张共享审计表。
 */
describe('W7 cross-module operation gate (real DB)', () => {
  let identityId: string;

  beforeEach(async () => {
    await cleanAllTables(prisma);
    identityId = randomUUID();
    await prisma.cloudAuthUser.create({
      data: {
        id: identityId,
        email: `gate-${identityId}@example.test`,
        name: 'W7 Gate',
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
  });

  afterAll(async () => {
    await cleanAllTables(prisma);
    await prisma.$disconnect();
  });

  it('notification + schedule-rebuild + account-closure + knowledge expose schema-conformant timeline, replay recover faults, and audit lands in the shared table', async () => {
    // ── Fault injection: seed failed/dead operations across modules ──
    const now = new Date();

    // Notification dead letter
    const notificationOp = `notification-dead-${randomUUID()}`;
    const notificationId = `notif-${randomUUID()}`;
    await prisma.notification.create({
      data: {
        id: notificationId,
        identityId,
        type: 'Reminder',
        category: 'Reminder',
        workflowKey: 'reliability.w7-gate',
        topic: 'reliability',
        idempotencyKey: `seed:${notificationId}`,
        title: 'W7 Gate Notif',
        content: 'gate',
        importance: 'Moderate',
        urgency: 'Medium',
        createdAt: now,
        updatedAt: now,
      },
    });
    const notificationRow = await prisma.notification.findUniqueOrThrow({
      where: { id: notificationId },
    });
    const notifOccurrenceKey = `${notificationRow.id}:in-app`;
    const notifIdempotencyKey = buildIdempotencyKeyString({
      identityId,
      source: 'notification',
      occurrenceKey: notifOccurrenceKey,
    });
    await prisma.notificationDispatchOutbox.create({
      data: {
        id: notificationOp,
        identityId,
        notificationId: notificationRow.id,
        source: 'notification',
        occurrenceKey: notifOccurrenceKey,
        channel: 'in-app',
        payloadJson: '{}',
        idempotencyKey: notifIdempotencyKey,
        status: 'dead_letter',
        attempt: 3,
        lastError: 'deliverer timeout',
        deadLetterAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Schedule rebuild failed
    const scheduleOp = `rebuild-failed-${randomUUID()}`;
    await prisma.scheduleRebuildOutbox.create({
      data: {
        id: scheduleOp,
        identityId,
        scheduleId: null,
        startTime: new Date(1000),
        endTime: new Date(2000),
        sourceRevision: 2,
        idempotencyKey: `gate:rebuild:${scheduleOp}`,
        status: 'failed',
        attempts: 5,
        lastError: 'cache rebuild exceeded max attempts',
        createdAt: now,
        processedAt: now,
      },
    });

    // Account closure failed
    const accountOp = `closure-failed-${randomUUID()}`;
    await prisma.accountClosureOperation.create({
      data: {
        id: accountOp,
        identityId,
        idempotencyKey: `gate:closure:${accountOp}`,
        phase: 'failed',
        status: 'failed',
        attempts: 5,
        version: 1,
        lastError: 'revocation timed out',
        deadLetterAt: now,
        createdAt: now,
        updatedAt: now,
        finishedAt: now,
      },
    });

    // Knowledge projection failed write request (needs the current Space -> RemoteBinding owner chain)
    const knowledgeConnectionId = `KnowledgeRemoteBindingId_${randomUUID()}`;
    const knowledgeSpaceId = `KnowledgeSpaceId_${randomUUID()}`;
    await prisma.knowledgeSpace.create({ data: { id: knowledgeSpaceId } });
    await prisma.knowledgeRemoteBinding.create({
      data: {
        id: knowledgeConnectionId,
        knowledgeSpaceId,
        identityId,
        provider: 'GitHub',
        installationId: `install-${identityId}`,
        repositoryId: `gh-repo-${identityId}`,
        repositoryFullNameSnapshot: `user/knowledge-${identityId}`,
        connectedAt: now,
      },
    });
    const knowledgeOp = `knowledge-proj-${randomUUID()}`;
    const knowledgeCommitSha = 'c'.repeat(40);
    await prisma.knowledgeWriteRequest.create({
      data: {
        id: knowledgeOp,
        identityId,
        bindingId: knowledgeConnectionId,
        knowledgeDocumentId: `kdoc_${randomUUID()}`,
        requestId: `gate-request-${randomUUID()}`,
        requestHash: createHash('sha256').update(knowledgeOp).digest('hex'),
        relativePath: 'notes/w7-gate.md',
        status: 'Committed',
        commitSha: knowledgeCommitSha,
        blobSha: 'b'.repeat(40),
        markdownContent: '# W7 Gate\n\nNote.',
        projectionStatus: 'Failed',
        projectionErrorCode: 'PROJECTION_REPLAY_FAILED',
        projectionErrorMessage: 'webhook timeout',
        projectionAttempts: 3,
        createdAt: now,
        updatedAt: now,
      },
    });

    // ── Wire the four current durable operation owners ──
    const notifModule = createNotificationPrismaModule(prisma, {
      closureChecker: async () => false,
      userTimeContextPort: {
        getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
      },
    });
    const schedule = createSchedulePrismaModule(prisma, {
      wireDeliveryLogConsumer: false,
      leaseCoordinator: {
        async execute(_leaseKey, task) {
          return { acquired: true, value: await task({ ensureHeld: async () => undefined }) };
        },
      },
    });
    const account = createAccountPrismaModule(prisma, {
      clock: createSystemClock(),
      userTimeContextPort: {
        getUserTimeContext: async () => createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 }),
      },
      cloudAuth: {
        revokeAllSessions: async () => ({ revokedSessions: 0 }),
        deleteUserData: async () => ({ deletedRecords: 0 }),
      },
    });
    const githubAppClient = createMockGithubAppClient(knowledgeCommitSha);
    const repository = createRepositoryPrismaModule(prisma, {
      closureChecker: async () => false,
      githubApp: {
        appId: 'gate-app',
        appSlug: 'memoflow-gate',
        privateKey: 'gate-private-key',
        webhookSecret: 'gate-webhook-secret',
        client: githubAppClient,
      },
    });

    const ctx = { identityId } as never;

    // ── Unified timeline: each entry is schema-conformant with W7 fields ──
    const notifTimeline = await notifModule.operations.getOperationTimeline(identityId);
    const scheduleTimeline = await schedule.api.queryRebuildTimeline(ctx);
    const accountTimeline = await account.api.queryClosureTimeline(ctx);
    const knowledgeTimeline = await repository.api.queryKnowledgeTimeline(ctx);

    for (const res of [
      notifTimeline,
      scheduleTimeline,
      accountTimeline,
      knowledgeTimeline,
    ]) {
      expect(res.ok).toBe(true);
    }
    const all = [
      ...(notifTimeline.ok ? (notifTimeline.data as any[]) : []),
      ...(scheduleTimeline.ok ? (scheduleTimeline.data as any[]) : []),
      ...(accountTimeline.ok ? (accountTimeline.data as any[]) : []),
      ...(knowledgeTimeline.ok ? (knowledgeTimeline.data as any[]) : []),
    ];
    expect(all.length).toBe(4);
    for (const entry of all) {
      expect(OperationTimelineEntrySchema.safeParse(entry).success).toBe(true);
      expect(OperationSourceSchema.safeParse(entry.source).success).toBe(true);
      expect(typeof entry.replayable).toBe('boolean');
      expect(typeof entry.updatedAt).toBe('string');
    }
    expect(all.map((e) => e.source).sort()).toEqual([
      'account-closure',
      'knowledge-projection',
      'notification',
      'schedule-rebuild',
    ]);

    // ── Fault recovery: unauthorized identity rejected for every module ──
    const otherIdentity = randomUUID();
    const otherCtx = { identityId: otherIdentity } as never;
    expect((await notifModule.operations.replayDeadLetter(notificationOp, otherIdentity)).ok).toBe(false);
    expect((await schedule.api.replayRebuildOutbox(scheduleOp, otherCtx)).ok).toBe(false);
    expect((await account.api.replayClosure(accountOp, otherCtx)).ok).toBe(false);
    expect(
      (await repository.api.replayKnowledgeWriteRequestProjection(otherCtx, knowledgeOp)).ok,
    ).toBe(false);

    // ── Fault recovery: authorized replay advances state for every module ──
    const notifReplay = await notifModule.operations.replayDeadLetter(notificationOp, identityId);
    expect(notifReplay.ok).toBe(true);
    expect((notifReplay.data as any).status).toBe('retryable');

    const scheduleReplay = await schedule.api.replayRebuildOutbox(scheduleOp, ctx);
    expect(scheduleReplay.ok).toBe(true);
    expect((scheduleReplay.data as any).status).toBe('pending');

    const accountReplay = await account.api.replayClosure(accountOp, ctx);
    expect(accountReplay.ok).toBe(true);
    expect((accountReplay.data as any).status).toBe('running');

    const knowledgeReplay = await repository.api.replayKnowledgeWriteRequestProjection(
      ctx,
      knowledgeOp,
    );
    expect(knowledgeReplay.ok).toBe(true);
    expect((knowledgeReplay.data as any).status).toBe('Succeeded');

    // ── Audit: all four replay actions landed in the SAME shared table ──
    const auditRows = await prisma.operationAuditLog.findMany({
      where: { actorIdentityId: identityId, action: 'replay' },
    });
    const auditedOperations = auditRows.map((r) => r.operationId).sort();
    // Knowledge is audit-first: each replay writes an intent record + an outcome
    // record, so its operation appears twice; the other three write once each.
    expect(auditedOperations).toEqual(
      [accountOp, knowledgeOp, knowledgeOp, notificationOp, scheduleOp].sort(),
    );
    const knowledgeAudits = auditRows
      .filter((r) => r.operationId === knowledgeOp)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    expect(knowledgeAudits.length).toBe(2);
    expect(knowledgeAudits[0].details).toContain('replay intent');
    expect(knowledgeAudits[1].details).toContain('status ->');
    const sources = auditRows.map((r) => r.source).sort();
    expect(sources).toEqual([
      'account-closure',
      'knowledge-projection',
      'knowledge-projection',
      'notification',
      'schedule-rebuild',
    ]);

    // Actor-scoped audit: another identity sees none of our records.
    const otherAudit = await notifModule.operations.getOperationAudit(otherIdentity);
    expect(otherAudit.ok).toBe(true);
    expect((otherAudit.data as any[]).some((a) => a.actorIdentityId === identityId)).toBe(false);

    // ── Cleanup ──
    notifModule.dispose();
    schedule.dispose();
    account.dispose();
    repository.dispose();
  });
});

function createMockGithubAppClient(commitSha: string): IGitHubAppClient {
  return {
    getInstallationInventory: async () => ({
      installationId: `install-${randomUUID()}`,
      accountId: '42',
      contentsPermission: 'write',
      suspended: false,
      repositories: [],
    }),
    getRepositorySnapshot: async () => ({
      repositoryId: 'repo',
      defaultBranch: 'main',
      empty: false,
      headSha: commitSha,
    }),
    getMarkdownChanges: async () => ({
      commitSha,
      requiresFullSnapshot: false,
      changes: [],
    }),
    getFullMarkdownSnapshot: async () => ({
      commitSha,
      files: [],
    }),
    getBlob: async () => ({ blobSha: 'b'.repeat(40), byteSize: 1, bytes: new Uint8Array() }),
    createFileCommit: async () => ({ commitSha, blobSha: 'b'.repeat(40) }),
    createInstallationAccessToken: async () => ({
      token: 'gate-token',
      expiresAt: 1_750_000_000_000,
    }),
  };
}
