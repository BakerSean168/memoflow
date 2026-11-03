import type { RoutineMethodId } from '@memoflow/routine-contracts/method-library';
import {
  type RoutineTrigger,
  type ProtocolSessionState,
  type RoutineTemporaryOverride,
} from '../../domain/routine';
import type {
  ProtocolSessionStore,
  RoutineProfileStore,
  RoutinePreferencesStore,
  RoutineRuntimeContextStore,
  RoutineTemporaryOverrideStore,
  RoutineOccurrenceTruthStore,
  RoutineOccurrenceFact,
  RoutineInteractionApplyReceipt,
} from '../../domain/ports';
import { createProtocolSessionRuntime } from '../../runtime/protocol';
import { createMembershipCommands } from './routine-coach/commands-membership';
import { createPreferencesCommands } from './routine-coach/commands-preferences';
import { createProfileCommands } from './routine-coach/commands-profile';
import { createProtocolCommands } from './routine-coach/commands-protocol';
import { createRoutineCommands } from './routine-coach/commands-routine';
import type { RoutineCoachCommandContext } from './routine-coach/command-context';

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

export interface RoutinePreferencesReceipt {
  readonly identityId: string;
  readonly globalEnabled: boolean;
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
  updatePreferences(input: {
    readonly identityId: string;
    readonly globalEnabled: boolean;
    readonly expectedVersion: number;
    readonly at?: number;
  }): Promise<RoutinePreferencesReceipt>;

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
  readonly routinePreferencesStore?: RoutinePreferencesStore;
  readonly runtimeContextStore: RoutineRuntimeContextStore;
  readonly temporaryOverrideStore: RoutineTemporaryOverrideStore;
  readonly occurrenceTruthStore: RoutineOccurrenceTruthStore;
  readonly protocolSessionStore: ProtocolSessionStore;
  /**
   * Signals that an occurrence was explicitly completed so a host-owned local
   * runtime (Elapsed/ActiveUsage) can re-arm its lane. Notification, desktop
   * InterventionWindow and AI all enter through respondToOccurrence, so the
   * feedback belongs to this command seam rather than to one transport.
   */
  readonly onOccurrenceCompleted?: (input: {
    readonly identityId: string;
    readonly routineId: string;
    readonly occurrenceKey: string;
    readonly triggerKind: RoutineOccurrenceFact['triggerKind'];
    readonly at: number;
  }) => void | Promise<void>;
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
  readonly onGlobalEnabledChanged?: (input: {
    readonly identityId: string;
    readonly globalEnabled: boolean;
  }) => void | Promise<void>;
  readonly now?: () => number;
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

  const ctx: RoutineCoachCommandContext = {
    options,
    now,
    protocolRuntime,
    notifyOverrideChanged,
    notifyScheduleChanged,
  };

  return {
    ...createPreferencesCommands(ctx),
    ...createRoutineCommands(ctx),
    ...createProfileCommands(ctx),
    ...createMembershipCommands(ctx),
    ...createProtocolCommands(ctx),
  };
}
