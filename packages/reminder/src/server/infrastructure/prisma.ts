import type { PrismaClient } from '@memoflow/database';
import { PrismaProtocolSessionStore } from './routine-vnext/protocol-session-store.prisma';
import { PrismaRoutineOccurrenceTruthStore } from './routine-vnext/routine-occurrence-truth-store.prisma';
import { PrismaRoutineProfileStore } from './routine-vnext/routine-profile-store.prisma';
import { PrismaRoutinePreferencesStore } from './routine-vnext/routine-preferences-store.prisma';
import { PrismaRoutineTemporaryOverrideStore } from './routine-schedule/routine-temporary-override-store.prisma';
import type {
  ProtocolSessionStore,
  RoutineOccurrenceTruthStore,
  RoutineProfileStore,
  RoutinePreferencesStore,
  RoutineTemporaryOverrideStore,
} from '../domain/ports';

/** Canonical Prisma persistence set for Routine vNext. */
export interface RoutinePrismaRepositorySet {
  readonly routineProfileStore: RoutineProfileStore;
  readonly routinePreferencesStore: RoutinePreferencesStore;
  readonly routineTemporaryOverrideStore: RoutineTemporaryOverrideStore;
  readonly protocolSessionStore: ProtocolSessionStore;
  readonly routineOccurrenceTruthStore: RoutineOccurrenceTruthStore;
}

export function createRoutinePrismaRepositories(db: PrismaClient): RoutinePrismaRepositorySet {
  return {
    routineProfileStore: new PrismaRoutineProfileStore(db),
    routinePreferencesStore: new PrismaRoutinePreferencesStore(db),
    routineTemporaryOverrideStore: new PrismaRoutineTemporaryOverrideStore(db),
    protocolSessionStore: new PrismaProtocolSessionStore(db),
    routineOccurrenceTruthStore: new PrismaRoutineOccurrenceTruthStore(db),
  };
}
