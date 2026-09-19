import type {
  NotificationChannelDeliverer,
  NotificationDeliveryContext,
  NotificationDeliveryTarget,
} from '../../runtime/notification.runtime';
import type { Notification } from '../../../domain/aggregates/notification';
import { createTypedEventPublisher, eventBus } from '@memoflow/utils/domain';
import type {
  NotificationDispatchDesktopEvent,
  NotificationEventMap,
} from '@memoflow/contracts/notification';

const notificationDispatchEvents = createTypedEventPublisher<
  Pick<NotificationEventMap, 'notification:dispatch_in_app' | 'notification:dispatch_desktop'>
>(eventBus);

type TargetObject = Record<string, unknown>;

/**
 * InApp delivery is durable once the dispatch receipt is committed by the worker.
 * The Notification Fact itself is already persisted before the outbox becomes
 * claimable, so this adapter deliberately performs no aggregate write-back.
 */
export class RealInAppChannelDeliverer implements NotificationChannelDeliverer {
  async deliver(
    _notification: Notification,
    _target: NotificationDeliveryTarget,
    _context: NotificationDeliveryContext,
  ): Promise<void> {
    // The worker publishes SSE only after the durable receipt succeeds.
  }
}

/** Desktop/native transport callable. */
type TransportDeliverFn = (dto: unknown, context?: unknown) => Promise<unknown> | unknown;

export function getTransportDeliverFn(transport: unknown): TransportDeliverFn | null {
  if (!transport) return null;
  const t = transport as TargetObject;
  if (typeof t.deliver === 'function') return t.deliver as TransportDeliverFn;
  if (typeof t.send === 'function') return t.send as TransportDeliverFn;
  if (typeof transport === 'function') return transport as TransportDeliverFn;
  return null;
}

/** A durable success requires an explicit native transport acknowledgement. */
export function isDeliveredAck(
  ack: unknown,
): ack is { ackId: string; status: 'delivered'; timestamp?: number } {
  if (!ack || typeof ack !== 'object' || Array.isArray(ack)) return false;
  const candidate = ack as TargetObject;
  return (
    typeof candidate.ackId === 'string' &&
    (candidate.ackId as string).length > 0 &&
    candidate.status === 'delivered'
  );
}

function describeAck(ack: unknown): string {
  if (ack === undefined) return 'undefined';
  if (ack === null) return 'null';
  if (typeof ack === 'object') {
    try {
      return JSON.stringify(ack);
    } catch {
      return String(ack);
    }
  }
  return String(ack);
}

/**
 * Native Desktop delivery adapter. Delivery status is recorded exclusively in
 * NotificationDispatchOutbox/receipt; the Fact is never mutated after an ack.
 */
export class RealDesktopChannelDeliverer implements NotificationChannelDeliverer {
  constructor(private readonly transport?: unknown) {}

  isAvailable(): boolean {
    return getTransportDeliverFn(this.transport) !== null;
  }

  async getAck(
    idempotencyKey: string,
  ): Promise<{ ackId: string; status: string; timestamp?: number } | null> {
    if (!this.transport) return null;
    const t = this.transport as {
      getAck?: (key: string) => Promise<unknown> | unknown;
      getAckStore?: () => unknown;
    };
    if (typeof t.getAck === 'function') {
      const ack = await t.getAck(idempotencyKey);
      return (ack as { ackId: string; status: string; timestamp?: number }) ?? null;
    }
    const store =
      typeof t.getAckStore === 'function'
        ? (t.getAckStore() as { getAck?: (key: string) => Promise<unknown> | unknown })
        : null;
    if (store && typeof store.getAck === 'function') {
      const ack = await store.getAck(idempotencyKey);
      return (ack as { ackId: string; status: string; timestamp?: number }) ?? null;
    }
    return null;
  }

  async deliver(
    notification: Notification,
    _target: NotificationDeliveryTarget,
    context: NotificationDeliveryContext,
  ): Promise<void> {
    const transportDeliver = getTransportDeliverFn(this.transport);
    if (!transportDeliver) {
      throw new Error(
        'production transport unavailable: transport is missing or has no callable deliver/send function',
      );
    }

    const isDomainObject =
      typeof (notification as unknown as { toServerDTO?: unknown }).toServerDTO === 'function';
    const dto = isDomainObject
      ? notification.toServerDTO()
      : (notification as unknown as TargetObject);

    const rawAck = await transportDeliver(dto, context);
    if (!isDeliveredAck(rawAck)) {
      throw new Error(
        `transport did not return a valid delivery ack (non-empty ackId and status 'delivered' required); got: ${describeAck(rawAck)}`,
      );
    }

    notificationDispatchEvents.send('notification:dispatch_desktop', {
      id:
        (dto.id as NotificationDispatchDesktopEvent['id']) ??
        ('' as NotificationDispatchDesktopEvent['id']),
      identityId:
        (dto.identityId as NotificationDispatchDesktopEvent['identityId']) ??
        ('' as NotificationDispatchDesktopEvent['identityId']),
      title: (dto.title as string) ?? 'Notification',
      body: (dto.content as string) ?? '',
      category: (dto.category ?? 'System') as NotificationDispatchDesktopEvent['category'],
      type: (dto.type ?? 'Info') as NotificationDispatchDesktopEvent['type'],
      importance: (dto.importance ?? 'Normal') as NonNullable<
        NotificationDispatchDesktopEvent['importance']
      >,
      data: ((dto as TargetObject).data as Record<string, unknown>) ?? {},
      sound: { enabled: true, name: null },
    });
  }
}
