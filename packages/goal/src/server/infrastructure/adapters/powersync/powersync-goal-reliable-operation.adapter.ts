import { randomUUID } from 'crypto';
import type { IElectronDatabaseTransaction } from '@memoflow/contracts/electron';
import {
  assertValidBusinessOperationReceipt,
  GoalRecordReceiptInputSchema,
  type BusinessOperationReceipt,
  type GoalRecordReceiptInput,
  type GoalReliableOperationPort,
} from '@memoflow/reliable-messaging-contracts';

export interface PowerSyncGoalOperationReceiptRow {
  idempotency_key: string;
  operation_id: string;
  identity_id: string;
  source: string;
  occurrence_key: string;
  status: string;
  created_at: string;
}

export function mapPowerSyncRowToGoalOperationReceipt(
  row: PowerSyncGoalOperationReceiptRow,
  goalId: string,
): BusinessOperationReceipt {
  const rawReceipt = {
    schemaVersion: 1,
    operationId: row.operation_id,
    identityId: row.identity_id,
    source: row.source,
    occurrenceKey: row.occurrence_key,
    idempotencyKey: row.idempotency_key,
    status: 'succeeded' as const,
    attempt: 1,
    lease: null,
    lastError: null,
    nextRetryAt: null,
    deadLetterAt: null,
    correlationId: goalId,
    causationId: null,
    attemptsHistory: [],
    createdAt: row.created_at,
    updatedAt: row.created_at,
    finishedAt: row.created_at,
  };

  return assertValidBusinessOperationReceipt(rawReceipt);
}

export class PowerSyncGoalReliableOperationAdapter implements GoalReliableOperationPort {
  constructor(private readonly db: IElectronDatabaseTransaction) {}

  async recordGoalCompletionReceipt(
    input: GoalRecordReceiptInput,
  ): Promise<BusinessOperationReceipt> {
    const validated = GoalRecordReceiptInputSchema.parse(input);

    const existing = await this.db.getOptional<PowerSyncGoalOperationReceiptRow>(
      `SELECT idempotency_key, operation_id, identity_id, source, occurrence_key, status, created_at
       FROM goal_operation_receipts
       WHERE idempotency_key = ? LIMIT 1`,
      [validated.idempotencyKey],
    );

    if (existing) {
      return mapPowerSyncRowToGoalOperationReceipt(existing, validated.goalId);
    }

    const operationId = randomUUID();
    const nowIso = new Date().toISOString();

    await this.db.execute(
      `INSERT OR IGNORE INTO goal_operation_receipts (
         id, idempotency_key, operation_id, identity_id, source, occurrence_key, status, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        operationId,
        validated.idempotencyKey,
        operationId,
        validated.identityId,
        validated.source,
        validated.occurrenceKey,
        'succeeded',
        nowIso,
      ],
    );

    const record = await this.db.getOptional<PowerSyncGoalOperationReceiptRow>(
      `SELECT idempotency_key, operation_id, identity_id, source, occurrence_key, status, created_at
       FROM goal_operation_receipts
       WHERE idempotency_key = ? LIMIT 1`,
      [validated.idempotencyKey],
    );

    if (record) {
      return mapPowerSyncRowToGoalOperationReceipt(record, validated.goalId);
    }

    // Fail-closed: the canonical row MUST be durable before we return success.
    // If it cannot be read back, the outer transaction must roll back — never
    // return a success receipt that was not persisted.
    throw new Error(
      `[FAIL-CLOSED] goal operation receipt for idempotency key ${validated.idempotencyKey} was not persisted`,
    );
  }
}
