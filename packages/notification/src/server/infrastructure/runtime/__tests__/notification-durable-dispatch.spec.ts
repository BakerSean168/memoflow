import { describe, expect, it, vi } from 'vitest';
import { createTimeContext } from '@memoflow/time';
import {
  createNotificationRuntimeContribution,
  type NotificationChannelDeliverer,
} from '../notification.runtime';
import {
  CapabilityMissingStartupException,
  CapabilityTestDoubleForbiddenException,
  buildIdempotencyKeyString,
} from '@memoflow/contracts/reliable-messaging';
import { Notification } from '../../../domain/aggregates/notification';
import { NotificationChannelType } from '@memoflow/contracts/notification';
import { InMemoryReliableAdapter } from './helpers/in-memory-reliable-adapter';

const TEST_TIME_CONTEXT = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });
const TEST_USER_TIME_CONTEXT_PORT = {
  getUserTimeContext: async () => TEST_TIME_CONTEXT,
};

function fact(identityId: string, idempotencyKey: string) {
  return Notification.create({
    identityId: identityId as never,
    workflowKey: 'system.general',
    topic: 'system.general',
    idempotencyKey,
    title: 'Alert',
    content: 'Critical alert',
    type: 'Warning',
    category: 'System',
  });
}

async function dispatchNotificationOutbox(
  adapter: InMemoryReliableAdapter,
  notification: Notification,
  channel: NotificationChannelType,
) {
  const identityId = String(notification.identityId);
  const notificationId = String(notification.id);
  const occurrenceKey = `${notificationId}:${channel}`;
  await adapter.dispatchOutbox(
    {
      operationId: `outbox-${occurrenceKey}`,
      identityId,
      source: 'notification',
      occurrenceKey,
      channel,
      payloadJson: JSON.stringify({ notificationId, title: notification.title, content: notification.content }),
      idempotencyKey: adapter.idempotencyKeyFor(identityId, occurrenceKey),
    },
    { notificationId },
  );
}

describe('Notification Durable Dispatch Worker & Capability', () => {
  it('fails fast when a required production capability is missing', () => {
    expect(() =>
      createNotificationRuntimeContribution({
        userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
        environment: 'production',
        reliableAdapter: new InMemoryReliableAdapter(),
        channelCapabilities: [
          { channelType: 'Push', status: 'missing', requiredInProduction: true },
        ],
      }),
    ).toThrow(CapabilityMissingStartupException);
  });

  it('forbids a disallowed test double in test environment', () => {
    expect(() =>
      createNotificationRuntimeContribution({
        userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
        environment: 'test',
        reliableAdapter: new InMemoryReliableAdapter(),
        channelCapabilities: [
          {
            channelType: 'Push',
            status: 'test_double',
            allowTestDoubleInTest: false,
          },
        ],
      }),
    ).toThrow(CapabilityTestDoubleForbiddenException);
  });

  it('records retry/dead-letter execution truth without channel aggregate state', async () => {
    let callCount = 0;
    const deliverer: NotificationChannelDeliverer = {
      async deliver() {
        callCount += 1;
        throw new Error('Network timeout during delivery');
      },
    };
    const notification = fact('user_123', 'durable-failure');
    const repository = {
      save: vi.fn(),
      findByIdForIdentity: vi.fn().mockResolvedValue(notification),
    };
    const adapter = new InMemoryReliableAdapter();
    await dispatchNotificationOutbox(adapter, notification, NotificationChannelType.InApp);

    const runtime = createNotificationRuntimeContribution({
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
      environment: 'test',
      repository: repository as never,
      reliableAdapter: adapter,
      deliverer,
      deadLetterThreshold: 2,
      backoffBaseMs: 10,
    });

    await runtime.tick();
    expect(runtime.getUnifiedSnapshot()['memoflow.notification.outbox.retried']).toBe(1);
    adapter.rows[0].status = 'retryable';
    adapter.rows[0].nextRetryAt = new Date(Date.now() - 1000);
    await runtime.tick();

    expect(callCount).toBe(2);
    expect(runtime.getUnifiedSnapshot()['memoflow.notification.outbox.dead_letter']).toBe(1);
    expect(repository.save).not.toHaveBeenCalled();
    expect(notification.toServerDTO()).not.toHaveProperty('notificationChannels');
  });

  it('records a successful receipt without mutating the Fact', async () => {
    const deliverer: NotificationChannelDeliverer = { async deliver() {} };
    const notification = fact('user_456', 'durable-success');
    const repository = {
      save: vi.fn(),
      findByIdForIdentity: vi.fn().mockResolvedValue(notification),
    };
    const adapter = new InMemoryReliableAdapter();
    await dispatchNotificationOutbox(adapter, notification, NotificationChannelType.InApp);
    const runtime = createNotificationRuntimeContribution({
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
      environment: 'test',
      repository: repository as never,
      reliableAdapter: adapter,
      deliverer,
    });

    await runtime.tick();
    const receipts = await adapter.queryReceipts(String(notification.identityId));
    expect(receipts).toHaveLength(1);
    expect(receipts[0].status).toBe('succeeded');
    expect(runtime.getMetrics().deliveredTotal).toBe(1);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('builds the canonical idempotency key for notification dispatch', () => {
    const key = buildIdempotencyKeyString({
      identityId: 'usr_789',
      source: 'notification',
      occurrenceKey: 'notif_100:InApp',
    });
    expect(key).toBe('v1:7:usr_789:12:notification:15:notif_100:InApp');
  });
});
