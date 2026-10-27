import type { PrismaClient } from '@memoflow/database';
import { createRecurrenceEngine, type RecurrenceEnginePort } from '@memoflow/time';
import {
  createRoutineScheduleProjectionSource,
  type RoutineScheduleProjectionSource,
} from './routine-schedule-projection-source';
import { createPrismaRoutineScheduleStateReader } from './routine-schedule-state-reader.prisma';

/**
 * Production Routine projection source factory (Prisma host).
 *
 * Apps believe the reader-port boundary, so this composition root is the only
 * place a Prisma type leaks into the ROUTINE-3401 wall-clock lane. The engine
 * is injected so hosts (and tests) can pin a deterministic recurrence engine.
 */
export function createRoutinePrismaScheduleProjectionSource(
  prisma: PrismaClient,
  options?: {
    readonly recurrenceEngine?: RecurrenceEnginePort;
    readonly now?: () => number;
  },
): RoutineScheduleProjectionSource {
  const recurrenceEngine = options?.recurrenceEngine ?? createRecurrenceEngine();
  return createRoutineScheduleProjectionSource({
    reader: createPrismaRoutineScheduleStateReader(prisma),
    recurrenceEngine,
    now: options?.now,
  });
}
