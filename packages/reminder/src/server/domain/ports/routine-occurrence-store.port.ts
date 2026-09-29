import type { BusinessOperationReceipt } from '@memoflow/contracts/reliable-messaging';

export type RoutineTerminalStatus = 'succeeded' | 'skipped';

export interface RoutineOccurrenceClaimInput {
  readonly identityId: string;
  readonly routineId: string;
  readonly occurrenceKey: string;
  readonly triggerKind?: 'WallClock' | 'Elapsed';
  readonly scheduledFor: number;
  /** Canonical business due boundary; defaults to scheduledFor for WallClock. */
  readonly becameDueAt?: number;
  readonly sourceRevision: string | number | null;
  readonly claimedAt: number;
  readonly leaseExpiresAt: number;
}

export interface RoutineOccurrenceLease {
  readonly occurrenceId: string;
  readonly identityId: string;
  readonly routineId: string;
  readonly occurrenceKey: string;
  readonly scheduledFor: number;
  readonly sourceRevision: string | number | null;
  readonly fencingToken: number;
  readonly ownerToken: string;
  readonly leaseExpiresAt: number;
  /** True when an earlier durable attempt already finalized this occurrence. */
  readonly alreadyFinalized: boolean;
  readonly terminalStatus: RoutineTerminalStatus | null;
}

export interface RoutineHistoryEntry {
  readonly routineId: string;
  readonly identityId: string;
  readonly occurrenceKey: string;
  readonly scheduledFor: number;
  readonly triggeredAt: number;
  readonly result: 'success' | 'skipped';
  readonly reason: string | null;
}

export interface RoutineOccurrenceCommitInput {
  readonly occurrenceId: string;
  readonly fencingToken: number;
  readonly ownerToken: string;
  readonly status: RoutineTerminalStatus;
  readonly history: RoutineHistoryEntry;
  readonly nextOccurrenceAt: number | null;
}

/**
 * Opaque handle to a single commit transaction spanning the occurrence store
 * and the notification writer. Paired adapters created against the same
 * database client (in one composition) unwrap it; hosts pass it through
 * untouched. Joining the finalize + durable `notification.requested` intent in
 * ONE transaction is the ROUTINE-3401 crash-window guard: a crash can never
 * surface a committed occurrence without its durable notification intent.
 */
export interface RoutineOccurrenceTransactionHandle {
  readonly kind: 'routine-occurrence-transaction';
  /** Paired-adapter transaction client (Prisma.TransactionClient in the reference impl). */
  readonly client: unknown;
}

/**
 * Durable occurrence fence for the Routine wall-clock lane.
 *
 * Semantics mirror the protected ReminderOccurrence assets (ADR-059 §10):
 * - claim creates-or-attaches the occurrence by its canonical occurrenceKey;
 * - a claim against an already-finalized occurrence is idempotent;
 * - a claim against a live lease owned by another fence throws LeaseFencingException;
 * - complete re-validates fencing + lease ownership atomically at commit time
 *   and records history / next trigger in one operation.
 */
export interface RoutineOccurrenceStore {
  claimOccurrence(input: RoutineOccurrenceClaimInput): Promise<RoutineOccurrenceLease>;
  completeOccurrence(
    input: RoutineOccurrenceCommitInput,
    options?: { readonly transaction?: RoutineOccurrenceTransactionHandle },
  ): Promise<BusinessOperationReceipt>;
  /**
   * Runs `callback` inside one commit transaction. The occurrence finalize and
   * the notification writer (same handle) join the transaction so they commit
   * or roll back together.
   */
  withOccurrenceTransaction<T>(
    callback: (transaction: RoutineOccurrenceTransactionHandle) => Promise<T>,
  ): Promise<T>;
}
