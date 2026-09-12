import { describe, expect, it, vi } from 'vitest';
import { createTimeContext } from '@memoflow/time';
import { ChannelStatus } from '@memoflow/contracts/notification';
import {
  createNotificationRuntimeContribution,
  type NotificationChannelDeliverer,
} from './notification.runtime';
import { Notification } from '../../domain/aggregates/notification';
import { NotificationChannel } from '../../domain/entities/notification-channel';
import type { INotificationRepository } from '../../domain/repositories/i-notification-repository';
import {
  InMemoryReliableAdapter,
  type DurableOutboxRow,
} from './__tests__/helpers/in-memory-reliable-adapter';

const TEST_TIME_CONTEXT = createTimeContext({ timeZone: 'UTC', weekStartsOn: 1 });
const TEST_USER_TIME_CONTEXT_PORT = {
  getUserTimeContext: async () => TEST_TIME_CONTEXT,
};

/** 构造一个带指定渠道状态的最小 Notification 聚合（经 Notification.load）。 */
function notificationWithChannel(status: string, options: { attempts?: number; failedAt?: Date | null } = {}) {
  const channel = NotificationChannel.create({
    notificationId: 'n-1' as never,
    channelType: 'InApp',
    recipient: 'identity-1',
  });
  // 通过内部状态直接摆好渠道状态（单测白盒，避免走实体状态机限制）
  const state: Record<string, unknown> = {
    id: 'ch-1',
    notificationId: 'n-1',
    channelType: 'InApp',
    status,
    recipient: 'identity-1',
    sendAttempts: options.attempts ?? 0,
    maxRetries: 3,
    error: null,
    response: null,
    sentAt: null,
    failedAt: options.failedAt ?? null,
  };
  Object.assign(channel, { _props: state });
  const notification = Notification.load({
    id: 'n-1' as never,
    identityId: 'identity-1' as never,
    workflowKey: 'reminder.general',
    topic: 'reminder.general',
    idempotencyKey: 'runtime-fixture',
    title: 't',
    content: 'c',
    type: 'Info' as never,
    category: 'Reminder' as never,
    importance: 'Moderate' as never,
    urgency: 'Medium' as never,
    isRead: false,
    readAt: null,
    actions: null,
    metadata: null,
    navigationIntent: null,
    expiresAt: null,
    version: 1,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    notificationChannels: [channel],
  } as never);
  return notification;
}

function makeRepository(notifications: Notification[]) {
  return {
    findChannelsByStatus: vi.fn(async (status: string) =>
      notifications.filter((n) =>
        (n.notificationChannels ?? []).some((c) => c.status === status),
      ),
    ),
    findByIdForIdentity: vi.fn(async (_identityId: string, id: string) =>
      notifications.find((n) => String(n.id) === id) ?? null,
    ),
    save: vi.fn(async () => undefined),
  } as unknown as INotificationRepository;
}

/** 将 Notification 的首个渠道作为 durable outbox 投递意图写入内存 adapter。 */
function dispatchChannelOutbox(
  adapter: InMemoryReliableAdapter,
  notification: Notification,
  channel: NotificationChannel,
) {
  const identityId = String(notification.identityId);
  const notificationId = String(notification.id);
  const occurrenceKey = `${notificationId}:${channel.channelType}`;
  return adapter.dispatchOutbox(
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

/** 让 outbox 行立即回到可被再次 claim 的 retryable 状态（模拟退避窗口已过）。 */
function forceRetryDue(row: DurableOutboxRow) {
  row.status = 'retryable';
  row.nextRetryAt = new Date(Date.now() - 1000);
}

describe('NotificationChannel durable worker (R3 收尾)', () => {
  it('delivers pending channels and advances to Delivered with receipt', async () => {
    const notification = notificationWithChannel(ChannelStatus.Pending);
    const repository = makeRepository([notification]);
    const deliverer: NotificationChannelDeliverer = { deliver: vi.fn(async () => undefined) };
    const adapter = new InMemoryReliableAdapter();

    const runtime = createNotificationRuntimeContribution({
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
      environment: 'test',
      repository,
      reliableAdapter: adapter,
      deliverer,
    });

    const channel = notification.notificationChannels![0];
    await dispatchChannelOutbox(adapter, notification, channel);
    await runtime.tick();

    expect(deliverer.deliver).toHaveBeenCalledTimes(1);
    expect(channel.status).toBe(ChannelStatus.Delivered);
    expect(channel.sentAt).not.toBeNull();
    expect(notification.isRead).toBe(false);
    expect(notification.readAt).toBeNull();
    expect(repository.save).toHaveBeenCalled();

    const receipts = await adapter.queryReceipts(String(notification.identityId));
    expect(receipts).toHaveLength(1);
    expect(receipts[0].status).toBe('succeeded');

    const metrics = runtime.getMetrics();
    expect(metrics.dispatchedTotal).toBe(1);
    expect(metrics.deliveredTotal).toBe(1);

    // P1-5: unified recorder keys fire on the real worker tick path.
    const unified = runtime.getUnifiedSnapshot();
    expect(unified['memoflow.notification.outbox.claimed']).toBe(1);
    expect(unified['memoflow.notification.outbox.succeeded']).toBe(1);
  });

  it('treats a device-offline channel failure as retryable and delivers after recovery', async () => {
    const notification = notificationWithChannel(ChannelStatus.Pending);
    const repository = makeRepository([notification]);
    let calls = 0;
    const deliverer: NotificationChannelDeliverer = {
      deliver: vi.fn(async () => {
        calls++;
        if (calls === 1) throw new Error('channel unreachable');
      }),
    };
    const adapter = new InMemoryReliableAdapter();

    const runtime = createNotificationRuntimeContribution({
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
      environment: 'test',
      repository,
      reliableAdapter: adapter,
      deliverer,
      backoffBaseMs: 60_000,
    });

    const channel = notification.notificationChannels![0];
    await dispatchChannelOutbox(adapter, notification, channel);

    await runtime.tick();
    expect(channel.status).toBe(ChannelStatus.Failed);
    expect(channel.failedAt).not.toBeNull();

    let receipts = await adapter.queryReceipts(String(notification.identityId));
    expect(receipts[0].status).toBe('retryable');
    expect(new Date(receipts[0].nextRetryAt!).getTime()).toBeGreaterThan(Date.now());

    // 退避窗口过后 outbox 重新可领用，且渠道回到待投递 → 重试成功
    channel.retry();
    forceRetryDue(adapter.rows[0]);
    await runtime.tick();

    expect(deliverer.deliver).toHaveBeenCalledTimes(2);
    expect(channel.status).toBe(ChannelStatus.Delivered);

    receipts = await adapter.queryReceipts(String(notification.identityId));
    expect(receipts[0].status).toBe('succeeded');

    // W7 互斥语义：retryable 分支记录 retried，不累计 outbox.failed
    const unified = runtime.getUnifiedSnapshot();
    expect(unified['memoflow.notification.outbox.retried']).toBe(1);
    expect(unified['memoflow.notification.outbox.failed']).toBeUndefined();
  });

  it('keeps failed channels in dead-letter once attempts exceed the threshold', async () => {
    const notification = notificationWithChannel(ChannelStatus.Failed, { attempts: 3 });
    const repository = makeRepository([notification]);
    const adapter = new InMemoryReliableAdapter();

    const runtime = createNotificationRuntimeContribution({
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
      environment: 'test',
      repository,
      reliableAdapter: adapter,
      deliverer: {
        deliver: vi.fn(async () => {
          throw new Error('channel unreachable');
        }),
      },
      deadLetterThreshold: 3,
    });

    const channel = notification.notificationChannels![0];
    await dispatchChannelOutbox(adapter, notification, channel);
    // 预置尝试次数：下一次失败即越过 dead-letter 阈值
    const row = adapter.rows[0];
    row.attempt = 3;
    forceRetryDue(row);

    await runtime.tick();

    expect(channel.status).toBe(ChannelStatus.Failed);

    const receipts = await adapter.queryReceipts(String(notification.identityId));
    expect(receipts[0].status).toBe('dead_letter');
    expect(receipts[0].attempt).toBe(4);

    const metrics = runtime.getMetrics();
    expect(metrics.deadLetterTotal).toBe(1);
    // W7 互斥语义：dead-letter 是独立终态，不得同时累计 failed
    expect(metrics.failedTotal).toBe(0);
    const unified = runtime.getUnifiedSnapshot();
    expect(unified['memoflow.notification.outbox.dead_letter']).toBe(1);
    expect(unified['memoflow.notification.outbox.retried']).toBeUndefined();
    expect(unified['memoflow.notification.outbox.failed']).toBeUndefined();
  });

  it('marks delivery failure and does not crash the tick', async () => {
    const notification = notificationWithChannel(ChannelStatus.Pending);
    const repository = makeRepository([notification]);
    const deliverer: NotificationChannelDeliverer = {
      deliver: vi.fn(async () => {
        throw new Error('channel unreachable');
      }),
    };
    const adapter = new InMemoryReliableAdapter();

    const runtime = createNotificationRuntimeContribution({
      userTimeContextPort: TEST_USER_TIME_CONTEXT_PORT,
      environment: 'test',
      repository,
      reliableAdapter: adapter,
      deliverer,
    });

    const channel = notification.notificationChannels![0];
    await dispatchChannelOutbox(adapter, notification, channel);

    await expect(runtime.tick()).resolves.toBeUndefined();

    expect(channel.status).toBe(ChannelStatus.Failed);
    expect(channel.failedAt).not.toBeNull();

    const receipts = await adapter.queryReceipts(String(notification.identityId));
    expect(receipts[0].status).toBe('retryable');
  });
});
