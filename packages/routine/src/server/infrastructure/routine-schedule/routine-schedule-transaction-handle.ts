import type { Prisma } from '@memoflow/database';
import type { RoutineOccurrenceTransactionHandle } from '../../domain/ports/routine-occurrence-store.port';

export type RoutineScheduleTransactionClient = Prisma.TransactionClient;

/**
 * Paired-adapter bridge for the opaque ROUTINE-3401 transaction handle.
 * The Prisma occurrence store and notification writer unwrap the same shared
 * `client` so both join the single `withOccurrenceTransaction` callback.
 */
export function resolveRoutineScheduleTransactionClient(
  handle: RoutineOccurrenceTransactionHandle | undefined,
): RoutineScheduleTransactionClient | null {
  if (handle?.kind !== 'routine-occurrence-transaction') return null;
  return handle.client as RoutineScheduleTransactionClient;
}
