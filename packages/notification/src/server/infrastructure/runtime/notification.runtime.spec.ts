import { describe, expect, it, vi } from 'vitest';
import { createTimeContext } from '@memoflow/time';
import {
  createNotificationRuntimeContribution,
  type NotificationChannelDeliverer,
} from './notification.runtime';
import { Notification } from '../../domain/aggregates/notification';
import type { INotificationRepository } from '../../domain/repositories/i-notification-repository';
import {
  InMemoryReliableAdapter,
  type DurableOutboxRow,
} from './__tests__/helpers/in-memory-reliable-adapter';

const TEST_TIME_CONTEXT = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });
const TEST_USER_TIME_CONTEXT_PORT = {
  getUserTimeContext: async () => TEST_TIME_CONTEXT,
};

function notificationFact() {
  return Notification.create({
    identityId: 'identity-1' as never,
    workflowKey: 'system.general',
    topic: 'system.general',
    idempotencyKey: 'runtime-fixture',
    title: 't',
    content: 'c',
    type: 'Info' as never,
    category: 'System' as never,
  });
}

function makeRepository(notification: Notification) {
  return {
    findByIdForIdentity: vi.fn(async (_identityId: string, id: string) =>
      String(notification.id) === id ? notification : null,
    ),
    save: vi.fn(async () => undefined),
  } as unknown as INotificationRepository;
}

async function dispatchOutbox(
  adapter: InMemoryReliableAdapter,
  notification: Notification,
  channel = 'InApp',
) {
  const identityId = String(notification.identityId);
  const notificationId = String(notification.id);
  const occurrenceKey = `${notificationId}:${channel}`;
  return adapter.dispatchOutbox(
    {
      operationId: `outbox-${occurrenceKey}`,
      identityId,
      source: 'notification',
      occurrenceKey,
      channel,
      payloadJson: JSON.stringify({
        notificationId,
        title: notification.title,
        content: notification.content,
      }),
      idempotencyKey: adapter.idempotencyKeyFor(identityId, occurrenceKey),
    },
    { notificationId },
  );
}

function forceRetryDue(row: DurableOutboxRow) {
  row.status = 'retryable';
  row.nextRetryAt = new Date(Date.now() - 1000);
}

describe('Notification durable delivery worker', () => {
  it('records success in the durable receipt without mutating the Notification Fact', async () => {
    const notification = notificationFact();
    const repository = makeRepository(notification);
    const deliverer: NotificationChannelDeliverer = { deliver: vi.fn(async () => undefined) };
    const adapter = new InMemoryReliableAdapter();
    await dispatchOutbox(adapter, notification);

    const runtime = createNotificationRuntimeContribution({
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
      environment: 'test',
      repository,
      reliableAdapter: adapter,
      deliverer,
    });

    await runtime.tick();

    expect(deliverer.deliver).toHaveBeenCalledWith(
      notification,
      { channelType: 'InApp', recipient: 'identity-1' },
      expect.objectContaining({ identityId: 'identity-1' }),
    );
    expect(repository.save).not.toHaveBeenCalled();
    expect(notification.isRead).toBe(false);
    expect(notification.toServerDTO()).not.toHaveProperty('notificationChannels');

    const receipts = await adapter.queryReceipts(String(notification.identityId));
    expect(receipts).toHaveLength(1);
    expect(receipts[0].status).toBe('succeeded');
    expect(runtime.getMetrics()).toMatchObject({ dispatchedTotal: 1, deliveredTotal: 1 });
    expect(runtime.getUnifiedSnapshot()['memoflow.notification.outbox.succeeded']).toBe(1);
  });

  it('retries a failed delivery and succeeds after recovery', async () => {
    const notification = notificationFact();
    const repository = makeRepository(notification);
    let calls = 0;
    const deliverer: NotificationChannelDeliverer = {
      deliver: vi.fn(async () => {
        calls += 1;
        if (calls === 1) throw new Error('channel unreachable');
      }),
    };
    const adapter = new InMemoryReliableAdapter();
    await dispatchOutbox(adapter, notification);
    const runtime = createNotificationRuntimeContribution({
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
      environment: 'test',
      repository,
      reliableAdapter: adapter,
      deliverer,
      backoffBaseMs: 60_000,
    });

    await runtime.tick();
    let receipts = await adapter.queryReceipts(String(notification.identityId));
    expect(receipts[0].status).toBe('retryable');

    forceRetryDue(adapter.rows[0]);
    await runtime.tick();

    expect(deliverer.deliver).toHaveBeenCalledTimes(2);
    receipts = await adapter.queryReceipts(String(notification.identityId));
    expect(receipts[0].status).toBe('succeeded');
    expect(repository.save).not.toHaveBeenCalled();
    expect(runtime.getUnifiedSnapshot()['memoflow.notification.outbox.retried']).toBe(1);
  });

  it('moves repeated failures to dead-letter using outbox attempt truth', async () => {
    const notification = notificationFact();
    const repository = makeRepository(notification);
    const adapter = new InMemoryReliableAdapter();
    await dispatchOutbox(adapter, notification);
    adapter.rows[0].attempt = 3;
    forceRetryDue(adapter.rows[0]);

    const runtime = createNotificationRuntimeContribution({
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
      environment: 'test',
      repository,
      reliableAdapter: adapter,
      deliverer: { deliver: vi.fn(async () => { throw new Error('channel unreachable'); }) },
      deadLetterThreshold: 3,
    });

    await runtime.tick();

    const receipts = await adapter.queryReceipts(String(notification.identityId));
    expect(receipts[0].status).toBe('dead_letter');
    expect(receipts[0].attempt).toBe(4);
    expect(runtime.getMetrics().deadLetterTotal).toBe(1);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('keeps a retryable failure contained inside the worker tick', async () => {
    const notification = notificationFact();
    const repository = makeRepository(notification);
    const adapter = new InMemoryReliableAdapter();
    await dispatchOutbox(adapter, notification);
    const runtime = createNotificationRuntimeContribution({
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
      environment: 'test',
      repository,
      reliableAdapter: adapter,
      deliverer: { deliver: vi.fn(async () => { throw new Error('channel unreachable'); }) },
    });

    await expect(runtime.tick()).resolves.toBeUndefined();
    const receipts = await adapter.queryReceipts(String(notification.identityId));
    expect(receipts[0].status).toBe('retryable');
    expect(repository.save).not.toHaveBeenCalled();
  });
});
