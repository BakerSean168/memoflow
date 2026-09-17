/**
 * Routine desktop composition root.
 *
 * The desktop main runtime owns the per-profile PowerSync database and selects
 * the canonical Routine vNext persistence adapters. This composer assembles the
 * owner command seam plus per-profile Elapsed/ActiveUsage/Intervention runtimes
 * and restores durable RoutineDefinition/Profile/Membership state on startup.
 *
 * It intentionally exposes no legacy reminder transport, CRUD module, or
 * retired template repository authority. Scheduler projection/execution uses
 * the Routine-owned seams exported by the package separately.
 */

import type { IElectronDatabase } from '@memoflow/contracts/electron';
import {
  createRoutinePowerSyncRepositories,
  loadPowerSyncRoutineLocalRegistrations,
} from '@memoflow/reminder';
import {
  createInterventionRuntime,
  createElapsedRuntime,
  createActiveUsageRuntime,
  createRoutineActivitySensorRuntime,
  createProtocolBreakCreditRuntime,
  type ProtocolBreakCreditRuntime,
  type InterventionPolicy,
  type InterventionRuntime,
  type AmbientBreakCreditRegistration,
  type ElapsedRuntime,
  type ActiveUsageRuntime,
  type ActiveUsageRoutineRegistration,
  type RoutineActivitySensorRuntime,
  createRoutineCoachCommandService,
  createRoutineOverrideChangedNotifier,
  createInMemoryRoutineRuntimeContextStore,
  type RoutineCoachCommandPort,
} from '@memoflow/reminder/routine-runtime';
import type { IdleSensorPort } from '@memoflow/reminder/routine-runtime';
import { WindowsIdleSensorAdapter } from '../modules/routine/windows-idle-sensor.adapter';

/** Dependencies the Routine composer needs from the desktop host runtime. */
export interface ComposeRoutineDesktopDependencies {
  /** PowerSync-backed desktop business database owned by the desktop main runtime. 桌面主进程持有的 PowerSync 桌面业务数据库。 */
  readonly db: IElectronDatabase;
  /** Active profile owner used to project only this tenant's local Routine lanes. */
  readonly identityId: string;
  /** Optional per-profile sink for protocol break completion credit. */
  readonly protocolBreakCreditRuntime?: ProtocolBreakCreditRuntime;
  readonly idleSensor?: IdleSensorPort;
  readonly protocolBreakRegistrations?: readonly AmbientBreakCreditRegistration[];
  /** Presentation escalation timing only; method configuration will replace this default in ROUTINE-5301/5302. */
  readonly interventionPolicy?: InterventionPolicy;
}

const DEFAULT_DESKTOP_INTERVENTION_POLICY: InterventionPolicy = {
  gentleDurationMs: 2 * 60_000,
  graceDurationMs: 3 * 60_000,
  guidedDurationMs: 5 * 60_000,
  strictEnabled: false,
};

/** Composed Routine surface for the desktop host. */
export interface ComposedRoutineDesktop {
  /** Routine Coach owner-domain command seam for approved AI/product orchestration. */
  readonly routineCommandPort: RoutineCoachCommandPort;
  /** Per-profile local Routine intervention truth shared by occurrence coordinators and InterventionWindow. */
  readonly interventionRuntime: InterventionRuntime;
  readonly protocolBreakCreditRuntime: ProtocolBreakCreditRuntime;
  /** Per-profile local timing/runtime truth. */
  readonly activityRuntime: RoutineActivitySensorRuntime;
  readonly elapsedRuntime: ElapsedRuntime;
  readonly activeUsageRuntime: ActiveUsageRuntime;
  /** Register one ActiveUsage routine and optional explicit protocol-break compatibility. */
  readonly registerActiveUsageRoutine: (input: {
    readonly activeUsage: ActiveUsageRoutineRegistration;
    readonly credit?: AmbientBreakCreditRegistration | null;
  }) => void;
  /** Compatibility name retained for the ROUTINE-4203 composition seam. */
  readonly registerProtocolBreakRoutine: (input: {
    readonly credit: AmbientBreakCreditRegistration;
    readonly activeUsage: ActiveUsageRoutineRegistration;
  }) => void;
  /** Reload durable vNext RoutineDefinition/Profile/Membership state for this profile. */
  readonly refreshLocalRoutineRegistrations: () => Promise<void>;
  /** Wait until queued local occurrence/interaction persistence has settled. */
  readonly flushRoutineOccurrencePersistence: () => Promise<void>;
}

/**
 * Compose the per-profile Routine owner/runtime surface from the desktop
 * runtime database. The returned object is intentionally transport-free; host
 * windows consume only the explicit Routine command/runtime ports.
 */
export function composeRoutine(
  dependencies: ComposeRoutineDesktopDependencies,
): ComposedRoutineDesktop {
  const repositories = createRoutinePowerSyncRepositories(dependencies.db);
  const runtimeContextStore = createInMemoryRoutineRuntimeContextStore();
  let refreshLocalRoutineRegistrations: () => Promise<void> = async () => {};
  let occurrencePersistenceTail: Promise<void> = Promise.resolve();
  let occurrencePersistenceFailure: unknown = null;
  const enqueueOccurrencePersistence = (
    work: () => Promise<void>,
    onFailure?: () => void,
  ): void => {
    occurrencePersistenceTail = occurrencePersistenceTail
      .then(work)
      .catch((error) => {
        occurrencePersistenceFailure = error;
        onFailure?.();
      });
  };
  const flushRoutineOccurrencePersistence = async (): Promise<void> => {
    await occurrencePersistenceTail;
    if (occurrencePersistenceFailure != null) {
      const error = occurrencePersistenceFailure;
      occurrencePersistenceFailure = null;
      throw error;
    }
  };

  const routineCommandPort = createRoutineCoachCommandService({
    routineProfileStore: repositories.routineProfileStore,
    runtimeContextStore,
    temporaryOverrideStore: repositories.routineTemporaryOverrideStore,
    occurrenceTruthStore: repositories.routineOccurrenceTruthStore,
    protocolSessionStore: repositories.protocolSessionStore,
    onOverrideChanged: createRoutineOverrideChangedNotifier(),
    onProfileActiveChanged: async ({ identityId }) => {
      if (identityId === dependencies.identityId) await refreshLocalRoutineRegistrations();
    },
  });

  const interventionRuntime = createInterventionRuntime();
  const interventionPolicy = {
    ...DEFAULT_DESKTOP_INTERVENTION_POLICY,
    ...(dependencies.interventionPolicy ?? {}),
  };
  const completeInterventionNaturally = (occurrenceKey: string, at: number): void => {
    if (!interventionRuntime.getSnapshot(occurrenceKey)) return;
    interventionRuntime.execute(occurrenceKey, { action: 'natural-stop', at });
  };
  const idleSensor =
    dependencies.idleSensor ?? new WindowsIdleSensorAdapter({ idleThresholdMs: 5 * 60_000 });
  const activityRuntime = createRoutineActivitySensorRuntime({
    idleSensor,
    idleThresholdMs: 5 * 60_000,
  });
  const activeUsageRuntime = createActiveUsageRuntime({
    activitySensor: activityRuntime,
    onOccurrenceDue: (event) => {
      enqueueOccurrencePersistence(
        async () => {
          const occurrence = await repositories.routineOccurrenceTruthStore.ensureOpenOccurrence({
            identityId: event.identityId,
            routineId: event.routineId,
            occurrenceKey: event.occurrenceKey,
            triggerKind: 'ActiveUsage',
            becameDueAt: event.dueAt,
            sourceRevision: event.generation,
          });
          if (occurrence.resolutionState !== 'Open') return;
          interventionRuntime.createDue({
            identityId: event.identityId,
            routineId: event.routineId,
            occurrenceKey: event.occurrenceKey,
            dueAt: occurrence.becameDueAt,
            policy: interventionPolicy,
          });
        },
        () => activeUsageRuntime.rearmOccurrence(event.identityId, event.routineId),
      );
    },
    onNaturalBreakSatisfied: (event) => {
      enqueueOccurrencePersistence(async () => {
        await repositories.routineOccurrenceTruthStore.ensureOpenOccurrence({
          identityId: event.identityId,
          routineId: event.routineId,
          occurrenceKey: event.occurrenceKey,
          triggerKind: 'ActiveUsage',
          becameDueAt: event.satisfiedAt,
          sourceRevision: event.generation,
        });
        await repositories.routineOccurrenceTruthStore.resolveOccurrence({
          identityId: event.identityId,
          routineId: event.routineId,
          occurrenceKey: event.occurrenceKey,
          state: 'Satisfied',
          resolutionKind: 'NaturalBreakCredit',
          resolvedAt: event.satisfiedAt,
          reason: `Natural idle break ${event.idleDurationMs}ms`,
        });
        completeInterventionNaturally(event.occurrenceKey, Number(event.satisfiedAt));
      });
    },
  });
  const elapsedRuntime = createElapsedRuntime({
    onOccurrenceDue: (event) => {
      enqueueOccurrencePersistence(
        async () => {
          const occurrence = await repositories.routineOccurrenceTruthStore.ensureOpenOccurrence({
            identityId: event.identityId,
            routineId: event.routineId,
            occurrenceKey: event.occurrenceKey,
            triggerKind: 'Elapsed',
            becameDueAt: event.dueAt,
            sourceRevision: event.anchorRevision,
          });
          if (occurrence.resolutionState !== 'Open') return;
          interventionRuntime.createDue({
            identityId: event.identityId,
            routineId: event.routineId,
            occurrenceKey: event.occurrenceKey,
            dueAt: occurrence.becameDueAt,
            policy: interventionPolicy,
          });
        },
        () => elapsedRuntime.rearmOccurrence(event.identityId, event.routineId),
      );
    },
  });
  const protocolBreakCreditRuntime =
    dependencies.protocolBreakCreditRuntime ??
    createProtocolBreakCreditRuntime({
      activeUsage: activeUsageRuntime,
      registrations: dependencies.protocolBreakRegistrations ?? [],
      onRoutineSatisfied: (entry) => {
        enqueueOccurrencePersistence(async () => {
          await repositories.routineOccurrenceTruthStore.ensureOpenOccurrence({
            identityId: entry.identityId,
            routineId: entry.routineId,
            occurrenceKey: entry.activeUsage.occurrenceKey,
            triggerKind: 'ActiveUsage',
            becameDueAt: entry.satisfiedAt,
            sourceRevision: entry.activeUsage.completedGeneration,
          });
          await repositories.routineOccurrenceTruthStore.resolveOccurrence({
            identityId: entry.identityId,
            routineId: entry.routineId,
            occurrenceKey: entry.activeUsage.occurrenceKey,
            state: 'Satisfied',
            resolutionKind: 'ProtocolBreakCredit',
            resolvedAt: entry.satisfiedAt,
            reason: `Protocol break ${entry.breakFactId}`,
          });
          completeInterventionNaturally(entry.activeUsage.occurrenceKey, Number(entry.satisfiedAt));
        });
      },
    });
  const locallyRegisteredElapsedRoutineIds = new Set<string>();
  const locallyRegisteredActiveUsageRoutineIds = new Set<string>();
  const registerActiveUsageRoutine = (input: {
    readonly activeUsage: ActiveUsageRoutineRegistration;
    readonly credit?: AmbientBreakCreditRegistration | null;
  }): void => {
    if (input.credit) {
      if (!protocolBreakCreditRuntime.register) {
        throw new TypeError('Protocol break credit runtime does not support registration');
      }
      protocolBreakCreditRuntime.register(input.credit);
    }
    try {
      activeUsageRuntime.registerRoutine(input.activeUsage);
    } catch (error) {
      if (input.credit) {
        protocolBreakCreditRuntime.unregister?.(input.credit.identityId, input.credit.routineId);
      }
      throw error;
    }
  };
  const registerProtocolBreakRoutine = (input: {
    readonly credit: AmbientBreakCreditRegistration;
    readonly activeUsage: ActiveUsageRoutineRegistration;
  }): void => registerActiveUsageRoutine(input);
  refreshLocalRoutineRegistrations = async (): Promise<void> => {
    const snapshot = await loadPowerSyncRoutineLocalRegistrations(
      dependencies.db,
      dependencies.identityId,
      runtimeContextStore.get({ identityId: dependencies.identityId }),
    );
    const restoredElapsedSnapshots = new Map(
      [...locallyRegisteredElapsedRoutineIds].flatMap((routineId) => {
        const restored = elapsedRuntime.getSnapshot(dependencies.identityId, routineId);
        return restored ? [[routineId, restored] as const] : [];
      }),
    );
    const restoredActiveUsageSnapshots = new Map(
      [...locallyRegisteredActiveUsageRoutineIds].flatMap((routineId) => {
        const restored = activeUsageRuntime.getSnapshot(dependencies.identityId, routineId);
        return restored ? [[routineId, restored] as const] : [];
      }),
    );
    for (const routineId of locallyRegisteredElapsedRoutineIds) {
      elapsedRuntime.unregisterRoutine(dependencies.identityId, routineId);
    }
    for (const routineId of locallyRegisteredActiveUsageRoutineIds) {
      activeUsageRuntime.unregisterRoutine(dependencies.identityId, routineId);
      protocolBreakCreditRuntime.unregister?.(dependencies.identityId, routineId);
    }
    locallyRegisteredElapsedRoutineIds.clear();
    locallyRegisteredActiveUsageRoutineIds.clear();

    for (const elapsed of snapshot.elapsed) {
      elapsedRuntime.registerRoutine({
        ...elapsed,
        restoredSnapshot:
          restoredElapsedSnapshots.get(elapsed.routineId) ?? elapsed.restoredSnapshot,
      });
      locallyRegisteredElapsedRoutineIds.add(elapsed.routineId);
    }

    const credits = new Map(
      snapshot.protocolBreakCredits.map((credit) => [credit.routineId, credit] as const),
    );
    for (const activeUsage of snapshot.activeUsage) {
      registerActiveUsageRoutine({
        activeUsage: {
          ...activeUsage,
          restoredSnapshot:
            restoredActiveUsageSnapshots.get(activeUsage.routineId) ??
            activeUsage.restoredSnapshot,
        },
        credit: credits.get(activeUsage.routineId) ?? null,
      });
      locallyRegisteredActiveUsageRoutineIds.add(activeUsage.routineId);
    }
  };

  return {
    routineCommandPort,
    interventionRuntime,
    protocolBreakCreditRuntime,
    activityRuntime,
    elapsedRuntime,
    activeUsageRuntime,
    registerActiveUsageRoutine,
    registerProtocolBreakRoutine,
    refreshLocalRoutineRegistrations,
    flushRoutineOccurrencePersistence,
  };
}
