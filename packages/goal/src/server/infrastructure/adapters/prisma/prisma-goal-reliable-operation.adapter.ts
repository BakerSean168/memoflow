import { randomUUID } from 'crypto';
import type { PrismaClient, OutboxMessage as PrismaOutboxMessage } from '@memoflow/database';
import {
  assertValidBusinessOperationReceipt,
  GoalRecordReceiptInputSchema,
  type BusinessOperationReceipt,
  type GoalRecordReceiptInput,
  type GoalReliableOperationPort,
} from '@memoflow/contracts/reliable-messaging';

export function mapPrismaOutboxToGoalOperationReceipt(
  outbox: PrismaOutboxMessage,
  input: GoalRecordReceiptInput,
): BusinessOperationReceipt {
  const rawReceipt = {
    schemaVersion: 1,
    operationId: outbox.id,
    identityId: input.identityId,
    source: input.source,
    occurrenceKey: input.occurrenceKey,
    idempotencyKey: input.idempotencyKey,
    status: 'succeeded' as const,
    attempt: outbox.attempts || 1,
    lease: null,
    lastError: null,
    nextRetryAt: null,
    deadLetterAt: null,
    correlationId: outbox.correlationId,
    causationId: outbox.causationId,
    attemptsHistory: [],
    createdAt: outbox.createdAt.toISOString(),
    updatedAt: outbox.createdAt.toISOString(),
    finishedAt: outbox.dispatchedAt
      ? outbox.dispatchedAt.toISOString()
      : outbox.createdAt.toISOString(),
  };

  return assertValidBusinessOperationReceipt(rawReceipt);
}

export class PrismaGoalReliableOperationAdapter implements GoalReliableOperationPort {
  constructor(private readonly db: Pick<PrismaClient, 'outboxMessage'>) {}

  async recordGoalCompletionReceipt(
    input: GoalRecordReceiptInput,
  ): Promise<BusinessOperationReceipt> {
    const validated = GoalRecordReceiptInputSchema.parse(input);

    const existing = await this.db.outboxMessage.findUnique({
      where: { idempotencyKey: validated.idempotencyKey },
    });

    if (existing) {
      return mapPrismaOutboxToGoalOperationReceipt(existing, validated);
    }

    const operationId = randomUUID();
    const now = new Date();

    try {
      const created = await this.db.outboxMessage.create({
        data: {
          id: operationId,
          identityId: validated.identityId,
          messageType: `goal.${validated.occurrenceKey.startsWith('archived') ? 'archived' : 'completed'}`,
          correlationId: validated.goalId,
          payloadJson: JSON.stringify({
            goalId: validated.goalId,
            identityId: validated.identityId,
            occurrenceKey: validated.occurrenceKey,
          }),
          idempotencyKey: validated.idempotencyKey,
          status: 'succeeded',
          attempts: 1,
          availableAt: now,
          dispatchedAt: now,
          createdAt: now,
        },
      });

      return mapPrismaOutboxToGoalOperationReceipt(created, validated);
    } catch (cause) {
      const reFetched = await this.db.outboxMessage.findUnique({
        where: { idempotencyKey: validated.idempotencyKey },
      });
      if (reFetched) {
        return mapPrismaOutboxToGoalOperationReceipt(reFetched, validated);
      }
      throw cause;
    }
  }
}
