import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildSchedulingKey } from '../../../../scheduling';
import { ScheduledInvocation } from '../../../domain/entities/scheduled-invocation';
import { ScheduledInvocationPrismaRepository } from './scheduled-invocation-prisma.repository';
import { createScheduleLeasePrismaRepository } from '../../lease/schedule-lease.repository';
import { createScheduledInvocationSchedulingPort } from '../../scheduling';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';

function createInvocation(identityId: string, runAt: number) {
  const owner = { identityId, type: 'task-plan', id: 'plan-1' };
  return ScheduledInvocation.create({
    id: 'scheduled-invocation:integration-1',
    identityId,
    owner,
    schedulingKey: buildSchedulingKey(owner.type, owner.id, 'reminder:occurrence-1'),
    handlerKey: 'task.reminder.fire',
    payloadVersion: 1,
    payload: { taskOccurrenceId: 'occurrence-1' },
    runAt,
    sourceRevision: 7,
    retryPolicy: {
      enabled: true,
      maxRetries: 3,
      initialDelayMs: 1_000,
      maxDelayMs: 10_000,
      backoffMultiplier: 2,
    },
    priority: 'normal',
    timeoutMs: 30_000,
    name: 'Task reminder',
    tags: ['task'],
    now: runAt - 1_000,
  });
}

describe('ScheduledInvocationPrismaRepository integration', () => {
  afterAll(async () => {
    await cleanAll();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await cleanAll();
  });

  it('rolls back a canonical ScheduledInvocation transaction when the owner reconcile callback fails', async () => {
    const identityId = 'scheduler-int-transaction-rollback';
    await seedAccount({ id: identityId });
    const prisma = await getPrisma();
    const repository = new ScheduledInvocationPrismaRepository(prisma, prisma);
    const invocation = createInvocation(identityId, Date.now() + 60_000);

    await expect(
      repository.withTransaction(async (txRepository) => {
        await txRepository.save(invocation.toState());
        throw new Error('injected owner reconcile failure');
      }),
    ).rejects.toThrow('injected owner reconcile failure');

    await expect(
      prisma.scheduledInvocation.findUnique({ where: { id: invocation.id } }),
    ).resolves.toBeNull();
  });

  it('persists canonical owner reconcile state and its durable receipt atomically', async () => {
    const identityId = 'scheduler-int-neutral-owner';
    await seedAccount({ id: identityId });
    const prisma = await getPrisma();
    const repository = new ScheduledInvocationPrismaRepository(prisma, prisma);
    const schedulingPort = createScheduledInvocationSchedulingPort(repository, {
      now: () => 1_800_000_000_000,
      operationIdFactory: () => 'operation:scheduler-int-neutral-owner',
    });
    const owner = { identityId, type: 'task-plan', id: 'plan-1' };
    const schedulingKey = buildSchedulingKey(owner.type, owner.id, 'reminder:occurrence-1');

    const receipt = await schedulingPort.reconcile(owner, [
      {
        schedulingKey,
        handlerKey: 'task.reminder.fire',
        runAt: 1_800_000_060_000,
        payloadVersion: 1,
        payload: { taskOccurrenceId: 'occurrence-1' },
        sourceRevision: 7,
      },
    ]);

    const row = await prisma.scheduledInvocation.findFirstOrThrow({
      where: { identityId, ownerType: owner.type, ownerId: owner.id, schedulingKey },
    });
    const operation = await prisma.schedulingReconcileOperation.findUniqueOrThrow({
      where: { operationId: receipt.operationId },
    });

    expect(row).toMatchObject({
      identityId,
      ownerType: owner.type,
      ownerId: owner.id,
      schedulingKey,
      handlerKey: 'task.reminder.fire',
      payloadVersion: 1,
      sourceRevision: 7,
      status: 'pending',
    });
    expect(operation).toMatchObject({
      identityId,
      ownerType: owner.type,
      ownerId: owner.id,
      status: 'succeeded',
      desiredCount: 1,
      createdCount: 1,
      updatedCount: 0,
      deletedCount: 0,
      unchangedCount: 0,
    });
  });

  it('recovers a claimed canonical invocation after the scheduler worker crashes and its host lease expires', async () => {
    const identityId = 'scheduler-int-worker-crash-recovery';
    await seedAccount({ id: identityId });
    const prisma = await getPrisma();
    const repositoryA = new ScheduledInvocationPrismaRepository(prisma, prisma);
    const repositoryB = new ScheduledInvocationPrismaRepository(prisma, prisma);
    const now = Date.now();
    const invocation = createInvocation(identityId, now - 1_000);
    await repositoryA.save(invocation.toState());

    const leaseA = createScheduleLeasePrismaRepository(prisma);
    const leaseB = createScheduleLeasePrismaRepository(prisma);
    const leaseKey = 'schedule-host';
    const leaseExpiresAt = now + 1_000;

    await expect(
      leaseA.tryAcquire({
        leaseKey,
        ownerToken: 'worker-a',
        now,
        expiresAt: leaseExpiresAt,
      }),
    ).resolves.toBe(true);

    const firstClaim = await repositoryA.claimAndStart({
      invocationId: invocation.id,
      identityId,
      claimToken: 'claim-a',
      claimExpiresAt: leaseExpiresAt,
      now,
      workerId: 'worker-a',
    });
    expect(firstClaim?.invocation.id).toBe(invocation.id);
    expect(firstClaim?.attempt.attemptNumber).toBe(1);
    expect(firstClaim?.attempt.fencingToken).toBe(1);

    await expect(
      leaseB.tryAcquire({
        leaseKey,
        ownerToken: 'worker-b',
        now: now + 500,
        expiresAt: now + 1_500,
      }),
    ).resolves.toBe(false);

    const takeoverAt = leaseExpiresAt + 1;
    await expect(
      leaseB.tryAcquire({
        leaseKey,
        ownerToken: 'worker-b',
        now: takeoverAt,
        expiresAt: takeoverAt + 60_000,
      }),
    ).resolves.toBe(true);

    await expect(repositoryB.recoverExpiredClaims(takeoverAt)).resolves.toBe(1);
    const recovered = await repositoryB.findByIdForIdentity(identityId, invocation.id);
    expect(recovered).toMatchObject({
      id: invocation.id,
      status: 'retry_wait',
      nextAttemptAt: takeoverAt,
      claimToken: null,
      claimExpiresAt: null,
      attemptCount: 1,
      fencingToken: 1,
    });

    const secondClaim = await repositoryB.claimAndStart({
      invocationId: invocation.id,
      identityId,
      claimToken: 'claim-b',
      claimExpiresAt: takeoverAt + 60_000,
      now: takeoverAt,
      workerId: 'worker-b',
    });
    expect(secondClaim?.invocation.id).toBe(invocation.id);
    expect(secondClaim?.attempt.attemptNumber).toBe(2);
    expect(secondClaim?.attempt.fencingToken).toBe(2);

    const leaseRow = await prisma.scheduleLease.findUniqueOrThrow({ where: { leaseKey } });
    expect(leaseRow.ownerToken).toBe('worker-b');
  });
});
