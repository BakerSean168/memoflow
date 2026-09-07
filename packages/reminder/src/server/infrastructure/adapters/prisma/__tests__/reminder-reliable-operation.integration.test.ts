import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { IdentityId } from '@memoflow/domain-shared';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { ReminderType } from '@memoflow/contracts/reminder';
import { NotificationRequestedSchema } from '@memoflow/contracts/notification';
import {
  buildIdempotencyKeyString,
  LeaseFencingException,
} from '@memoflow/contracts/reliable-messaging';
import { ReminderTemplate } from '../../../../domain/aggregates/reminder-template';
import { ReminderGroup } from '../../../../domain/aggregates/reminder-group';
import { ReminderReliableOperationPrismaAdapter } from '../reminder-reliable-operation-prisma.adapter';
import { PrismaReminderWriteTransactionRunner } from '../prisma-reminder-write-transaction-runner';
import { ReminderTemplatePrismaRepository } from '../reminder-template-prisma.repository';
import { ReminderGroupPrismaRepository } from '../reminder-group-prisma.repository';
import { ReminderSchedulerService } from '../../../../domain/services/reminder-scheduler-service';
import { ReminderTriggerService } from '../../../../domain/services/reminder-trigger-service';
import { ReminderTemplateControlService } from '../../../../domain/services/reminder-template-control-service';
import { ReminderMetricsCollector } from '../../../../domain/services/reminder-metrics-service';
import { PrismaRoutineProfileStore } from '../../../routine-vnext/routine-profile-store.prisma';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '../../../../../__tests__/integration-helpers';

function createSampleTemplate(identityId: string, selfEnabled = true) {
  return ReminderTemplate.create({
    identityId: identityId as IdentityId,
    title: 'Daily Check-in',
    type: ReminderType.Recurring,
    selfEnabled,
    trigger: {
      type: 'FixedTime',
      fixedTime: { time: '10:00', timezone: 'UTC' },
      interval: null,
    },
    activeTime: { activatedAt: Date.now() - 60_000 },
    notificationConfig: {
      channels: ['InApp'],
      title: 'Check-in time',
      body: 'Time to record progress',
      sound: { enabled: true, soundName: null },
      vibration: { enabled: true, pattern: null },
      actions: null,
    },
    description: 'Daily habit check-in',
    importanceLevel: ImportanceLevel.Normal,
    tags: ['daily'],
    color: '#3b82f6',
    icon: 'bell',
  });
}

describe('W1 Reminder LeaseClaim & Reliable Operations Integration Tests', () => {
  afterAll(async () => {
    await cleanAll();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await cleanAll();
  });

  it('1. Dual-instance claim mutual exclusion: only one instance claims the due occurrence', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const prisma = await getPrisma();
    const adapter = new ReminderReliableOperationPrismaAdapter(prisma);
    const templateRepo = new ReminderTemplatePrismaRepository(prisma);

    const template = createSampleTemplate(identityId);
    await templateRepo.save(template);

    const templateId = template.id as string;
    const occurrenceKey = '2026-08-09T08:00:00.000Z';
    const idempotencyKey = buildIdempotencyKeyString({
      identityId,
      source: 'reminder',
      occurrenceKey,
    });

    // Concurrent claim attempts from Worker 1 and Worker 2
    const claim1Promise = adapter.claimOccurrence({
      identityId,
      source: 'reminder',
      templateId,
      occurrenceKey,
      ownerToken: 'worker-1',
      leaseDurationMs: 30000,
      idempotencyKey,
    });

    const claim2Promise = adapter.claimOccurrence({
      identityId,
      source: 'reminder',
      templateId,
      occurrenceKey,
      ownerToken: 'worker-2',
      leaseDurationMs: 30000,
      idempotencyKey,
    });

    const [res1, res2] = await Promise.all([claim1Promise, claim2Promise]);

    const claimedResults = [res1, res2].filter((r) => r.claimed);
    const unclaimedResults = [res1, res2].filter((r) => !r.claimed);

    expect(claimedResults).toHaveLength(1);
    expect(unclaimedResults).toHaveLength(1);

    expect(claimedResults[0].lease).not.toBeNull();
    expect(claimedResults[0].receipt.status).toBe('running');
    expect(unclaimedResults[0].lease).toBeNull();
  });

  it('2. Crash recovery without duplication: expired lease can be claimed by second worker', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const prisma = await getPrisma();
    const adapter = new ReminderReliableOperationPrismaAdapter(prisma);
    const templateRepo = new ReminderTemplatePrismaRepository(prisma);

    const template = createSampleTemplate(identityId);
    await templateRepo.save(template);

    const templateId = template.id as string;
    const occurrenceKey = '2026-08-09T09:00:00.000Z';
    const idempotencyKey = buildIdempotencyKeyString({
      identityId,
      source: 'reminder',
      occurrenceKey,
    });

    // Worker 1 claims with very short lease (100ms) and "crashes" (does not finish transaction)
    const res1 = await adapter.claimOccurrence({
      identityId,
      source: 'reminder',
      templateId,
      occurrenceKey,
      ownerToken: 'worker-1-crashed',
      leaseDurationMs: 100,
      idempotencyKey,
    });

    expect(res1.claimed).toBe(true);
    expect(res1.lease?.fencingToken).toBe(1);

    // Wait for lease expiry
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Worker 2 scans and recovers expired lease
    const res2 = await adapter.claimOccurrence({
      identityId,
      source: 'reminder',
      templateId,
      occurrenceKey,
      ownerToken: 'worker-2-recovery',
      leaseDurationMs: 30000,
      idempotencyKey,
    });

    expect(res2.claimed).toBe(true);
    expect(res2.lease?.ownerToken).toBe('worker-2-recovery');
    expect(res2.lease?.fencingToken).toBe(2); // Fencing token incremented
  });

  it('3. Duplicate claim returns original receipt after completion', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const prisma = await getPrisma();
    const adapter = new ReminderReliableOperationPrismaAdapter(prisma);
    const runner = new PrismaReminderWriteTransactionRunner(prisma);
    const templateRepo = new ReminderTemplatePrismaRepository(prisma);

    const template = createSampleTemplate(identityId);
    await templateRepo.save(template);

    const occurrenceKey = '2026-08-09T10:00:00.000Z';
    const idempotencyKey = buildIdempotencyKeyString({
      identityId,
      source: 'reminder',
      occurrenceKey,
    });

    const claimRes = await adapter.claimOccurrence({
      identityId,
      source: 'reminder',
      templateId: template.id as string,
      occurrenceKey,
      ownerToken: 'worker-primary',
      leaseDurationMs: 30000,
      idempotencyKey,
    });

    expect(claimRes.claimed).toBe(true);

    // Process transaction cleanly
    const receipt = await runner.executeClaimedOccurrenceTransaction({
      template,
      occurrence: {
        id: claimRes.receipt.operationId,
        identityId,
        templateId: template.id as string,
        occurrenceKey,
        idempotencyKey,
        fencingToken: claimRes.lease!.fencingToken,
        ownerToken: 'worker-primary',
      },
      isEnabled: true,
    });

    expect(receipt.status).toBe('succeeded');

    const requestedOutbox = await prisma.outboxMessage.findFirstOrThrow({
      where: { identityId, messageType: 'notification.requested' },
    });
    const requestedEnvelope = NotificationRequestedSchema.parse(
      JSON.parse(requestedOutbox.payloadJson),
    );
    expect(requestedEnvelope.identityId).toBe(identityId);
    expect(requestedEnvelope.source).toBe('reminder');
    expect(requestedEnvelope.idempotencyKey).toBe(idempotencyKey);

    // Subsequent duplicate claim
    const dupClaim = await adapter.claimOccurrence({
      identityId,
      source: 'reminder',
      templateId: template.id as string,
      occurrenceKey,
      ownerToken: 'worker-secondary',
      leaseDurationMs: 30000,
      idempotencyKey,
    });

    expect(dupClaim.claimed).toBe(false);
    expect(dupClaim.lease).toBeNull();
    expect(dupClaim.receipt.status).toBe('succeeded');
    expect(dupClaim.receipt.operationId).toBe(receipt.operationId);
  });

  it('4. Stale owner fencing: write with invalid owner or fencing token is rejected', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const prisma = await getPrisma();
    const adapter = new ReminderReliableOperationPrismaAdapter(prisma);
    const runner = new PrismaReminderWriteTransactionRunner(prisma);
    const templateRepo = new ReminderTemplatePrismaRepository(prisma);

    const template = createSampleTemplate(identityId);
    await templateRepo.save(template);

    const occurrenceKey = '2026-08-09T11:00:00.000Z';
    const idempotencyKey = buildIdempotencyKeyString({
      identityId,
      source: 'reminder',
      occurrenceKey,
    });

    const claimRes = await adapter.claimOccurrence({
      identityId,
      source: 'reminder',
      templateId: template.id as string,
      occurrenceKey,
      ownerToken: 'worker-valid',
      leaseDurationMs: 30000,
      idempotencyKey,
    });

    // Stale owner attempts transaction with wrong owner token
    await expect(
      runner.executeClaimedOccurrenceTransaction({
        template,
        occurrence: {
          id: claimRes.receipt.operationId,
          identityId,
          templateId: template.id as string,
          occurrenceKey,
          idempotencyKey,
          fencingToken: claimRes.lease!.fencingToken,
          ownerToken: 'worker-stale-imposter',
        },
        isEnabled: true,
      }),
    ).rejects.toThrow(LeaseFencingException);
  });

  it('5. Disabled template records skipped status and receipt in single transaction', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const prisma = await getPrisma();
    const adapter = new ReminderReliableOperationPrismaAdapter(prisma);
    const runner = new PrismaReminderWriteTransactionRunner(prisma);
    const templateRepo = new ReminderTemplatePrismaRepository(prisma);

    const disabledTemplate = createSampleTemplate(identityId, false);
    await templateRepo.save(disabledTemplate);

    const occurrenceKey = '2026-08-09T12:00:00.000Z';
    const idempotencyKey = buildIdempotencyKeyString({
      identityId,
      source: 'reminder',
      occurrenceKey,
    });

    const claimRes = await adapter.claimOccurrence({
      identityId,
      source: 'reminder',
      templateId: disabledTemplate.id as string,
      occurrenceKey,
      ownerToken: 'worker-disabled-test',
      leaseDurationMs: 30000,
      idempotencyKey,
    });

    const receipt = await runner.executeClaimedOccurrenceTransaction({
      template: disabledTemplate,
      occurrence: {
        id: claimRes.receipt.operationId,
        identityId,
        templateId: disabledTemplate.id as string,
        occurrenceKey,
        idempotencyKey,
        fencingToken: claimRes.lease!.fencingToken,
        ownerToken: 'worker-disabled-test',
      },
      isEnabled: false,
      skipReason: 'Template self-disabled',
    });

    expect(receipt.status).toBe('skipped');
    expect(receipt.finishedAt).not.toBeNull();
  });

  it('6. Heartbeat lease: retains owner and extends expiry before expiration, rejects renewal after expiry', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const prisma = await getPrisma();
    const adapter = new ReminderReliableOperationPrismaAdapter(prisma);
    const templateRepo = new ReminderTemplatePrismaRepository(prisma);

    const template = createSampleTemplate(identityId);
    await templateRepo.save(template);

    const occurrenceKey = '2026-08-09T13:00:00.000Z';
    const idempotencyKey = buildIdempotencyKeyString({
      identityId,
      source: 'reminder',
      occurrenceKey,
    });

    const claimRes = await adapter.claimOccurrence({
      identityId,
      source: 'reminder',
      templateId: template.id as string,
      occurrenceKey,
      ownerToken: 'worker-hb-1',
      leaseDurationMs: 200,
      idempotencyKey,
    });

    expect(claimRes.claimed).toBe(true);
    const claimId = claimRes.receipt.operationId;
    const fencingToken = claimRes.lease!.fencingToken;

    // Heartbeat before expiry -> renewed: true, owner retained, lease extended
    const hbRes = await adapter.heartbeatLease({
      identityId,
      source: 'reminder',
      templateId: template.id as string,
      occurrenceKey,
      ownerToken: 'worker-hb-1',
      claimId,
      fencingToken,
      leaseDurationMs: 500,
    });

    expect(hbRes.renewed).toBe(true);
    expect(hbRes.lease?.ownerToken).toBe('worker-hb-1');
    expect(hbRes.lease?.lastHeartbeatAt).not.toBeNull();

    // Wait past the extended lease expiry
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Heartbeat after expiry -> renewed: false
    const expiredHbRes = await adapter.heartbeatLease({
      identityId,
      source: 'reminder',
      templateId: template.id as string,
      occurrenceKey,
      ownerToken: 'worker-hb-1',
      claimId,
      fencingToken,
      leaseDurationMs: 500,
    });

    expect(expiredHbRes.renewed).toBe(false);
  });

  it('7. Retryable to dead-letter state machine transition and persistence with metrics', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const prisma = await getPrisma();
    const adapter = new ReminderReliableOperationPrismaAdapter(prisma);
    const templateRepo = new ReminderTemplatePrismaRepository(prisma);

    const template = createSampleTemplate(identityId);
    await templateRepo.save(template);

    const occurrenceKey = '2026-08-09T14:00:00.000Z';
    const idempotencyKey = buildIdempotencyKeyString({
      identityId,
      source: 'reminder',
      occurrenceKey,
    });

    const claimRes = await adapter.claimOccurrence({
      identityId,
      source: 'reminder',
      templateId: template.id as string,
      occurrenceKey,
      ownerToken: 'worker-metrics',
      leaseDurationMs: 30000,
      idempotencyKey,
    });

    const controlService = new ReminderTemplateControlService(
      templateRepo,
      new ReminderGroupPrismaRepository(prisma),
    );
    const triggerService = new ReminderTriggerService(templateRepo, controlService);
    const runner = new PrismaReminderWriteTransactionRunner(prisma);
    const metrics = new ReminderMetricsCollector();

    const scheduler = new ReminderSchedulerService(
      templateRepo,
      triggerService,
      adapter,
      runner,
      controlService,
      metrics,
    );

    // Attempt 1 -> retryable
    await scheduler.recordOccurrenceFailure({
      receipt: claimRes.receipt,
      error: new Error('Transient database error'),
      maxRetries: 3,
    });

    const dbOcc1 = await prisma.reminderOccurrence.findUniqueOrThrow({
      where: { idempotencyKey },
    });
    expect(dbOcc1.status).toBe('retryable');
    expect(dbOcc1.lastError).toBe('Transient database error');
    expect(dbOcc1.nextRetryAt).not.toBeNull();
    expect(dbOcc1.deadLetterAt).toBeNull();
    expect(metrics.getSnapshot().retryTotal).toBe(1);
    expect(metrics.getSnapshot().deadLetterTotal).toBe(0);
    // P1-5: unified recorder keys fire on the real scheduler path.
    const unified1 = metrics.getUnifiedSnapshot();
    expect(unified1['memoflow.reminder.outbox.retried']).toBe(1);
    expect(unified1['memoflow.reminder.outbox.dead_letter']).toBeUndefined();

    // Attempt 3 -> dead_letter
    const receiptAttempt3 = { ...claimRes.receipt, attempt: 3 };
    await scheduler.recordOccurrenceFailure({
      receipt: receiptAttempt3,
      error: new Error('Permanent failure'),
      maxRetries: 3,
    });

    const dbOcc3 = await prisma.reminderOccurrence.findUniqueOrThrow({
      where: { idempotencyKey },
    });
    expect(dbOcc3.status).toBe('dead_letter');
    expect(dbOcc3.lastError).toBe('Permanent failure');
    expect(dbOcc3.nextRetryAt).toBeNull();
    expect(dbOcc3.deadLetterAt).not.toBeNull();
    expect(metrics.getSnapshot().deadLetterTotal).toBe(1);
    // P1-5: dead-letter is a distinct unified key, not lumped into failed.
    const unified2 = metrics.getUnifiedSnapshot();
    expect(unified2['memoflow.reminder.outbox.dead_letter']).toBe(1);
    // W7 互斥语义：retryable 与 dead_letter 分支不得再累计终态 outbox.failed
    expect(unified2['memoflow.reminder.outbox.retried']).toBe(1);
    expect(unified2['memoflow.reminder.outbox.failed']).toBeUndefined();
    expect(metrics.getSnapshot().failedTotal).toBe(0);
  });

  it('8. Notification outbox DB unique idempotency constraint prevents duplicate outbox messages', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const prisma = await getPrisma();

    const idempotencyKey = buildIdempotencyKeyString({
      identityId,
      source: 'reminder',
      occurrenceKey: '2026-08-09T15:00:00.000Z',
    });

    await prisma.outboxMessage.create({
      data: {
        id: 'outbox-msg-1',
        identityId,
        messageType: 'notification.requested',
        schemaVersion: 1,
        correlationId: 'corr-1',
        causationId: 'cause-1',
        payloadJson: JSON.stringify({ title: 'Test 1' }),
        idempotencyKey,
        status: 'pending',
        attempts: 0,
      },
    });

    // Attempting duplicate insert with same idempotencyKey must be rejected by DB unique constraint
    await expect(
      prisma.outboxMessage.create({
        data: {
          id: 'outbox-msg-2',
          identityId,
          messageType: 'notification.requested',
          schemaVersion: 1,
          correlationId: 'corr-2',
          causationId: 'cause-2',
          payloadJson: JSON.stringify({ title: 'Test 2' }),
          idempotencyKey,
          status: 'pending',
          attempts: 0,
        },
      }),
    ).rejects.toThrow();
  });

  it('9. Group disabled or paused template produces durable skipped receipt through scheduler scan', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const prisma = await getPrisma();
    const adapter = new ReminderReliableOperationPrismaAdapter(prisma);
    const runner = new PrismaReminderWriteTransactionRunner(prisma);
    const templateRepo = new ReminderTemplatePrismaRepository(prisma);
    const groupRepo = new ReminderGroupPrismaRepository(prisma);

    const group = ReminderGroup.create({
      identityId: identityId as IdentityId,
      name: 'Paused Group',
      order: 1,
    });
    group.pause();
    await groupRepo.save(group);

    const template = createSampleTemplate(identityId, true);
    template.moveToGroup(group.id);
    template.setNextTriggerTime(Date.now() - 1000);
    await templateRepo.save(template);

    const controlService = new ReminderTemplateControlService(templateRepo, groupRepo);
    const triggerService = new ReminderTriggerService(templateRepo, controlService);
    const scheduler = new ReminderSchedulerService(
      templateRepo,
      triggerService,
      adapter,
      runner,
      controlService,
    );

    const result = await scheduler.schedule({ identityId });

    expect(result.totalCount).toBe(1);
    expect(result.skippedCount).toBe(1);

    const occurrence = await prisma.reminderOccurrence.findFirstOrThrow({
      where: { templateId: template.id as string },
    });
    expect(occurrence.status).toBe('skipped');
    expect(occurrence.finishedAt).not.toBeNull();
  });

  it('10. FixedTime trigger calculation across timezone boundary', async () => {
    const identityId = IdentityId.generate();
    const templateInTokyo = ReminderTemplate.create({
      identityId: identityId as IdentityId,
      title: 'Tokyo Morning Reminder',
      type: ReminderType.Recurring,
      selfEnabled: true,
      trigger: {
        type: 'FixedTime',
        fixedTime: { time: '09:00', timezone: 'Asia/Tokyo' },
        interval: null,
      },
      activeTime: { activatedAt: Date.now() - 60_000 },
      notificationConfig: {
        channels: ['InApp'],
        title: 'Morning Tokyo',
        body: 'Good morning',
        sound: { enabled: true, soundName: null },
        vibration: { enabled: true, pattern: null },
        actions: null,
      },
      importanceLevel: ImportanceLevel.Normal,
      tags: ['tokyo'],
      color: '#3b82f6',
      icon: 'bell',
    });

    const nextTrigger = templateInTokyo.calculateNextTrigger();
    expect(nextTrigger).not.toBeNull();
    const dateUtc = new Date(nextTrigger!);
    expect(dateUtc.getUTCHours()).toBe(0);
    expect(dateUtc.getUTCMinutes()).toBe(0);
  });

  it('11. Retryable occurrence before nextRetryAt is NOT claimed by cron scan; claimed only after nextRetryAt', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const prisma = await getPrisma();
    const adapter = new ReminderReliableOperationPrismaAdapter(prisma);
    const templateRepo = new ReminderTemplatePrismaRepository(prisma);

    const template = createSampleTemplate(identityId);
    const now = new Date();
    template.setNextTriggerTime(now.getTime() - 1000);
    await templateRepo.save(template);

    const templateId = template.id as string;
    const triggerTime = template.getNextTriggerTime()!;
    const rawTimeIso = new Date(triggerTime).toISOString();
    const occurrenceKey = `${templateId}:${rawTimeIso}`;
    const idempotencyKey = buildIdempotencyKeyString({
      identityId,
      source: 'reminder',
      occurrenceKey,
    });

    const futureNextRetryAt = new Date(now.getTime() + 10000);

    // Seed DB occurrence as 'retryable' with nextRetryAt in future
    await prisma.reminderOccurrence.create({
      data: {
        id: 'occ-retry-1',
        identityId,
        templateId,
        source: 'reminder',
        occurrenceKey,
        idempotencyKey,
        status: 'retryable',
        attempt: 1,
        lastError: 'Simulated network timeout',
        nextRetryAt: futureNextRetryAt,
        createdAt: now,
        updatedAt: now,
      },
    });

    const groupRepo = new ReminderGroupPrismaRepository(prisma);
    const controlService = new ReminderTemplateControlService(templateRepo, groupRepo);
    const triggerService = new ReminderTriggerService(templateRepo, controlService);
    const runner = new PrismaReminderWriteTransactionRunner(prisma);
    const scheduler = new ReminderSchedulerService(
      templateRepo,
      triggerService,
      adapter,
      runner,
      controlService,
    );

    // Attempt scheduler scan before nextRetryAt -> MUST NOT process/claim
    const scanRes1 = await scheduler.schedule({ identityId });
    expect(scanRes1.successCount).toBe(0);
    expect(scanRes1.skippedCount).toBe(1);

    // Update nextRetryAt to past
    const pastNextRetryAt = new Date(now.getTime() - 1000);
    await prisma.reminderOccurrence.update({
      where: { idempotencyKey },
      data: { nextRetryAt: pastNextRetryAt },
    });

    // Attempt scheduler scan after nextRetryAt -> MUST succeed and claim
    const scanRes2 = await scheduler.schedule({ identityId });
    expect(scanRes2.successCount).toBe(1);

    const occDb = await prisma.reminderOccurrence.findUniqueOrThrow({ where: { idempotencyKey } });
    expect(occDb.status).toBe('succeeded');
    expect(occDb.attempt).toBe(2);
  });

  it('12. Dead letter occurrence is NOT claimed by cron scan', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const prisma = await getPrisma();
    const adapter = new ReminderReliableOperationPrismaAdapter(prisma);
    const templateRepo = new ReminderTemplatePrismaRepository(prisma);

    const template = createSampleTemplate(identityId);
    const now = new Date();
    template.setNextTriggerTime(now.getTime() - 1000);
    await templateRepo.save(template);

    const templateId = template.id as string;
    const triggerTime = template.getNextTriggerTime()!;
    const rawTimeIso = new Date(triggerTime).toISOString();
    const occurrenceKey = `${templateId}:${rawTimeIso}`;
    const idempotencyKey = buildIdempotencyKeyString({
      identityId,
      source: 'reminder',
      occurrenceKey,
    });

    // Seed DB occurrence as 'dead_letter'
    await prisma.reminderOccurrence.create({
      data: {
        id: 'occ-deadletter-1',
        identityId,
        templateId,
        source: 'reminder',
        occurrenceKey,
        idempotencyKey,
        status: 'dead_letter',
        attempt: 3,
        lastError: 'Fatal non-retriable failure',
        deadLetterAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Attempt claim via adapter -> MUST be rejected
    const claimRes = await adapter.claimOccurrence({
      identityId,
      source: 'reminder',
      templateId,
      occurrenceKey,
      ownerToken: 'worker-cron-scan',
      leaseDurationMs: 30000,
      idempotencyKey,
    });

    expect(claimRes.claimed).toBe(false);
    expect(claimRes.receipt.status).toBe('dead_letter');

    // Run scheduler scan -> MUST skip dead_letter
    const controlService = new ReminderTemplateControlService(
      templateRepo,
      new ReminderGroupPrismaRepository(prisma),
    );
    const triggerService = new ReminderTriggerService(templateRepo, controlService);
    const runner = new PrismaReminderWriteTransactionRunner(prisma);
    const scheduler = new ReminderSchedulerService(
      templateRepo,
      triggerService,
      adapter,
      runner,
      controlService,
    );

    const schedResult = await scheduler.schedule({ identityId });
    expect(schedResult.details[0].ok).toBe(false);
    expect(schedResult.details[0].message).toBe('Lease claim rejected (held by active owner)');

    const occDb = await prisma.reminderOccurrence.findUniqueOrThrow({ where: { idempotencyKey } });
    expect(occDb.status).toBe('dead_letter');
  });

  it('13. Automatic heartbeat loop during long-running execution extends lease and prevents expiry reclaim', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const prisma = await getPrisma();
    const adapter = new ReminderReliableOperationPrismaAdapter(prisma);
    const templateRepo = new ReminderTemplatePrismaRepository(prisma);

    const template = createSampleTemplate(identityId);
    template.setNextTriggerTime(Date.now() - 1000);
    await templateRepo.save(template);

    const controlService = new ReminderTemplateControlService(
      templateRepo,
      new ReminderGroupPrismaRepository(prisma),
    );
    const triggerService = new ReminderTriggerService(templateRepo, controlService);
    const runner = new PrismaReminderWriteTransactionRunner(prisma);
    const scheduler = new ReminderSchedulerService(
      templateRepo,
      triggerService,
      adapter,
      runner,
      controlService,
    );

    let worker2ClaimedDuringExecution = false;

    // Override claimOccurrence to set a short 150ms lease in DB with 50ms heartbeat interval
    const originalClaim = adapter.claimOccurrence.bind(adapter);
    adapter.claimOccurrence = async (input) => {
      const res = await originalClaim({ ...input, leaseDurationMs: 150 });
      if (res.lease) {
        res.lease.heartbeatIntervalMs = 50;
      }
      return res;
    };

    // Delay transaction runner execution by 350ms (longer than initial 150ms DB lease duration)
    // At t=200ms, attempt worker 2 claim to verify heartbeat extended DB lease and prevented reclaim
    const originalExecute = runner.executeClaimedOccurrenceTransaction.bind(runner);
    runner.executeClaimedOccurrenceTransaction = async (params) => {
      setTimeout(async () => {
        const worker2Res = await originalClaim({
          identityId: params.occurrence.identityId,
          source: 'reminder',
          templateId: params.occurrence.templateId,
          occurrenceKey: params.occurrence.occurrenceKey,
          ownerToken: 'worker-2-preemptor',
          leaseDurationMs: 150,
          idempotencyKey: params.occurrence.idempotencyKey,
        });
        if (worker2Res.claimed) {
          worker2ClaimedDuringExecution = true;
        }
      }, 200);

      await new Promise((resolve) => setTimeout(resolve, 350));
      return originalExecute(params);
    };

    const scheduleResult = await scheduler.schedule({ identityId });
    expect(scheduleResult.successCount).toBe(1);
    expect(worker2ClaimedDuringExecution).toBe(false);

    const occDb = await prisma.reminderOccurrence.findFirstOrThrow({
      where: { templateId: template.id as string },
    });
    expect(occDb.status).toBe('succeeded');
    expect(occDb.lastHeartbeatAt).not.toBeNull();
  });

  it('15. Re-claim atomicity under concurrency: retryable before nextRetryAt rejected by both workers, after nextRetryAt claimed by exactly one worker', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const prisma = await getPrisma();
    const adapter = new ReminderReliableOperationPrismaAdapter(prisma);
    const templateRepo = new ReminderTemplatePrismaRepository(prisma);

    const template = createSampleTemplate(identityId);
    await templateRepo.save(template);

    const templateId = template.id as string;
    const occurrenceKey = '2026-08-09T17:00:00.000Z';
    const idempotencyKey = buildIdempotencyKeyString({
      identityId,
      source: 'reminder',
      occurrenceKey,
    });

    const now = new Date();
    const futureNextRetryAt = new Date(now.getTime() + 10000);

    await prisma.reminderOccurrence.create({
      data: {
        id: 'occ-atomic-retry-1',
        identityId,
        templateId,
        source: 'reminder',
        occurrenceKey,
        idempotencyKey,
        status: 'retryable',
        attempt: 1,
        lastError: 'Simulated network timeout',
        nextRetryAt: futureNextRetryAt,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Concurrent claim before nextRetryAt -> both rejected
    const [before1, before2] = await Promise.all([
      adapter.claimOccurrence({
        identityId,
        source: 'reminder',
        templateId,
        occurrenceKey,
        ownerToken: 'worker-A',
        leaseDurationMs: 30000,
        idempotencyKey,
      }),
      adapter.claimOccurrence({
        identityId,
        source: 'reminder',
        templateId,
        occurrenceKey,
        ownerToken: 'worker-B',
        leaseDurationMs: 30000,
        idempotencyKey,
      }),
    ]);
    expect(before1.claimed).toBe(false);
    expect(before2.claimed).toBe(false);

    // Update nextRetryAt to past
    await prisma.reminderOccurrence.update({
      where: { idempotencyKey },
      data: { nextRetryAt: new Date(now.getTime() - 1000) },
    });

    // Concurrent claim after nextRetryAt -> exactly one claimed
    const [after1, after2] = await Promise.all([
      adapter.claimOccurrence({
        identityId,
        source: 'reminder',
        templateId,
        occurrenceKey,
        ownerToken: 'worker-A',
        leaseDurationMs: 30000,
        idempotencyKey,
      }),
      adapter.claimOccurrence({
        identityId,
        source: 'reminder',
        templateId,
        occurrenceKey,
        ownerToken: 'worker-B',
        leaseDurationMs: 30000,
        idempotencyKey,
      }),
    ]);

    const claimed = [after1, after2].filter((r) => r.claimed);
    const rejected = [after1, after2].filter((r) => !r.claimed);

    expect(claimed).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(claimed[0].receipt.status).toBe('running');
    expect(claimed[0].receipt.attempt).toBe(2);
  });

  it('16. Heartbeat preemption interleaving: stale owner heartbeat and record failure write do NOT overwrite new owner (lease/status retain new owner values)', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const prisma = await getPrisma();
    const adapter = new ReminderReliableOperationPrismaAdapter(prisma);
    const templateRepo = new ReminderTemplatePrismaRepository(prisma);

    const template = createSampleTemplate(identityId);
    await templateRepo.save(template);

    const templateId = template.id as string;
    const occurrenceKey = '2026-08-09T18:00:00.000Z';
    const idempotencyKey = buildIdempotencyKeyString({
      identityId,
      source: 'reminder',
      occurrenceKey,
    });

    // Worker 1 claims occurrence with short 100ms lease
    const claimWorker1 = await adapter.claimOccurrence({
      identityId,
      source: 'reminder',
      templateId,
      occurrenceKey,
      ownerToken: 'worker-1-stale',
      leaseDurationMs: 100,
      idempotencyKey,
    });
    expect(claimWorker1.claimed).toBe(true);

    // Wait for lease expiry
    await new Promise((resolve) => setTimeout(resolve, 120));

    // Worker 2 preempts and claims occurrence
    const claimWorker2 = await adapter.claimOccurrence({
      identityId,
      source: 'reminder',
      templateId,
      occurrenceKey,
      ownerToken: 'worker-2-active',
      leaseDurationMs: 30000,
      idempotencyKey,
    });
    expect(claimWorker2.claimed).toBe(true);
    expect(claimWorker2.lease?.ownerToken).toBe('worker-2-active');
    expect(claimWorker2.lease?.fencingToken).toBe(2);

    // Worker 1 attempts heartbeat using stale fencingToken 1 -> throws LeaseFencingException
    await expect(
      adapter.heartbeatLease({
        identityId,
        source: 'reminder',
        templateId,
        occurrenceKey,
        ownerToken: 'worker-1-stale',
        claimId: claimWorker1.receipt.operationId,
        fencingToken: 1,
        leaseDurationMs: 30000,
      }),
    ).rejects.toThrow(LeaseFencingException);

    // Worker 1 calls recordDeliveryIntent with stale failure receipt -> MUST NOT overwrite Worker 2's active lease/status
    const staleFailureReceipt = {
      ...claimWorker1.receipt,
      status: 'retryable' as const,
      lastError: 'Worker 1 failed after preemption',
      nextRetryAt: new Date(Date.now() + 5000).toISOString(),
    };

    await adapter.recordDeliveryIntent(staleFailureReceipt);

    // Assert DB state retains Worker 2's active values!
    const dbOcc = await prisma.reminderOccurrence.findUniqueOrThrow({
      where: { idempotencyKey },
    });
    expect(dbOcc.status).toBe('running');
    expect(dbOcc.ownerToken).toBe('worker-2-active');
    expect(dbOcc.fencingToken).toBe(2);
    expect(dbOcc.claimId).toBe(claimWorker2.lease?.claimId);
  });

  it('17. Dead-letter query & replay: queryDeadLetters retrieves dead letters, replayDeadLetter enables reclamation by cron', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const prisma = await getPrisma();
    const adapter = new ReminderReliableOperationPrismaAdapter(prisma);
    const templateRepo = new ReminderTemplatePrismaRepository(prisma);

    const template = createSampleTemplate(identityId);
    const now = new Date();
    template.setNextTriggerTime(now.getTime() - 1000);
    await templateRepo.save(template);

    const templateId = template.id as string;
    const triggerTime = template.getNextTriggerTime()!;
    const rawTimeIso = new Date(triggerTime).toISOString();
    const occurrenceKey = `${templateId}:${rawTimeIso}`;
    const idempotencyKey = buildIdempotencyKeyString({
      identityId,
      source: 'reminder',
      occurrenceKey,
    });

    // Seed DB occurrence as 'dead_letter'
    await prisma.reminderOccurrence.create({
      data: {
        id: 'occ-deadletter-replay-1',
        identityId,
        templateId,
        source: 'reminder',
        occurrenceKey,
        idempotencyKey,
        status: 'dead_letter',
        attempt: 3,
        lastError: 'Unrecoverable external error',
        deadLetterAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });

    // Query dead letters via adapter port
    const deadLetters = await adapter.queryDeadLetters(identityId);
    expect(deadLetters).toHaveLength(1);
    expect(deadLetters[0].idempotencyKey).toBe(idempotencyKey);
    expect(deadLetters[0].status).toBe('dead_letter');

    // Cron scan attempt before replay -> rejected
    const claimBeforeReplay = await adapter.claimOccurrence({
      identityId,
      source: 'reminder',
      templateId,
      occurrenceKey,
      ownerToken: 'worker-cron',
      leaseDurationMs: 30000,
      idempotencyKey,
    });
    expect(claimBeforeReplay.claimed).toBe(false);

    // Replay dead letter
    const replayedReceipt = await adapter.replayDeadLetter({
      identityId,
      occurrenceKey,
    });
    expect(replayedReceipt.status).toBe('retryable');
    expect(replayedReceipt.deadLetterAt).toBeNull();
    expect(replayedReceipt.nextRetryAt).not.toBeNull();

    // Cron scan after replay -> reclaims and processes successfully via scheduler.schedule()
    const groupRepo = new ReminderGroupPrismaRepository(prisma);
    const controlService = new ReminderTemplateControlService(templateRepo, groupRepo);
    const triggerService = new ReminderTriggerService(templateRepo, controlService);
    const runner = new PrismaReminderWriteTransactionRunner(prisma);
    const scheduler = new ReminderSchedulerService(
      templateRepo,
      triggerService,
      adapter,
      runner,
      controlService,
    );

    const schedRes = await scheduler.schedule({ identityId });
    expect(schedRes.successCount).toBe(1);

    const occDb = await prisma.reminderOccurrence.findUniqueOrThrow({ where: { idempotencyKey } });
    expect(occDb.status).toBe('succeeded');
  });

  it('20. Same identity same timestamp dual templates do not collide on idempotency key and both deliver successfully', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const prisma = await getPrisma();
    const adapter = new ReminderReliableOperationPrismaAdapter(prisma);
    const templateRepo = new ReminderTemplatePrismaRepository(prisma);
    const groupRepo = new ReminderGroupPrismaRepository(prisma);
    const runner = new PrismaReminderWriteTransactionRunner(prisma);

    const sameTriggerTime = Date.now() - 1000;

    // Create Template A
    const templateA = createSampleTemplate(identityId);
    templateA.setNextTriggerTime(sameTriggerTime);
    await templateRepo.save(templateA);

    // Create Template B
    const templateB = createSampleTemplate(identityId);
    templateB.setNextTriggerTime(sameTriggerTime);
    await templateRepo.save(templateB);

    const controlService = new ReminderTemplateControlService(templateRepo, groupRepo);
    const triggerService = new ReminderTriggerService(templateRepo, controlService);
    const scheduler = new ReminderSchedulerService(
      templateRepo,
      triggerService,
      adapter,
      runner,
      controlService,
    );

    // Execute schedule scan for identity
    const res = await scheduler.schedule({ identityId });

    expect(res.totalCount).toBe(2);
    expect(res.successCount).toBe(2);
    expect(res.failedCount).toBe(0);
    expect(res.skippedCount).toBe(0);

    // Verify both occurrences recorded in DB with status succeeded
    const occurrences = await prisma.reminderOccurrence.findMany({
      where: { identityId },
    });
    expect(occurrences).toHaveLength(2);
    expect(occurrences.map((o) => o.templateId).sort()).toEqual(
      [templateA.id as string, templateB.id as string].sort(),
    );
    expect(occurrences.every((o) => o.status === 'succeeded')).toBe(true);

    // Verify Notification outbox messages exist for both
    const outboxMessages = await prisma.outboxMessage.findMany({
      where: { identityId },
    });
    expect(outboxMessages).toHaveLength(2);
  });

  it('21. Fencing check at transaction commit: rollback entire transaction if lease is preempted during execution', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const prisma = await getPrisma();
    const adapter = new ReminderReliableOperationPrismaAdapter(prisma);
    const templateRepo = new ReminderTemplatePrismaRepository(prisma);
    const runner = new PrismaReminderWriteTransactionRunner(prisma);

    const template = createSampleTemplate(identityId);
    await templateRepo.save(template);

    const templateId = template.id as string;
    const occurrenceKey = '2026-08-09T08:00:00.000Z';
    const idempotencyKey = buildIdempotencyKeyString({
      identityId,
      source: 'reminder',
      occurrenceKey,
    });

    // 1. Worker 1 claims occurrence
    const claim1 = await adapter.claimOccurrence({
      identityId,
      source: 'reminder',
      templateId,
      occurrenceKey,
      ownerToken: 'worker-1',
      leaseDurationMs: 30000,
      idempotencyKey,
    });
    expect(claim1.claimed).toBe(true);

    // 2. Worker 1 attempts transaction; inside beforeCommitHook (after writing history/template/outbox, before commit update),
    // Worker 2 preempts the occurrence in DB.
    await expect(
      runner.executeClaimedOccurrenceTransaction({
        template,
        occurrence: {
          id: claim1.receipt.operationId,
          identityId,
          templateId,
          occurrenceKey,
          idempotencyKey,
          fencingToken: claim1.lease!.fencingToken,
          ownerToken: 'worker-1',
        },
        isEnabled: true,
        triggerTime: Date.now(),
        beforeCommitHook: async () => {
          // Simulate Worker 2 preempting the occurrence mid-transaction
          await prisma.reminderOccurrence.update({
            where: { id: claim1.receipt.operationId },
            data: {
              ownerToken: 'worker-2',
              fencingToken: 2,
              leaseExpiresAt: new Date(Date.now() + 30000),
            },
          });
        },
      }),
    ).rejects.toThrow(LeaseFencingException);

    // 3. Verify full transaction rollback: no history, no outbox, template nextTriggerAt un-advanced
    const histories = await prisma.reminderHistory.findMany({
      where: { identityId },
    });
    expect(histories).toHaveLength(0);

    const outbox = await prisma.outboxMessage.findMany({
      where: { identityId },
    });
    expect(outbox).toHaveLength(0);

    const dbTemplate = await templateRepo.findByIdForIdentity(template.id, identityId);
    expect(dbTemplate?.nextTriggerAt).toBeFalsy();

    // Occurrence status in DB remains worker-2's running status
    const dbOcc = await prisma.reminderOccurrence.findUniqueOrThrow({
      where: { id: claim1.receipt.operationId },
    });
    expect(dbOcc.ownerToken).toBe('worker-2');
    expect(dbOcc.fencingToken).toBe(2);
    expect(dbOcc.status).toBe('running');
  });

  it('22. Reclaimed occurrence heartbeat: worker 2 after lease expiry can successfully heartbeat reclaimed lease', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const prisma = await getPrisma();
    const adapter = new ReminderReliableOperationPrismaAdapter(prisma);
    const templateRepo = new ReminderTemplatePrismaRepository(prisma);

    const template = createSampleTemplate(identityId);
    await templateRepo.save(template);

    const templateId = template.id as string;
    const occurrenceKey = '2026-08-09T08:00:00.000Z';
    const idempotencyKey = buildIdempotencyKeyString({
      identityId,
      source: 'reminder',
      occurrenceKey,
    });

    // 1. Worker 1 claims occurrence
    const claim1 = await adapter.claimOccurrence({
      identityId,
      source: 'reminder',
      templateId,
      occurrenceKey,
      ownerToken: 'worker-1',
      leaseDurationMs: 30000,
      idempotencyKey,
    });
    expect(claim1.claimed).toBe(true);

    // 2. Expire lease in DB
    await prisma.reminderOccurrence.update({
      where: { id: claim1.receipt.operationId },
      data: {
        leaseExpiresAt: new Date(Date.now() - 1000),
      },
    });

    // 3. Worker 2 re-claims occurrence (new claimId generated, claimId !== id)
    const claim2 = await adapter.claimOccurrence({
      identityId,
      source: 'reminder',
      templateId,
      occurrenceKey,
      ownerToken: 'worker-2',
      leaseDurationMs: 30000,
      idempotencyKey,
    });
    expect(claim2.claimed).toBe(true);
    expect(claim2.lease!.claimId).not.toBe(claim1.receipt.operationId);

    // 4. Worker 2 performs heartbeat using claim2.lease.claimId
    const hbRes = await adapter.heartbeatLease({
      identityId,
      source: 'reminder',
      templateId,
      occurrenceKey,
      ownerToken: 'worker-2',
      claimId: claim2.lease!.claimId,
      fencingToken: claim2.lease!.fencingToken,
      leaseDurationMs: 30000,
    });

    expect(hbRes.renewed).toBe(true);
    expect(hbRes.lease).not.toBeNull();
    expect(hbRes.lease?.ownerToken).toBe('worker-2');
  });

  it('24. Lease expired mid-transaction: transaction commit rolls back if lease expires during execution without preemption', async () => {
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });
    const prisma = await getPrisma();
    const adapter = new ReminderReliableOperationPrismaAdapter(prisma);
    const templateRepo = new ReminderTemplatePrismaRepository(prisma);
    const runner = new PrismaReminderWriteTransactionRunner(prisma);

    const template = createSampleTemplate(identityId);
    await templateRepo.save(template);

    const templateId = template.id as string;
    const occurrenceKey = '2026-08-09T08:00:00.000Z';
    const idempotencyKey = buildIdempotencyKeyString({
      identityId,
      source: 'reminder',
      occurrenceKey,
    });

    // 1. Worker 1 claims occurrence
    const claim1 = await adapter.claimOccurrence({
      identityId,
      source: 'reminder',
      templateId,
      occurrenceKey,
      ownerToken: 'worker-1',
      leaseDurationMs: 30000,
      idempotencyKey,
    });
    expect(claim1.claimed).toBe(true);

    // 2. Worker 1 executes transaction; inside beforeCommitHook, lease expires in DB without preemption
    await expect(
      runner.executeClaimedOccurrenceTransaction({
        template,
        occurrence: {
          id: claim1.receipt.operationId,
          identityId,
          templateId,
          occurrenceKey,
          idempotencyKey,
          fencingToken: claim1.lease!.fencingToken,
          ownerToken: 'worker-1',
        },
        isEnabled: true,
        triggerTime: Date.now(),
        beforeCommitHook: async () => {
          // Expire the lease in DB during transaction execution
          await prisma.reminderOccurrence.update({
            where: { id: claim1.receipt.operationId },
            data: {
              leaseExpiresAt: new Date(Date.now() - 1000),
            },
          });
        },
      }),
    ).rejects.toThrow(LeaseFencingException);

    // 3. Verify full transaction rollback: no history, no outbox, template nextTriggerAt un-advanced
    const histories = await prisma.reminderHistory.findMany({
      where: { identityId },
    });
    expect(histories).toHaveLength(0);

    const outbox = await prisma.outboxMessage.findMany({
      where: { identityId },
    });
    expect(outbox).toHaveLength(0);

    const dbTemplate = await templateRepo.findByIdForIdentity(template.id, identityId);
    expect(dbTemplate?.nextTriggerAt).toBeFalsy();
  });

  it('18. W7 unified operation timeline query + audited replay via module API', async () => {
    const { createReminderPrismaModule } = await import('../../../prisma');
    const prisma = await getPrisma();
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });

    const moduleInstance = createReminderPrismaModule(prisma, {
      closureChecker: async () => false,
    });

    const templateRepo = new ReminderTemplatePrismaRepository(prisma);
    const template = createSampleTemplate(identityId);
    const now = new Date();
    template.setNextTriggerTime(now.getTime() - 1000);
    await templateRepo.save(template);

    const templateId = template.id as string;
    const triggerTime = template.getNextTriggerTime()!;
    const occurrenceKey = `${templateId}:${new Date(triggerTime).toISOString()}`;
    const idempotencyKey = buildIdempotencyKeyString({
      identityId,
      source: 'reminder',
      occurrenceKey,
    });

    // Seed a dead-letter occurrence
    await prisma.reminderOccurrence.create({
      data: {
        id: 'occ-w7-reminder-1',
        identityId,
        templateId,
        source: 'reminder',
        occurrenceKey,
        idempotencyKey,
        status: 'dead_letter',
        attempt: 3,
        lastError: 'deliverer unavailable',
        deadLetterAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });

    const ctx = { identityId } as never;
    const timelineRes = await moduleInstance.api.queryOperationTimeline(ctx);
    expect(timelineRes.ok).toBe(true);
    const entries = timelineRes.ok ? (timelineRes.data as any[]) : [];
    const entry = entries.find((e) => e.operationId === 'occ-w7-reminder-1');
    expect(entry).toBeDefined();
    expect(entry.source).toBe('reminder');
    expect(entry.status).toBe('dead_letter');
    expect(entry.failureReason).toBe('deliverer unavailable');
    expect(entry.attempts).toBe(3);
    expect(entry.replayable).toBe(true);

    // Unauthorized identity cannot replay another identity's occurrence
    const otherIdentity = IdentityId.generate();
    const otherCtx = { identityId: otherIdentity } as never;
    const rejected = await moduleInstance.api.replayOperation('occ-w7-reminder-1', otherCtx);
    expect(rejected.ok).toBe(false);

    // Authorized replay advances state and records audit
    const replayRes = await moduleInstance.api.replayOperation('occ-w7-reminder-1', ctx);
    expect(replayRes.ok).toBe(true);
    const replayed = replayRes.ok ? (replayRes.data as any) : null;
    expect(replayed.status).toBe('retryable');

    const auditRes = await moduleInstance.api.getOperationAudit(ctx);
    expect(auditRes.ok).toBe(true);
    const audit = auditRes.ok ? (auditRes.data as any[]) : [];
    const replayAudit = audit.find(
      (a) =>
        a.operationId === 'occ-w7-reminder-1' && a.action === 'replay' && a.source === 'reminder',
    );
    expect(replayAudit).toBeDefined();
    expect(replayAudit.actorIdentityId).toBe(identityId);

    // Timeline after replay reflects state advancement
    const timelineAfter = await moduleInstance.api.queryOperationTimeline(ctx);
    const entryAfter = (timelineAfter.ok ? (timelineAfter.data as any[]) : []).find(
      (e) => e.operationId === 'occ-w7-reminder-1',
    );
    expect(entryAfter.status).toBe('retryable');
    expect(entryAfter.replayable).toBe(false);

    // P1-3: every timeline query records a timeline_query audit with result count.
    const queryAuditRows = await prisma.operationAuditLog.findMany({
      where: { actorIdentityId: identityId, action: 'timeline_query', source: 'reminder' },
    });
    expect(queryAuditRows.length).toBeGreaterThanOrEqual(2);
    const queryAudit = queryAuditRows[0];
    expect(queryAudit.operationId).toBe('*timeline-query*');
    const details = JSON.parse(queryAudit.details as string);
    expect(details.resultCount).toBeGreaterThanOrEqual(1);
    expect(typeof details.filters).toBe('object');

    moduleInstance.dispose();
  });

  it('P1-4: reminder replay audit write failure rolls back the state advancement (atomicity)', async () => {
    const { createReminderModule } = await import('../../../reminder.module');
    const prisma = await getPrisma();
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });

    const templateRepo = new ReminderTemplatePrismaRepository(prisma);
    const template = createSampleTemplate(identityId);
    const now = new Date();
    template.setNextTriggerTime(now.getTime() - 1000);
    await templateRepo.save(template);

    const templateId = template.id as string;
    const triggerTime = template.getNextTriggerTime()!;
    const occurrenceKey = `${templateId}:${new Date(triggerTime).toISOString()}`;
    const idempotencyKey = buildIdempotencyKeyString({
      identityId,
      source: 'reminder',
      occurrenceKey,
    });

    await prisma.reminderOccurrence.create({
      data: {
        id: 'occ-w7-fail-inject-1',
        identityId,
        templateId,
        source: 'reminder',
        occurrenceKey,
        idempotencyKey,
        status: 'dead_letter',
        attempt: 3,
        lastError: 'deliverer unavailable',
        deadLetterAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });

    const failingAudit = {
      record: async () => {
        throw new Error('audit write failure injected');
      },
      listByActor: async () => [],
    };

    const { ReminderResponsePrismaRepository } =
      await import('../../../../infrastructure/adapters/prisma/reminder-response-prisma.repository');
    const { UserReminderPreferencePrismaRepository } =
      await import('../../../../infrastructure/adapters/prisma/user-reminder-preference-prisma.repository');

    const moduleInstance = createReminderModule({
      reminderTemplateRepository: templateRepo,
      reminderGroupRepository: new ReminderGroupPrismaRepository(prisma),
      reminderResponseRepository: new ReminderResponsePrismaRepository(prisma),
      userReminderPreferenceRepository: new UserReminderPreferencePrismaRepository(prisma),
      routineProfileStore: new PrismaRoutineProfileStore(prisma),
      closureChecker: async () => false,
      reliablePort: new ReminderReliableOperationPrismaAdapter(prisma),
      auditRepository: failingAudit as never,
    });

    const ctx = { identityId } as never;
    const replayRes = await moduleInstance.api.replayOperation('occ-w7-fail-inject-1', ctx);
    expect(replayRes.ok).toBe(false);

    // The occurrence must NOT have advanced out of dead_letter: atomic rollback.
    const after = await prisma.reminderOccurrence.findUniqueOrThrow({
      where: { id: 'occ-w7-fail-inject-1' },
    });
    expect(after.status).toBe('dead_letter');
    expect(after.deadLetterAt).not.toBeNull();

    moduleInstance.dispose();
  });

  it('P1-3: reminder timeline query fails closed when audit write fails', async () => {
    const { createReminderModule } = await import('../../../reminder.module');
    const prisma = await getPrisma();
    const identityId = IdentityId.generate();
    await seedAccount({ id: identityId });

    const templateRepo = new ReminderTemplatePrismaRepository(prisma);
    const template = createSampleTemplate(identityId);
    const now = new Date();
    template.setNextTriggerTime(now.getTime() - 1000);
    await templateRepo.save(template);

    const failingAudit = {
      record: async () => {
        throw new Error('audit write failure injected');
      },
      listByActor: async () => [],
    };

    const { ReminderResponsePrismaRepository } =
      await import('../../../../infrastructure/adapters/prisma/reminder-response-prisma.repository');
    const { UserReminderPreferencePrismaRepository } =
      await import('../../../../infrastructure/adapters/prisma/user-reminder-preference-prisma.repository');

    const moduleInstance = createReminderModule({
      reminderTemplateRepository: templateRepo,
      reminderGroupRepository: new ReminderGroupPrismaRepository(prisma),
      reminderResponseRepository: new ReminderResponsePrismaRepository(prisma),
      userReminderPreferenceRepository: new UserReminderPreferencePrismaRepository(prisma),
      routineProfileStore: new PrismaRoutineProfileStore(prisma),
      closureChecker: async () => false,
      reliablePort: new ReminderReliableOperationPrismaAdapter(prisma),
      auditRepository: failingAudit as never,
    });

    const ctx = { identityId } as never;
    await expect(moduleInstance.api.queryOperationTimeline(ctx)).rejects.toThrow(
      'audit write failure injected',
    );

    moduleInstance.dispose();
  });
});
