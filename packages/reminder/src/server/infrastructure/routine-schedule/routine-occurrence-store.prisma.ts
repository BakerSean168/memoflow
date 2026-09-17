import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient, RoutineOccurrence } from '@memoflow/database';
import {
  assertValidBusinessOperationReceipt,
  buildIdempotencyKeyString,
  LeaseFencingException,
  type BusinessOperationReceipt,
} from '@memoflow/contracts/reliable-messaging';
import type {
  RoutineOccurrenceClaimInput,
  RoutineOccurrenceCommitInput,
  RoutineOccurrenceLease,
  RoutineOccurrenceStore,
  RoutineOccurrenceTransactionHandle,
  RoutineTerminalStatus,
} from '../../domain/ports/routine-occurrence-store.port';
import { resolveRoutineScheduleTransactionClient } from './routine-schedule-transaction-handle';

const ROUTINE_OCCURRENCE_SOURCE = 'routine';

/**
 * Prisma occurrence fence for the ROUTINE-3401 wall-clock lane
 * (`routine_occurrences`, ADR-059 §10 semantics mirroring ReminderOccurrence).
 *
 * - claim creates-or-attaches the occurrence by its canonical occurrenceKey;
 * - a claim against an already-finalized occurrence is idempotent;
 * - a claim against a live lease owned by another fence returns that lease;
 * - an expired lease is taken over with a higher fencing token.
 *
 * `completeOccurrence` re-validates fencing + lease ownership at commit time,
 * and the store joins the `notification.requested` outbox write in the same
 * `$transaction` when invoked through `withOccurrenceTransaction`.
 */
export class PrismaRoutineOccurrenceStore implements RoutineOccurrenceStore {
  constructor(private readonly prisma: PrismaClient) {}

  async claimOccurrence(input: RoutineOccurrenceClaimInput): Promise<RoutineOccurrenceLease> {
    const idempotencyKey = buildIdempotencyKeyString({
      identityId: input.identityId,
      source: ROUTINE_OCCURRENCE_SOURCE,
      occurrenceKey: input.occurrenceKey,
    });

    const existing = await this.prisma.routineOccurrence.findUnique({
      where: { idempotencyKey },
    });

    if (!existing) {
      const now = new Date(input.claimedAt);
      const created = await this.prisma.routineOccurrence.create({
        data: {
          id: `RoutineOccurrence_${randomUUID()}`,
          identityId: input.identityId,
          routineId: input.routineId,
          source: ROUTINE_OCCURRENCE_SOURCE,
          occurrenceKey: input.occurrenceKey,
          scheduledFor: new Date(input.scheduledFor),
          sourceRevision:
            input.sourceRevision == null ? null : String(input.sourceRevision),
          idempotencyKey,
          status: 'running',
          triggerKind: 'WallClock',
          becameDueAt: new Date(input.scheduledFor),
          resolutionState: 'Open',
          attempt: 1,
          ownerToken: `owner:${randomUUID()}`,
          fencingToken: 1,
          leaseExpiresAt: new Date(input.leaseExpiresAt),
          historyJson: '[]',
          createdAt: now,
          updatedAt: now,
        },
      });
      return mapRowToLease(created);
    }

    return this.reconcileExistingClaim(existing, input);
  }

  private async reconcileExistingClaim(
    existing: RoutineOccurrence,
    input: RoutineOccurrenceClaimInput,
  ): Promise<RoutineOccurrenceLease> {
    if (existing.status === 'succeeded' || existing.status === 'skipped') {
      return mapRowToLease(existing);
    }

    const now = new Date(input.claimedAt);
    const leaseAlive = existing.leaseExpiresAt != null && existing.leaseExpiresAt > now;

    let current = existing;
    if (!leaseAlive) {
      const takeover = await this.prisma.routineOccurrence.updateMany({
        where: {
          id: existing.id,
          status: 'running',
          OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
        },
        data: {
          ownerToken: `owner:${randomUUID()}`,
          fencingToken: { increment: 1 },
          leaseExpiresAt: new Date(input.leaseExpiresAt),
          attempt: { increment: 1 },
          updatedAt: now,
        },
      });
      if (takeover.count > 0) {
        const updated = await this.prisma.routineOccurrence.findUniqueOrThrow({
          where: { id: existing.id },
        });
        current = updated;
      }
    }

    return mapRowToLease(current);
  }

  async completeOccurrence(
    input: RoutineOccurrenceCommitInput,
    options?: { readonly transaction?: RoutineOccurrenceTransactionHandle },
  ): Promise<BusinessOperationReceipt> {
    const client = resolveRoutineScheduleTransactionClient(options?.transaction) ?? this.prisma;
    const now = new Date();

    const commit = await client.routineOccurrence.updateMany({
      where: {
        id: input.occurrenceId,
        status: 'running',
        ownerToken: input.ownerToken,
        fencingToken: input.fencingToken,
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { gte: now } }],
      },
      data: {
        status: input.status,
        ownerToken: null,
        claimId: null,
        leaseExpiresAt: null,
        lastError: null,
        historyJson: JSON.stringify([input.history]),
        nextOccurrenceAt:
          input.nextOccurrenceAt == null ? null : new Date(input.nextOccurrenceAt),
        attempt: { increment: 1 },
        finishedAt: now,
        updatedAt: now,
      },
    });

    if (commit.count === 0) {
      throw await this.fencingConflict(input, now);
    }

    const updated = await client.routineOccurrence.findUniqueOrThrow({
      where: { id: input.occurrenceId },
    });
    return mapRowToReceipt(updated);
  }

  private async fencingConflict(
    input: RoutineOccurrenceCommitInput,
    now: Date,
  ): Promise<LeaseFencingException> {
    const dbState = await this.prisma.routineOccurrence.findUnique({
      where: { id: input.occurrenceId },
    });
    if (!dbState) {
      return new LeaseFencingException(
        `routine:occurrence:${input.occurrenceId}`,
        `Routine occurrence '${input.occurrenceId}' not found at commit time.`,
      );
    }
    if (dbState.fencingToken !== input.fencingToken) {
      return new LeaseFencingException(
        `routine:occurrence:${input.occurrenceId}`,
        `Stale fencing token at commit: expected ${input.fencingToken}, active is ${dbState.fencingToken}`,
        dbState.fencingToken,
        input.fencingToken,
      );
    }
    if (dbState.ownerToken !== input.ownerToken) {
      return new LeaseFencingException(
        `routine:occurrence:${input.occurrenceId}`,
        `Owner token mismatch at commit: active owner is '${dbState.ownerToken}', incoming is '${input.ownerToken}'`,
      );
    }
    if (dbState.status !== 'running') {
      return new LeaseFencingException(
        `routine:occurrence:${input.occurrenceId}`,
        `Status conflict at commit: active status is '${dbState.status}', expected 'running'`,
      );
    }
    if (dbState.leaseExpiresAt != null && dbState.leaseExpiresAt < now) {
      return new LeaseFencingException(
        `routine:occurrence:${input.occurrenceId}`,
        `Lease expired at commit time for occurrence '${input.occurrenceId}'.`,
      );
    }
    return new LeaseFencingException(
      `routine:occurrence:${input.occurrenceId}`,
      `Fencing check failed at commit time for occurrence '${input.occurrenceId}'.`,
    );
  }

  async withOccurrenceTransaction<T>(
    callback: (transaction: RoutineOccurrenceTransactionHandle) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const handle: RoutineOccurrenceTransactionHandle = {
        kind: 'routine-occurrence-transaction',
        client: tx,
      };
      return callback(handle);
    });
  }
}

function mapRowToLease(row: RoutineOccurrence): RoutineOccurrenceLease {
  if (row.scheduledFor == null) {
    throw new TypeError(
      `WallClock routine occurrence '${row.occurrenceKey}' is missing scheduledFor`,
    );
  }
  const finalized = row.status === 'succeeded' || row.status === 'skipped';
  return {
    occurrenceId: row.id,
    identityId: row.identityId,
    routineId: row.routineId,
    occurrenceKey: row.occurrenceKey,
    scheduledFor: row.scheduledFor.getTime(),
    sourceRevision: row.sourceRevision,
    fencingToken: row.fencingToken,
    ownerToken: row.ownerToken ?? '',
    leaseExpiresAt: row.leaseExpiresAt?.getTime() ?? 0,
    alreadyFinalized: finalized,
    terminalStatus: finalized ? (row.status as RoutineTerminalStatus) : null,
  };
}

function mapRowToReceipt(row: RoutineOccurrence): BusinessOperationReceipt {
  return assertValidBusinessOperationReceipt({
    schemaVersion: 1,
    operationId: `routine:occurrence:${row.occurrenceKey}`,
    identityId: row.identityId,
    source: row.source,
    occurrenceKey: row.occurrenceKey,
    idempotencyKey: row.idempotencyKey,
    status: row.status === 'succeeded' || row.status === 'skipped' ? row.status : 'running',
    attempt: row.attempt,
    lease: null,
    lastError: row.lastError,
    nextRetryAt: null,
    deadLetterAt: null,
    correlationId: row.correlationId,
    causationId: row.causationId,
    attemptsHistory: [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  });
}