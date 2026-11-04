import type { BusinessOperationReceipt } from '@memoflow/reliable-messaging-contracts';
import type { NotificationSseAdapter } from '../adapters/sse/notification-sse.adapter';
import type {
  NotificationDispatchOutboxRow,
  NotificationRuntimeContext,
} from './notification.runtime';

/**
 * SSE seam of the notification durable runtime.
 *
 * The adapter instance is created once by the runtime factory and shared
 * through the context so the composition root and the dispatch loop observe
 * the same subscriber registry.
 */
export interface NotificationRuntimeSsePort {
  getSseAdapter(): NotificationSseAdapter;
}

export function createNotificationRuntimeSsePort(
  ctx: NotificationRuntimeContext,
): NotificationRuntimeSsePort {
  return {
    getSseAdapter(): NotificationSseAdapter {
      return ctx.sseAdapter;
    },
  };
}

/**
 * SSE is a read-only outbox consumer: broadcast the real-time delivery event
 * only AFTER the durable receipt is persisted.
 */
export function broadcastDurableDelivery(
  ctx: NotificationRuntimeContext,
  outbox: NotificationDispatchOutboxRow,
  payloadData: Record<string, unknown>,
  recordedReceipt: BusinessOperationReceipt,
): void {
  ctx.sseAdapter.broadcastDeliveryEvent(outbox.identityId, recordedReceipt, {
    outboxChannel: outbox.channel,
    notificationId: outbox.notificationId,
    title: (payloadData.title as string) ?? 'Notification',
    content: (payloadData.content as string) ?? '',
    category: (payloadData.category as string) ?? 'System',
    type: (payloadData.type as string) ?? 'Info',
    data: payloadData,
  });
}
