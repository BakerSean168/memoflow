import type { Instant } from '@memoflow/time';
import { ResultCode, ResultErrorException } from '@memoflow/contracts/result';
import { findRoutineMethod, type RoutineMethodId } from '../../../method-library';
import {
  ProfileMembership,
  RoutineDefinition,
  RoutineProfile,
  type RoutineTrigger,
} from '../../domain/routine';
import {
  ProtocolDefinition,
  ProtocolSession,
  createTemporaryOverride,
  createSnoozeOverride,
  type ProtocolSessionState,
  type RoutineTemporaryOverride,
} from '../../domain/routine';
import type {
  ProtocolSessionStore,
  RoutineProfileStore,
  RoutineRuntimeContextStore,
  RoutineTemporaryOverrideStore,
  RoutineOccurrenceTruthStore,
  RoutineInteractionApplyReceipt,
} from '../../domain/ports';
import {
  createProtocolSessionRuntime,
  type ProtocolPhaseTransitionReceipt,
} from '../../runtime/protocol';

function routineNotFound(message: string): ResultErrorException {
  return new ResultErrorException(message, ResultCode.NOT_FOUND, undefined, undefined, 404);
}

function routineConflict(message: string): ResultErrorException {
  return new ResultErrorException(message, ResultCode.CONFLICT, undefined, undefined, 409);
}

export type RoutineProtocolMethodId = Extract<RoutineMethodId, '50-10-protocol' | 'pomodoro'>;

export interface RoutineDefinitionReceipt {
  readonly routineId: string;
  readonly identityId: string;
  readonly name: string;
  readonly version: number;
}

export interface RoutineProfileReceipt {
  readonly profileId: string;
  readonly identityId: string;
  readonly name: string;
  readonly version: number;
}

export interface RoutineMembershipReceipt {
  readonly identityId: string;
  readonly routineId: string;
  readonly profileIds: readonly string[];
  readonly version: number;
}

export interface RoutineRuntimeContextReceipt {
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
  createRoutine(input: {
    readonly identityId: string;
    readonly routineId?: string;
    readonly name: string;
    readonly description?: string | null;
    readonly trigger?: RoutineTrigger | null;
    readonly profileIds?: readonly string[];
    readonly at?: number;
  }): Promise<RoutineDefinitionReceipt>;

  updateRoutine(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly expectedVersion: number;
    readonly name?: string;
    readonly description?: string | null;
    readonly enabled?: boolean;
    readonly trigger?: RoutineTrigger | null;
    readonly at?: number;
  }): Promise<RoutineDefinitionReceipt>;

  deleteRoutine(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly expectedVersion?: number;
  }): Promise<{ readonly routineId: string; readonly identityId: string }>;

  createProfile(input: {
    readonly identityId: string;
    readonly profileId?: string;
    readonly name: string;
    readonly description?: string | null;
    readonly enabled?: boolean;
    readonly at?: number;
  }): Promise<RoutineProfileReceipt>;

  updateProfile(input: {
    readonly identityId: string;
    readonly profileId: string;
    readonly expectedVersion: number;
    readonly name?: string;
    readonly description?: string | null;
    readonly enabled?: boolean;
    readonly at?: number;
  }): Promise<RoutineProfileReceipt>;

  deleteProfile(input: {
    readonly identityId: string;
    readonly profileId: string;
    readonly expectedVersion?: number;
  }): Promise<{ readonly profileId: string; readonly identityId: string }>;

  replaceRoutineProfiles(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly expectedVersion: number;
    readonly profileIds: readonly string[];
    readonly at?: number;
  }): Promise<RoutineMembershipReceipt>;

  setMembershipEnabled(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly profileId: string;
    readonly enabled: boolean;
    readonly expectedVersion: number;
    readonly at?: number;
  }): Promise<{
    readonly identityId: string;
    readonly routineId: string;
    readonly profileId: string;
    readonly enabled: boolean;
    readonly version: number;
  }>;

  setProfileActive(input: {
    readonly identityId: string;
    readonly profileId: string;
    readonly active: boolean;
    readonly at?: number;
  }): Promise<RoutineRuntimeContextReceipt>;

  setTemporaryOverride(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly snoozeUntil?: number | null;
    readonly suppressUntil?: number | null;
    readonly overrideIntervalMs?: number | null;
    readonly expiresAt: number;
    readonly reason: string;
    readonly source?: 'user' | 'ai' | 'runtime';
    readonly expectedVersion?: number;
  }): Promise<RoutineTemporaryOverrideReceipt>;

  clearTemporaryOverride(input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly expectedVersion?: number;
  }): Promise<RoutineTemporaryOverrideReceipt>;

  respondToOccurrence(input: {
    readonly commandId: string;
    readonly identityId: string;
    readonly routineId: string;
    readonly occurrenceKey: string;
    readonly action: 'acknowledge' | 'complete' | 'snooze' | 'dismiss' | 'skip';
    readonly snoozeDurationMs?: number;
    readonly responseLatencyMs?: number | null;
    readonly metadata?: Readonly<Record<string, unknown>> | null;
    readonly at?: number;
  }): Promise<RoutineInteractionApplyReceipt>;

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
  readonly runtimeContextStore: RoutineRuntimeContextStore;
  readonly temporaryOverrideStore: RoutineTemporaryOverrideStore;
  readonly occurrenceTruthStore: RoutineOccurrenceTruthStore;
  readonly protocolSessionStore: ProtocolSessionStore;
  readonly onOverrideChanged?: (input: {
    readonly identityId: string;
    readonly routineId: string;
  }) => void | Promise<void>;
  readonly onScheduleChanged?: (input: {
    readonly identityId: string;
    readonly routineId: string;
  }) => void | Promise<void>;
  readonly onProfileActiveChanged?: (input: {
    readonly identityId: string;
    readonly profileId: string;
    readonly active: boolean;
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
  const protocolRuntime = createProtocolSessionRuntime({
    store: options.protocolSessionStore,
    now,
  });

  const notifyOverrideChanged = async (identityId: string, routineId: string) => {
    await options.onOverrideChanged?.({ identityId, routineId });
  };
  const notifyScheduleChanged = async (identityId: string, routineId: string) => {
    await options.onScheduleChanged?.({ identityId, routineId });
  };

  return {
    async createRoutine(input) {
      const at = input.at ?? now();
      const profileIds = [...(input.profileIds ?? [])];
      const uniqueProfileIds = new Set(profileIds);
      if (uniqueProfileIds.size !== profileIds.length) {
        throw new TypeError('Duplicate Routine profile membership');
      }
      const profiles = await options.routineProfileStore.findProfilesByIds({
        identityId: input.identityId,
        profileIds,
      });
      if (profiles.length !== profileIds.length) {
        throw routineNotFound('One or more Routine profiles were not found');
      }
      const routine = RoutineDefinition.create({
        id: input.routineId,
        identityId: input.identityId,
        name: input.name,
        description: input.description,
        trigger: input.trigger ?? null,
        now: new Date(at),
      });
      const memberships = profileIds.map((profileId) =>
        ProfileMembership.create({
          identityId: input.identityId,
          profileId,
          routineId: routine.id,
          now: new Date(at),
        }),
      );
      const existing = input.routineId
        ? await options.routineProfileStore.findDefinition({
            identityId: input.identityId,
            routineId: input.routineId,
          })
        : null;
      if (existing) {
        if (
          existing.name !== routine.name ||
          existing.description !== routine.description ||
          existing.enabled !== routine.enabled ||
          JSON.stringify(existing.trigger) !== JSON.stringify(routine.trigger)
        ) {
          throw routineConflict(`Routine '${routine.id}' already exists with different data`);
        }
        await notifyScheduleChanged(existing.identityId, existing.id);
        return {
          routineId: existing.id,
          identityId: existing.identityId,
          name: existing.name,
          version: existing.version,
        };
      }
      await options.routineProfileStore.createDefinitionWithMemberships({
        definition: routine,
        memberships,
      });
      await notifyScheduleChanged(routine.identityId, routine.id);
      return {
        routineId: routine.id,
        identityId: routine.identityId,
        name: routine.name,
        version: routine.version,
      };
    },

    async updateRoutine(input) {
      const routine = await options.routineProfileStore.findDefinition({
        identityId: input.identityId,
        routineId: input.routineId,
      });
      if (!routine) throw routineNotFound(`Routine '${input.routineId}' was not found`);
      if (routine.version !== input.expectedVersion)
        throw routineConflict(`Routine '${input.routineId}' version conflict`);
      routine.update(
        {
          name: input.name,
          description: input.description,
          enabled: input.enabled,
          trigger: input.trigger,
        },
        new Date(input.at ?? now()),
      );
      await options.routineProfileStore.updateDefinition({
        definition: routine,
        expectedVersion: input.expectedVersion,
      });
      await notifyScheduleChanged(routine.identityId, routine.id);
      return {
        routineId: routine.id,
        identityId: routine.identityId,
        name: routine.name,
        version: routine.version,
      };
    },

    async deleteRoutine(input) {
      await options.routineProfileStore.deleteDefinition(input);
      await notifyScheduleChanged(input.identityId, input.routineId);
      return { identityId: input.identityId, routineId: input.routineId };
    },

    async createProfile(input) {
      const profile = RoutineProfile.create({
        id: input.profileId,
        identityId: input.identityId,
        name: input.name,
        description: input.description,
        enabled: input.enabled,
        now: new Date(input.at ?? now()),
      });
      const existing = input.profileId
        ? await options.routineProfileStore.findProfile({
            identityId: input.identityId,
            profileId: input.profileId,
          })
        : null;
      if (existing) {
        if (
          existing.name !== profile.name ||
          existing.description !== profile.description ||
          existing.enabled !== profile.enabled
        ) {
          throw routineConflict(`Profile '${profile.id}' already exists with different data`);
        }
        return {
          profileId: existing.id,
          identityId: existing.identityId,
          name: existing.name,
          version: existing.version,
        };
      }
      await options.routineProfileStore.upsertProfile(profile);
      return {
        profileId: profile.id,
        identityId: profile.identityId,
        name: profile.name,
        version: profile.version,
      };
    },

    async updateProfile(input) {
      const profile = await options.routineProfileStore.findProfile({
        identityId: input.identityId,
        profileId: input.profileId,
      });
      if (!profile) throw routineNotFound(`Profile '${input.profileId}' was not found`);
      if (profile.version !== input.expectedVersion)
        throw routineConflict(`Profile '${input.profileId}' version conflict`);
      profile.update(
        { name: input.name, description: input.description, enabled: input.enabled },
        new Date(input.at ?? now()),
      );
      await options.routineProfileStore.updateProfile({
        profile,
        expectedVersion: input.expectedVersion,
      });
      const affectedMemberships = await options.routineProfileStore.listMembershipsForProfile({
        identityId: profile.identityId,
        profileId: profile.id,
      });
      for (const membership of affectedMemberships) {
        await notifyScheduleChanged(profile.identityId, membership.routineId);
      }
      return {
        profileId: profile.id,
        identityId: profile.identityId,
        name: profile.name,
        version: profile.version,
      };
    },

    async deleteProfile(input) {
      const memberships = await options.routineProfileStore.listMembershipsForProfile({
        identityId: input.identityId,
        profileId: input.profileId,
      });
      if (memberships.length > 0)
        throw routineConflict(`Profile '${input.profileId}' still has Routine memberships`);
      await options.routineProfileStore.deleteProfile(input);
      return { identityId: input.identityId, profileId: input.profileId };
    },

    async replaceRoutineProfiles(input) {
      const routine = await options.routineProfileStore.findDefinition({
        identityId: input.identityId,
        routineId: input.routineId,
      });
      if (!routine) throw routineNotFound(`Routine '${input.routineId}' was not found`);
      if (routine.version !== input.expectedVersion)
        throw routineConflict(`Routine '${input.routineId}' version conflict`);
      const profileIds = [...input.profileIds];
      if (new Set(profileIds).size !== profileIds.length)
        throw new TypeError('Duplicate Routine profile membership');
      const profiles = await options.routineProfileStore.findProfilesByIds({
        identityId: input.identityId,
        profileIds,
      });
      if (profiles.length !== profileIds.length)
        throw routineNotFound('One or more Routine profiles were not found');
      const existing = await options.routineProfileStore.listMembershipsForRoutine({
        identityId: input.identityId,
        routineId: input.routineId,
      });
      const existingByProfile = new Map(
        existing.map((membership) => [membership.profileId, membership]),
      );
      const memberships = profileIds.map(
        (profileId) =>
          existingByProfile.get(profileId) ??
          ProfileMembership.create({
            identityId: input.identityId,
            profileId,
            routineId: input.routineId,
            now: new Date(input.at ?? now()),
          }),
      );
      await options.routineProfileStore.replaceRoutineMemberships({
        identityId: input.identityId,
        routineId: input.routineId,
        memberships,
        expectedVersion: input.expectedVersion,
      });
      await notifyScheduleChanged(input.identityId, input.routineId);
      return {
        identityId: input.identityId,
        routineId: input.routineId,
        profileIds,
        version: input.expectedVersion + 1,
      };
    },

    async setMembershipEnabled(input) {
      const memberships = await options.routineProfileStore.listMembershipsForRoutine({
        identityId: input.identityId,
        routineId: input.routineId,
      });
      const membership = memberships.find((entry) => entry.profileId === input.profileId);
      if (!membership)
        throw routineNotFound(`Routine membership '${input.profileId}' was not found`);
      if (membership.version !== input.expectedVersion)
        throw routineConflict('Routine membership version conflict');
      if (input.enabled) membership.enable(new Date(input.at ?? now()));
      else membership.disable(new Date(input.at ?? now()));
      await options.routineProfileStore.upsertMembership(membership, input.expectedVersion);
      await notifyScheduleChanged(input.identityId, input.routineId);
      return {
        identityId: input.identityId,
        routineId: input.routineId,
        profileId: input.profileId,
        enabled: membership.enabled,
        version: membership.version,
      };
    },

    async setProfileActive(input) {
      const profile = await options.routineProfileStore.findProfile({
        identityId: input.identityId,
        profileId: input.profileId,
      });
      if (!profile) throw routineNotFound(`Routine profile '${input.profileId}' was not found`);
      const receipt = options.runtimeContextStore.setProfileActive({
        identityId: profile.identityId,
        profileId: profile.id,
        active: input.active,
        at: input.at,
      });
      await options.onProfileActiveChanged?.({
        identityId: profile.identityId,
        profileId: profile.id,
        active: input.active,
      });
      return receipt;
    },

    async setTemporaryOverride(input) {
      const routine = await options.routineProfileStore.findDefinition({
        identityId: input.identityId,
        routineId: input.routineId,
      });
      if (!routine) throw routineNotFound(`Routine '${input.routineId}' was not found`);
      const override = createTemporaryOverride({
        snoozeUntil: input.snoozeUntil,
        suppressUntil: input.suppressUntil,
        overrideIntervalMs: input.overrideIntervalMs,
        expiresAt: input.expiresAt,
        reason: input.reason,
        source: input.source ?? 'ai',
      });
      await options.temporaryOverrideStore.setRoutineTemporaryOverride({
        identityId: input.identityId,
        routineId: input.routineId,
        override,
        expectedVersion: input.expectedVersion,
      });
      await notifyOverrideChanged(input.identityId, input.routineId);
      return { identityId: input.identityId, routineId: input.routineId, override };
    },

    async clearTemporaryOverride(input) {
      const existing = await options.temporaryOverrideStore.findRoutineTemporaryOverride(input);
      if (existing == null && input.expectedVersion !== undefined) {
        return { identityId: input.identityId, routineId: input.routineId, override: null };
      }
      await options.temporaryOverrideStore.clearRoutineTemporaryOverride(input);
      if (existing != null) await notifyOverrideChanged(input.identityId, input.routineId);
      return { identityId: input.identityId, routineId: input.routineId, override: null };
    },

    async respondToOccurrence(input) {
      const commandId = input.commandId.trim();
      if (!commandId) throw new TypeError('Routine occurrence commandId must not be empty');
      const occurrence = await options.occurrenceTruthStore.findOccurrence({
        identityId: input.identityId,
        routineId: input.routineId,
        occurrenceKey: input.occurrenceKey,
      });
      if (!occurrence) {
        throw routineNotFound(`Routine occurrence '${input.occurrenceKey}' was not found`);
      }
      const actedAt = input.at ?? now();
      const action =
        input.action === 'acknowledge'
          ? 'Acknowledged'
          : input.action === 'complete'
            ? 'Completed'
            : input.action === 'snooze'
              ? 'Snoozed'
              : input.action === 'dismiss'
                ? 'Dismissed'
                : 'Skipped';
      const responseLatencyMs =
        input.responseLatencyMs ?? Math.max(0, actedAt - Number(occurrence.becameDueAt));

      const snoozeDurationMs =
        input.action === 'snooze'
          ? positiveInteger(input.snoozeDurationMs ?? 0, 'snoozeDurationMs')
          : null;
      const temporaryOverride =
        snoozeDurationMs == null
          ? null
          : createSnoozeOverride({
              now: actedAt,
              durationMs: snoozeDurationMs,
              reason: 'Routine occurrence snoozed',
              source: 'user',
            });

      // Interaction + snooze product state are one owner-domain commit. This is
      // the replay fence: a failed transaction leaves neither side visible, and
      // the same commandId returns the original fact without extending snooze.
      const receipt = await options.occurrenceTruthStore.applyInteraction({
        idempotencyKey: commandId,
        identityId: input.identityId,
        routineId: input.routineId,
        occurrenceKey: input.occurrenceKey,
        action,
        actedAt,
        responseLatencyMs,
        snoozeDurationMs,
        temporaryOverride,
        metadata: input.metadata,
      });
      if (input.action === 'snooze') {
        await notifyOverrideChanged(input.identityId, input.routineId);
      }
      return receipt;
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
        throw new TypeError(
          'longBreakEveryCycles and longBreakMinutes must be configured together',
        );
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
      if (!persisted)
        throw routineNotFound(`Protocol session '${input.sessionId}' disappeared after transition`);
      return protocolReceipt(persisted, transition);
    },
  };
}
