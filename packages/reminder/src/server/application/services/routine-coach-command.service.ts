import type { Instant } from '@memoflow/time';
import {
  findRoutineMethod,
  type RoutineMethodId,
} from '../../../method-library';
import {
  ProtocolDefinition,
  ProtocolSession,
  createTemporaryOverride,
  type ProtocolSessionState,
  type RoutineTemporaryOverride,
} from '../../domain/routine';
import type {
  ProtocolSessionStore,
  RoutineProfileStore,
  RoutineTemporaryOverrideStore,
} from '../../domain/ports';
import {
  createProtocolSessionRuntime,
  type ProtocolPhaseTransitionReceipt,
} from '../../runtime/protocol';

export type RoutineProtocolMethodId = Extract<RoutineMethodId, '50-10-protocol' | 'pomodoro'>;

export interface RoutineProfileActivationReceipt {
  readonly profileId: string;
  readonly identityId: string;
  readonly active: boolean;
  readonly version: number;
}

export interface RoutineTemporaryOverrideReceipt {
  readonly routineId: string;
  readonly identityId: string;
  readonly override: RoutineTemporaryOverride | null;
}

export interface RoutineProtocolSessionReceipt {
  readonly sessionId: string;
  readonly identityId: string;
  readonly protocolId: string;
  readonly state: ProtocolSessionState;
  readonly phaseKey: string | null;
  readonly version: number;
}

export interface RoutineCoachCommandPort {
  setProfileActive(input: {
    readonly identityId: string;
    readonly profileId: string;
    readonly active: boolean;
    readonly at?: number;
  }): Promise<RoutineProfileActivationReceipt>;

  setTemporaryOverride(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly snoozeUntil?: number | null;
    readonly suppressUntil?: number | null;
    readonly overrideIntervalMs?: number | null;
    readonly expiresAt: number;
    readonly reason: string;
  }): Promise<RoutineTemporaryOverrideReceipt>;

  clearTemporaryOverride(input: {
    readonly identityId: string;
    readonly routineId: string;
  }): Promise<RoutineTemporaryOverrideReceipt>;

  startPresetProtocol(input: {
    readonly identityId: string;
    readonly methodId: RoutineProtocolMethodId;
    readonly focusMinutes?: number;
    readonly breakMinutes?: number;
    readonly cycles?: number;
    readonly longBreakEveryCycles?: number | null;
    readonly longBreakMinutes?: number | null;
    readonly at?: number;
  }): Promise<RoutineProtocolSessionReceipt>;

  transitionProtocol(input: {
    readonly identityId: string;
    readonly sessionId: string;
    readonly action: 'pause' | 'resume' | 'end';
    readonly at?: number;
  }): Promise<RoutineProtocolSessionReceipt>;
}

export interface CreateRoutineCoachCommandServiceOptions {
  readonly routineProfileStore: RoutineProfileStore;
  readonly temporaryOverrideStore: RoutineTemporaryOverrideStore;
  readonly protocolSessionStore: ProtocolSessionStore;
  readonly onOverrideChanged?: (input: {
    readonly identityId: string;
    readonly routineId: string;
  }) => void | Promise<void>;
  readonly now?: () => number;
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${field} must be a positive integer`);
  }
  return value;
}

function optionalPositiveInteger(value: number | null | undefined, field: string): number | null {
  if (value == null) return null;
  return positiveInteger(value, field);
}

function protocolReceipt(
  session: ProtocolSession,
  transition?: ProtocolPhaseTransitionReceipt,
): RoutineProtocolSessionReceipt {
  const snapshot = session.snapshot();
  return {
    sessionId: snapshot.id,
    identityId: snapshot.identityId,
    protocolId: snapshot.protocolId,
    state: transition?.state ?? snapshot.state,
    phaseKey: transition?.phaseKey ?? null,
    version: transition?.persistedVersion ?? snapshot.version,
  };
}

/**
 * Product command seam for Routine Coach AI/UI orchestration.
 *
 * It mutates only Routine-owned state. Scheduler is deliberately absent: a
 * temporary override emits an owner-domain change callback and the normal
 * Routine -> SchedulingPort projection performs reconciliation.
 */
export function createRoutineCoachCommandService(
  options: CreateRoutineCoachCommandServiceOptions,
): RoutineCoachCommandPort {
  const now = options.now ?? Date.now;
  const protocolRuntime = createProtocolSessionRuntime({ store: options.protocolSessionStore, now });

  const notifyOverrideChanged = async (identityId: string, routineId: string) => {
    await options.onOverrideChanged?.({ identityId, routineId });
  };

  return {
    async setProfileActive(input) {
      const profile = await options.routineProfileStore.findProfile({
        identityId: input.identityId,
        profileId: input.profileId,
      });
      if (!profile) throw new Error(`Routine profile '${input.profileId}' was not found`);
      const at = new Date(input.at ?? now());
      if (input.active) profile.activate(at);
      else profile.deactivate(at);
      await options.routineProfileStore.upsertProfile(profile);
      return {
        profileId: profile.id,
        identityId: profile.identityId,
        active: profile.active,
        version: profile.version,
      };
    },

    async setTemporaryOverride(input) {
      const routine = await options.routineProfileStore.findDefinition({
        identityId: input.identityId,
        routineId: input.routineId,
      });
      if (!routine) throw new Error(`Routine '${input.routineId}' was not found`);
      const override = createTemporaryOverride({
        snoozeUntil: input.snoozeUntil,
        suppressUntil: input.suppressUntil,
        overrideIntervalMs: input.overrideIntervalMs,
        expiresAt: input.expiresAt,
        reason: input.reason,
        source: 'ai',
      });
      await options.temporaryOverrideStore.setRoutineTemporaryOverride({
        identityId: input.identityId,
        routineId: input.routineId,
        override,
      });
      await notifyOverrideChanged(input.identityId, input.routineId);
      return { identityId: input.identityId, routineId: input.routineId, override };
    },

    async clearTemporaryOverride(input) {
      await options.temporaryOverrideStore.clearRoutineTemporaryOverride(input);
      await notifyOverrideChanged(input.identityId, input.routineId);
      return { identityId: input.identityId, routineId: input.routineId, override: null };
    },

    async startPresetProtocol(input) {
      const method = findRoutineMethod(input.methodId);
      if (method.runtimeRequirement !== 'Protocol') {
        throw new TypeError(`Routine method '${input.methodId}' is not Protocol-owned`);
      }
      const recommended = method.recommendedParameters;
      const focusMinutes = positiveInteger(
        input.focusMinutes ?? recommended.focusMinutes ?? 0,
        'focusMinutes',
      );
      const breakMinutes = positiveInteger(
        input.breakMinutes ?? recommended.breakMinutes ?? 0,
        'breakMinutes',
      );
      const cycles = positiveInteger(input.cycles ?? recommended.cycles ?? 0, 'cycles');
      const longBreakEveryCycles = optionalPositiveInteger(
        input.longBreakEveryCycles ?? recommended.longBreakEveryCycles,
        'longBreakEveryCycles',
      );
      const longBreakMinutes = optionalPositiveInteger(
        input.longBreakMinutes ?? recommended.longBreakMinutes,
        'longBreakMinutes',
      );
      if ((longBreakEveryCycles == null) !== (longBreakMinutes == null)) {
        throw new TypeError('longBreakEveryCycles and longBreakMinutes must be configured together');
      }
      const at = input.at ?? now();
      const protocol = ProtocolDefinition.create({
        identityId: input.identityId,
        name: method.name,
        phases: [
          {
            id: 'focus',
            kind: 'Focus',
            role: 'cycle',
            durationMs: focusMinutes * 60_000,
          },
          {
            id: 'break',
            kind: 'ShortBreak',
            role: 'cycle',
            durationMs: breakMinutes * 60_000,
          },
        ],
        cyclePolicy: { mode: 'fixed', cycles },
        breakPolicy: {
          afterFinalCycle: 'include',
          longBreakEveryCycles,
          longBreakDurationMs: longBreakMinutes == null ? null : longBreakMinutes * 60_000,
        },
        now: at,
      });
      const session = ProtocolSession.create({ identityId: input.identityId, protocol, now: at });
      await protocolRuntime.persistNewSession(session);
      const transition = await protocolRuntime.transition({
        identityId: input.identityId,
        sessionId: session.id,
        action: 'start',
        at: at as Instant,
      });
      return protocolReceipt(session, transition);
    },

    async transitionProtocol(input) {
      const transition = await protocolRuntime.transition({
        identityId: input.identityId,
        sessionId: input.sessionId,
        action: input.action,
        at: input.at,
      });
      const persisted = await options.protocolSessionStore.findById({
        identityId: input.identityId,
        sessionId: input.sessionId,
      });
      if (!persisted) throw new Error(`Protocol session '${input.sessionId}' disappeared after transition`);
      return protocolReceipt(persisted, transition);
    },
  };
}
