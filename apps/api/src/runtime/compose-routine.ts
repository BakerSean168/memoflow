/** API host composition for canonical Routine vNext owner state. */
import type { PrismaClient } from '@memoflow/database';
import {
  createRoutinePrismaRepositories,
  createRoutinePortableCapability,
  createRoutineNotificationAttentionReader,
  type RoutineCoachCommandPort,
} from '@memoflow/routine';
import {
  createInMemoryRoutineRuntimeContextStore,
  createRoutineCoachCommandService,
  createRoutineConfigurationQueryService,
  createRoutineOverrideChangedNotifier,
  createRoutineScheduleChangedNotifier,
  type RoutineConfigurationQueryPort,
} from '@memoflow/routine/routine-runtime';

export interface ComposeRoutineDependencies {
  readonly db: PrismaClient;
}

export interface ComposedRoutine {
  readonly routineCommandPort: RoutineCoachCommandPort;
  readonly notificationAttentionReader: ReturnType<typeof createRoutineNotificationAttentionReader>;
  readonly routineQueryPort: RoutineConfigurationQueryPort;
  readonly portableCapability: ReturnType<typeof createRoutinePortableCapability>;
}

export function composeRoutine(dependencies: ComposeRoutineDependencies): ComposedRoutine {
  const repositories = createRoutinePrismaRepositories(dependencies.db);
  const runtimeContextStore = createInMemoryRoutineRuntimeContextStore();
  const scheduleChanged = createRoutineScheduleChangedNotifier();
  const routineCommandPort = createRoutineCoachCommandService({
    routineProfileStore: repositories.routineProfileStore,
    routinePreferencesStore: repositories.routinePreferencesStore,
    runtimeContextStore,
    temporaryOverrideStore: repositories.routineTemporaryOverrideStore,
    occurrenceTruthStore: repositories.routineOccurrenceTruthStore,
    protocolSessionStore: repositories.protocolSessionStore,
    onOverrideChanged: createRoutineOverrideChangedNotifier(),
    // Identity-wide global-gate reconciliation is centralized inside the
    // command service through onScheduleChanged. Do not layer a second host
    // callback here or every Routine receives duplicate projection events.
    onScheduleChanged: scheduleChanged,
  });
  const routineQueryPort = createRoutineConfigurationQueryService({
    occurrenceTruthStore: repositories.routineOccurrenceTruthStore,
    routineProfileStore: repositories.routineProfileStore,
    routinePreferencesStore: repositories.routinePreferencesStore,
    runtimeContextStore,
    temporaryOverrideStore: repositories.routineTemporaryOverrideStore,
    localRuntimeAvailable: false,
  });
  return {
    routineCommandPort,
    notificationAttentionReader: createRoutineNotificationAttentionReader({
      occurrenceTruthStore: repositories.routineOccurrenceTruthStore,
      temporaryOverrideStore: repositories.routineTemporaryOverrideStore,
    }),
    routineQueryPort,
    portableCapability: createRoutinePortableCapability(repositories),
  };
}
