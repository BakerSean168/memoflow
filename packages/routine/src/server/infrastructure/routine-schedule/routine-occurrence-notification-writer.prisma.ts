import type { Prisma, PrismaClient, OutboxMessage } from '@memoflow/database';
import { NOTIFICATION_REQUESTED_MESSAGE_TYPE } from '@memoflow/notification-contracts';
import {
  assertValidBusinessOperationReceipt,
  buildIdempotencyKeyString,
  mapOutboxStatusToBusinessOperationStatus,
  parseIdempotencyKeyString,
  type BusinessOperationReceipt,
  type OutboxMessageStatus,
} from '@memoflow/reliable-messaging-contracts';
import type { RoutineOccurrenceTransactionHandle } from '../../domain/ports/routine-occurrence-store.port';
import type {
  RoutineOccurrenceNotificationRequestInput,
  RoutineOccurrenceNotificationWriterPort,
} from '../../domain/ports/routine-occurrence-notification-writer.port';
import { buildRoutineNotificationRequestedOutboxInput } from './routine-occurrence-notification-writer';
import { resolveRoutineScheduleTransactionClient } from './routine-schedule-transaction-handle';

/**
 * Map a shared `reliable_outbox_messages` row to a unified
 * BusinessOperationReceipt (same projection as the canonical Notification
 * package's mapPrismaSharedOutboxToReceipt, kept local so the routine lane
 * stays independent of @memoflow/notification at runtime).
 */
export function mapSharedOutboxRowToReceipt(row: OutboxMessage): BusinessOperationReceipt {
  const parsedKey = parseIdempotencyKeyString(row.idempotencyKey ?? '');
  const identityId = row.identityId ?? parsedKey?.identityId ?? '';
  if (!identityId) {
    throw new Error(
      `[FAIL-FAST] Shared outbox row '${row.id}' has no identityId and no parseable idempotencyKey.`,
    );
  }
  const source = parsedKey?.source ?? 'notification';
  const occurrenceKey = parsedKey?.occurrenceKey ?? row.id;
  const status = mapOutboxStatusToBusinessOperationStatus(row.status as OutboxMessageStatus);

  return assertValidBusinessOperationReceipt({
    schemaVersion: 1,
    operationId: row.id,
    identityId,
    source,
    occurrenceKey,
    idempotencyKey:
      row.idempotencyKey ?? buildIdempotencyKeyString({ identityId, source, occurrenceKey }),
    status,
    attempt: row.attempts,
    lease: null,
    lastError: row.lastError,
    nextRetryAt: null,
    deadLetterAt: null,
    correlationId: row.correlationId,
    causationId: row.causationId,
    attemptsHistory: [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.createdAt.toISOString(),
    finishedAt: status === 'succeeded' && row.dispatchedAt ? row.dispatchedAt.toISOString() : null,
  });
}

/**
 * Prisma durable `notification.requested` writer (NOTIF-3301 envelope) for the
 * ROUTINE-3401 lane. Mirrors the canonical Notification package writer, but
 * lives inside the reminder compose root so the routine commit + notification
 * intent join ONE transaction through the shared ROUTINE-3401 handle — no
 * cross-package opaque transaction casts.
 */
export class PrismaRoutineOccurrenceNotificationWriter implements RoutineOccurrenceNotificationWriterPort {
  constructor(private readonly prisma: PrismaClient) {}

  async enqueueRoutineOccurrenceRequested(
    input: RoutineOccurrenceNotificationRequestInput,
    options?: { readonly transaction?: RoutineOccurrenceTransactionHandle },
  ): Promise<BusinessOperationReceipt> {
    const outboxInput = buildRoutineNotificationRequestedOutboxInput(input);
    const envelope = outboxInput.envelope;

    const client = resolveRoutineScheduleTransactionClient(options?.transaction) ?? this.prisma;
    const existing = await this.findByOutboxAnchor(
      client,
      outboxInput.operationId,
      envelope.idempotencyKey,
    );
    if (existing) return mapSharedOutboxRowToReceipt(existing);

    const now = new Date();
    try {
      const created = await client.outboxMessage.create({
        data: {
          id: outboxInput.operationId,
          identityId: envelope.identityId,
          messageType: NOTIFICATION_REQUESTED_MESSAGE_TYPE,
          schemaVersion: 1,
          correlationId: envelope.correlationId ?? outboxInput.operationId,
          causationId: envelope.causationId ?? envelope.correlationId ?? outboxInput.operationId,
          payloadJson: JSON.stringify(envelope),
          idempotencyKey: envelope.idempotencyKey,
          status: 'pending',
          attempts: 0,
          availableAt: now,
          createdAt: now,
        },
      });
      return mapSharedOutboxRowToReceipt(created);
    } catch (cause) {
      // P2002 under our operationId or the canonical idempotencyKey means a
      // concurrent replay won; return the stable receipt instead of failing.
      const reFetched = await this.findByOutboxAnchor(
        client,
        outboxInput.operationId,
        envelope.idempotencyKey,
      );
      if (!reFetched) throw cause;
      return mapSharedOutboxRowToReceipt(reFetched);
    }
  }

  private async findByOutboxAnchor(
    client: Prisma.TransactionClient | PrismaClient,
    operationId: string,
    idempotencyKey: string | undefined,
  ): Promise<OutboxMessage | null> {
    const byOperationId = await client.outboxMessage.findUnique({
      where: { id: operationId },
    });
    if (byOperationId) return byOperationId;
    if (idempotencyKey) {
      return client.outboxMessage.findUnique({ where: { idempotencyKey } });
    }
    return null;
  }
}
