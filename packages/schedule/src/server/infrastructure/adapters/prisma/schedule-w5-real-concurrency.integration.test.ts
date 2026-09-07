import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '../../../../__tests__/integration-helpers';
import { SchedulePrismaRepository } from './schedule-prisma.repository';
import { ScheduleEventApplicationService } from '../../../application/services/schedule-event-application-service';
import { ScheduleRebuildWorkerService } from '../../../application/services/schedule-rebuild-worker-service';
import { ScheduleDomainEventPublisherService } from '../../../application/services/schedule-domain-event-publisher';
import { CalendarEntry } from '../../../domain/aggregates/calendar-entry';
import { PowerSyncScheduleRepository } from '../powersync/schedule-powersync.repository';
import { PrismaClient } from '@memoflow/database';
import { PrismaPg } from '@prisma/adapter-pg';
import type { IEventBus } from '@memoflow/patterns';
import { createEventBusAdapter } from '@memoflow/patterns';
import type { IElectronDatabase, IElectronDatabaseQueryResult } from '@memoflow/contracts/electron';
import { CrossPlatformEventBus, eventBus } from '@memoflow/utils/domain';
import { ScheduleEventDeliveryLogConsumer } from '../../consumers/schedule-event-delivery-log.consumer';
import { createUnifiedOperationMetricsRecorder } from '@memoflow/patterns/operations';
// Cross-package integration: Calendar reliability must interoperate with the concrete Scheduler lease.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createSchedulerPrismaRepositories } from '@memoflow/scheduler';

function createRealSqlitePowerSyncDb(): IElectronDatabase {
  const sqlite = new (require('better-sqlite3'))(':memory:') as {
    prepare(sql: string): { run(...p: unknown[]): { changes: number }; all(...p: unknown[]): unknown[]; get(...p: unknown[]): unknown };
    exec(sql: string): void;
    close(): void;
  };
  sqlite.exec(`
    CREATE TABLE schedules (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration INTEGER NOT NULL,
      has_conflict INTEGER,
      conflicting_schedules TEXT,
      priority INTEGER,
      location TEXT,
      attendees TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const wrapper: IElectronDatabase = {
    async execute(sql: string, parameters?: unknown[]): Promise<IElectronDatabaseQueryResult> {
      const stmt = sqlite.prepare(sql);
      const info = stmt.run(...(parameters ?? []));
      return { rowsAffected: info.changes };
    },
    async getAll<T>(sql: string, parameters?: unknown[]): Promise<T[]> {
      const stmt = sqlite.prepare(sql);
      return stmt.all(...(parameters ?? [])) as T[];
    },
    async getOptional<T>(sql: string, parameters?: unknown[]): Promise<T | null> {
      const stmt = sqlite.prepare(sql);
      const row = stmt.get(...(parameters ?? []));
      return (row as T) ?? null;
    },
    async get<T>(sql: string, parameters?: unknown[]): Promise<T> {
      const stmt = sqlite.prepare(sql);
      const row = stmt.get(...(parameters ?? []));
      if (!row) throw new Error(`Query returned no rows: ${sql}`);
      return row as T;
    },
    async writeTransaction<T>(callback: (tx: IElectronDatabaseTransaction) => Promise<T>): Promise<T> {
      sqlite.exec('BEGIN');
      try {
        const result = await callback(wrapper as IElectronDatabaseTransaction);
        sqlite.exec('COMMIT');
        return result;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
    close: () => sqlite.close(),
  } as IElectronDatabase & { close(): void };
  return wrapper;
}

function createRecordingEventBus(): {
  bus: IEventBus;
  events: { eventType: string; aggregateId: string; idempotencyKey?: string }[];
} {
  const events: { eventType: string; aggregateId: string; idempotencyKey?: string }[] = [];
  const bus: IEventBus = {
    async publish(event) {
      events.push({ eventType: event.eventType, aggregateId: event.aggregateId, idempotencyKey: event.idempotencyKey });
    },
  };
  return { bus, events };
}

const passThroughLease = {
  execute: async (_key: string, task: any) => ({
    acquired: true,
    value: await task({ ensureHeld: async () => undefined }),
  }),
};

describe('W5: Real Database Concurrency & PowerSync Integration Matrix', () => {
  const identityId = 'w5-real-concurrency-identity';

  afterAll(async () => {
    await cleanAll();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await cleanAll();
    await seedAccount({ id: identityId });
  });

  it('Requirement 1: Real PostgreSQL two-connection CAS race — one succeeds (version=2), competitor receives 409 CONFLICT with currentVersion: 2', async () => {
    const prisma1 = await getPrisma();
    // Genuinely distinct second connection (separate PrismaClient + pool), not the shared singleton
    const prisma2 = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
    });
    try {
    const repo1 = new SchedulePrismaRepository(prisma1);
    const repo2 = new SchedulePrismaRepository(prisma2);
    const service1 = new ScheduleEventApplicationService(repo1);
    const service2 = new ScheduleEventApplicationService(repo2);

    const created = await service1.createSchedule({
      identityId,
      title: 'Race Event',
      startTime: 1000,
      endTime: 2000,
    });
    expect(created.version).toBe(1);

    // Connection A and Connection B race to update with expectedVersion: 1
    const p1 = service1.updateSchedule(created.id, identityId, {
      title: 'Winner A',
      expectedVersion: 1,
    });
    const p2 = service2.updateSchedule(created.id, identityId, {
      title: 'Winner B',
      expectedVersion: 1,
    });

    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const winner = (fulfilled[0] as PromiseFulfilledResult<any>).value;
    expect(winner.version).toBe(2);

    const loserErr = (rejected[0] as PromiseRejectedResult).reason;
    expect(loserErr).toMatchObject({
      code: 'CONFLICT',
      context: {
        currentVersion: 2,
        expectedVersion: 1,
      },
    });

    const finalRow = await prisma1.schedule.findUnique({ where: { id: created.id } });
    expect(finalRow?.version).toBe(2);
    } finally {
      await prisma2.$disconnect();
    }
  });

  it('Requirement 2: Prisma delete/update/outbox transactional rollback & zero external events published on failure', async () => {
    const prisma = await getPrisma();
    const repo = new SchedulePrismaRepository(prisma);
    const service = new ScheduleEventApplicationService(repo);

    const created = await service.createSchedule({
      identityId,
      title: 'Transactional Event',
      startTime: 1000,
      endTime: 2000,
    });

    // Same-transaction durable outbox write: the delete domain event is present
    // in schedule_domain_event_outbox before any process-level publish.
    const beforeDelete = await prisma.scheduleDomainEventOutbox.count({
      where: { scheduleId: created.id },
    });
    expect(beforeDelete).toBeGreaterThan(0);

    const eventSpy = vi.fn();
    eventBus.on('schedule:calendar-entry-deleted', eventSpy);

    try {
      // Fault injection: force rebuild outbox creation to fail inside delete transaction
      vi.spyOn(SchedulePrismaRepository.prototype, 'createRebuildOutbox').mockImplementationOnce(async () => {
        throw new Error('Transaction failure injected during delete aggregate');
      });

      await expect(
        service.deleteSchedule(created.id, identityId, 1),
      ).rejects.toThrow('Transaction failure injected');

      // Assert row STILL exists in PostgreSQL database (transaction rolled back)
      const dbRow = await prisma.schedule.findUnique({ where: { id: created.id } });
      expect(dbRow).not.toBeNull();
      expect(dbRow?.title).toBe('Transactional Event');

      // Assert NO domain events were published externally (correct event type)
      expect(eventSpy).not.toHaveBeenCalled();

      // Assert the delete domain event outbox row was rolled back with the transaction:
      // no 'schedule:calendar-entry-deleted' row exists even though deleteAggregate flushed it.
      const deletedOutboxRows = await prisma.scheduleDomainEventOutbox.count({
        where: { scheduleId: created.id, eventType: 'schedule:calendar-entry-deleted' },
      });
      expect(deletedOutboxRows).toBe(0);
    } finally {
      eventBus.off('schedule:calendar-entry-deleted', eventSpy);
    }
  });

  it('Requirement 3: PowerSync repository CAS, update, and real transaction rollback', async () => {
    const db = createRealSqlitePowerSyncDb();
    const psRepo = new PowerSyncScheduleRepository(db);
    const service = new ScheduleEventApplicationService(psRepo);

    const created = await service.createSchedule({
      identityId,
      title: 'PowerSync Event',
      startTime: 1000,
      endTime: 2000,
    });

    expect(created.version).toBe(1);

    // PowerSync CAS update
    const updated = await service.updateSchedule(created.id, identityId, {
      title: 'PowerSync Updated',
      expectedVersion: 1,
    });
    expect(updated.version).toBe(2);
    expect(updated.title).toBe('PowerSync Updated');

    // PowerSync stale CAS update fails
    await expect(
      service.updateSchedule(created.id, identityId, {
        title: 'PowerSync Stale Update',
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      context: { currentVersion: 2, expectedVersion: 1 },
    });

    // PowerSync transaction rollback test
    vi.spyOn(PowerSyncScheduleRepository.prototype, 'createRebuildOutbox').mockImplementationOnce(async () => {
      throw new Error('PowerSync outbox write fault injected');
    });

    await expect(
      service.updateSchedule(created.id, identityId, {
        title: 'Should Rollback PowerSync',
        expectedVersion: 2,
      }),
    ).rejects.toThrow('PowerSync outbox write fault injected');

    const loaded = await service.getSchedule(created.id, identityId);
    expect(loaded?.title).toBe('PowerSync Updated');
    expect(loaded?.version).toBe(2);

    // Same-transaction domain-event outbox rollback: the failing update flushed a
    // 'schedule:calendar-entry-updated' row inside the transaction, which must be
    // rolled back with the aggregate — only the two prior commits remain.
    const updatedOutboxRows = await db.getAll<{ event_type: string; idempotency_key: string }>(
      'SELECT event_type, idempotency_key FROM schedule_domain_event_outbox WHERE identity_id = ?',
      [identityId],
    );
    const updatedKeys = updatedOutboxRows.filter((r) => r.event_type === 'schedule:calendar-entry-updated');
    expect(updatedKeys).toHaveLength(1);
    expect(updatedKeys[0].idempotency_key).toBe(
      `domain:${identityId}:${created.id}:2:schedule:calendar-entry-updated`,
    );
  });

  it('Requirement 4: Worker crash after dequeue (claim then drop) — timeout reclaim, worker2 restart converges', async () => {
    const prisma = await getPrisma();
    const repo = new SchedulePrismaRepository(prisma);
    const service = new ScheduleEventApplicationService(repo);

    // Create 2 overlapping events → conflict projections + rebuild outbox entries
    const e1 = await service.createSchedule({ identityId, title: 'Event A', startTime: 1000, endTime: 2000 });
    const e2 = await service.createSchedule({ identityId, title: 'Event B', startTime: 1500, endTime: 2500 });

    const s1 = await service.getSchedule(e1.id, identityId);
    const s2 = await service.getSchedule(e2.id, identityId);
    expect(s1?.hasConflict).toBe(true);
    expect(s2?.hasConflict).toBe(true);

    // Delete Event B → enqueues a durable rebuild outbox row
    await service.deleteSchedule(e2.id, identityId, e2.version);

    // Worker 1 CLAIMS the rebuild outbox item, then "crashes" immediately after
    // dequeue — it never refreshes the projection and never acks.
    const crashToken = 'worker1-crashed-token';
    const claimedByWorker1 = await repo.claimRebuildOutboxItems(crashToken, 10, 30000);
    expect(claimedByWorker1.length).toBeGreaterThan(0);

    // Worker 1 never returns: the claim ages past the timeout.
    await prisma.scheduleRebuildOutbox.updateMany({
      where: { claimToken: crashToken },
      data: { claimedAt: new Date(Date.now() - 120000) },
    });

    // Worker 2 (restart) reclaims the timed-out item and converges.
    const worker2 = new ScheduleRebuildWorkerService(repo, passThroughLease);
    const res = await worker2.processOutbox(identityId);

    expect(res.processedCount).toBeGreaterThan(0);
    expect(res.failedCount).toBe(0);

    const row = await prisma.scheduleRebuildOutbox.findFirst({
      where: { id: claimedByWorker1[0].id },
    });
    expect(row?.status).toBe('completed');
    expect(row?.claimToken).toBeNull();

    // Event A conflict should now be cleared
    const afterDeleteS1 = await service.getSchedule(e1.id, identityId);
    expect(afterDeleteS1?.hasConflict).toBe(false);
  });

  it('Requirement 5: Stale source revision rejection in conflict projection', async () => {
    const prisma = await getPrisma();
    const repo = new SchedulePrismaRepository(prisma);

    const entry = CalendarEntry.create({
      identityId,
      title: 'Projection Test Event',
      startTime: 1000,
      endTime: 2000,
    });
    await repo.save(entry); // version = 1

    // Update business aggregate to version = 2
    entry.updateTitle('New Title');
    await repo.save(entry, 1); // version = 2

    // Attempt to apply a stale conflict projection with sourceRevision = 1
    await repo.updateConflictProjection(identityId, entry.id, true, ['other-event'], 1);

    // Verify DB record: hasConflict remains false, version remains 2, title remains 'New Title'
    const dbRow = await prisma.schedule.findUnique({ where: { id: entry.id } });
    expect(dbRow?.hasConflict).toBe(false);
    expect(dbRow?.version).toBe(2);
    expect(dbRow?.title).toBe('New Title');
  });

  it('Requirement 6: Timeout reclaim — old worker claim token ack is rejected after reclaim', async () => {
    const prisma = await getPrisma();
    const repo = new SchedulePrismaRepository(prisma);
    const service = new ScheduleEventApplicationService(repo);

    // Create overlapping events to generate a rebuild outbox entry
    const _e1 = await service.createSchedule({ identityId, title: 'Race A', startTime: 1000, endTime: 2000 });
    const e2 = await service.createSchedule({ identityId, title: 'Race B', startTime: 1500, endTime: 2500 });

    // Delete to enqueue a rebuild outbox row (durable, same tx)
    await service.deleteSchedule(e2.id, identityId, e2.version);

    // Old worker claims with token A
    const tokenA = 'token-old-worker';
    const claimedA = await repo.claimRebuildOutboxItems(tokenA, 10, 30000);
    expect(claimedA.length).toBeGreaterThan(0);

    // Simulate claim timeout: old claim is now expired (claimedAt older than timeout)
    const now = new Date();
    await prisma.scheduleRebuildOutbox.updateMany({
      where: { claimToken: tokenA },
      data: { claimedAt: new Date(now.getTime() - 120000) },
    });

    // New worker reclaims with token B (timeout reclaim path)
    const tokenB = 'token-new-worker';
    const claimedB = await repo.claimRebuildOutboxItems(tokenB, 10, 30000);
    expect(claimedB.length).toBeGreaterThan(0);

    // Old worker tries to ack with its (now stale) token A — must be rejected (0 affected)
    const firstId = claimedA[0].id;
    await expect(
      repo.markRebuildOutboxProcessed(firstId, tokenA),
    ).rejects.toThrow();

    // The record remains owned by token B (status processing + claim_token B)
    const row = await prisma.scheduleRebuildOutbox.findUnique({ where: { id: firstId } });
    expect(row?.claimToken).toBe(tokenB);
  });

  it('Requirement 7: PowerSync claim ownership — old worker token ack is rejected after timeout reclaim', async () => {
    const db = createRealSqlitePowerSyncDb();
    const psRepo = new PowerSyncScheduleRepository(db);
    const service = new ScheduleEventApplicationService(psRepo);

    // Create overlapping events to enqueue a rebuild outbox row
    const _e1 = await service.createSchedule({ identityId, title: 'PS Race A', startTime: 1000, endTime: 2000 });
    const e2 = await service.createSchedule({ identityId, title: 'PS Race B', startTime: 1500, endTime: 2500 });
    await service.deleteSchedule(e2.id, identityId, e2.version);

    // Old worker claims with token A
    const tokenA = 'ps-token-old';
    const claimedA = await psRepo.claimRebuildOutboxItems(tokenA, 10, 30000);
    expect(claimedA.length).toBeGreaterThan(0);

    // Age the claim beyond the timeout (claimed_at older than threshold)
    await db.execute('UPDATE schedule_rebuild_outbox SET claimed_at = ? WHERE claim_token = ?', [
      new Date(Date.now() - 120000).toISOString(),
      tokenA,
    ]);

    // New worker reclaims with token B (timeout reclaim path)
    const tokenB = 'ps-token-new';
    const claimedB = await psRepo.claimRebuildOutboxItems(tokenB, 10, 30000);
    expect(claimedB.length).toBeGreaterThan(0);

    // Old worker ack with stale token A must be rejected (lease lost)
    const firstId = claimedA[0].id;
    await expect(
      psRepo.markRebuildOutboxProcessed(firstId, tokenA),
    ).rejects.toThrow(/lease lost/);

    // Record remains owned by token B (status processing + claim_token B)
    const row = await db.getOptional<{ claim_token: string; status: string }>(
      'SELECT claim_token, status FROM schedule_rebuild_outbox WHERE id = ?',
      [firstId],
    );
    expect(row?.claim_token).toBe(tokenB);
    expect(row?.status).toBe('processing');
  });

  it('Requirement 8: Prisma domain-event outbox — same-transaction durable write for create/update/delete, idempotency-key uniqueness, rollback leaves zero rows', async () => {
    const prisma = await getPrisma();
    const repo = new SchedulePrismaRepository(prisma);
    const service = new ScheduleEventApplicationService(repo);

    const created = await service.createSchedule({
      identityId,
      title: 'Outbox Event',
      startTime: 1000,
      endTime: 2000,
    });

    // create flushed 'schedule:calendar-entry-created' into the durable outbox
    let rows = await prisma.scheduleDomainEventOutbox.findMany({
      where: { scheduleId: created.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((r) => r.eventType)).toContain('schedule:calendar-entry-created');
    expect(rows.every((r) => r.status === 'pending')).toBe(true);

    // update flushes 'schedule:calendar-entry-updated' with the post-command revision
    await service.updateSchedule(created.id, identityId, {
      title: 'Outbox Updated',
      expectedVersion: 1,
    });
    rows = await prisma.scheduleDomainEventOutbox.findMany({
      where: { scheduleId: created.id },
      orderBy: { createdAt: 'asc' },
    });
    const updatedRow = rows.find((r) => r.eventType === 'schedule:calendar-entry-updated');
    expect(updatedRow).toBeDefined();
    expect(updatedRow!.idempotencyKey).toBe(
      `domain:${identityId}:${created.id}:2:schedule:calendar-entry-updated`,
    );

    // Re-running the same idempotency key must NOT create a duplicate row
    await repo.createDomainEventOutbox([
      {
        identityId,
        scheduleId: created.id,
        eventType: 'schedule:calendar-entry-updated',
        payload: updatedRow!.payload,
        idempotencyKey: updatedRow!.idempotencyKey,
      },
    ]);
    const afterRedelivery = await prisma.scheduleDomainEventOutbox.count({
      where: { idempotencyKey: updatedRow!.idempotencyKey },
    });
    expect(afterRedelivery).toBe(1);

    // delete flushes 'schedule:calendar-entry-deleted' in the same transaction
    await service.deleteSchedule(created.id, identityId, 2);
    rows = await prisma.scheduleDomainEventOutbox.findMany({
      where: { scheduleId: created.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((r) => r.eventType)).toContain('schedule:calendar-entry-deleted');

    // Fault injection: outbox write failure inside update → full rollback of
    // aggregate + domain-event outbox rows for that command.
    const e2 = await service.createSchedule({
      identityId,
      title: 'Rollback Target',
      startTime: 3000,
      endTime: 4000,
    });
    vi.spyOn(SchedulePrismaRepository.prototype, 'flushDomainEvents').mockImplementationOnce(async () => {
      throw new Error('domain outbox write fault injected');
    });
    await expect(
      service.updateSchedule(e2.id, identityId, { title: 'Must Not Persist', expectedVersion: 1 }),
    ).rejects.toThrow('domain outbox write fault injected');
    const e2Row = await prisma.schedule.findUnique({ where: { id: e2.id } });
    expect(e2Row?.title).toBe('Rollback Target');
    expect(e2Row?.version).toBe(1);
  });

  it('Requirement 9: Prisma domain-event publisher — crash before dequeue and crash after publish before ack both converge on restart', async () => {
    const prisma = await getPrisma();
    const repo = new SchedulePrismaRepository(prisma);
    const service = new ScheduleEventApplicationService(repo);

    // Crash point A: "crash before dequeue" — a publisher never claimed the row;
    // a restarted publisher processes it once and acks.
    const a = await service.createSchedule({ identityId, title: 'Crash A', startTime: 1000, endTime: 2000 });
    const { bus: busA, events: eventsA } = createRecordingEventBus();
    const publisherA = new ScheduleDomainEventPublisherService(repo, passThroughLease, busA);
    const resA = await publisherA.processOutbox();
    expect(resA.publishedCount).toBeGreaterThan(0);
    expect(eventsA.map((e) => e.eventType)).toContain('schedule:calendar-entry-created');
    const rowA = await prisma.scheduleDomainEventOutbox.findFirst({ where: { scheduleId: a.id } });
    expect(rowA?.status).toBe('completed');
    expect(rowA?.publishedAt).not.toBeNull();

    // Crash point B: "crash after publish, before ack" — the item is claimed and
    // published, but never acked. After the claim times out, a restarted publisher
    // reclaims it and converges to a stable completed state.
    const b = await service.createSchedule({ identityId, title: 'Crash B', startTime: 2000, endTime: 3000 });
    const crashToken = 'publisher-crashed-token';
    const claimedB = await repo.claimDomainEventOutboxItems(crashToken, 10, 30000);
    expect(claimedB.length).toBeGreaterThan(0);
    const crashedId = claimedB.find((c) => c.scheduleId === b.id)?.id ?? claimedB[0].id;

    // Publisher 1 publishes the event then "crashes" before ack.
    const { bus: busB, events: eventsB } = createRecordingEventBus();
    const item = claimedB.find((c) => c.id === crashedId)!;
    await busB.publish({
      eventType: item.eventType,
      payload: JSON.parse(item.payload),
      aggregateId: item.scheduleId,
      occurredAt: item.createdAt,
    });

    // Age the claim so a new publisher can reclaim it.
    await prisma.scheduleDomainEventOutbox.updateMany({
      where: { claimToken: crashToken },
      data: { claimedAt: new Date(Date.now() - 120000) },
    });

    // Restarted publisher reclaims and converges.
    const publisherB = new ScheduleDomainEventPublisherService(repo, passThroughLease, busB);
    const resB = await publisherB.processOutbox();
    expect(resB.failedCount).toBe(0);

    const rowB = await prisma.scheduleDomainEventOutbox.findUnique({ where: { id: crashedId } });
    expect(rowB?.status).toBe('completed');
    expect(rowB?.publishedAt).not.toBeNull();

    // Converged: no infinite loop, a fresh run publishes nothing new.
    const resB2 = await publisherB.processOutbox();
    expect(resB2.publishedCount).toBe(0);
    expect(eventsB.map((e) => e.eventType)).toContain('schedule:calendar-entry-created');
  });

  it('Requirement 10: Prisma publisher at-least-once — publish-before-ack crash, crash-leftover lease expiry takeover, fully rebuilt chain redelivers the same key and the durable receipt+effect dedupes atomically', async () => {
    const prisma = await getPrisma();
    const repo = new SchedulePrismaRepository(prisma);
    const service = new ScheduleEventApplicationService(repo);

    const created = await service.createSchedule({ identityId, title: 'Idempotent', startTime: 1000, endTime: 2000 });

    // ----- First publisher: fresh bus/adapter/consumer; deterministic publish-before-ack crash -----
    const busA = new CrossPlatformEventBus();
    const adapterA = createEventBusAdapter(busA);
    const consumerA = new ScheduleEventDeliveryLogConsumer(prisma, busA);
    consumerA.start();

    const realLeaseA = createSchedulerPrismaRepositories(prisma).leaseCoordinator;
    const publisherA = new ScheduleDomainEventPublisherService(repo, realLeaseA, adapterA, {
      faultInjection: { failAfterPublishBeforeAck: true },
    });
    // The publisher crashes AFTER publish (consumer received + recorded receipt) but BEFORE ack.
    await expect(publisherA.processOutbox()).rejects.toThrow('after publish before ack');

    const crashRow = await prisma.scheduleDomainEventOutbox.findFirst({ where: { scheduleId: created.id } });
    expect(crashRow?.status).toBe('processing'); // real persisted processing + claimToken
    expect(crashRow?.claimToken).toBeTruthy();
    // The consumer already recorded its durable receipt + effect in its own transaction.
    expect(await prisma.scheduleEventConsumerReceipt.count()).toBe(1);
    expect(await prisma.scheduleEventDeliveryLog.count()).toBe(1);

    // ----- Crash-leftover lease: a dead process left an unexpired lease row (no finally release) -----
    const nowMs = Date.now();
    await prisma.scheduleLease.create({
      data: {
        id: 'schedule-domain-event-publisher:dead-owner-crash',
        leaseKey: 'schedule-domain-event-publisher',
        ownerToken: 'dead-owner-crash',
        expiresAt: new Date(nowMs + 60_000),
      },
    });

    // ----- Fully rebuilt chain: NEW client, NEW repo, NEW bus/adapter/consumer, NEW lease -----
    // The crashed process's in-process objects are discarded: stop consumerA, then rebuild everything fresh.
    consumerA.stop();
    const rebuiltClient = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    try {
      const rebuiltRepo = new SchedulePrismaRepository(rebuiltClient);
      const busB = new CrossPlatformEventBus();
      const adapterB = createEventBusAdapter(busB);
      const consumerB = new ScheduleEventDeliveryLogConsumer(rebuiltClient, busB);
      consumerB.start();
      const realLeaseB = createSchedulerPrismaRepositories(rebuiltClient).leaseCoordinator;

      const restartedPublisher = new ScheduleDomainEventPublisherService(rebuiltRepo, realLeaseB, adapterB);

      // The leftover crash lease is UNEXPIRED -> the rebuilt publisher cannot acquire it yet.
      const blocked = await restartedPublisher.processOutbox();
      expect(blocked.leaseAcquired).toBe(false); // crash-leftover lease still held by the dead owner
      expect(await rebuiltClient.scheduleDomainEventOutbox.count()).toBeGreaterThanOrEqual(1); // untouched

      // ----- Timeout reclaim: the dead owner's lease expires; the rebuilt publisher takes over -----
      await rebuiltClient.scheduleLease.updateMany({
        where: { ownerToken: 'dead-owner-crash' },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      // Age the outbox processing claim so the rebuilt publisher can reclaim it too.
      await rebuiltClient.scheduleDomainEventOutbox.updateMany({
        where: { scheduleId: created.id },
        data: { claimedAt: new Date(Date.now() - 120000) },
      });

      const second = await restartedPublisher.processOutbox();
      expect(second.leaseAcquired).toBe(true); // expired crash lease was cleaned + re-acquired via DB
      expect(second.publishedCount).toBe(1); // redelivered the SAME event (at-least-once)

      // ----- Convergence: only DB state; the rebuilt consumer's durable receipt dedupes the same key -----
      expect(await rebuiltClient.scheduleEventConsumerReceipt.count()).toBe(1);
      expect(await rebuiltClient.scheduleEventDeliveryLog.count()).toBe(1); // independent effect happened exactly once
      const rowAfter = await rebuiltClient.scheduleDomainEventOutbox.findFirst({ where: { scheduleId: created.id } });
      expect(rowAfter?.status).toBe('completed');
    } finally {
      await rebuiltClient.$disconnect();
    }
    consumerA.stop();
  });

  it('Requirement 11: PowerSync real sqlite — same-transaction domain-event outbox write and claim/ack ownership', async () => {
    const db = createRealSqlitePowerSyncDb();
    const psRepo = new PowerSyncScheduleRepository(db);
    const service = new ScheduleEventApplicationService(psRepo);

    // create + update write domain events into the same sqlite transaction
    const created = await service.createSchedule({ identityId, title: 'PS Outbox', startTime: 1000, endTime: 2000 });
    await service.updateSchedule(created.id, identityId, { title: 'PS Outbox v2', expectedVersion: 1 });

    const rows = await db.getAll<{ event_type: string; status: string; idempotency_key: string }>(
      'SELECT event_type, status, idempotency_key FROM schedule_domain_event_outbox WHERE identity_id = ? ORDER BY created_at ASC',
      [identityId],
    );
    expect(rows.map((r) => r.event_type)).toContain('schedule:calendar-entry-created');
    expect(rows.map((r) => r.event_type)).toContain('schedule:calendar-entry-updated');
    expect(rows.every((r) => r.status === 'pending')).toBe(true);

    // Claim with token A, publish, ack → completed.
    const { bus, events } = createRecordingEventBus();
    const publisher = new ScheduleDomainEventPublisherService(psRepo, passThroughLease, bus);
    const res = await publisher.processOutbox();
    expect(res.publishedCount).toBe(2);
    expect(res.failedCount).toBe(0);
    expect(events).toHaveLength(2);

    const completed = await db.getOptional<{ status: string; published_at: string | null }>(
      'SELECT status, published_at FROM schedule_domain_event_outbox WHERE event_type = ?',
      ['schedule:calendar-entry-created'],
    );
    expect(completed?.status).toBe('completed');
    expect(completed?.published_at).not.toBeNull();
  });

  it('Requirement 12: out-of-order source revision — stale rebuild outbox processed after a newer state is rejected by the projection', async () => {
    const prisma = await getPrisma();
    const repo = new SchedulePrismaRepository(prisma);
    const service = new ScheduleEventApplicationService(repo);

    const e1 = await service.createSchedule({ identityId, title: 'Ordering A', startTime: 1000, endTime: 2000 });
    const e2 = await service.createSchedule({ identityId, title: 'Ordering B', startTime: 1500, endTime: 2500 });
    expect((await service.getSchedule(e1.id, identityId))?.hasConflict).toBe(true);

    // Delete B enqueues a rebuild item whose sourceRevision is e1's version at that time (1).
    await service.deleteSchedule(e2.id, identityId, e2.version);

    // A newer business update bumps e1 to version 2 BEFORE the worker drains the outbox.
    await service.updateSchedule(e1.id, identityId, { title: 'Ordering A v2', expectedVersion: 1 });

    // Manually enqueue a STALE rebuild item (old revision 1, out-of-order redelivery).
    await repo.createRebuildOutbox({
      identityId,
      scheduleId: e1.id,
      startTime: 1000,
      endTime: 2000,
      sourceRevision: 1,
      idempotencyKey: 'rebuild:ordering-stale-redelivery',
    });

    const projectionCalls: { id: string; sourceRevision: number }[] = [];
    const originalUpdateProjection = repo.updateConflictProjection.bind(repo);
    vi.spyOn(repo, 'updateConflictProjection').mockImplementation(async (...args) => {
      projectionCalls.push({ id: String(args[1]), sourceRevision: args[4] });
      return originalUpdateProjection(...args);
    });

    // Worker processes the whole outbox including the stale item last.
    const worker = new ScheduleRebuildWorkerService(repo, passThroughLease);
    const res = await worker.processOutbox(identityId);
    expect(res.failedCount).toBe(0);

    // The worker threaded the outbox sourceRevision through to the projection.
    expect(projectionCalls.some((c) => c.id === e1.id && c.sourceRevision === 1)).toBe(true);

    // The stale projection (sourceRevision 1) must not regress the newer state:
    // e1 remains version 2 with the updated title and the post-delete projection.
    const dbRow = await prisma.schedule.findUnique({ where: { id: e1.id } });
    expect(dbRow?.version).toBe(2);
    expect(dbRow?.title).toBe('Ordering A v2');
    expect(dbRow?.hasConflict).toBe(false);
  });
  it('Requirement 13: Consumer concurrent duplicate delivery — unique-constrained receipt + independent effect make exactly one side effect win; loser is explicit idempotent success', async () => {
    const prisma = await getPrisma();
    const key = 'concurrent-dedup-key';
    const bus = new CrossPlatformEventBus();
    const consumer = new ScheduleEventDeliveryLogConsumer(prisma, bus);
    consumer.start();

    // Two concurrent deliveries of the SAME key race the unique constraint.
    const adapter = createEventBusAdapter(bus);
    const adapter2 = createEventBusAdapter(bus);
    const event = {
      eventType: 'schedule:calendar-entry-created',
      payload: {},
      aggregateId: 'a',
      occurredAt: new Date(),
      idempotencyKey: key,
    } as never;
    const settled = await Promise.allSettled([adapter.publish(event), adapter2.publish(event)]);
    // The loser is explicitly recognized as consumed success — NOT a swallowed error.
    expect(settled.map((s) => s.status)).toEqual(['fulfilled', 'fulfilled']);

    const receipts = await prisma.scheduleEventConsumerReceipt.findMany({ where: { idempotencyKey: key } });
    expect(receipts).toHaveLength(1); // unique constraint: exactly one receipt row
    const logs = await prisma.scheduleEventDeliveryLog.findMany({ where: { idempotencyKey: key } });
    expect(logs).toHaveLength(1); // exactly one independent effect committed
    consumer.stop();
    await prisma.scheduleEventConsumerReceipt.deleteMany({ where: { idempotencyKey: key } });
    await prisma.scheduleEventDeliveryLog.deleteMany({ where: { idempotencyKey: key } });
  });

  it('P1-5: schedule rebuild worker drives the real worker path and emits unified metric events', async () => {
    const prisma = await getPrisma();
    const recorder = createUnifiedOperationMetricsRecorder();
    const repo = new SchedulePrismaRepository(prisma, undefined, recorder);
    const service = new ScheduleEventApplicationService(repo);

    const e1 = await service.createSchedule({
      identityId,
      title: 'Metrics Worker A',
      startTime: 1000,
      endTime: 2000,
    });
    const e2 = await service.createSchedule({
      identityId,
      title: 'Metrics Worker B',
      startTime: 1500,
      endTime: 2500,
    });
    await service.deleteSchedule(e2.id, identityId, e2.version);

    // W7：真实 outbox 持久化成功点必须发射 persisted
    const persistedSnap = recorder.snapshot();
    expect(persistedSnap['memoflow.schedule-rebuild.outbox.persisted']).toBeGreaterThanOrEqual(1);

    const worker = new ScheduleRebuildWorkerService(repo, passThroughLease, {}, recorder);
    const res = await worker.processOutbox(identityId);

    expect(res.processedCount).toBeGreaterThan(0);
    const snap = recorder.snapshot();
    expect(snap['memoflow.schedule-rebuild.outbox.persisted']).toBeGreaterThanOrEqual(1);
    expect(snap['memoflow.schedule-rebuild.outbox.claimed']).toBeGreaterThanOrEqual(1);
    expect(snap['memoflow.schedule-rebuild.outbox.succeeded']).toBeGreaterThanOrEqual(1);
    expect(snap['memoflow.schedule-rebuild.worker.completed']).toBeGreaterThanOrEqual(1);
  });

  it('P1-5: schedule rebuild worker distinguishes retried from dead_letter metrics on failure', async () => {
    const prisma = await getPrisma();
    const repo = new SchedulePrismaRepository(prisma);
    const service = new ScheduleEventApplicationService(repo);

    await service.createSchedule({
      identityId,
      title: 'Metrics Retry A',
      startTime: 1000,
      endTime: 2000,
    });
    const e2 = await service.createSchedule({
      identityId,
      title: 'Metrics Retry B',
      startTime: 1500,
      endTime: 2500,
    });
    await service.deleteSchedule(e2.id, identityId, e2.version);

    // Make the conflict cache refresh always fail so every item lands in the catch path.
    vi.spyOn(repo, 'findByTimeRange').mockRejectedValue(new Error('cache backend down'));

    const recorder = createUnifiedOperationMetricsRecorder();
    // maxAttempts=1: nextAttempts(1) >= maxAttempts(1) -> dead_letter, not a generic failed.
    const worker = new ScheduleRebuildWorkerService(
      repo,
      passThroughLease,
      { maxAttempts: 1 },
      recorder,
    );
    const res = await worker.processOutbox(identityId);

    expect(res.failedCount).toBeGreaterThan(0);
    const snap = recorder.snapshot();
    expect(snap['memoflow.schedule-rebuild.outbox.dead_letter']).toBeGreaterThanOrEqual(1);
    expect(snap['memoflow.schedule-rebuild.outbox.failed']).toBeUndefined();
    expect(snap['memoflow.schedule-rebuild.outbox.retried']).toBeUndefined();
    expect(snap['memoflow.schedule-rebuild.worker.failed']).toBeGreaterThanOrEqual(1);
  });

  it('W7: unified rebuild timeline query + audited replay; unauthorized identity rejected', async () => {
    const prisma = await getPrisma();
    const { createSchedulePrismaModule } = await import('../../prisma');
    const moduleInstance = createSchedulePrismaModule(prisma, {
      leaseCoordinator: createSchedulerPrismaRepositories(prisma).leaseCoordinator,
      wireDeliveryLogConsumer: false,
    });

    const opId = 'rebuild-w7-failed-1';
    await prisma.scheduleRebuildOutbox.create({
      data: {
        id: opId,
        identityId,
        scheduleId: null,
        startTime: new Date(1000),
        endTime: new Date(2000),
        sourceRevision: 3,
        idempotencyKey: 'rebuild:w7-failed-1',
        status: 'failed',
        attempts: 5,
        lastError: 'cache rebuild exceeded max attempts',
        createdAt: new Date(),
        processedAt: new Date(),
      },
    });

    const ctx = { identityId } as never;
    const timelineRes = await moduleInstance.api.queryRebuildTimeline(ctx);
    expect(timelineRes.ok).toBe(true);
    const entries = timelineRes.ok ? (timelineRes.data as any[]) : [];
    const entry = entries.find((e) => e.operationId === opId);
    expect(entry).toBeDefined();
    expect(entry.source).toBe('schedule-rebuild');
    expect(entry.status).toBe('dead_letter');
    expect(entry.failureReason).toBe('cache rebuild exceeded max attempts');
    expect(entry.attempts).toBe(5);
    expect(entry.replayable).toBe(true);

    // Unauthorized identity cannot replay another identity's failed rebuild
    const otherIdentity = `other-${Date.now()}`;
    const otherCtx = { identityId: otherIdentity } as never;
    const rejected = await moduleInstance.api.replayRebuildOutbox(opId, otherCtx);
    expect(rejected.ok).toBe(false);

    // Authorized replay advances state to pending and records audit
    const replayRes = await moduleInstance.api.replayRebuildOutbox(opId, ctx);
    expect(replayRes.ok).toBe(true);
    const replayed = replayRes.ok ? (replayRes.data as any) : null;
    expect(replayed.status).toBe('pending');
    expect(replayed.replayable).toBe(false);

    const auditRes = await moduleInstance.api.getOperationAudit(ctx);
    expect(auditRes.ok).toBe(true);
    const audit = auditRes.ok ? (auditRes.data as any[]) : [];
    const replayAudit = audit.find(
      (a) => a.operationId === opId && a.action === 'replay' && a.source === 'schedule-rebuild',
    );
    expect(replayAudit).toBeDefined();
    expect(replayAudit.actorIdentityId).toBe(identityId);

    // Timeline after replay reflects state advancement
    const timelineAfter = await moduleInstance.api.queryRebuildTimeline(ctx);
    const entryAfter = (
      timelineAfter.ok ? (timelineAfter.data as any[]) : []
    ).find((e) => e.operationId === opId);
    expect(entryAfter.status).toBe('pending');
    expect(entryAfter.replayable).toBe(false);

    // P1-3: timeline queries wrote timeline_query audits with result count.
    const queryAuditRows = await prisma.operationAuditLog.findMany({
      where: {
        actorIdentityId: identityId,
        action: 'timeline_query',
        source: 'schedule-rebuild',
      },
    });
    expect(queryAuditRows.length).toBeGreaterThanOrEqual(2);
    const qDetails = JSON.parse(queryAuditRows[0].details as string);
    expect(qDetails.resultCount).toBeGreaterThanOrEqual(1);

    moduleInstance.dispose();
  });

  it('P1-4: schedule rebuild replay audit write failure rolls back the state advancement', async () => {
    const prisma = await getPrisma();
    const { createScheduleModule } = await import('../../schedule.module');
    const opId = 'rebuild-w7-fail-inject-1';
    await prisma.scheduleRebuildOutbox.create({
      data: {
        id: opId,
        identityId,
        scheduleId: null,
        startTime: new Date(1000),
        endTime: new Date(2000),
        sourceRevision: 4,
        idempotencyKey: 'rebuild:w7-fail-inject-1',
        status: 'failed',
        attempts: 5,
        lastError: 'cache rebuild exceeded max attempts',
        createdAt: new Date(),
        processedAt: new Date(),
      },
    });

    const failingAudit = {
      record: async () => {
        throw new Error('audit write failure injected');
      },
      listByActor: async () => [],
    };

    const moduleInstance = createScheduleModule({
      scheduleRepository: new SchedulePrismaRepository(prisma),
      leaseCoordinator: createSchedulerPrismaRepositories(prisma).leaseCoordinator,
      auditRepository: failingAudit as never,
    });

    const ctx = { identityId } as never;
    const replayRes = await moduleInstance.api.replayRebuildOutbox(opId, ctx);
    expect(replayRes.ok).toBe(false);

    const after = await prisma.scheduleRebuildOutbox.findUniqueOrThrow({ where: { id: opId } });
    expect(after.status).toBe('failed');
    expect(after.claimToken).toBeNull();

    await moduleInstance.dispose();
  });

  it('P1-3: schedule timeline query fails closed when audit write fails', async () => {
    const prisma = await getPrisma();
    const { createScheduleModule } = await import('../../schedule.module');

    const failingAudit = {
      record: async () => {
        throw new Error('audit write failure injected');
      },
      listByActor: async () => [],
    };

    const moduleInstance = createScheduleModule({
      scheduleRepository: new SchedulePrismaRepository(prisma),
      leaseCoordinator: createSchedulerPrismaRepositories(prisma).leaseCoordinator,
      auditRepository: failingAudit as never,
    });

    const ctx = { identityId } as never;
    await expect(moduleInstance.api.queryRebuildTimeline(ctx)).rejects.toThrow(
      'audit write failure injected',
    );

    await moduleInstance.dispose();
  });

});
