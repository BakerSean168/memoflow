import { randomUUID } from 'node:crypto';
import type { IElectronDatabase, IElectronDatabaseTransaction } from '@memoflow/desktop-contracts';
import {
  assertValidBusinessOperationReceipt,
  buildIdempotencyKeyString,
  LeaseFencingException,
  type BusinessOperationReceipt,
} from '@memoflow/reliable-messaging-contracts';
import { withRoutineWriteTransaction } from '../routine-vnext/powersync-write-transaction';
import type {
  RoutineOccurrenceClaimInput,
  RoutineOccurrenceCommitInput,
  RoutineOccurrenceLease,
  RoutineOccurrenceStore,
  RoutineOccurrenceTransactionHandle,
  RoutineTerminalStatus,
} from '../../domain/ports/routine-occurrence-store.port';

interface OccurrenceRow {
  id: string;
  identity_id: string;
  routine_id: string;
  source: string;
  occurrence_key: string;
  scheduled_for: string | null;
  source_revision: string | null;
  idempotency_key: string;
  status: string;
  attempt: number;
  owner_token: string | null;
  fencing_token: number;
  lease_expires_at: string | null;
  last_error: string | null;
  correlation_id: string | null;
  causation_id: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

const SOURCE = 'routine';

/** Local SQLite counterpart of PrismaRoutineOccurrenceStore. */
export class PowerSyncRoutineOccurrenceStore implements RoutineOccurrenceStore {
  constructor(private readonly db: IElectronDatabase) {}

  async claimOccurrence(input: RoutineOccurrenceClaimInput): Promise<RoutineOccurrenceLease> {
    return withRoutineWriteTransaction(this.db, async (tx) => {
      const key = idempotencyKey(input.identityId, input.occurrenceKey);
      const existing = await tx.getOptional<OccurrenceRow>(
        `SELECT * FROM routine_occurrences WHERE idempotency_key = ? LIMIT 1`,
        [key],
      );
      if (existing) return this.reconcileClaim(tx, existing, input);

      const now = new Date(input.claimedAt).toISOString();
      const id = `RoutineOccurrence_${randomUUID()}`;
      await tx.execute(
        `INSERT INTO routine_occurrences (
          id, identity_id, routine_id, source, occurrence_key, scheduled_for,
          source_revision, idempotency_key, status, trigger_kind, became_due_at,
          resolution_state, attempt, owner_token, fencing_token, lease_expires_at,
          history_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, 'Open', 1, ?, 1, ?, '[]', ?, ?)`,
        [
          id,
          input.identityId,
          input.routineId,
          SOURCE,
          input.occurrenceKey,
          new Date(input.scheduledFor).toISOString(),
          input.sourceRevision == null ? null : String(input.sourceRevision),
          key,
          input.triggerKind ?? 'WallClock',
          new Date(input.becameDueAt ?? input.scheduledFor).toISOString(),
          `owner:${randomUUID()}`,
          new Date(input.leaseExpiresAt).toISOString(),
          now,
          now,
        ],
      );
      const created = await tx.get<OccurrenceRow>(
        `SELECT * FROM routine_occurrences WHERE id = ?`,
        [id],
      );
      return toLease(created);
    });
  }

  private async reconcileClaim(
    tx: IElectronDatabaseTransaction,
    existing: OccurrenceRow,
    input: RoutineOccurrenceClaimInput,
  ): Promise<RoutineOccurrenceLease> {
    if (existing.status === 'succeeded' || existing.status === 'skipped') {
      return toLease(existing);
    }
    const now = new Date(input.claimedAt).toISOString();
    if (existing.lease_expires_at != null && existing.lease_expires_at > now) {
      return toLease(existing);
    }
    const ownerToken = `owner:${randomUUID()}`;
    await tx.execute(
      `UPDATE routine_occurrences
          SET owner_token = ?, fencing_token = fencing_token + 1,
              lease_expires_at = ?, attempt = attempt + 1, updated_at = ?
        WHERE id = ? AND status = 'running'
          AND (lease_expires_at IS NULL OR lease_expires_at <= ?)`,
      [ownerToken, new Date(input.leaseExpiresAt).toISOString(), now, existing.id, now],
    );
    const current = await tx.get<OccurrenceRow>(`SELECT * FROM routine_occurrences WHERE id = ?`, [
      existing.id,
    ]);
    return toLease(current);
  }

  async completeOccurrence(
    input: RoutineOccurrenceCommitInput,
    options?: { readonly transaction?: RoutineOccurrenceTransactionHandle },
  ): Promise<BusinessOperationReceipt> {
    const tx = transactionClient(options?.transaction) ?? this.db;
    // #731: routine_occurrences is a PowerSync view; its INSTEAD OF trigger never reports
    // rowsAffected. Check the claim in the same transaction instead of trusting changes().
    return withRoutineWriteTransaction(tx, async (client) => {
      const now = new Date(input.history.triggeredAt).toISOString();
      const current = await client.getOptional<OccurrenceRow>(
        `SELECT * FROM routine_occurrences WHERE id = ?`,
        [input.occurrenceId],
      );
      if (!current || !claimIsCurrent(current, input, now)) {
        throw staleClaim(input, current?.fencing_token);
      }
      await client.execute(
        `UPDATE routine_occurrences
            SET status = ?, owner_token = NULL, claim_id = NULL, lease_expires_at = NULL,
                last_error = NULL, history_json = ?,
                next_occurrence_at = ?, attempt = attempt + 1, finished_at = ?, updated_at = ?
          WHERE id = ? AND status = 'running' AND owner_token = ? AND fencing_token = ?
            AND (lease_expires_at IS NULL OR lease_expires_at >= ?)`,
        [
          input.status,
          JSON.stringify([input.history]),
          input.nextOccurrenceAt == null ? null : new Date(input.nextOccurrenceAt).toISOString(),
          now,
          now,
          input.occurrenceId,
          input.ownerToken,
          input.fencingToken,
          now,
        ],
      );
      const updated = await client.getOptional<OccurrenceRow>(
        `SELECT * FROM routine_occurrences WHERE id = ?`,
        [input.occurrenceId],
      );
      if (!updated || updated.status !== input.status || updated.finished_at !== now) {
        throw staleClaim(input, updated?.fencing_token);
      }
      return toReceipt(updated);
    });
  }

  async withOccurrenceTransaction<T>(
    callback: (transaction: RoutineOccurrenceTransactionHandle) => Promise<T>,
  ): Promise<T> {
    return this.db.writeTransaction((tx) =>
      callback({ kind: 'routine-occurrence-transaction', client: tx }),
    );
  }
}

function transactionClient(
  handle: RoutineOccurrenceTransactionHandle | undefined,
): IElectronDatabaseTransaction | null {
  if (handle?.kind !== 'routine-occurrence-transaction') return null;
  const client = handle.client;
  if (
    typeof client !== 'object' ||
    client === null ||
    !('execute' in client) ||
    !('getOptional' in client)
  ) {
    throw new TypeError('Routine occurrence transaction must contain a PowerSync transaction.');
  }
  return client as IElectronDatabaseTransaction;
}

function claimIsCurrent(
  row: OccurrenceRow,
  input: RoutineOccurrenceCommitInput,
  now: string,
): boolean {
  return (
    row.status === 'running' &&
    row.owner_token === input.ownerToken &&
    Number(row.fencing_token) === input.fencingToken &&
    (row.lease_expires_at == null || row.lease_expires_at >= now)
  );
}

function staleClaim(
  input: RoutineOccurrenceCommitInput,
  actualFencingToken: number | undefined,
): LeaseFencingException {
  return new LeaseFencingException(
    `routine:occurrence:${input.occurrenceId}`,
    'Routine occurrence claim is no longer current.',
    actualFencingToken,
    input.fencingToken,
  );
}

function idempotencyKey(identityId: string, occurrenceKey: string): string {
  return buildIdempotencyKeyString({ identityId, source: SOURCE, occurrenceKey });
}

function toLease(row: OccurrenceRow): RoutineOccurrenceLease {
  if (row.scheduled_for == null) {
    throw new TypeError(
      `Scheduled routine occurrence '${row.occurrence_key}' is missing scheduledFor`,
    );
  }
  const finalized = row.status === 'succeeded' || row.status === 'skipped';
  return {
    occurrenceId: row.id,
    identityId: row.identity_id,
    routineId: row.routine_id,
    occurrenceKey: row.occurrence_key,
    scheduledFor: Date.parse(row.scheduled_for),
    sourceRevision: row.source_revision,
    fencingToken: row.fencing_token,
    ownerToken: row.owner_token ?? '',
    leaseExpiresAt: row.lease_expires_at == null ? 0 : Date.parse(row.lease_expires_at),
    alreadyFinalized: finalized,
    terminalStatus: finalized ? (row.status as RoutineTerminalStatus) : null,
  };
}

function toReceipt(row: OccurrenceRow): BusinessOperationReceipt {
  return assertValidBusinessOperationReceipt({
    schemaVersion: 1,
    operationId: `routine:occurrence:${row.occurrence_key}`,
    identityId: row.identity_id,
    source: row.source,
    occurrenceKey: row.occurrence_key,
    idempotencyKey: row.idempotency_key,
    status: row.status === 'succeeded' || row.status === 'skipped' ? row.status : 'running',
    attempt: row.attempt,
    lease: null,
    lastError: row.last_error,
    nextRetryAt: null,
    deadLetterAt: null,
    correlationId: row.correlation_id,
    causationId: row.causation_id,
    attemptsHistory: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  });
}
