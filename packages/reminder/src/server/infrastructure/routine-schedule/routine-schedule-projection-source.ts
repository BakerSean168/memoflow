import type { ScheduledIntent, SchedulingOwner } from '@memoflow/contracts/schedule';
import { asInstant, type RecurrenceEnginePort } from '@memoflow/time';
import {
  computeRoutineNextEligibleOccurrence,
  requiresDurableScheduleProjection,
  RoutineDefinition,
  type RoutineTemporaryOverride,
  type RoutineTrigger,
  type WallClockTrigger,
} from '../../domain/routine';
import {
  buildRoutineWallClockIntent,
  buildRoutineWallClockOwner,
  type RoutineWallClockOccurrencePayload,
} from './routine-schedule-contract';

/** Runtime snapshot consumed by the durable projection lane. */
export interface RoutineScheduleSnapshot {
  readonly definition: RoutineDefinition;
  /**
   * Durable cloud-side Profile/Membership gate. Host-local `profile active`
   * RuntimeContext is deliberately excluded from Scheduler authority.
   */
  readonly durableProfileGateOpen: boolean;
  /** Durable snooze/suppress runtime state served by the state reader. */
  readonly temporaryOverride?: RoutineTemporaryOverride | null;
}

/**
 * Read-only definition sink for the Scheduler projection. Routines are the
 * single future source of truth; this lane consumes a snapshot and never
 * reaches into Prisma directly so the projection stays host-neutral.
 */
export interface RoutineScheduleStateReader {
  readRoutineScheduleSnapshot(
    routineId: string,
    identityId: string,
  ): Promise<RoutineScheduleSnapshot | null>;
  /** Full authority scan used by startup reconcile / lost-event repair. */
  listRoutineRefs(): Promise<Array<{ routineId: string; identityId: string }>>;
}

export interface RoutineScheduleProjectionPlan {
  readonly owner: SchedulingOwner;
  readonly desired: readonly ScheduledIntent<RoutineWallClockOccurrencePayload>[];
}

export interface RoutineScheduleProjectionSource {
  buildRoutinePlan(routineId: string, identityId: string): Promise<RoutineScheduleProjectionPlan>;
  buildRoutineOwner(routineId: string, identityId: string): SchedulingOwner;
  listRoutineRefs(): Promise<Array<{ routineId: string; identityId: string }>>;
}

export interface RoutineScheduleProjectionHandlers {
  upsertRoutine(routineId: string, identityId: string): Promise<void>;
  deleteRoutine(routineId: string, identityId: string): Promise<void>;
}

export interface RoutineOccurrenceCommittedEvent {
  readonly routineId: string;
  readonly identityId: string;
  readonly occurrenceKey: string;
  readonly scheduledFor: number;
}

/** Snooze/override changed: rebuild the routine's desired scheduling set now. */
export interface RoutineOverrideChangedEvent {
  readonly routineId: string;
  readonly identityId: string;
}

/** Durable owner truth changed and the Scheduler projection must be rebuilt. */
export interface RoutineScheduleChangedEvent {
  readonly routineId: string;
  readonly identityId: string;
}

/**
 * NOTE: this stays a TYPE LITERAL, not an interface. `TypedEventMap` constrains
 * the keyed payload map to `Record<string, unknown>`, and only a type literal
 * carries an implicit string index signature (`keyof Map` is exactly the two
 * declared keys, never `string | number`). Interfaces do NOT — they would widen
 * to `string` and instantly break every `Subscriber<...>` wiring.
 */
export type RoutineScheduleProjectionEventMap = {
  readonly 'routine:occurrence-committed': RoutineOccurrenceCommittedEvent;
  readonly 'routine:override-changed': RoutineOverrideChangedEvent;
  readonly 'routine:schedule-changed': RoutineScheduleChangedEvent;
};

export const routineScheduleProjectionEventNames = [
  'routine:occurrence-committed',
  'routine:override-changed',
  'routine:schedule-changed',
] as const satisfies readonly (keyof RoutineScheduleProjectionEventMap)[];

export function createRoutineScheduleProjectionEventHandlers(
  projector: RoutineScheduleProjectionHandlers,
): {
  [K in keyof RoutineScheduleProjectionEventMap]: (
    event: RoutineScheduleProjectionEventMap[K],
  ) => Promise<void>;
} {
  return {
    'routine:occurrence-committed': async (event) => {
      await projector.upsertRoutine(event.routineId, event.identityId);
    },
    // An override/snooze change means the desired set may jump (suppress) or
    // reappear (expiry) in place — rebuild the full plan so the neutral
    // Scheduler converges without waiting for the next occurrence commit.
    'routine:override-changed': async (event) => {
      await projector.upsertRoutine(event.routineId, event.identityId);
    },
    'routine:schedule-changed': async (event) => {
      await projector.upsertRoutine(event.routineId, event.identityId);
    },
  };
}

/**
 * Only a scheduler-owned WallClock trigger produces a durable invocation here.
 * Elapsed / ActiveUsage keep their `local-runtime` timing owner (Wave 4); this
 * projection never schedules them.
 */
function durableWallClockTrigger(trigger: RoutineTrigger | null): WallClockTrigger | null {
  if (!trigger) return null;
  return requiresDurableScheduleProjection(trigger) ? trigger : null;
}

export function createRoutineScheduleProjectionSource(deps: {
  readonly reader: RoutineScheduleStateReader;
  readonly recurrenceEngine: RecurrenceEnginePort;
  readonly now?: () => number;
}): RoutineScheduleProjectionSource {
  const now = deps.now ?? Date.now;

  return {
    buildRoutineOwner(routineId, identityId) {
      return buildRoutineWallClockOwner(routineId, identityId);
    },

    async listRoutineRefs() {
      return deps.reader.listRoutineRefs();
    },

    async buildRoutinePlan(routineId, identityId) {
      const owner = buildRoutineWallClockOwner(routineId, identityId);
      const snapshot = await deps.reader.readRoutineScheduleSnapshot(routineId, identityId);
      if (!snapshot) {
        return { owner, desired: [] };
      }

      const { definition } = snapshot;
      const canonicalOwner = buildRoutineWallClockOwner(definition.id, definition.identityId);
      if (!definition.enabled || !snapshot.durableProfileGateOpen) {
        return { owner: canonicalOwner, desired: [] };
      }

      const trigger = durableWallClockTrigger(definition.trigger);
      if (!trigger) {
        return { owner: canonicalOwner, desired: [] };
      }

      const occurrence = computeRoutineNextEligibleOccurrence({
        routineId: definition.id,
        engine: deps.recurrenceEngine,
        trigger,
        after: asInstant(now()),
        temporaryOverride: snapshot.temporaryOverride ?? null,
      });
      if (!occurrence) {
        return { owner: canonicalOwner, desired: [] };
      }

      const intent = buildRoutineWallClockIntent({
        routineId: definition.id,
        identityId: definition.identityId,
        routineName: definition.name,
        occurrenceKey: occurrence.occurrenceKey,
        scheduledFor: Number(occurrence.occurrenceAt),
        sourceRevision: definition.version,
      });

      return { owner: canonicalOwner, desired: [intent] };
    },
  };
}
