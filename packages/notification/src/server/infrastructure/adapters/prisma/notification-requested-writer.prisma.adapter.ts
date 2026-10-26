/**
 * NotificationRequestedPrismaWriterAdapter - Prisma implementation of
 * notification-requested writer port (NOTIF-3301 durable integration envelope).
 *
 * Business handlers enqueue a `NotificationRequested` envelope into the shared
 * `outboxMessage` table within their own transaction (when a txClient is
 * supplied) or on the standard client. The write never reaches into any channel
 * deliverer, so a handler commit never depends on external Desktop/Email/Push
 * delivery success.
 */

import type { Prisma, PrismaClient, OutboxMessage } from '@memoflow/database';
import {
  type NotificationRequestedOutboxInput,
  NotificationRequestedOutboxInputSchema,
  type NotificationRequestedWriterPort,
  NOTIFICATION_REQUESTED_MESSAGE_TYPE,
} from '@memoflow/notification-contracts';
import {
  assertValidBusinessOperationReceipt,
  type BusinessOperationReceipt,
  mapOutboxStatusToBusinessOperationStatus,
  type OutboxMessageStatus,
  parseIdempotencyKeyString,
} from '@memoflow/reliable-messaging-contracts';

/**
 * Map a shared `outboxMessage` row to a unified BusinessOperationReceipt used by
 * the W0 shared port boundary. The row has a terminal-less subset of receipt
 * fields, so terminal state invariants are satisfied via dispatchedAt (for
 * succeeded) and only a non-terminal lease is projected.
 */
export function mapPrismaSharedOutboxToReceipt(row: OutboxMessage): BusinessOperationReceipt {
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

  const lease =
    status === 'running' && row.ownerToken && row.claimId && row.leaseExpiresAt
      ? {
          schemaVersion: 1 as const,
          resourceKey: `${source}:${identityId}:${occurrenceKey}`,
          claimId: row.claimId,
          fencingToken: row.fencingToken ?? 0,
          ownerToken: row.ownerToken,
          expiresAt: row.leaseExpiresAt.toISOString(),
          lastHeartbeatAt: row.lastHeartbeatAt ? row.lastHeartbeatAt.toISOString() : null,
          heartbeatIntervalMs: null,
        }
      : null;

  return assertValidBusinessOperationReceipt({
    schemaVersion: 1,
    operationId: row.id,
    identityId,
    source,
    occurrenceKey,
    idempotencyKey: row.idempotencyKey ?? buildSharedOutboxKey(identityId, source, occurrenceKey),
    status,
    attempt: row.attempts,
    lease,
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

function buildSharedOutboxKey(identityId: string, source: string, occurrenceKey: string): string {
  return `v1:${identityId.length}:${identityId}:${source.length}:${source}:${occurrenceKey.length}:${occurrenceKey}`;
}

export class NotificationRequestedPrismaWriterAdapter implements NotificationRequestedWriterPort {
  constructor(private readonly prisma: PrismaClient) {}

  async enqueueNotificationRequested(
    input: NotificationRequestedOutboxInput,
    options?: { txClient?: Prisma.TransactionClient },
  ): Promise<BusinessOperationReceipt> {
    const validated = NotificationRequestedOutboxInputSchema.parse(input);
    const client = options?.txClient ?? this.prisma;
    const now = new Date();
    const envelope = validated.envelope;

    const existing = await client.outboxMessage.findUnique({
      where: { id: validated.operationId },
    });
    if (existing) {
      return mapPrismaSharedOutboxToReceipt(existing);
    }

    // Envelope-level idempotency: the canonical idempotencyKey (NOT the
    // operationId) is the durable dedupe anchor. A crash/replay retry may carry
    // a freshly generated operationId for the very same envelope, so reconcile
    // to the existing outbox row pinned by the unique idempotencyKey.
    if (envelope.idempotencyKey) {
      const existingByIdempotencyKey = await client.outboxMessage.findUnique({
        where: { idempotencyKey: envelope.idempotencyKey },
      });
      if (existingByIdempotencyKey) {
        return mapPrismaSharedOutboxToReceipt(existingByIdempotencyKey);
      }
    }

    const correlationId =
      envelope.correlationId ?? validated.correlationId ?? validated.operationId;
    const causationId = envelope.causationId ?? validated.causationId ?? null;

    try {
      const created = await client.outboxMessage.create({
        data: {
          id: validated.operationId,
          identityId: envelope.identityId,
          messageType: NOTIFICATION_REQUESTED_MESSAGE_TYPE,
          schemaVersion: 1,
          correlationId,
          causationId,
          payloadJson: JSON.stringify(envelope),
          idempotencyKey: envelope.idempotencyKey,
          status: 'pending',
          attempts: 0,
          availableAt: now,
          createdAt: now,
        },
      });

      return mapPrismaSharedOutboxToReceipt(created);
    } catch (cause) {
      // A unique-constraint violation (P2002) here means a concurrent winner
      // created the durable row first — either under our operationId or under
      // the canonical idempotencyKey. Re-fetch by both anchors and return the
      // stable receipt instead of failing the handler.
      const reFetched =
        (await client.outboxMessage.findUnique({
          where: { id: validated.operationId },
        })) ??
        (envelope.idempotencyKey
          ? await client.outboxMessage.findUnique({
              where: { idempotencyKey: envelope.idempotencyKey },
            })
          : null);
      if (!reFetched) throw cause;
      return mapPrismaSharedOutboxToReceipt(reFetched);
    }
  }
}
