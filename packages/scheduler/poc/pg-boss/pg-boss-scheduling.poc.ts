import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PgBoss } from 'pg-boss';
import { prisma } from '@memoflow/database';
import type { ScheduledIntent, SchedulingOwner } from '@memoflow/contracts/schedule';
import { TEST_DATABASE_URL } from '@memoflow/test-utils/setup/database';
import {
  PGBOSS_POC_DLQ,
  PGBOSS_POC_QUEUE,
  PGBOSS_POC_SCHEMA,
  PgBossSchedulingPocAdapter,
  type PgBossPocPayload,
  createPrismaPgBossDb,
  translateRetryPolicy,
} from './pg-boss-scheduling.adapter.poc';

const owner: SchedulingOwner = {
  identityId: 'poc-identity',
  type: 'task-template',
  id: 'task-template-poc',
};

function intent(
  schedulingKey: string,
  payload: Record<string, unknown>,
  runAt = Date.now() + 60_000,
): ScheduledIntent {
  return {
    schedulingKey,
    handlerKey: 'task.reminder.fire',
    runAt,
    payloadVersion: 1,
    payload,
    sourceRevision: 1,
    retryPolicy: {
      maxRetries: 2,
      initialDelayMs: 1_000,
      maxDelayMs: 4_000,
      backoffMultiplier: 2,
    },
    timeoutMs: 30_000,
  };
}

function createBoss(applicationName: string): PgBoss {
  return new PgBoss({
    connectionString: TEST_DATABASE_URL,
    schema: PGBOSS_POC_SCHEMA,
    application_name: applicationName,
    createSchema: true,
    migrate: true,
    supervise: false,
    monitorIntervalSeconds: 1,
    schedule: false,
    useListenNotify: false,
  });
}

async function ensurePocQueues(boss: PgBoss): Promise<void> {
  await boss.createQueue(PGBOSS_POC_DLQ);
  await boss.createQueue(PGBOSS_POC_QUEUE, {
    deadLetter: PGBOSS_POC_DLQ,
    retryLimit: 0,
    retryDelay: 1,
    retryBackoff: false,
    expireInSeconds: 30,
  });
}

async function jobsForOwner(boss: PgBoss) {
  return boss.findJobs<PgBossPocPayload>(PGBOSS_POC_QUEUE, {
    data: { ownerKey: 'owner:v1:12:poc-identity:13:task-template:17:task-template-poc' },
  });
}

describe('POC-6401 pg-boss SchedulingPort evidence', () => {
  let boss: PgBoss;

  beforeAll(async () => {
    boss = createBoss('memoflow-poc-primary');
    boss.on('error', () => undefined);
    await boss.start();
    await ensurePocQueues(boss);
  });

  beforeEach(async () => {
    await boss.deleteAllJobs(PGBOSS_POC_QUEUE);
    await boss.deleteAllJobs(PGBOSS_POC_DLQ);
  });

  afterAll(async () => {
    await boss.stop();
    await prisma.$disconnect();
  });

  it('wraps owner complete-set reconcile in one transaction: create/update/unchanged/delete', async () => {
    const adapter = new PgBossSchedulingPocAdapter(boss, prisma);
    const runAt = Date.now() + 60_000;

    const first = await adapter.reconcile(owner, [
      intent('key-a', { value: 'a' }, runAt),
      intent('key-b', { value: 'b' }, runAt),
    ]);
    expect(first).toMatchObject({
      status: 'succeeded',
      desiredCount: 2,
      createdCount: 2,
      updatedCount: 0,
      deletedCount: 0,
      unchangedCount: 0,
    });

    const second = await adapter.reconcile(owner, [
      intent('key-a', { value: 'a' }, runAt),
      intent('key-b', { value: 'b-v2' }, runAt),
      intent('key-c', { value: 'c' }, runAt),
    ]);
    expect(second).toMatchObject({
      status: 'succeeded',
      desiredCount: 3,
      createdCount: 1,
      updatedCount: 1,
      deletedCount: 0,
      unchangedCount: 1,
    });

    const third = await adapter.reconcile(owner, [
      intent('key-b', { value: 'b-v2' }, runAt),
      intent('key-c', { value: 'c' }, runAt),
    ]);
    expect(third).toMatchObject({
      status: 'succeeded',
      desiredCount: 2,
      createdCount: 0,
      updatedCount: 0,
      deletedCount: 1,
      unchangedCount: 2,
    });

    const jobs = await jobsForOwner(boss);
    expect(jobs.map((job) => job.data.schedulingKey).sort()).toEqual(['key-b', 'key-c']);
  });

  it('serializes concurrent complete-set reconciles for the same owner with a PostgreSQL advisory lock', async () => {
    const left = new PgBossSchedulingPocAdapter(boss, prisma);
    const right = new PgBossSchedulingPocAdapter(boss, prisma);
    const runAt = Date.now() + 60_000;

    const [leftReceipt, rightReceipt] = await Promise.all([
      left.reconcile(owner, [intent('key-left', { side: 'left' }, runAt)]),
      right.reconcile(owner, [intent('key-right', { side: 'right' }, runAt)]),
    ]);

    expect(leftReceipt.status).toBe('succeeded');
    expect(rightReceipt.status).toBe('succeeded');
    const jobs = await jobsForOwner(boss);
    expect(jobs).toHaveLength(1);
    expect(['key-left', 'key-right']).toContain(jobs[0].data.schedulingKey);
  });

  it('preserves the terminal schedulingKey collision invariant instead of mutating terminal work', async () => {
    const adapter = new PgBossSchedulingPocAdapter(boss, prisma);
    const runAt = Date.now() + 60_000;
    expect(
      (await adapter.reconcile(owner, [intent('terminal-key', { revision: 1 }, runAt)])).status,
    ).toBe('succeeded');
    const [persisted] = await jobsForOwner(boss);
    await boss.cancel(PGBOSS_POC_QUEUE, persisted.id);

    const collision = await adapter.reconcile(owner, [
      intent('terminal-key', { revision: 2 }, runAt),
    ]);
    expect(collision).toMatchObject({
      status: 'failed',
      failure: { code: 'PERSISTED_KEY_COLLISION', retryable: false },
    });
    const [stillTerminal] = await jobsForOwner(boss);
    expect(stillTerminal.state).toBe('cancelled');
    expect((stillTerminal.data.payload as { revision: number }).revision).toBe(1);
  });

  it('rolls back pg-boss upserts when the owner reconcile transaction fails', async () => {
    const baseline = new PgBossSchedulingPocAdapter(boss, prisma);
    await baseline.reconcile(owner, [intent('key-a', { value: 'before' })]);

    const failing = new PgBossSchedulingPocAdapter(boss, prisma, {
      failureInjector(point) {
        if (point === 'after-upsert') throw new Error('poc injected rollback');
      },
    });
    const receipt = await failing.reconcile(owner, [
      intent('key-a', { value: 'after' }),
      intent('key-b', { value: 'new' }),
    ]);
    expect(receipt).toMatchObject({
      status: 'failed',
      failure: { code: 'TRANSACTION_FAILED', retryable: true },
    });

    const jobs = await jobsForOwner(boss);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].data.schedulingKey).toBe('key-a');
    expect((jobs[0].data.payload as { value: string }).value).toBe('before');
  });

  it('supports transaction-aware enqueue through the pg-boss per-call db adapter', async () => {
    const rolledBackId = randomUUID();
    await expect(
      prisma.$transaction(async (tx) => {
        await boss.send(
          PGBOSS_POC_QUEUE,
          { marker: 'must-rollback' },
          { id: rolledBackId, db: createPrismaPgBossDb(tx) },
        );
        throw new Error('rollback caller transaction');
      }),
    ).rejects.toThrow('rollback caller transaction');
    expect(await boss.findJobs(PGBOSS_POC_QUEUE, { id: rolledBackId })).toHaveLength(0);

    const committedId = randomUUID();
    await prisma.$transaction(async (tx) => {
      await boss.send(
        PGBOSS_POC_QUEUE,
        { marker: 'committed' },
        { id: committedId, db: createPrismaPgBossDb(tx) },
      );
    });
    expect(await boss.findJobs(PGBOSS_POC_QUEUE, { id: committedId })).toHaveLength(1);
  });

  it('claims one ready job exactly once across two pg-boss instances', async () => {
    const secondBoss = createBoss('memoflow-poc-second-worker');
    secondBoss.on('error', () => undefined);
    await secondBoss.start();
    try {
      const id = await boss.send(PGBOSS_POC_QUEUE, { marker: 'claim-once' });
      expect(id).toBeTruthy();

      const [left, right] = await Promise.all([
        boss.fetch(PGBOSS_POC_QUEUE, { includeMetadata: true }),
        secondBoss.fetch(PGBOSS_POC_QUEUE, { includeMetadata: true }),
      ]);
      expect(left.length + right.length).toBe(1);
      const claimed = [...left, ...right][0];
      expect(claimed.id).toBe(id);
      await boss.complete(PGBOSS_POC_QUEUE, claimed.id);
    } finally {
      await secondBoss.stop();
    }
  });

  it('retries failed work with deferred backoff, while exposing the retry-contract mismatch', async () => {
    const id = await boss.send(
      PGBOSS_POC_QUEUE,
      { marker: 'retry' },
      {
        retryLimit: 2,
        retryDelay: 1,
        retryBackoff: true,
        retryDelayMax: 3,
        deadLetter: PGBOSS_POC_DLQ,
      },
    );
    const [claimed] = await boss.fetch(PGBOSS_POC_QUEUE, { includeMetadata: true });
    expect(claimed.id).toBe(id);
    const failedAt = Date.now();
    await boss.fail(PGBOSS_POC_QUEUE, claimed.id, { error: 'poc retry' });

    const [retried] = await boss.findJobs(PGBOSS_POC_QUEUE, {
      id: claimed.id,
    });
    expect(retried.state).toBe('retry');
    // pg-boss increments retryCount when the deferred retry is claimed again, not when fail() schedules it.
    expect(retried.retryCount).toBe(0);
    expect(retried.startAfter.getTime()).toBeGreaterThan(failedAt);
    const [retryClaim] = await boss.fetch(PGBOSS_POC_QUEUE, {
      includeMetadata: true,
      ignoreStartAfter: true,
    });
    expect(retryClaim.id).toBe(claimed.id);
    expect(retryClaim.retryCount).toBe(1);
    await boss.complete(PGBOSS_POC_QUEUE, retryClaim.id);

    const translation = translateRetryPolicy({
      maxRetries: 3,
      initialDelayMs: 1_500,
      maxDelayMs: 5_500,
      backoffMultiplier: 3,
    });
    expect(translation.exact).toBe(false);
    expect(translation.gaps).toEqual(
      expect.arrayContaining([
        expect.stringContaining('precision is seconds'),
        expect.stringContaining('arbitrary multiplier'),
      ]),
    );
  });

  it('moves terminal failures to a DLQ and can redrive them to the source queue', async () => {
    const id = await boss.send(
      PGBOSS_POC_QUEUE,
      { marker: 'dlq-redrive' },
      { retryLimit: 0, deadLetter: PGBOSS_POC_DLQ },
    );
    const [claimed] = await boss.fetch(PGBOSS_POC_QUEUE, { includeMetadata: true });
    expect(claimed.id).toBe(id);
    await boss.fail(PGBOSS_POC_QUEUE, claimed.id, { error: 'terminal' });

    const dlqBefore = await boss.findJobs(PGBOSS_POC_DLQ, {
      data: { marker: 'dlq-redrive' },
    });
    expect(dlqBefore).toHaveLength(1);
    expect(dlqBefore[0].sourceName).toBe(PGBOSS_POC_QUEUE);

    await boss.deleteJob(PGBOSS_POC_QUEUE, claimed.id);
    expect(await boss.redrive(PGBOSS_POC_DLQ, { sourceName: PGBOSS_POC_QUEUE })).toBe(1);
    expect(
      await boss.findJobs(PGBOSS_POC_QUEUE, { data: { marker: 'dlq-redrive' } }),
    ).toHaveLength(1);
    expect(
      await boss.findJobs(PGBOSS_POC_DLQ, { data: { marker: 'dlq-redrive' } }),
    ).toHaveLength(0);
  });

  it('supports heartbeat touch and expiration supervision for active jobs', async () => {
    const heartbeatId = await boss.send(
      PGBOSS_POC_QUEUE,
      { marker: 'heartbeat' },
      { heartbeatSeconds: 10, expireInSeconds: 30, retryLimit: 0 },
    );
    const [heartbeatJob] = await boss.fetch(PGBOSS_POC_QUEUE, { includeMetadata: true });
    expect(heartbeatJob.id).toBe(heartbeatId);
    expect(heartbeatJob.heartbeatSeconds).toBe(10);
    const touchResult = (await boss.touch(PGBOSS_POC_QUEUE, heartbeatJob.id)) as unknown as {
      affected: number;
    };
    expect(touchResult.affected).toBe(1);
    await boss.complete(PGBOSS_POC_QUEUE, heartbeatJob.id);

    const expiringIdMaybe = await boss.send(
      PGBOSS_POC_QUEUE,
      { marker: 'expire' },
      { expireInSeconds: 1, retryLimit: 0 },
    );
    if (!expiringIdMaybe) throw new Error('pg-boss did not create the expiration PoC job');
    const expiringId = expiringIdMaybe;
    const [expiringJob] = await boss.fetch(PGBOSS_POC_QUEUE, { includeMetadata: true });
    expect(expiringJob.id).toBe(expiringId);
    expect(expiringJob.expireInSeconds).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 2_100));
    await boss.supervise(PGBOSS_POC_QUEUE);
    const [expired] = await boss.findJobs(PGBOSS_POC_QUEUE, {
      id: expiringId,
    });
    expect(expired.state).toBe('failed');
  });

  it('recovers durable deferred work after the creating pg-boss instance stops', async () => {
    const recoveryQueue = 'memoflow-recovery-poc';
    const producer = createBoss('memoflow-poc-recovery-producer');
    producer.on('error', () => undefined);
    await producer.start();
    await producer.createQueue(recoveryQueue);
    await producer.deleteAllJobs(recoveryQueue);
    const id = await producer.send(
      recoveryQueue,
      { marker: 'restart-recovery' },
      { startAfter: new Date(Date.now() + 300) },
    );
    await producer.stop();

    const consumer = createBoss('memoflow-poc-recovery-consumer');
    consumer.on('error', () => undefined);
    await consumer.start();
    try {
      await new Promise((resolve) => setTimeout(resolve, 350));
      const [recovered] = await consumer.fetch(recoveryQueue, { includeMetadata: true });
      expect(recovered.id).toBe(id);
      await consumer.complete(recoveryQueue, recovered.id);
    } finally {
      await consumer.stop();
    }
  });
});
