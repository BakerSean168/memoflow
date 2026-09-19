import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@memoflow/database';
import type { NotificationInteractionDTO } from '@memoflow/contracts/notification';
import type {
  INotificationInteractionRepository,
  RecordNotificationInteractionInput,
} from '../../../domain/repositories/i-notification-interaction-repository';

function toDTO(row: {
  id: string;
  idempotencyKey: string;
  identityId: string;
  notificationId: string;
  actionKey: string;
  actionKind: string;
  occurredAt: Date;
  commandReceiptId: string | null;
  outcome: string;
  correlationId: string | null;
  causationId: string | null;
}): NotificationInteractionDTO {
  return {
    id: row.id as NotificationInteractionDTO['id'],
    idempotencyKey: row.idempotencyKey,
    identityId: row.identityId as NotificationInteractionDTO['identityId'],
    notificationId: row.notificationId as NotificationInteractionDTO['notificationId'],
    actionKey: row.actionKey,
    actionKind: row.actionKind as NotificationInteractionDTO['actionKind'],
    occurredAt: row.occurredAt.getTime(),
    commandReceiptId: row.commandReceiptId,
    outcome: row.outcome as NotificationInteractionDTO['outcome'],
    correlationId: row.correlationId,
    causationId: row.causationId,
  };
}

export class NotificationInteractionPrismaRepository implements INotificationInteractionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async record(input: RecordNotificationInteractionInput): Promise<NotificationInteractionDTO> {
    const row = await this.prisma.notificationInteraction.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      create: {
        id: `NotificationInteraction_${randomUUID()}`,
        idempotencyKey: input.idempotencyKey,
        identityId: input.identityId,
        notificationId: input.notificationId,
        actionKey: input.actionKey,
        actionKind: input.actionKind,
        occurredAt: new Date(input.occurredAt),
        commandReceiptId: input.commandReceiptId ?? null,
        outcome: input.outcome,
        correlationId: input.correlationId ?? null,
        causationId: input.causationId ?? null,
      },
      update: {},
    });
    if (row.identityId !== input.identityId || row.notificationId !== input.notificationId) {
      throw new Error('Notification interaction idempotency key is already owned by another fact');
    }
    return toDTO(row);
  }

  async findByIdempotencyKey(
    identityId: string,
    idempotencyKey: string,
  ): Promise<NotificationInteractionDTO | null> {
    const row = await this.prisma.notificationInteraction.findFirst({
      where: { identityId, idempotencyKey },
    });
    return row ? toDTO(row) : null;
  }

  async listByNotification(
    identityId: string,
    notificationId: string,
  ): Promise<NotificationInteractionDTO[]> {
    const rows = await this.prisma.notificationInteraction.findMany({
      where: { identityId, notificationId },
      orderBy: { occurredAt: 'asc' },
    });
    return rows.map(toDTO);
  }
}
