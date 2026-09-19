import type { PrismaClient } from '@memoflow/database';
import { PrismaProtocolSessionStore } from './routine-vnext/protocol-session-store.prisma';
import { PrismaRoutineOccurrenceTruthStore } from './routine-vnext/routine-occurrence-truth-store.prisma';
import { PrismaRoutineProfileStore } from './routine-vnext/routine-profile-store.prisma';
import { PrismaRoutineTemporaryOverrideStore } from './routine-schedule/routine-temporary-override-store.prisma';
import type {
  ProtocolSessionStore,
  RoutineOccurrenceTruthStore,
  RoutineProfileStore,
  RoutineTemporaryOverrideStore,
} from '../domain/ports';

/** Canonical Prisma persistence set for Routine vNext. */
export interface RoutinePrismaRepositorySet {
  readonly routineProfileStore: RoutineProfileStore;
  readonly routineTemporaryOverrideStore: RoutineTemporaryOverrideStore;
  readonly protocolSessionStore: ProtocolSessionStore;
  readonly routineOccurrenceTruthStore: RoutineOccurrenceTruthStore;
}

export function createRoutinePrismaRepositories(db: PrismaClient): RoutinePrismaRepositorySet {
  return {
    routineProfileStore: new PrismaRoutineProfileStore(db),
    routineTemporaryOverrideStore: new PrismaRoutineTemporaryOverrideStore(db),
    protocolSessionStore: new PrismaProtocolSessionStore(db),
    routineOccurrenceTruthStore: new PrismaRoutineOccurrenceTruthStore(db),
  };
}
