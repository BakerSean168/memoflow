import type {
  NotificationInteractionDTO,
  NotificationInteractionKind,
  NotificationInteractionOutcome,
} from '@memoflow/contracts/notification';

export interface RecordNotificationInteractionInput {
  readonly idempotencyKey: string;
  readonly identityId: string;
  readonly notificationId: string;
  readonly actionKey: string;
  readonly actionKind: NotificationInteractionKind;
  readonly occurredAt: number;
  readonly commandReceiptId?: string | null;
  readonly outcome: NotificationInteractionOutcome;
  readonly correlationId?: string | null;
  readonly causationId?: string | null;
}

export interface INotificationInteractionRepository {
  record(input: RecordNotificationInteractionInput): Promise<NotificationInteractionDTO>;
  findByIdempotencyKey(identityId: string, idempotencyKey: string): Promise<NotificationInteractionDTO | null>;
  listByNotification(identityId: string, notificationId: string): Promise<NotificationInteractionDTO[]>;
}
