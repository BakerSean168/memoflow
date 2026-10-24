import { randomUUID } from 'node:crypto';
import {
  assertValidBusinessOperationReceipt,
  buildIdempotencyKeyString,
  LeaseFencingException,
  type BusinessOperationReceipt,
} from '@memoflow/contracts/reliable-messaging';
import type {
  RoutineHistoryEntry,
  RoutineOccurrenceClaimInput,
  RoutineOccurrenceCommitInput,
  RoutineOccurrenceLease,
  RoutineOccurrenceStore,
  RoutineOccurrenceTransactionHandle,
  RoutineTerminalStatus,
} from '../../domain/ports/routine-occurrence-store.port';

interface StoredRoutineOccurrence {
  id: string;
  identityId: string;
  routineId: string;
  occurrenceKey: string;
  scheduledFor: number;
  sourceRevision: string | number | null;
  status: 'pending' | 'running' | RoutineTerminalStatus;
  fencingToken: number | null;
  ownerToken: string | null;
  leaseExpiresAt: number | null;
  claimedAt: number | null;
  finishedAt: number | null;
  history: RoutineHistoryEntry[];
  nextOccurrenceAt: number | null;
}

function leaseFor(record: StoredRoutineOccurrence): RoutineOccurrenceLease {
  return {
    occurrenceId: record.id,
    identityId: record.identityId,
    routineId: record.routineId,
    occurrenceKey: record.occurrenceKey,
    scheduledFor: record.scheduledFor,
    sourceRevision: record.sourceRevision,
    fencingToken: record.fencingToken ?? 0,
    ownerToken: record.ownerToken ?? '',
    leaseExpiresAt: record.leaseExpiresAt ?? 0,
    alreadyFinalized: record.status === 'succeeded' || record.status === 'skipped',
    terminalStatus:
      record.status === 'succeeded' || record.status === 'skipped' ? record.status : null,
  };
}

function resourceKey(occurrenceKey: string): string {
  return `routine:occurrence:${occurrenceKey}`;
}

/**
 * In-memory durable occurrence store with the same fence contract as the
 * protected ReminderOccurrence assets. Claims/commits are serialized per
 * occurrenceKey so concurrency semantics stay deterministic in tests.
 */
export function createInMemoryRoutineOccurrenceStore(options?: {
  readonly now?: () => number;
  readonly operationIdFactory?: () => string;
}): RoutineOccurrenceStore {
  const now = options?.now ?? Date.now;
  const operationIdFactory =
    options?.operationIdFactory ?? (() => `routine-occurrence:${randomUUID()}`);
  const occurrences = new Map<string, StoredRoutineOccurrence>();
  const locks = new Map<string, Promise<unknown>>();

  function withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const next = previous.then(() => gate);
    locks.set(key, next);
    return previous.then(work).finally(() => {
      release();
      if (locks.get(key) === next) locks.delete(key);
    });
  }

  return {
    async claimOccurrence(input: RoutineOccurrenceClaimInput): Promise<RoutineOccurrenceLease> {
      return withLock(`claim:${input.occurrenceKey}`, async () => {
        const existing = occurrences.get(input.occurrenceKey);

        if (!existing) {
          const record: StoredRoutineOccurrence = {
            id: `ROccurrence_${randomUUID()}`,
            identityId: input.identityId,
            routineId: input.routineId,
            occurrenceKey: input.occurrenceKey,
            scheduledFor: input.scheduledFor,
            sourceRevision: input.sourceRevision,
            status: 'running',
            fencingToken: 1,
            ownerToken: `owner:${randomUUID()}`,
            leaseExpiresAt: input.leaseExpiresAt,
            claimedAt: input.claimedAt,
            finishedAt: null,
            history: [],
            nextOccurrenceAt: null,
          };
          occurrences.set(input.occurrenceKey, record);
          return leaseFor(record);
        }

        if (existing.status === 'succeeded' || existing.status === 'skipped') {
          return leaseFor(existing);
        }

        const leaseAlive =
          existing.leaseExpiresAt != null && existing.leaseExpiresAt > input.claimedAt;
        if (leaseAlive) {
          return leaseFor(existing);
        }

        existing.status = 'running';
        existing.fencingToken = (existing.fencingToken ?? 0) + 1;
        existing.ownerToken = `owner:${randomUUID()}`;
        existing.leaseExpiresAt = input.leaseExpiresAt;
        existing.claimedAt = input.claimedAt;
        return leaseFor(existing);
      });
    },

    async completeOccurrence(
      input: RoutineOccurrenceCommitInput,
    ): Promise<BusinessOperationReceipt> {
      return withLock(`commit:${input.occurrenceId}`, async () => {
        const record = [...occurrences.values()].find((occ) => occ.id === input.occurrenceId);
        if (!record) {
          throw new LeaseFencingException(
            resourceKey(input.occurrenceId),
            `Routine occurrence '${input.occurrenceId}' not found at transaction commit time.`,
          );
        }

        const commitNow = now();
        if (record.fencingToken !== input.fencingToken) {
          throw new LeaseFencingException(
            resourceKey(record.occurrenceKey),
            `Stale fencing token: expected ${input.fencingToken}, active is ${record.fencingToken}`,
            record.fencingToken ?? 0,
            input.fencingToken,
          );
        }
        if (record.ownerToken !== input.ownerToken) {
          throw new LeaseFencingException(
            resourceKey(record.occurrenceKey),
            `Owner token mismatch: active owner is '${record.ownerToken}', incoming is '${input.ownerToken}'`,
          );
        }
        if (record.leaseExpiresAt != null && record.leaseExpiresAt < commitNow) {
          throw new LeaseFencingException(
            resourceKey(record.occurrenceKey),
            `Lease expired at ${record.leaseExpiresAt}`,
          );
        }

        record.status = input.status;
        record.fencingToken = null;
        record.ownerToken = null;
        record.leaseExpiresAt = null;
        record.finishedAt = commitNow;
        record.history = [input.history];
        record.nextOccurrenceAt = input.nextOccurrenceAt;

        const receipt = assertValidBusinessOperationReceipt({
          schemaVersion: 1,
          operationId: operationIdFactory(),
          identityId: record.identityId,
          source: 'routine',
          occurrenceKey: record.occurrenceKey,
          idempotencyKey: buildIdempotencyKeyString({
            identityId: record.identityId,
            source: 'routine',
            occurrenceKey: record.occurrenceKey,
          }),
          status: input.status,
          attempt: 1,
          lease: null,
          lastError: null,
          nextRetryAt: null,
          deadLetterAt: null,
          correlationId: null,
          causationId: null,
          attemptsHistory: [],
          createdAt: new Date(input.history.triggeredAt).toISOString(),
          updatedAt: new Date(commitNow).toISOString(),
          finishedAt: new Date(commitNow).toISOString(),
        });
        return receipt;
      });
    },

    async withOccurrenceTransaction<T>(
      callback: (transaction: RoutineOccurrenceTransactionHandle) => Promise<T>,
    ): Promise<T> {
      return withLock(`transaction:global`, () =>
        callback({
          kind: 'routine-occurrence-transaction',
          client: undefined,
        }),
      );
    },
  };
}
