import { type RoutineOccurrenceCommittedEvent } from '@memoflow/routine-contracts';
import type { PrismaClient } from '@memoflow/database';
import { createRecurrenceEngine, type RecurrenceEnginePort } from '@memoflow/time';
import { PrismaRoutineOccurrenceNotificationWriter } from './routine-occurrence-notification-writer.prisma';
import { PrismaRoutineOccurrenceStore } from './routine-occurrence-store.prisma';
import type { RoutineScheduleExecutionDeps } from './routine-schedule-execution-source';

import { createPrismaRoutineScheduleStateReader } from './routine-schedule-state-reader.prisma';
import { PrismaRoutineTemporaryOverrideStore } from './routine-temporary-override-store.prisma';

/**
 * Production Routine execution deps factory (Prisma host).
 *
 * Composes the durable occurrence fence, the shared `notification.requested`
 * outbox writer and the definition reader against ONE PrismaClient so their
 * opaque ROUTINE-3401 transaction handles unwrap to the same transaction. The
 * host wires the post-commit signal (`publishOccurrenceCommitted`) that re-arms
 * the next Scheduler trigger through the Routine projection runtime.
 */
export function createRoutinePrismaScheduleExecutionDeps(
  prisma: PrismaClient,
  options?: {
    readonly recurrenceEngine?: RecurrenceEnginePort;
    readonly now?: () => number;
    readonly publishOccurrenceCommitted?: (event: RoutineOccurrenceCommittedEvent) => void;
  },
): RoutineScheduleExecutionDeps {
  return {
    reader: createPrismaRoutineScheduleStateReader(prisma),
    occurrenceStore: new PrismaRoutineOccurrenceStore(prisma),
    notificationWriter: new PrismaRoutineOccurrenceNotificationWriter(prisma),
    temporaryOverrideStore: new PrismaRoutineTemporaryOverrideStore(prisma),
    recurrenceEngine: options?.recurrenceEngine ?? createRecurrenceEngine(),
    now: options?.now,
    publishOccurrenceCommitted: options?.publishOccurrenceCommitted,
  };
}
