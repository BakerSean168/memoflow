import { describe, it, expect, vi } from 'vitest';
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
import { NotificationChannel } from '../../../domain/entities/notification-channel';
import { NotificationChannelType } from '@memoflow/contracts/notification';
import { InMemoryReliableAdapter } from './helpers/in-memory-reliable-adapter';

const TEST_TIME_CONTEXT = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });
const TEST_USER_TIME_CONTEXT_PORT = {
  getUserTimeContext: async () => TEST_TIME_CONTEXT,
};

/** 将 Notification 的单个渠道作为 durable outbox 投递意图写入内存 adapter。 */
async function dispatchNotificationOutbox(
  adapter: InMemoryReliableAdapter,
  notification: Notification,
  channel: NotificationChannel,
) {
  const identityId = String(notification.identityId);
  const notificationId = String(notification.id);
  const occurrenceKey = `${notificationId}:${channel.channelType}`;
  await adapter.dispatchOutbox(
    {
      operationId: `outbox-${occurrenceKey}`,
      identityId,
      source: 'notification',
      occurrenceKey,
      channel: channel.channelType,
      payloadJson: JSON.stringify({ notificationId, title: notification.title, content: notification.content }),
      idempotencyKey: adapter.idempotencyKeyFor(identityId, occurrenceKey),
    },
    { notificationId },
  );
}

describe('Notification Durable Dispatch Worker & Capability (W2)', () => {
  it('1. Startup fails fast when required channel capability is missing in production', () => {
    expect(() =>
      createNotificationRuntimeContribution({
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
        environment: 'production',
        reliableAdapter: new InMemoryReliableAdapter(),
        channelCapabilities: [
          {
            channelType: 'Push',
            status: 'missing',
            requiredInProduction: true,
          },
        ],
      }),
    ).toThrow(CapabilityMissingStartupException);
  });

  it('2. Startup fails fast when test double is used in production', () => {
    expect(() =>
      createNotificationRuntimeContribution({
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
        environment: 'production',
        reliableAdapter: new InMemoryReliableAdapter(),
        channelCapabilities: [
          {
            channelType: 'Push',
            status: 'test_double',
            requiredInProduction: true,
          },
        ],
      }),
    ).toThrow(CapabilityMissingStartupException);
  });

  it('3. Test double forbidden exception thrown when allowTestDoubleInTest is false in test env', () => {
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

  it('4. Deliverer failure records failed, retry, and dead-letter metrics correctly', async () => {
    let callCount = 0;
    const failingDeliverer: NotificationChannelDeliverer = {
      async deliver() {
        callCount++;
        throw new Error('Network timeout during delivery');
      },
    };

    const notification = Notification.create({
      identityId: 'user_123' as any,
      workflowKey: 'system.general',
      topic: 'system.general',
      idempotencyKey: 'durable-failure',
      title: 'Alert',
      content: 'Critical alert',
      type: 'Warning',
      category: 'System',
    });
    const channel = NotificationChannel.create({
      notificationId: notification.id,
      channelType: NotificationChannelType.InApp,
      recipient: 'user_123',
    });
    notification.addChannel(channel);

    const mockRepo = {
      findChannelsByStatus: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      findByIdForIdentity: vi.fn().mockResolvedValue(notification),
    };

    const adapter = new InMemoryReliableAdapter();
    await dispatchNotificationOutbox(adapter, notification, channel);

    const runtime = createNotificationRuntimeContribution({
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
      environment: 'test',
      repository: mockRepo as any,
      reliableAdapter: adapter,
      deliverer: failingDeliverer,
      deadLetterThreshold: 2,
      backoffBaseMs: 10,
    });

    await runtime.tick();
    const metrics1 = runtime.getMetrics();
    expect(metrics1.dispatchedTotal).toBe(1);
    // W7 互斥语义：retryable 分支只累计 retried，不得累计终态 failed
    expect(metrics1.failedTotal).toBe(0);
    expect(metrics1.retryTotal).toBe(1);
    const unified1 = runtime.getUnifiedSnapshot();
    expect(unified1['memoflow.notification.outbox.retried']).toBe(1);
    expect(unified1['memoflow.notification.outbox.failed']).toBeUndefined();

    // Second attempt -> reaches dead letter threshold (2)
    const row = adapter.rows[0];
    row.status = 'retryable';
    row.nextRetryAt = new Date(Date.now() - 1000);
    await runtime.tick();
    const metrics2 = runtime.getMetrics();
    expect(metrics2.dispatchedTotal).toBe(2);
    // W7 互斥语义：dead_letter 分支只累计 dead_letter，不得再累计终态 failed
    expect(metrics2.failedTotal).toBe(0);
    expect(metrics2.deadLetterTotal).toBe(1);
    const unified2 = runtime.getUnifiedSnapshot();
    expect(unified2['memoflow.notification.outbox.retried']).toBe(1);
    expect(unified2['memoflow.notification.outbox.dead_letter']).toBe(1);
    expect(unified2['memoflow.notification.outbox.failed']).toBeUndefined();

    const deadLetters = await adapter.queryDeadLetters('user_123');
    expect(deadLetters).toHaveLength(1);
    expect(deadLetters[0].status).toBe('dead_letter');
  });

  it('5. Successful deliverer increments delivered metrics and advances channel status', async () => {
    const successDeliverer: NotificationChannelDeliverer = {
      async deliver() {},
    };

    const notification = Notification.create({
      identityId: 'user_456' as any,
      workflowKey: 'system.general',
      topic: 'system.general',
      idempotencyKey: 'durable-success',
      title: 'Welcome',
      content: 'Hello!',
      type: 'Info',
      category: 'System',
    });
    const channel = NotificationChannel.create({
      notificationId: notification.id,
      channelType: NotificationChannelType.InApp,
      recipient: 'user_456',
    });
    notification.addChannel(channel);

    const mockRepo = {
      findChannelsByStatus: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      findByIdForIdentity: vi.fn().mockResolvedValue(notification),
    };

    const adapter = new InMemoryReliableAdapter();
    await dispatchNotificationOutbox(adapter, notification, channel);

    const runtime = createNotificationRuntimeContribution({
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
      environment: 'test',
      repository: mockRepo as any,
      reliableAdapter: adapter,
      deliverer: successDeliverer,
    });

    await runtime.tick();
    const metrics = runtime.getMetrics();
    expect(metrics.dispatchedTotal).toBe(1);
    expect(metrics.deliveredTotal).toBe(1);
    expect(channel.status).toBe('Delivered');

    const receipts = await adapter.queryReceipts(String(notification.identityId));
    expect(receipts).toHaveLength(1);
    expect(receipts[0].status).toBe('succeeded');
  });

  it('6. Canonical Idempotency Key validation for notification outbox dispatch', () => {
    const key = buildIdempotencyKeyString({
      identityId: 'usr_789',
      source: 'notification',
      occurrenceKey: 'notif_100:InApp',
    });

    expect(key).toBe('v1:7:usr_789:12:notification:15:notif_100:InApp');
  });
});
