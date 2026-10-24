import {
  createTypedEventPublisher,
  createTypedEventSubscriber,
  eventBus,
} from '@memoflow/utils/domain';
import {
  NotificationChannelType as ChannelTypeEnum,
  type NotificationDispatchDesktopEvent,
  type NotificationDispatchInAppEvent,
  type NotificationEventMap,
} from '@memoflow/contracts/notification';
import type { BusinessOperationReceipt } from '@memoflow/contracts/reliable-messaging';

export type NotificationSseDeliveryEvent =
  NotificationDispatchInAppEvent | NotificationDispatchDesktopEvent;

export type NotificationSseDeliveryEventHandler = (payload: NotificationSseDeliveryEvent) => void;

export interface ReliableReceiptQueryProvider {
  queryReceipts(
    identityId: string,
    options?: { limit?: number; lastCursor?: string; status?: string },
  ): Promise<BusinessOperationReceipt[]>;
}

const notificationDispatchEvents =
  createTypedEventPublisher<
    Pick<NotificationEventMap, 'notification:dispatch_in_app' | 'notification:dispatch_desktop'>
  >(eventBus);

const notificationDispatchSubscriber =
  createTypedEventSubscriber<
    Pick<NotificationEventMap, 'notification:dispatch_in_app' | 'notification:dispatch_desktop'>
  >(eventBus);

export class NotificationSseAdapter {
  private readonly perIdentityCursors = new Map<string, string>();

  constructor(private readonly receiptQueryProvider?: ReliableReceiptQueryProvider) {}

  /**
   * Subscribe to real-time delivery events and return an unsubscribe function.
   * Used by transports (e.g. HTTP SSE) as the typed event seam instead of raw `eventBus.on/off`.
   */
  subscribe(handler: NotificationSseDeliveryEventHandler): () => void {
    const onInApp = (payload: NotificationDispatchInAppEvent) => handler(payload);
    const onDesktop = (payload: NotificationDispatchDesktopEvent) => handler(payload);

    notificationDispatchSubscriber.on('notification:dispatch_in_app', onInApp);
    notificationDispatchSubscriber.on('notification:dispatch_desktop', onDesktop);

    return () => {
      notificationDispatchSubscriber.off('notification:dispatch_in_app', onInApp);
      notificationDispatchSubscriber.off('notification:dispatch_desktop', onDesktop);
    };
  }

  /**
   * Get persistent cursor for a specific identity
   */
  getCursor(identityId: string): string | null {
    return this.perIdentityCursors.get(identityId) ?? null;
  }

  /**
   * Update persistent cursor for a specific identity
   */
  setCursor(identityId: string, cursor: string): void {
    this.perIdentityCursors.set(identityId, cursor);
  }

  /**
   * Catch up missed events during client disconnection window.
   * Reads durable receipts state from receiptQueryProvider using persistent cursor.
   */
  async catchupMissedEvents(
    identityId: string,
    clientLastCursor?: string,
    limit = 100,
  ): Promise<{ receipts: BusinessOperationReceipt[]; cursor: string | null }> {
    const effectiveCursor = clientLastCursor ?? this.perIdentityCursors.get(identityId);

    if (!this.receiptQueryProvider) {
      return { receipts: [], cursor: effectiveCursor ?? null };
    }

    const receipts = await this.receiptQueryProvider.queryReceipts(identityId, {
      lastCursor: effectiveCursor,
      status: 'succeeded',
      limit,
    });

    if (receipts.length > 0) {
      const latestReceipt = receipts[receipts.length - 1];
      const newCursor = `${latestReceipt.updatedAt}|${latestReceipt.operationId}`;
      this.perIdentityCursors.set(identityId, newCursor);
      return { receipts, cursor: newCursor };
    }

    return { receipts: [], cursor: effectiveCursor ?? null };
  }

  /**
   * Broadcast real-time delivery event upon outbox receipt persistence and update identity cursor.
   */
  broadcastDeliveryEvent(
    identityId: string,
    receipt: BusinessOperationReceipt,
    payload: {
      outboxChannel: string;
      notificationId: string;
      title?: string;
      content?: string;
      category?: string;
      type?: string;
      data?: Record<string, unknown>;
    },
  ): void {
    if (receipt.updatedAt && receipt.operationId) {
      this.perIdentityCursors.set(identityId, `${receipt.updatedAt}|${receipt.operationId}`);
    }

    const isInApp =
      payload.outboxChannel === ChannelTypeEnum.InApp || payload.outboxChannel === 'InApp';
    const isPush =
      payload.outboxChannel === ChannelTypeEnum.Push || payload.outboxChannel === 'Push';

    if (isInApp) {
      notificationDispatchEvents.send('notification:dispatch_in_app', {
        id: payload.notificationId as NotificationEventMap['notification:dispatch_in_app']['id'],
        operationId: receipt.operationId,
        updatedAt: receipt.updatedAt,
        identityId:
          identityId as NotificationEventMap['notification:dispatch_in_app']['identityId'],
        title: payload.title ?? 'Notification',
        body: payload.content ?? '',
        category: (payload.category ??
          'System') as NotificationEventMap['notification:dispatch_in_app']['category'],
        type: (payload.type ??
          'Info') as NotificationEventMap['notification:dispatch_in_app']['type'],
        importance: 'Normal' as NotificationEventMap['notification:dispatch_in_app']['importance'],
        data: payload.data ?? {},
      });
    } else if (isPush) {
      notificationDispatchEvents.send('notification:dispatch_desktop', {
        id: payload.notificationId as NotificationEventMap['notification:dispatch_desktop']['id'],
        operationId: receipt.operationId,
        updatedAt: receipt.updatedAt,
        identityId:
          identityId as NotificationEventMap['notification:dispatch_desktop']['identityId'],
        title: payload.title ?? 'Notification',
        body: payload.content ?? '',
        category: (payload.category ??
          'System') as NotificationEventMap['notification:dispatch_desktop']['category'],
        type: (payload.type ??
          'Info') as NotificationEventMap['notification:dispatch_desktop']['type'],
        importance: 'Normal' as NotificationEventMap['notification:dispatch_desktop']['importance'],
        data: payload.data ?? {},
        sound: { enabled: true, name: null },
      });
    }
  }
}
