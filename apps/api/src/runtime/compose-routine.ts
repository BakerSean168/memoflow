/** API host composition for canonical Routine vNext owner state. */
import type { PrismaClient } from '@memoflow/database';
import {
  createRoutinePrismaRepositories,
  createRoutinePortableCapability,
  type RoutineCoachCommandPort,
} from '@memoflow/reminder';
import {
  createInMemoryRoutineRuntimeContextStore,
  createRoutineCoachCommandService,
  createRoutineOverrideChangedNotifier,
} from '@memoflow/reminder/routine-runtime';

export interface ComposeRoutineDependencies {
  readonly db: PrismaClient;
}

export interface ComposedRoutine {
  readonly routineCommandPort: RoutineCoachCommandPort;
  readonly portableCapability: ReturnType<typeof createRoutinePortableCapability>;
}

export function composeRoutine(dependencies: ComposeRoutineDependencies): ComposedRoutine {
  const repositories = createRoutinePrismaRepositories(dependencies.db);
  const runtimeContextStore = createInMemoryRoutineRuntimeContextStore();
  const routineCommandPort = createRoutineCoachCommandService({
    routineProfileStore: repositories.routineProfileStore,
    runtimeContextStore,
    temporaryOverrideStore: repositories.routineTemporaryOverrideStore,
    occurrenceTruthStore: repositories.routineOccurrenceTruthStore,
    protocolSessionStore: repositories.protocolSessionStore,
    onOverrideChanged: createRoutineOverrideChangedNotifier(),
  });
  return {
    routineCommandPort,
    portableCapability: createRoutinePortableCapability(repositories),
  };
}
