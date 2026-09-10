import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@memoflow/database';
import { IdentityId } from '@memoflow/domain-shared';
import { Account } from '@memoflow/account/server';
import { createAccountPrismaModule } from '@memoflow/account/server';
import { ReminderAccountClosedConsumer } from '@memoflow/reminder/server';
import { NotificationAccountClosedConsumer } from '@memoflow/notification/server';
import { RepositoryAccountClosedConsumer } from '@memoflow/repository/server';
import { AccountClosedWorker } from '@memoflow/account/server';
import { cleanAll, disconnectPrisma } from '@memoflow/test-utils/setup/integration-helpers';
import { asInstant, createSystemClock } from '@memoflow/time';

/**
 * W3 real-path integration: closure saga -> account-closed outbox ->
 * worker (lease) -> real Reminder/Notification/Repository consumers cancel pending work.
 */
describe('API host account-closed consumer chain', () => {
  beforeEach(async () => {
    await cleanAll();
  });

  afterAll(async () => {
    await cleanAll();
    await disconnectPrisma();
  });

  it('closure saga publishes account-closed; worker with real consumers cancels reminder/notification/repository pending work', async () => {
    const identityId = IdentityId.generate().toString();
    const __idempotencyKey = `chain-${Date.now()}`;

    await prisma.cloudAuthUser.create({
      data: {
        id: identityId,
        email: `chain-${identityId}@example.com`,
        name: 'Chain User',
        emailVerified: true,
      },
    });

    const account = Account.create({
      id: IdentityId.of(identityId),
      nicknameSeed: 'Chain User',
      now: asInstant(1_700_000_000_000),
    });
    const module = createAccountPrismaModule(prisma, {
      clock: createSystemClock(),
      revocationPort: { revokeAll: async () => ({ revokedSessions: 1 }) },
    });
    await module.accountRepository.save(account);

    // Seed pending reminder work
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

    // Seed pending notification dispatch work
    const notificationId = crypto.randomUUID();
    await prisma.notification.create({
      data: {
        id: notificationId,
        identityId,
        type: 'Info',
        category: 'System',
        workflowKey: 'account.closure.test',
        topic: 'account.closure',
        idempotencyKey: `seed:${notificationId}`,
        title: 'Test Notification',
        content: 'Content',
        importance: 'Moderate',
        urgency: 'Medium',
      },
    });
    await prisma.notificationDispatchOutbox.create({
      data: {
        id: crypto.randomUUID(),
        identityId,
        notificationId,
        source: 'notification',
        occurrenceKey: `${notificationId}:InApp`,
        channel: 'InApp',
        payloadJson: JSON.stringify({ notificationId, title: 'Test' }),
        idempotencyKey: `v1:notif:${identityId}:${notificationId}`,
        status: 'pending',
      },
    });

    // Seed pending repository work
    const repoId = crypto.randomUUID();
    await prisma.repository.create({
      data: {
        id: repoId,
        identityId,
        name: 'Test Repo',
        type: 'git',
        path: '/test/repo',
        status: 'ACTIVE',
      },
    });
    const connId = crypto.randomUUID();
    await prisma.knowledgeRepositoryConnection.create({
      data: {
        id: connId,
        identityId,
        githubUserId: 'gh-1',
        githubRepositoryId: 'gh-repo-1',
        githubRepositoryFullName: 'user/repo',
        installationId: 'inst-1',
        status: 'ACTIVE',
      },
    });
    const writeReqId = crypto.randomUUID();
    await prisma.knowledgeWriteRequest.create({
      data: {
        id: writeReqId,
        identityId,
        connectionId: connId,
        requestId: 'req-1',
        requestHash: 'hash-1',
        relativePath: 'note.md',
        status: 'PENDING',
      },
    });

    // Full closure saga via the real use-case
    const result = await module.useCases.closeAccount.execute({ reason: 'Chain test' }, {
      identityId,
      deviceId: 'device-1',
    } as never);
    expect(result.ok).toBe(true);

    // Worker consumes the outbox with REAL consumers
    const worker = new AccountClosedWorker(prisma, {
      reminderConsumer: new ReminderAccountClosedConsumer(prisma),
      notificationConsumer: new NotificationAccountClosedConsumer(prisma),
      repositoryConsumer: new RepositoryAccountClosedConsumer(prisma),
    });
    const processed = await worker.processPendingMessages(50);
    expect(processed).toBeGreaterThanOrEqual(1);

    // Reminder pending work cancelled
    const template = await prisma.reminderTemplate.findUnique({ where: { id: reminderId } });
    expect(template?.status).toBe('disabled');
    const occurrences = await prisma.reminderOccurrence.findMany({ where: { identityId } });
    expect(occurrences.every((occ) => occ.status === 'cancelled')).toBe(true);

    // Notification pending dispatch cancelled
    const dispatches = await prisma.notificationDispatchOutbox.findMany({ where: { identityId } });
    expect(dispatches.every((disp) => disp.status === 'cancelled')).toBe(true);

    // Repository pending write request cancelled and repository archived
    const repository = await prisma.repository.findUnique({ where: { id: repoId } });
    expect(repository?.status).toBe('ARCHIVED');
    const writeReq = await prisma.knowledgeWriteRequest.findUnique({ where: { id: writeReqId } });
    expect(writeReq?.status).toBe('CANCELLED');

    // Inbox receipts recorded for all three consumers
    const reminderReceipt = await prisma.inboxReceipt.findFirst({
      where: { consumer: 'reminder-account-closed' },
    });
    expect(reminderReceipt).not.toBeNull();

    const notificationReceipt = await prisma.inboxReceipt.findFirst({
      where: { consumer: 'notification-account-closed' },
    });
    expect(notificationReceipt).not.toBeNull();

    const repoReceipt = await prisma.inboxReceipt.findFirst({
      where: { consumer: 'repository-account-closed' },
    });
    expect(repoReceipt).not.toBeNull();
  });
});
