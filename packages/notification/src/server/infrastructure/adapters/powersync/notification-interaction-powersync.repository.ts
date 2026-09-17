import { randomUUID } from 'node:crypto';
import type { IElectronDatabase } from '@memoflow/contracts/electron';
import type { NotificationInteractionDTO } from '@memoflow/contracts/notification';
import type {
  INotificationInteractionRepository,
  RecordNotificationInteractionInput,
} from '../../../domain/repositories/i-notification-interaction-repository';

interface InteractionRow {
  id: string;
  idempotency_key: string;
  identity_id: string;
  notification_id: string;
  action_key: string;
  action_kind: string;
  occurred_at: string;
  command_receipt_id: string | null;
  outcome: string;
  correlation_id: string | null;
  causation_id: string | null;
}

function toDTO(row: InteractionRow): NotificationInteractionDTO {
  return {
    id: row.id as NotificationInteractionDTO['id'],
    idempotencyKey: row.idempotency_key,
    identityId: row.identity_id as NotificationInteractionDTO['identityId'],
    notificationId: row.notification_id as NotificationInteractionDTO['notificationId'],
    actionKey: row.action_key,
    actionKind: row.action_kind as NotificationInteractionDTO['actionKind'],
    occurredAt: new Date(row.occurred_at).getTime(),
    commandReceiptId: row.command_receipt_id,
    outcome: row.outcome as NotificationInteractionDTO['outcome'],
    correlationId: row.correlation_id,
    causationId: row.causation_id,
  };
}

export class NotificationInteractionPowerSyncRepository implements INotificationInteractionRepository {
  constructor(private readonly db: IElectronDatabase) {}

  async record(input: RecordNotificationInteractionInput): Promise<NotificationInteractionDTO> {
    return this.db.writeTransaction(async (tx) => {
      const existing = await tx.getOptional<InteractionRow>(
        `SELECT * FROM notification_interactions WHERE idempotency_key = ? LIMIT 1`,
        [input.idempotencyKey],
      );
      if (existing) {
        if (existing.identity_id !== input.identityId || existing.notification_id !== input.notificationId) {
          throw new Error('Notification interaction idempotency key is already owned by another fact');
        }
        return toDTO(existing);
      }

      const id = `NotificationInteraction_${randomUUID()}`;
      await tx.execute(
        `INSERT INTO notification_interactions (
          id, idempotency_key, identity_id, notification_id, action_key, action_kind,
          occurred_at, command_receipt_id, outcome, correlation_id, causation_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.idempotencyKey,
          input.identityId,
          input.notificationId,
          input.actionKey,
          input.actionKind,
          new Date(input.occurredAt).toISOString(),
          input.commandReceiptId ?? null,
          input.outcome,
          input.correlationId ?? null,
          input.causationId ?? null,
        ],
      );
      const inserted = await tx.get<InteractionRow>(
        `SELECT * FROM notification_interactions WHERE id = ? LIMIT 1`,
        [id],
      );
      return toDTO(inserted);
    });
  }

  async findByIdempotencyKey(
    identityId: string,
    idempotencyKey: string,
  ): Promise<NotificationInteractionDTO | null> {
    const row = await this.db.getOptional<InteractionRow>(
      `SELECT * FROM notification_interactions WHERE identity_id = ? AND idempotency_key = ? LIMIT 1`,
      [identityId, idempotencyKey],
    );
    return row ? toDTO(row) : null;
  }

  async listByNotification(
    identityId: string,
    notificationId: string,
  ): Promise<NotificationInteractionDTO[]> {
    const rows = await this.db.getAll<InteractionRow>(
      `SELECT * FROM notification_interactions WHERE identity_id = ? AND notification_id = ? ORDER BY occurred_at ASC`,
      [identityId, notificationId],
    );
    return rows.map(toDTO);
  }
}
