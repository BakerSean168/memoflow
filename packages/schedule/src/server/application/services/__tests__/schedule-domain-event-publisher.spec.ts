import { describe, expect, it, vi } from 'vitest';
import type { IEventBus } from '@memoflow/patterns';
import type {
  IScheduleRepository,
  ScheduleDomainEventOutboxDTO,
  ScheduleRebuildOutboxDTO,
} from '../../domain/repositories/i-schedule-repository';
import type { CalendarEntry } from '../../domain/aggregates/calendar-entry';
import { LeaseLostError } from '@memoflow/patterns/lease';
import {
  ScheduleDomainEventPublisherRuntime,
  ScheduleDomainEventPublisherService,
} from '../schedule-domain-event-publisher';

class InMemoryDomainEventOutboxRepository implements IScheduleRepository {
  public outbox: ScheduleDomainEventOutboxDTO[] = [];
  public leaseGuardBreaks = false;

  async save(_schedule: CalendarEntry): Promise<void> {}
  async findByIdForIdentity(): Promise<CalendarEntry | null> {
    return null;
  }
  async findByIdentityId(): Promise<CalendarEntry[]> {
    return [];
  }
  async deleteById(): Promise<void> {}
  async deleteAggregate(): Promise<void> {}
  async findByTimeRange(): Promise<CalendarEntry[]> {
    return [];
  }
  async updateConflictProjection(): Promise<void> {}
  async createRebuildOutbox(): Promise<void> {}
  async fetchPendingRebuildOutbox(): Promise<ScheduleRebuildOutboxDTO[]> {
    return [];
  }
  async claimRebuildOutboxItems(): Promise<ScheduleRebuildOutboxDTO[]> {
    return [];
  }
  async markRebuildOutboxProcessed(): Promise<void> {}

  async createDomainEventOutbox(
    events: {
      identityId: string;
      scheduleId: string;
      eventType: string;
      payload: string;
      idempotencyKey: string;
    }[],
  ): Promise<void> {
    const now = new Date();
    for (const evt of events) {
      if (this.outbox.some((o) => o.idempotencyKey === evt.idempotencyKey)) continue;
      this.outbox.push({
        id: `evt-${this.outbox.length + 1}`,
        identityId: evt.identityId,
        scheduleId: evt.scheduleId,
        eventType: evt.eventType,
        payload: evt.payload,
        status: 'pending',
        attempts: 0,
        claimToken: null,
        claimedAt: null,
        nextAttemptAt: null,
        publishedAt: null,
        idempotencyKey: evt.idempotencyKey,
        createdAt: now,
      });
    }
  }

  async fetchPendingDomainEventOutbox(): Promise<ScheduleDomainEventOutboxDTO[]> {
    return this.outbox.filter((o) => o.status === 'pending');
  }

  async claimDomainEventOutboxItems(
    claimToken: string,
    limit = 50,
    _timeoutMs = 30000,
  ): Promise<ScheduleDomainEventOutboxDTO[]> {
    const now = new Date();
    const eligible = this.outbox.filter(
      (o) =>
        o.status === 'pending' ||
        (o.status === 'retry' && (o.nextAttemptAt === null || o.nextAttemptAt <= now)) ||
        (o.status === 'processing' && o.claimedAt !== null && o.claimedAt <= now),
    );
    const claimed = eligible.slice(0, limit);
    for (const item of claimed) {
      item.status = 'processing';
      item.claimToken = claimToken;
      item.claimedAt = new Date();
    }
    return claimed;
  }

  async markDomainEventOutboxProcessed(
    id: string,
    claimToken: string,
    error?: string,
    maxAttempts = 5,
  ): Promise<void> {
    const item = this.outbox.find((o) => o.id === id);
    if (!item || item.claimToken !== claimToken || item.status !== 'processing') {
      throw new LeaseLostError(
        `Domain event outbox item ${id} is no longer owned by this claim token (lease lost)`,
      );
    }
    if (!error) {
      item.status = 'completed';
      item.publishedAt = new Date();
      item.claimToken = null;
      return;
    }
    const nextAttempts = item.attempts + 1;
    item.attempts = nextAttempts;
    item.lastError = error;
    item.claimToken = null;
    if (nextAttempts >= maxAttempts) {
      item.status = 'failed';
    } else {
      item.status = 'retry';
      item.nextAttemptAt = new Date(Date.now() + Math.pow(2, nextAttempts) * 1000);
    }
  }

  async withTransaction<T>(fn: (repo: IScheduleRepository) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

function createPublishingEventBusSpy(): {
  bus: IEventBus;
  published: { eventType: string; payload: unknown; aggregateId: string; idempotencyKey?: string }[];
} {
  const published: { eventType: string; payload: unknown; aggregateId: string; idempotencyKey?: string }[] = [];
  const bus: IEventBus = {
    async publish(event) {
      published.push({
        eventType: event.eventType,
        payload: event.payload,
        aggregateId: event.aggregateId,
        idempotencyKey: event.idempotencyKey,
      });
    },
  };
  return { bus, published };
}

const passThroughLease = {
  execute: async (_key: string, task: any) => ({
    acquired: true,
    value: await task({ ensureHeld: async () => undefined }),
  }),
};

function seedEvent(repo: InMemoryDomainEventOutboxRepository, overrides: Partial<ScheduleDomainEventOutboxDTO> = {}) {
  return repo.createDomainEventOutbox([
    {
      identityId: 'identity-1',
      scheduleId: 'schedule-1',
      eventType: 'schedule:calendar-entry-updated',
      payload: JSON.stringify({ entryId: 'schedule-1' }),
      idempotencyKey: 'domain:identity-1:schedule-1:2:schedule:calendar-entry-updated',
      ...overrides,
    },
  ]);
}

describe('ScheduleDomainEventPublisherService — durable delivery semantics', () => {
  it('claims pending outbox items, publishes each exactly once, and acks to completed', async () => {
    const repo = new InMemoryDomainEventOutboxRepository();
    const { bus, published } = createPublishingEventBusSpy();
    await seedEvent(repo);

    const publisher = new ScheduleDomainEventPublisherService(repo, passThroughLease, bus);
    const result = await publisher.processOutbox();

    expect(result.publishedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      eventType: 'schedule:calendar-entry-updated',
      payload: { entryId: 'schedule-1' },
      aggregateId: 'schedule-1',
    });

    const item = repo.outbox[0];
    expect(item.status).toBe('completed');
    expect(item.publishedAt).not.toBeNull();
    expect(item.claimToken).toBeNull();

    // Empty second run: nothing left to publish.
    const second = await publisher.processOutbox();
    expect(second.publishedCount).toBe(0);
  });

  it('at-least-once redelivery carries the stable idempotencyKey on the envelope (consumer dedupes, publisher does not silently skip)', async () => {
    const repo = new InMemoryDomainEventOutboxRepository();
    const { bus, published } = createPublishingEventBusSpy();
    await seedEvent(repo);

    const publisher = new ScheduleDomainEventPublisherService(repo, passThroughLease, bus);
    await publisher.processOutbox();
    expect(published).toHaveLength(1);
    // Every published envelope must carry the stable outbox idempotencyKey so a
    // consumer with side effects can dedupe atomically (durable receipt).
    expect(published[0].idempotencyKey).toBeTruthy();

    // True crash window: publish succeeded but the ack never landed — the row is
    // pending with publishedAt NULL. The publisher MUST re-publish (at-least-once);
    // correctness rests on the consumer's durable receipt, not on skipping here.
    repo.outbox[0].status = 'pending';
    repo.outbox[0].claimToken = null;
    repo.outbox[0].publishedAt = null;

    const redelivery = await publisher.processOutbox();
    expect(redelivery.publishedCount).toBe(1); // re-published after the lost ack
    expect(published).toHaveLength(2); // at-least-once: bus sees the event twice
    expect(published[1].idempotencyKey).toBe(published[0].idempotencyKey); // same stable key
    expect(repo.outbox[0].status).toBe('completed');
  });

  it('marks retry on publish failure, then failed after maxAttempts', async () => {
    const repo = new InMemoryDomainEventOutboxRepository();
    const failingBus: IEventBus = {
      async publish() {
        throw new Error('event bus down');
      },
    };
    await seedEvent(repo);

    const publisher = new ScheduleDomainEventPublisherService(repo, passThroughLease, failingBus, {
      maxAttempts: 2,
    });

    const first = await publisher.processOutbox();
    expect(first.failedCount).toBe(1);
    expect(repo.outbox[0].status).toBe('retry');
    expect(repo.outbox[0].attempts).toBe(1);
    expect(repo.outbox[0].nextAttemptAt).not.toBeNull();

    // Force the retry window open so the second attempt is eligible.
    repo.outbox[0].nextAttemptAt = new Date(Date.now() - 1000);
    const second = await publisher.processOutbox();
    expect(second.failedCount).toBe(1);
    expect(repo.outbox[0].status).toBe('failed');
    expect(repo.outbox[0].attempts).toBe(2);
    expect(repo.outbox[0].publishedAt).toBeNull();
  });

  it('stops publishing when the lease is lost mid-batch (no further state writes)', async () => {
    const repo = new InMemoryDomainEventOutboxRepository();
    const { bus, published } = createPublishingEventBusSpy();
    await seedEvent(repo);
    await seedEvent(repo, {
      identityId: 'identity-1',
      scheduleId: 'schedule-2',
      idempotencyKey: 'domain:identity-1:schedule-2:2:schedule:calendar-entry-updated',
    });

    let guardCalls = 0;
    const leaseThatBreaks = {
      execute: async (_key: string, task: any) => {
        const value = await task({
          ensureHeld: async () => {
            guardCalls += 1;
            if (guardCalls >= 3) {
              throw new LeaseLostError();
            }
          },
        });
        return { acquired: true, value };
      },
    };

    const publisher = new ScheduleDomainEventPublisherService(repo, leaseThatBreaks, bus);
    await expect(publisher.processOutbox()).rejects.toBeInstanceOf(LeaseLostError);

    // First item was published and acked; the batch aborts at the start of the
    // second item, so it is never published and never written past the claim.
    expect(published).toHaveLength(1);
    const second = repo.outbox[1];
    expect(second.status).toBe('processing');
    expect(second.publishedAt).toBeNull();
  });

  it('fault injection after publish before ack leaves the item processing with its claim token (crash window, no ack, no retry/failed)', async () => {
    const repo = new InMemoryDomainEventOutboxRepository();
    const { bus, published } = createPublishingEventBusSpy();
    await seedEvent(repo);

    const publisher = new ScheduleDomainEventPublisherService(repo, passThroughLease, bus, {
      faultInjection: { failAfterPublishBeforeAck: true },
    });

    // The event IS published (consumer received it) but the process dies before ack.
    await expect(publisher.processOutbox()).rejects.toThrow('after publish before ack');
    expect(published).toHaveLength(1);

    // Crash state: the durable row remains processing + claimToken (not completed,
    // not reverted to pending, not retry/failed) so a timeout reclaim can redeliver.
    const item = repo.outbox[0];
    expect(item.status).toBe('processing');
    expect(item.claimToken).toBeTruthy();
    expect(item.publishedAt).toBeNull();
  });

  it('runtime start/stop can be invoked idempotently', async () => {
    const repo = new InMemoryDomainEventOutboxRepository();
    const { bus } = createPublishingEventBusSpy();
    const publisher = new ScheduleDomainEventPublisherService(repo, passThroughLease, bus);
    const runtime = new ScheduleDomainEventPublisherRuntime(publisher, 50);

    await runtime.start();
    await runtime.start(); // no-op
    await new Promise((resolve) => setTimeout(resolve, 120));
    await runtime.stop();
    await runtime.stop(); // no-op
  });
});
