import { randomUUID } from 'crypto';
import {
  assertValidBusinessOperationReceipt,
  GoalRecordReceiptInputSchema,
  type BusinessOperationReceipt,
  type GoalRecordReceiptInput,
  type GoalReliableOperationPort,
} from '@memoflow/reliable-messaging-contracts';

export class InMemoryGoalReliableOperationAdapter implements GoalReliableOperationPort {
  private readonly receipts = new Map<string, BusinessOperationReceipt>();

  async recordGoalCompletionReceipt(
    input: GoalRecordReceiptInput,
  ): Promise<BusinessOperationReceipt> {
    const validated = GoalRecordReceiptInputSchema.parse(input);

    const existing = this.receipts.get(validated.idempotencyKey);
    if (existing) {
      return existing;
    }

    const nowIso = new Date().toISOString();
    const receipt = assertValidBusinessOperationReceipt({
      schemaVersion: 1,
      operationId: randomUUID(),
      identityId: validated.identityId,
      source: validated.source,
      occurrenceKey: validated.occurrenceKey,
      idempotencyKey: validated.idempotencyKey,
      status: 'succeeded',
      attempt: 1,
      lease: null,
      lastError: null,
      nextRetryAt: null,
      deadLetterAt: null,
      correlationId: validated.goalId,
      causationId: null,
      attemptsHistory: [],
      createdAt: nowIso,
      updatedAt: nowIso,
      finishedAt: nowIso,
    });

    this.receipts.set(validated.idempotencyKey, receipt);
    return receipt;
  }

  getReceiptCount(): number {
    return this.receipts.size;
  }

  clear(): void {
    this.receipts.clear();
  }
}
