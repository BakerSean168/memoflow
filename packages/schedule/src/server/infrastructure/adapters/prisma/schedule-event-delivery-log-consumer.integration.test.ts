import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanAll,
  disconnectPrisma,
  getPrisma,
  seedAccount,
} from '../../../../__tests__/integration-helpers';
import { SchedulePrismaRepository } from './schedule-prisma.repository';
import { ScheduleEventApplicationService } from '../../../application/services/schedule-event-application-service';
import { ScheduleDomainEventPublisherService } from '../../../application/services/schedule-domain-event-publisher';
import { ScheduleEventDeliveryLogConsumer } from '../../consumers/schedule-event-delivery-log.consumer';
import type { LeaseCoordinatorPort } from '@memoflow/patterns/lease';
import { CrossPlatformEventBus } from '@memoflow/utils/domain';
import { createEventBusAdapter } from '@memoflow/patterns';
import { PrismaClient } from '@memoflow/database';
import { PrismaPg } from '@prisma/adapter-pg';

const passThroughLease: LeaseCoordinatorPort = {
  execute: async (_key: string, task) => ({
    acquired: true,
    value: await task({ ensureHeld: async () => undefined }),
  }),
};

/**
 * P1-1：production 幂等消费矩阵。真实 PostgreSQL + 真实 bus/adapter + 真实
 * ScheduleEventDeliveryLogConsumer：receipt 与独立 delivery-log 副作用同事务提交，
 * 并发 duplicate-key loser 被显式识别为幂等成功，非 duplicate 失败反馈给可靠
 * publisher（阻止 completed，进入 retry/failed）。
 */
describe('W5: ScheduleEventDeliveryLogConsumer — production idempotent consumption', () => {
  const identityId = 'w5-delivery-log-consumer-identity';

  afterAll(async () => {
    await cleanAll();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await cleanAll();
    await seedAccount({ id: identityId });
  });

  it('success: receipt + independent delivery-log effect commit in one transaction; outbox completes', async () => {
    const prisma = await getPrisma();
    const repo = new SchedulePrismaRepository(prisma);
    const service = new ScheduleEventApplicationService(repo);
    const created = await service.createSchedule({
      identityId,
      title: 'Consumer Success',
      startTime: 1000,
      endTime: 2000,
    });

    const bus = new CrossPlatformEventBus();
    const adapter = createEventBusAdapter(bus);
    const consumer = new ScheduleEventDeliveryLogConsumer(prisma, bus);
    consumer.start();

    const publisher = new ScheduleDomainEventPublisherService(repo, passThroughLease, adapter);
    const res = await publisher.processOutbox();
    expect(res.failedCount).toBe(0);
    expect(res.publishedCount).toBe(1);

    const outbox = await prisma.scheduleDomainEventOutbox.findFirst({
      where: { scheduleId: created.id },
    });
    expect(outbox?.status).toBe('completed');
    expect(outbox?.publishedAt).not.toBeNull();

    const receipts = await prisma.scheduleEventConsumerReceipt.findMany();
    expect(receipts).toHaveLength(1);
    expect(receipts[0].idempotencyKey).toBe(outbox?.idempotencyKey);

    const logs = await prisma.scheduleEventDeliveryLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].idempotencyKey).toBe(outbox?.idempotencyKey);
    expect(logs[0].eventType).toBe('schedule:calendar-entry-created');
    expect(logs[0].aggregateId).toBe(created.id);

    consumer.stop();
  });

  it('sync throw: handler failure is returned to the publisher — outbox enters retry, no receipt/effect written', async () => {
    const prisma = await getPrisma();
    const repo = new SchedulePrismaRepository(prisma);
    const service = new ScheduleEventApplicationService(repo);
    await service.createSchedule({
      identityId,
      title: 'Consumer Sync Throw',
      startTime: 1000,
      endTime: 2000,
    });

    const bus = new CrossPlatformEventBus();
    const adapter = createEventBusAdapter(bus);
    bus.on('schedule:calendar-entry-created', () => {
      throw new Error('consumer sync failure');
    });

    const publisher = new ScheduleDomainEventPublisherService(repo, passThroughLease, adapter);
    const res = await publisher.processOutbox();
    expect(res.publishedCount).toBe(0);
    expect(res.failedCount).toBe(1);

    const outbox = await prisma.scheduleDomainEventOutbox.findFirst({});
    expect(outbox?.status).toBe('retry');
    expect(outbox?.attempts).toBe(1);
    expect(outbox?.publishedAt).toBeNull();
    expect(await prisma.scheduleEventConsumerReceipt.count()).toBe(0);
    expect(await prisma.scheduleEventDeliveryLog.count()).toBe(0);
  });

  it('async reject: rejected consumer transaction blocks ack — outbox enters retry, no receipt/effect written', async () => {
    const prisma = await getPrisma();
    const repo = new SchedulePrismaRepository(prisma);
    const service = new ScheduleEventApplicationService(repo);
    await service.createSchedule({
      identityId,
      title: 'Consumer Async Reject',
      startTime: 1000,
      endTime: 2000,
    });

    const bus = new CrossPlatformEventBus();
    const adapter = createEventBusAdapter(bus);
    bus.on('schedule:calendar-entry-created', async () => {
      throw new Error('consumer async failure');
    });

    const publisher = new ScheduleDomainEventPublisherService(repo, passThroughLease, adapter);
    const res = await publisher.processOutbox();
    expect(res.publishedCount).toBe(0);
    expect(res.failedCount).toBe(1);

    const outbox = await prisma.scheduleDomainEventOutbox.findFirst({});
    expect(outbox?.status).toBe('retry');
    expect(outbox?.attempts).toBe(1);
    expect(outbox?.publishedAt).toBeNull();
    expect(await prisma.scheduleEventConsumerReceipt.count()).toBe(0);
    expect(await prisma.scheduleEventDeliveryLog.count()).toBe(0);
  });

  it('transaction rollback: effect write fails after receipt write — the whole transaction rolls back', async () => {
    const prisma = await getPrisma();
    const bus = new CrossPlatformEventBus();
    const adapter = createEventBusAdapter(bus);

    // Inject a non-duplicate failure on the independent effect write inside $transaction.
    const faultPrisma = new Proxy(prisma, {
      get(target, prop) {
        if (prop === '$transaction') {
          return (callback: (tx: unknown) => Promise<unknown>) =>
            (target as unknown as PrismaClient).$transaction((tx) => {
              const wrappedTx = new Proxy(tx as object, {
                get(t, p) {
                  if (p === 'scheduleEventDeliveryLog') {
                    return {
                      create: async () => {
                        throw new Error('injected effect write failure');
                      },
                    };
                  }
                  return (t as Record<PropertyKey, unknown>)[p as PropertyKey];
                },
              });
              return callback(wrappedTx);
            });
        }
        return (target as Record<PropertyKey, unknown>)[prop as PropertyKey];
      },
    }) as unknown as PrismaClient;

    const consumer = new ScheduleEventDeliveryLogConsumer(faultPrisma, bus);
    consumer.start();

    // Receipt write succeeds, effect write fails → whole transaction rolls back.
    await expect(
      adapter.publish({
        eventType: 'schedule:calendar-entry-created',
        payload: {},
        aggregateId: 'agg-1',
        occurredAt: new Date(),
        idempotencyKey: 'rollback-receipt-effect-key',
      } as never),
    ).rejects.toThrow('injected effect write failure');

    expect(await prisma.scheduleEventConsumerReceipt.count()).toBe(0);
    expect(await prisma.scheduleEventDeliveryLog.count()).toBe(0);
    consumer.stop();
  });

  it('concurrent duplicate delivery: loser is explicitly idempotent success — both publishes fulfill, exactly one receipt + one effect', async () => {
    const prisma = await getPrisma();
    const bus = new CrossPlatformEventBus();
    const consumer = new ScheduleEventDeliveryLogConsumer(prisma, bus);
    consumer.start();

    const key = 'concurrent-dedup-consumer-key';
    const adapterA = createEventBusAdapter(bus);
    const adapterB = createEventBusAdapter(bus);
    const event = {
      eventType: 'schedule:calendar-entry-created',
      payload: {},
      aggregateId: 'agg-1',
      occurredAt: new Date(),
      idempotencyKey: key,
    } as never;

    const settled = await Promise.allSettled([adapterA.publish(event), adapterB.publish(event)]);
    // The concurrent loser is recognized as consumed success, not a swallowed error.
    expect(settled.map((s) => s.status)).toEqual(['fulfilled', 'fulfilled']);

    const receipts = await prisma.scheduleEventConsumerReceipt.findMany({ where: { idempotencyKey: key } });
    expect(receipts).toHaveLength(1);
    const logs = await prisma.scheduleEventDeliveryLog.findMany({ where: { idempotencyKey: key } });
    expect(logs).toHaveLength(1);
    expect(logs[0].eventType).toBe('schedule:calendar-entry-created');
    expect(logs[0].aggregateId).toBe('agg-1');
    consumer.stop();
  });

  it('Requirement 10 (delivery-log suite, full-rebuild matrix): deterministic publish-before-ack fault → real processing claim → timeout reclaim → full instance rebuild → concurrent redelivery converges (DB-only)', async () => {
    const prisma = await getPrisma();
    const repo = new SchedulePrismaRepository(prisma);
    const service = new ScheduleEventApplicationService(repo);
    const created = await service.createSchedule({
      identityId,
      title: 'Crash Matrix',
      startTime: 1000,
      endTime: 2000,
    });

    // --- Process 1 (pre-crash): real production delivery seam, consumer records receipt + effect ---
    const bus1 = new CrossPlatformEventBus();
    const adapter1 = createEventBusAdapter(bus1);
    const consumer1 = new ScheduleEventDeliveryLogConsumer(prisma, bus1);
    consumer1.start();

    const publisher1 = new ScheduleDomainEventPublisherService(repo, passThroughLease, adapter1, {
      faultInjection: { failAfterPublishBeforeAck: true },
    });

    // publish succeeds, then the deterministic fault fires before the ack.
    await expect(publisher1.processOutbox()).rejects.toThrow('after publish before ack');

    // Crash left real processing + claimToken persisted (not ack, not reverted to pending).
    const crashedRow = await prisma.scheduleDomainEventOutbox.findFirst({
      where: { scheduleId: created.id },
    });
    expect(crashedRow?.status).toBe('processing');
    expect(crashedRow?.claimToken).toBeTruthy();
    expect(crashedRow?.publishedAt).toBeNull();
    expect(await prisma.scheduleEventConsumerReceipt.count()).toBe(1);
    expect(await prisma.scheduleEventDeliveryLog.count()).toBe(1);

    // Process 1's in-process objects are discarded (crash). Only DB state survives.

    // Timeout reclaim: age the real processing claim so the restarted publisher can reclaim it.
    await prisma.scheduleDomainEventOutbox.updateMany({
      where: { scheduleId: created.id },
      data: { claimedAt: new Date(Date.now() - 120_000) },
    });

    // --- Process 2 (restart): rebuild publisher / repository+client / bus / adapter / consumer / lease ---
    const prisma2 = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
    });
    const repo2 = new SchedulePrismaRepository(prisma2);
    const bus2 = new CrossPlatformEventBus();
    const adapter2 = createEventBusAdapter(bus2);
    const adapter2b = createEventBusAdapter(bus2);
    const consumer2 = new ScheduleEventDeliveryLogConsumer(prisma2, bus2);
    consumer2.start();
    const publisher2 = new ScheduleDomainEventPublisherService(repo2, passThroughLease, adapter2);

    // Recovery path runs a concurrent double delivery of the SAME idempotencyKey:
    // the rebuilt publisher reclaims + redelivers while a second adapter delivers the
    // same key concurrently. Both must converge as success.
    const recoveredRow = await prisma.scheduleDomainEventOutbox.findFirst({
      where: { scheduleId: created.id },
    });
    const event = {
      eventType: recoveredRow?.eventType,
      payload: {},
      aggregateId: created.id,
      occurredAt: new Date(),
      idempotencyKey: recoveredRow?.idempotencyKey,
    } as never;

    const settled = await Promise.allSettled([
      publisher2.processOutbox(),
      adapter2b.publish(event),
    ]);
    expect(settled.map((s) => s.status)).toEqual(['fulfilled', 'fulfilled']);

    // DB-only convergence: outbox / receipt / independent effect table.
    const finalRow = await prisma.scheduleDomainEventOutbox.findFirst({
      where: { scheduleId: created.id },
    });
    expect(finalRow?.status).toBe('completed');
    expect(finalRow?.publishedAt).not.toBeNull();

    const receipts = await prisma.scheduleEventConsumerReceipt.findMany();
    expect(receipts).toHaveLength(1);
    expect(receipts[0].idempotencyKey).toBe(recoveredRow?.idempotencyKey);

    const logs = await prisma.scheduleEventDeliveryLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0].idempotencyKey).toBe(recoveredRow?.idempotencyKey);
    expect(logs[0].eventType).toBe('schedule:calendar-entry-created');
    expect(logs[0].aggregateId).toBe(created.id);

    consumer2.stop();
    await prisma2.$disconnect();
  });
});
