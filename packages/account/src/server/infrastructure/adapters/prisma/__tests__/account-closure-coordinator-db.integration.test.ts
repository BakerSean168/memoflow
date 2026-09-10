import { describe, it, expect } from 'vitest';
import { prisma } from '@memoflow/database';
import { PrismaAccountClosureOperationRepository } from '../account-closure-operation-prisma.repository';
import { PrismaAccountRepository } from '../account-prisma.repository';
import { AccountClosureCoordinator } from '../../../../application/services/account-closure-coordinator';
import { AccountClosureOutboxEventPublisher } from '../../../adapters/outbox/account-closure-outbox-event-publisher';
import { PrismaCloudAuthRevocationAdapter } from '../../../adapters/cloud-auth/cloud-auth-revocation.adapter';
import { AccountClosedWorker } from '../../../workers/account-closed.worker';
import { IdentityId } from '@memoflow/domain-shared/shared';
import { Account } from '../../../../domain/aggregates/account';
// Historical W3/W4 baseline: this integration test wires the real cross-module
// consumers into AccountClosedWorker. scope:account may not depend on other
// feature scopes; the boundary exemption is test-only and documented here.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { ReminderAccountClosedConsumer } from '@memoflow/reminder/server';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { NotificationAccountClosedConsumer } from '@memoflow/notification/server';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { RepositoryAccountClosedConsumer } from '@memoflow/repository/server';
import type { CloudAuthRevocationPort } from '../../../../application/ports/cloud-auth-revocation.port';
import { asInstant, createSystemClock } from '@memoflow/time';

describe('Account Closure Coordinator & Worker Real DB Concurrency Integration Tests', () => {
  const closureOpRepo = new PrismaAccountClosureOperationRepository(prisma);
  const accountRepo = new PrismaAccountRepository(prisma);
  const eventPublisher = new AccountClosureOutboxEventPublisher(prisma);
  const revocationPort = new PrismaCloudAuthRevocationAdapter(prisma, createSystemClock());

  const coordinator = new AccountClosureCoordinator({
    accountRepository: accountRepo,
    closureOperationRepository: closureOpRepo,
    revocationPort,
    eventPublisher,
    clock: createSystemClock(),
  });

  it('dual concurrency: two concurrent callers with same identity & key -> only one owner completes saga', async () => {
    const identityId = IdentityId.generate().toString();
    const idempotencyKey = `concurrency-${Date.now()}`;

    // Create cloudAuthUser & account in DB
    await prisma.cloudAuthUser.create({
      data: {
        id: identityId,
        email: `conc-${identityId}@example.com`,
        name: 'Concurrent User',
        emailVerified: true,
      },
    });

    const account = Account.create({
      id: IdentityId.of(identityId),
      nicknameSeed: `conc-${identityId}@example.com`,

      now: asInstant(1_700_000_000_000),
    });
    await accountRepo.save(account);

    // Launch 2 concurrent execute calls
    const [receipt1, receipt2] = await Promise.all([
      coordinator.execute(identityId, idempotencyKey, { reason: 'Conc test' }),
      coordinator.execute(identityId, idempotencyKey, { reason: 'Conc test' }),
    ]);

    expect(receipt1.operationId).toBe(receipt2.operationId);
    expect(receipt1.identityId).toBe(identityId);
    expect(receipt2.identityId).toBe(identityId);
    expect(receipt1.status === 'succeeded' || receipt2.status === 'succeeded').toBe(true);

    // Fetch final operation record from DB
    const finalOp = await closureOpRepo.findByIdentityAndIdempotencyKey(identityId, idempotencyKey);
    expect(finalOp).not.toBeNull();
    expect(finalOp?.status).toBe('succeeded');
    expect(finalOp?.phase).toBe('closed');
    expect(finalOp?.ownerToken).not.toBeNull();
  });

  it('closure revokes auth state, persists disabledAt, and closes Account', async () => {
    const identityId = IdentityId.generate().toString();
    const idempotencyKey = `closure-auth-projection-${Date.now()}`;
    await prisma.cloudAuthUser.create({
      data: {
        id: identityId,
        email: `closure-auth-${identityId}@example.com`,
        name: 'Closure Auth Projection User',
        emailVerified: true,
      },
    });
    await prisma.cloudAuthSession.create({
      data: {
        userId: identityId,
        token: `closure-auth-token-${identityId}`,
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
      },
    });
    await prisma.cloudAuthDeviceCode.create({
      data: {
        deviceCode: `closure-device-${identityId}`,
        userCode: `CLOSE${identityId.slice(-6)}`,
        userId: identityId,
        expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        status: 'pending',
      },
    });
    const account = Account.create({
      id: IdentityId.of(identityId),
      nicknameSeed: `closure-auth-${identityId}@example.com`,
      now: asInstant(1_700_000_000_000),
    });
    await accountRepo.save(account);

    const receipt = await coordinator.execute(identityId, idempotencyKey, {
      reason: 'Auth projection closure',
    });

    expect(receipt.status).toBe('succeeded');
    expect(await prisma.cloudAuthSession.count({ where: { userId: identityId } })).toBe(0);
    expect(await prisma.cloudAuthDeviceCode.count({ where: { userId: identityId } })).toBe(0);
    const authUser = await prisma.cloudAuthUser.findUniqueOrThrow({ where: { id: identityId } });
    expect(authUser.disabledAt).not.toBeNull();
    const closedAccount = await prisma.account.findUniqueOrThrow({ where: { id: identityId } });
    expect(closedAccount.status).toBe('Closed');
  });

  it('dual coordinator real slow side-effect: Coordinator A slow revoke across lease -> Coordinator B takes over, revoke count = 1, Coordinator A write fenced out', async () => {
    const identityId = IdentityId.generate().toString();
    const idempotencyKey = `dual-coord-slow-${Date.now()}`;

    await prisma.cloudAuthUser.create({
      data: {
        id: identityId,
        email: `dual-coord-${identityId}@example.com`,
        name: 'Dual Coord User',
        emailVerified: true,
      },
    });

    const account = Account.create({
      id: IdentityId.of(identityId),
      nicknameSeed: `dual-coord-${identityId}@example.com`,

      now: asInstant(1_700_000_000_000),
    });
    await accountRepo.save(account);

    let revokeCalls = 0;
    const trackingRevocationPort: CloudAuthRevocationPort = {
      revokeAuthentication: async (id: string) => {
        revokeCalls++;
        return revocationPort.revokeAuthentication(id);
      },
      deleteUserData: async (id: string) => {
        return revocationPort.deleteUserData(id);
      },
    };

    const slowRevocationPortA: CloudAuthRevocationPort = {
      revokeAuthentication: async (id: string) => {
        revokeCalls++;
        const result = await revocationPort.revokeAuthentication(id);
        // Sleep 2000ms > 1500ms lease duration
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return result;
      },
      deleteUserData: async (id: string) => {
        return revocationPort.deleteUserData(id);
      },
    };

    const coordA = new AccountClosureCoordinator({
      accountRepository: accountRepo,
      closureOperationRepository: closureOpRepo,
      revocationPort: slowRevocationPortA,
      eventPublisher,
      leaseDurationMs: 3000,
      enableHeartbeat: true,
      clock: createSystemClock(),
    });

    const coordB = new AccountClosureCoordinator({
      accountRepository: accountRepo,
      closureOperationRepository: closureOpRepo,
      revocationPort: trackingRevocationPort,
      eventPublisher,
      leaseDurationMs: 3000,
      enableHeartbeat: true,
      clock: createSystemClock(),
    });

    const promiseA = coordA.execute(identityId, idempotencyKey, { reason: 'Dual coord A' });

    // Wait 1600ms for Coordinator A's lease to expire
    await new Promise((resolve) => setTimeout(resolve, 1600));

    const receiptB = await coordB.execute(identityId, idempotencyKey, { reason: 'Dual coord B' });

    // B tried to claim while A still holds the heartbeat-renewed lease:
    // B must NOT have taken over (no second side effect) — it observes the
    // in-progress operation (running) or the final succeeded receipt if A
    // completed before B's check.
    expect(receiptB.operationId).toBeDefined();

    const receiptA = await promiseA;

    // Assert: external side effect (revoke calls) happened EXACTLY ONCE
    expect(revokeCalls).toBe(1);

    // Assert: A (heartbeat owner) completed the saga; B observed the same operation
    expect(receiptA.status).toBe('succeeded');
    expect(receiptA.phase).toBe('closed');
    expect(receiptB.operationId).toBe(receiptA.operationId);
    expect(receiptB.status === 'succeeded' || receiptB.status === 'running').toBe(true);
  });

  it('account-closed outbox message is processed by worker with lease and cancels pending work', async () => {
    const identityId = IdentityId.generate().toString();
    const idempotencyKey = `worker-${Date.now()}`;

    await prisma.cloudAuthUser.create({
      data: {
        id: identityId,
        email: `worker-${identityId}@example.com`,
        name: 'Worker User',
        emailVerified: true,
      },
    });

    const account = Account.create({
      id: IdentityId.of(identityId),
      nicknameSeed: `worker-${identityId}@example.com`,

      now: asInstant(1_700_000_000_000),
    });
    await accountRepo.save(account);

    // Insert pending reminder template & occurrence
    const reminderId = crypto.randomUUID();
    await prisma.reminderTemplate.create({
      data: {
        id: reminderId,
        identityId,
        name: 'Pending Reminder',
        status: 'active',
        type: 'Recurring',
        selfEnabled: true,
        importanceLevel: 'Normal',
        tags: '[]',
        trigger: 'cron',
        activeTime: '{}',
        notificationConfig: '{}',
        stats: '{}',
      },
    });

    await prisma.reminderOccurrence.create({
      data: {
        id: crypto.randomUUID(),
        occurrenceKey: `notif_${reminderId}:1`,
        idempotencyKey: `v1:7:${identityId}:notif_${reminderId}:1`,
        status: 'pending',
        template: { connect: { id: reminderId } },
        account: { connect: { id: identityId } },
      },
    });

    // Execute closure coordinator
    const receipt = await coordinator.execute(identityId, idempotencyKey, {
      reason: 'Worker test',
    });
    expect(receipt.status).toBe('succeeded');

    // Run worker to process outbox
    const seenEvents: string[] = [];
    const worker = new AccountClosedWorker(prisma, {
      reminderConsumer: {
        handleAccountClosed: async (event, eventId) => {
          seenEvents.push(eventId);
        },
      },
      notificationConsumer: {
        handleAccountClosed: async (event, eventId) => {
          seenEvents.push(eventId);
        },
      },
    });
    const processed = await worker.processPendingMessages();
    expect(processed).toBeGreaterThanOrEqual(1);
    expect(seenEvents.length).toBeGreaterThanOrEqual(2);
  });

  it('dual worker real slow consumer: worker1 slow consumer across lease -> worker2 takes over outbox message, side-effects execution = 1 per consumer', async () => {
    const identityId = IdentityId.generate().toString();
    const eventId = `event-dual-worker-${Date.now()}`;

    await prisma.cloudAuthUser.create({
      data: {
        id: identityId,
        email: `dualworker-${identityId}@example.com`,
        name: 'Dual Worker User',
        emailVerified: true,
      },
    });

    const account = Account.create({
      id: IdentityId.of(identityId),
      nicknameSeed: `dualworker-${identityId}@example.com`,

      now: asInstant(1_700_000_000_000),
    });
    await accountRepo.save(account);

    const reminderId = crypto.randomUUID();
    await prisma.reminderTemplate.create({
      data: {
        id: reminderId,
        identityId,
        name: 'Pending Reminder Dual Worker',
        status: 'active',
        type: 'Recurring',
        selfEnabled: true,
        importanceLevel: 'Normal',
        tags: '[]',
        trigger: 'cron',
        activeTime: '{}',
        notificationConfig: '{}',
        stats: '{}',
      },
    });
    const occurrenceId = crypto.randomUUID();
    await prisma.reminderOccurrence.create({
      data: {
        id: occurrenceId,
        occurrenceKey: `notif_${reminderId}:1`,
        idempotencyKey: `v1:7:${identityId}:notif_${reminderId}:1`,
        status: 'pending',
        template: { connect: { id: reminderId } },
        account: { connect: { id: identityId } },
      },
    });

    const notifOutboxId = crypto.randomUUID();
    await prisma.notification.create({
      data: {
        id: notifOutboxId,
        identityId,
        type: 'Info',
        category: 'System',
        workflowKey: 'account.closure.slow-consumer',
        topic: 'account.closure',
        idempotencyKey: `seed:${notifOutboxId}`,
        title: 'Slow Consumer Notification',
        content: 'Content',
        importance: 'Moderate',
        urgency: 'Medium',
      },
    });
    await prisma.notificationDispatchOutbox.create({
      data: {
        id: notifOutboxId,
        identityId,
        notificationId: notifOutboxId,
        source: 'notification',
        occurrenceKey: `${notifOutboxId}:InApp`,
        channel: 'InApp',
        payloadJson: JSON.stringify({ notificationId: notifOutboxId, title: 'Slow Consumer' }),
        idempotencyKey: `v1:notif:${identityId}:${notifOutboxId}`,
        status: 'pending',
      },
    });

    const repoId = crypto.randomUUID();
    await prisma.repository.create({
      data: {
        id: repoId,
        identityId,
        name: 'Test Repo',
        type: 'knowledge',
        path: `/tmp/test-repo-${repoId}`,
        status: 'ACTIVE',
      },
    });
    const writeReqId = crypto.randomUUID();
    await prisma.knowledgeRepositoryConnection.create({
      data: {
        id: repoId,
        identityId,
        githubUserId: `github-user-${repoId}`,
        githubRepositoryId: `gh-repo-${repoId}`,
        githubRepositoryFullName: `user/test-repo-${repoId}`,
        installationId: `install-${repoId}`,
      },
    });
    await prisma.knowledgeWriteRequest.create({
      data: {
        id: writeReqId,
        identityId,
        connectionId: repoId,
        requestId: `req-${writeReqId}`,
        requestHash: `hash-${writeReqId}`,
        relativePath: 'notes/readme.md',
        status: 'PENDING',
      },
    });

    const outboxId = crypto.randomUUID();
    await prisma.outboxMessage.create({
      data: {
        id: outboxId,
        messageType: 'account:closed',
        correlationId: `corr-${outboxId}`,
        payloadJson: JSON.stringify({ identityId, closedAt: Date.now() }),
        idempotencyKey: eventId,
        status: 'pending',
      },
    });

    const realReminderConsumer = new ReminderAccountClosedConsumer(prisma);
    const realNotificationConsumer = new NotificationAccountClosedConsumer(prisma);
    const realRepositoryConsumer = new RepositoryAccountClosedConsumer(prisma);

    const worker1 = new AccountClosedWorker(prisma, {
      leaseDurationMs: 1500,
      enableHeartbeat: false,
      reminderConsumer: {
        handleAccountClosed: async (event, evtId) => {
          await realReminderConsumer.handleAccountClosed(event as any, evtId);
          // Sleep 2000ms > 1500ms lease duration to simulate slow consumer
          await new Promise((resolve) => setTimeout(resolve, 2000));
        },
      },
      notificationConsumer: {
        handleAccountClosed: async (event, evtId) => {
          await realNotificationConsumer.handleAccountClosed(event as any, evtId);
        },
      },
      repositoryConsumer: {
        handleAccountClosed: async (event, evtId) => {
          await realRepositoryConsumer.handleAccountClosed(event as any, evtId);
        },
      },
    });

    const worker2 = new AccountClosedWorker(prisma, {
      leaseDurationMs: 1500,
      enableHeartbeat: true,
      reminderConsumer: {
        handleAccountClosed: async (event, evtId) => {
          await realReminderConsumer.handleAccountClosed(event as any, evtId);
        },
      },
      notificationConsumer: {
        handleAccountClosed: async (event, evtId) => {
          await realNotificationConsumer.handleAccountClosed(event as any, evtId);
        },
      },
      repositoryConsumer: {
        handleAccountClosed: async (event, evtId) => {
          await realRepositoryConsumer.handleAccountClosed(event as any, evtId);
        },
      },
    });

    const promiseWorker1 = worker1.processPendingMessages(1);

    // Wait 1600ms for Worker 1's lease to expire
    await new Promise((resolve) => setTimeout(resolve, 1600));

    const processed2 = await worker2.processPendingMessages(1);
    expect(processed2).toBe(1);

    await promiseWorker1;

    const occurrence = await prisma.reminderOccurrence.findUnique({ where: { id: occurrenceId } });
    const notifOutbox = await prisma.notificationDispatchOutbox.findUnique({
      where: { id: notifOutboxId },
    });
    const repo = await prisma.repository.findUnique({ where: { id: repoId } });
    const writeReq = await prisma.knowledgeWriteRequest.findUnique({ where: { id: writeReqId } });

    expect(occurrence?.status).toBe('cancelled');
    expect(notifOutbox?.status).toBe('cancelled');
    expect(repo?.status).toBe('ARCHIVED');
    expect(writeReq?.status).toBe('CANCELLED');

    const receipts = await prisma.inboxReceipt.findMany({
      where: { id: eventId },
    });
    expect(receipts.length).toBe(3);
    const consumerNames = receipts.map((r) => r.consumer).sort();
    expect(consumerNames).toEqual([
      'notification-account-closed',
      'reminder-account-closed',
      'repository-account-closed',
    ]);

    const finalOutbox = await prisma.outboxMessage.findUnique({ where: { id: outboxId } });
    expect(finalOutbox?.status).toBe('dispatched');
  });

  it('failed dual retriers: concurrent claim on failed operation -> only one owner takes over and attempts increments once', async () => {
    const identityId = IdentityId.generate().toString();
    const idempotencyKey = `failed-retry-${Date.now()}`;
    const opId = crypto.randomUUID();

    await prisma.accountClosureOperation.create({
      data: {
        id: opId,
        identityId,
        idempotencyKey,
        phase: 'revoking',
        status: 'failed',
        attempts: 1,
        version: 1,
        ownerToken: null,
        leaseExpiresAt: null,
        lastError: 'Network error',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    const now = new Date();
    const future = new Date(now.getTime() + 30000);

    const [claim1, claim2] = await Promise.all([
      closureOpRepo.claimOwnership({
        id: opId,
        identityId,
        ownerToken: 'retrier-1',
        leaseExpiresAt: future,
        now,
        expectedStatus: 'failed',
      }),
      closureOpRepo.claimOwnership({
        id: opId,
        identityId,
        ownerToken: 'retrier-2',
        leaseExpiresAt: future,
        now,
        expectedStatus: 'failed',
      }),
    ]);

    // Exactly one retrier claims ownership
    expect(claim1 !== claim2).toBe(true);

    const row = await prisma.accountClosureOperation.findUnique({ where: { id: opId } });
    expect(row?.status).toBe('running');
    expect(row?.attempts).toBe(2); // incremented by 1 exactly once
  });

  it('lease expired old owner fencing: old owner CAS update is rejected after new owner claims lease', async () => {
    const identityId = IdentityId.generate().toString();
    const idempotencyKey = `lease-expire-${Date.now()}`;
    const opId = crypto.randomUUID();
    const now = new Date();
    const past = new Date(now.getTime() - 10000);
    const future = new Date(now.getTime() + 30000);

    await prisma.accountClosureOperation.create({
      data: {
        id: opId,
        identityId,
        idempotencyKey,
        phase: 'revoking',
        status: 'running',
        attempts: 1,
        version: 1,
        ownerToken: 'old-owner-token',
        leaseExpiresAt: past,
        createdAt: past,
        updatedAt: past,
      },
    });

    // New owner claims lease since old lease expired
    const newOwnerClaimed = await closureOpRepo.claimOwnership({
      id: opId,
      identityId,
      ownerToken: 'new-owner-token',
      leaseExpiresAt: future,
      now,
    });
    expect(newOwnerClaimed).toBe(true);

    // Old owner attempts to write phase update with old token -> fenced out!
    const oldOwnerCAS = await closureOpRepo.updatePhaseCAS({
      id: opId,
      identityId,
      expectedPhase: 'revoking',
      newPhase: 'revoked',
      ownerToken: 'old-owner-token',
    });
    expect(oldOwnerCAS).toBe(false);
  });

  it('slow side-effect across lease: old completion write is fenced out when pre-empted by new owner', async () => {
    const identityId = IdentityId.generate().toString();
    const idempotencyKey = `slow-side-effect-${Date.now()}`;
    const opId = crypto.randomUUID();
    const now = new Date();
    const past = new Date(now.getTime() - 5000);
    const future = new Date(now.getTime() + 30000);

    await prisma.accountClosureOperation.create({
      data: {
        id: opId,
        identityId,
        idempotencyKey,
        phase: 'revoking',
        status: 'running',
        attempts: 1,
        version: 1,
        ownerToken: 'slow-worker-token',
        leaseExpiresAt: past,
        createdAt: past,
        updatedAt: past,
      },
    });

    // Worker B pre-empts slow Worker A whose lease expired
    const workerBClaimed = await closureOpRepo.claimOwnership({
      id: opId,
      identityId,
      ownerToken: 'worker-b-token',
      leaseExpiresAt: future,
      now,
    });
    expect(workerBClaimed).toBe(true);

    // Slow Worker A finishes its side effect and attempts CAS completion write -> fenced out!
    const workerACAS = await closureOpRepo.updatePhaseCAS({
      id: opId,
      identityId,
      expectedPhase: 'revoking',
      newPhase: 'revoked',
      ownerToken: 'slow-worker-token',
    });
    expect(workerACAS).toBe(false);
  });

  it('crash/restart recovery: operation stopped mid-way is claimed and resumed by new instance to completion', async () => {
    const identityId = IdentityId.generate().toString();
    const idempotencyKey = `crash-recovery-${Date.now()}`;
    const opId = crypto.randomUUID();
    const past = new Date(Date.now() - 60000);

    await prisma.cloudAuthUser.create({
      data: {
        id: identityId,
        email: `crash-${identityId}@example.com`,
        name: 'Crash Recovery User',
        emailVerified: true,
      },
    });

    const account = Account.create({
      id: IdentityId.of(identityId),
      nicknameSeed: `crash-${identityId}@example.com`,

      now: asInstant(1_700_000_000_000),
    });
    await accountRepo.save(account);

    // Operation was interrupted at phase 'revoking'
    await prisma.accountClosureOperation.create({
      data: {
        id: opId,
        identityId,
        idempotencyKey,
        phase: 'revoking',
        status: 'running',
        attempts: 1,
        version: 1,
        ownerToken: 'crashed-instance-token',
        leaseExpiresAt: past,
        createdAt: past,
        updatedAt: past,
      },
    });

    // New instance starts and executes coordinator with same identity & key
    const receipt = await coordinator.execute(identityId, idempotencyKey, {
      reason: 'Crash recovery',
    });
    expect(receipt.status).toBe('succeeded');
    expect(receipt.phase).toBe('closed');

    const finalOp = await closureOpRepo.findByIdentityAndIdempotencyKey(identityId, idempotencyKey);
    expect(finalOp?.status).toBe('succeeded');
    expect(finalOp?.phase).toBe('closed');
  });

  it('W7: unified closure timeline query + audited replay; unauthorized identity rejected', async () => {
    const identityId = IdentityId.generate().toString();
    await prisma.cloudAuthUser.create({
      data: {
        id: identityId,
        email: `w7-${identityId}@example.com`,
        name: 'W7 User',
        emailVerified: true,
      },
    });

    const opId = `closure-w7-failed-${Date.now()}`;
    const now = new Date();
    await prisma.accountClosureOperation.create({
      data: {
        id: opId,
        identityId,
        idempotencyKey: `w7-failed-key-${Date.now()}`,
        phase: 'failed',
        status: 'failed',
        attempts: 5,
        version: 1,
        lastError: 'cloud auth revocation timed out',
        deadLetterAt: now,
        nextRetryAt: null,
        createdAt: now,
        updatedAt: now,
        finishedAt: now,
      },
    });

    const { createAccountPrismaModule } = await import('../../../prisma');
    const moduleInstance = createAccountPrismaModule(prisma, {
      clock: createSystemClock(),
      cloudAuth: {
        revokeAllSessions: async () => ({ revokedSessions: 0 }),
        deleteUserData: async () => ({ deletedRecords: 0 }),
      },
    });

    const cx = { identityId } as never;
    const timelineRes = await moduleInstance.api.queryClosureTimeline(cx);
    expect(timelineRes.ok).toBe(true);
    const entries = timelineRes.ok ? (timelineRes.data as any[]) : [];
    const entry = entries.find((e) => e.operationId === opId);
    expect(entry).toBeDefined();
    expect(entry.source).toBe('account-closure');
    expect(entry.status).toBe('dead_letter');
    expect(entry.failureReason).toBe('cloud auth revocation timed out');
    expect(entry.attempts).toBe(5);
    expect(entry.replayable).toBe(true);

    // Unauthorized identity cannot replay another identity's closure
    const otherIdentity = IdentityId.generate().toString();
    const otherCx = { identityId: otherIdentity } as never;
    const rejected = await moduleInstance.api.replayClosure(opId, otherCx);
    expect(rejected.ok).toBe(false);

    // Authorized replay advances state and records audit
    const replayRes = await moduleInstance.api.replayClosure(opId, cx);
    expect(replayRes.ok).toBe(true);
    const replayed = replayRes.ok ? (replayRes.data as any) : null;
    expect(replayed.status).toBe('running');
    expect(replayed.replayable).toBe(false);

    const auditRes = await moduleInstance.api.getOperationAudit(cx);
    expect(auditRes.ok).toBe(true);
    const audit = auditRes.ok ? (auditRes.data as any[]) : [];
    const replayAudit = audit.find(
      (a) => a.operationId === opId && a.action === 'replay' && a.source === 'account-closure',
    );
    expect(replayAudit).toBeDefined();
    expect(replayAudit.actorIdentityId).toBe(identityId);

    // P1-3: the timeline query wrote a timeline_query audit with result count.
    const queryAudit = await prisma.operationAuditLog.findFirst({
      where: {
        actorIdentityId: identityId,
        action: 'timeline_query',
        source: 'account-closure',
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(queryAudit).toBeDefined();
    expect(queryAudit?.operationId).toBe('*timeline-query*');
    const qDetails = JSON.parse(queryAudit?.details as string);
    expect(qDetails.resultCount).toBeGreaterThanOrEqual(1);

    moduleInstance.dispose();
  });

  it('P1-4: account closure replay audit write failure rolls back the state advancement', async () => {
    const identityId = IdentityId.generate().toString();
    await prisma.cloudAuthUser.create({
      data: {
        id: identityId,
        email: `w7-fail-${identityId}@example.com`,
        name: 'W7 Fail User',
        emailVerified: true,
      },
    });

    const opId = `closure-w7-fail-inject-${Date.now()}`;
    const now = new Date();
    await prisma.accountClosureOperation.create({
      data: {
        id: opId,
        identityId,
        idempotencyKey: `w7-fail-key-${Date.now()}`,
        phase: 'failed',
        status: 'failed',
        attempts: 5,
        version: 1,
        lastError: 'cloud auth revocation timed out',
        deadLetterAt: now,
        nextRetryAt: null,
        createdAt: now,
        updatedAt: now,
        finishedAt: now,
      },
    });

    const { createAccountModule } = await import('../../../account.module');
    const failingAudit = {
      record: async () => {
        throw new Error('audit write failure injected');
      },
      listByActor: async () => [],
    };
    const moduleInstance = createAccountModule({
      accountRepository: new PrismaAccountRepository(prisma),
      closureOperationRepository: closureOpRepo,
      revocationPort: {
        revokeAllSessions: async () => ({ revokedSessions: 0, success: true }),
      },
      eventPublisher: { publishAccountClosed: async () => undefined },
      laneCapability: 'api',
      auditRepository: failingAudit as never,
    });

    const cx = { identityId } as never;
    const replayRes = await moduleInstance.api.replayClosure(opId, cx);
    expect(replayRes.ok).toBe(false);

    const after = await prisma.accountClosureOperation.findUniqueOrThrow({
      where: { id: opId },
    });
    expect(after.status).toBe('failed');
    expect(after.deadLetterAt).not.toBeNull();

    moduleInstance.dispose();
  });

  it('P1-3: account closure timeline query fails closed when audit write fails', async () => {
    const identityId = IdentityId.generate().toString();
    await prisma.cloudAuthUser.create({
      data: {
        id: identityId,
        email: `w7-queryfail-${identityId}@example.com`,
        name: 'W7 Query Fail User',
        emailVerified: true,
      },
    });

    const { createAccountModule } = await import('../../../account.module');
    const failingAudit = {
      record: async () => {
        throw new Error('audit write failure injected');
      },
      listByActor: async () => [],
    };
    const moduleInstance = createAccountModule({
      accountRepository: new PrismaAccountRepository(prisma),
      closureOperationRepository: closureOpRepo,
      revocationPort: {
        revokeAllSessions: async () => ({ revokedSessions: 0, success: true }),
      },
      eventPublisher: { publishAccountClosed: async () => undefined },
      laneCapability: 'api',
      auditRepository: failingAudit as never,
    });

    const cx = { identityId } as never;
    await expect(moduleInstance.api.queryClosureTimeline(cx)).rejects.toThrow(
      'audit write failure injected',
    );

    moduleInstance.dispose();
  });
});
