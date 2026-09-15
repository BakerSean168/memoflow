import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ExecutionStatus,
  SourceModule,
  Timezone,
} from '@memoflow/contracts/schedule';
import { RetryPolicy, ScheduleConfig, ScheduleTaskMetadata } from '../../../domain/value-objects';
import { ScheduleTask } from '../../../domain/aggregates/schedule-task';
import { ScheduleTaskPrismaRepository } from './schedule-task-prisma.repository';
import { buildSchedulingKey } from '../../../../scheduling';
import { createScheduleTaskSchedulingPort } from '../../scheduling';
import { createScheduleLeasePrismaRepository } from '../../lease/schedule-lease.repository';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '@memoflow/test-utils/setup/integration-helpers';

function createScheduleTask(identityId: string) {
  const task = ScheduleTask.create({
    identityId,
    name: 'Rebalance goal priorities',
    sourceModule: SourceModule.Goal,
    sourceEntityId: 'goal-123',
    schedule: ScheduleConfig.create({
      cronExpression: '0 9 * * *',
      timezone: Timezone.Shanghai,
      startDate: null,
      endDate: null,
      maxExecutions: 5,
    }),
    description: null,
    metadata: ScheduleTaskMetadata.create({
      payload: { goalId: 'goal-123', reason: 'oracle-hardening' },
      tags: ['goal', 'nightly'],
      priority: 'High',
      timeout: 45000,
    }),
    retryPolicy: RetryPolicy.create({
      enabled: true,
      maxRetries: 4,
      retryDelay: 3000,
      backoffMultiplier: 2,
      maxRetryDelay: 20000,
    }),
  });

  task.recordExecution(ExecutionStatus.Success, 125, {
    goalId: 'goal-123',
    adjusted: true,
  });

  return task;
}

describe('ScheduleTaskPrismaRepository integration', () => {
  afterAll(async () => {
    await cleanAll();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await cleanAll();
  });

  it('persists and reloads execution children, metadata JSON, enum state, and nullable dates', async () => {
    const identityId = 'schedule-int-identity';
    await seedAccount({ id: identityId });

    const prisma = await getPrisma();
    const repository = new ScheduleTaskPrismaRepository(prisma);
    const task = createScheduleTask(identityId);

    await repository.save(task);

    const row = await prisma.scheduleTask.findUnique({
      where: { id: String(task.id) },
      include: { executions: true },
    });
    const loaded = await repository.findById(String(task.id));

    expect(row).not.toBeNull();
    expect(row?.startDate).toBeNull();
    expect(row?.endDate).toBeNull();
    expect(row?.payload).toContain('goal-123');
    expect(row?.tags).toContain('nightly');
    expect(row?.executions).toHaveLength(1);

    expect(loaded).not.toBeNull();
    expect(loaded?.sourceModule).toBe(SourceModule.Goal);
    expect(loaded?.description).toBeNull();
    expect(loaded?.executionCount).toBe(1);
    expect(loaded?.metadata.payload).toEqual({
      goalId: 'goal-123',
      reason: 'oracle-hardening',
    });
    expect(loaded?.metadata.tags).toEqual(['goal', 'nightly']);
    expect(loaded?.executions).toHaveLength(1);
    expect(loaded?.executions?.[0]?.status).toBe(ExecutionStatus.Success);
  });

  it('rolls back a transaction-scoped save when the owner reconcile callback fails', async () => {
    const identityId = 'schedule-int-transaction-rollback';
    await seedAccount({ id: identityId });

    const prisma = await getPrisma();
    const repository = new ScheduleTaskPrismaRepository(prisma);
    const task = createScheduleTask(identityId);

    await expect(
      repository.withTransaction(async (txRepository) => {
        await txRepository.save(task);
        throw new Error('injected owner reconcile failure');
      }),
    ).rejects.toThrow('injected owner reconcile failure');

    await expect(
      prisma.scheduleTask.findUnique({ where: { id: String(task.id) } }),
    ).resolves.toBeNull();
  });


  it('persists neutral scheduling identity and a durable reconcile receipt in the owner transaction', async () => {
    const identityId = 'schedule-int-neutral-owner';
    await seedAccount({ id: identityId });

    const prisma = await getPrisma();
    const repository = new ScheduleTaskPrismaRepository(prisma);
    const schedulingPort = createScheduleTaskSchedulingPort(repository);
    const owner = { identityId, type: 'task', id: 'task-plan-1' };
    const schedulingKey = buildSchedulingKey(owner.type, owner.id, 'reminder:occurrence-1');

    const receipt = await schedulingPort.reconcile(owner, [
      {
        schedulingKey,
        handlerKey: 'task.reminder.fire',
        runAt: Date.now() + 60_000,
        payloadVersion: 1,
        payload: { taskOccurrenceId: 'task-occurrence-1' },
        sourceRevision: 7,
      },
    ]);

    const row = await prisma.scheduleTask.findFirstOrThrow({
      where: { identityId, ownerType: owner.type, ownerId: owner.id, schedulingKey },
    });
    const operation = await prisma.schedulingReconcileOperation.findUniqueOrThrow({
      where: { operationId: receipt.operationId },
    });

    expect(row).toMatchObject({
      schedulingKey,
      ownerType: owner.type,
      ownerId: owner.id,
      handlerKey: 'task.reminder.fire',
      payloadVersion: 1,
      sourceRevision: '7',
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

  it('recovers a claimed invocation after the scheduler worker crashes and its host lease expires', async () => {
    const identityId = 'schedule-int-worker-crash-recovery';
    await seedAccount({ id: identityId });

    const prisma = await getPrisma();
    const repositoryA = new ScheduleTaskPrismaRepository(prisma);
    const repositoryB = new ScheduleTaskPrismaRepository(prisma);
    const task = createScheduleTask(identityId);
    await repositoryA.save(task);

    const persisted = await prisma.scheduleTask.findUniqueOrThrow({
      where: { id: String(task.id) },
    });
    expect(persisted.nextRunAt).not.toBeNull();
    if (!persisted.nextRunAt) return;

    const leaseA = createScheduleLeasePrismaRepository(prisma);
    const leaseB = createScheduleLeasePrismaRepository(prisma);
    const leaseKey = 'schedule-host';
    const leaseStartedAt = Date.now();
    const leaseExpiresAt = leaseStartedAt + 1_000;

    await expect(
      leaseA.tryAcquire({
        leaseKey,
        ownerToken: 'worker-a',
        now: leaseStartedAt,
        expiresAt: leaseExpiresAt,
      }),
    ).resolves.toBe(true);

    // worker A claims the invocation and then crashes before recording execution.
    await expect(
      repositoryA.claimForExecution(String(task.id), persisted.nextRunAt),
    ).resolves.toBe(true);

    // The replacement host cannot own Scheduler until the crashed host lease expires.
    await expect(
      leaseB.tryAcquire({
        leaseKey,
        ownerToken: 'worker-b',
        now: leaseStartedAt + 500,
        expiresAt: leaseStartedAt + 1_500,
      }),
    ).resolves.toBe(false);

    // After expiry, the replacement host takes the lease and may re-claim the same
    // unchanged nextRunAt. Scheduler therefore recovers at-least-once after a crash;
    // domain handlers remain responsible for idempotent side-effect fences.
    await expect(
      leaseB.tryAcquire({
        leaseKey,
        ownerToken: 'worker-b',
        now: leaseExpiresAt + 1,
        expiresAt: leaseExpiresAt + 60_000,
      }),
    ).resolves.toBe(true);
    await expect(
      repositoryB.claimForExecution(String(task.id), persisted.nextRunAt),
    ).resolves.toBe(true);

    const leaseRow = await prisma.scheduleLease.findUniqueOrThrow({ where: { leaseKey } });
    expect(leaseRow.ownerToken).toBe('worker-b');
    expect(await repositoryB.findDueTasksForExecution(persisted.nextRunAt)).toHaveLength(1);
  });

  it('lists tasks by identity without leaking other scheduler state', async () => {
    const identityId = 'schedule-int-primary';
    const otherIdentityId = 'schedule-int-other';
    await seedAccount({ id: identityId });
    await seedAccount({ id: otherIdentityId });

    const prisma = await getPrisma();
    const repository = new ScheduleTaskPrismaRepository(prisma);
    const firstTask = createScheduleTask(identityId);
    const secondTask = ScheduleTask.create({
      identityId,
      name: 'Dispatch reminder digest',
      sourceModule: SourceModule.Reminder,
      sourceEntityId: 'reminder-789',
      schedule: ScheduleConfig.createDefault(Timezone.Utc),
    });
    const foreignTask = createScheduleTask(otherIdentityId);

    await repository.save(firstTask);
    await repository.save(secondTask);
    await repository.save(foreignTask);

    const tasks = await repository.findByIdentityId(identityId);

    expect(tasks).toHaveLength(2);
    expect(tasks.every((task) => task.identityId === identityId)).toBe(true);
    expect(tasks.map((task) => task.name)).toEqual(
      expect.arrayContaining(['Rebalance goal priorities', 'Dispatch reminder digest']),
    );
  });
});
