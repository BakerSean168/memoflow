import type {
  AIActiveUsageTriggerInput,
  AIElapsedTriggerInput,
  IAIRoutineCommandPort,
  AIRoutineCreateInput,
  AIWallClockTriggerInput,
} from '../server/application/ports/routine-command.port';

/** Canonical trigger constructors owned by the Routine module. */
export interface RoutineActiveUsageSemantics {
  readonly requiredActiveMs: number;
  readonly anchor?: AIActiveUsageTriggerInput['anchor'];
  readonly naturalBreakCredit?: { readonly idleDurationMs: number } | null;
  readonly protocolBreakCredit?: AIActiveUsageTriggerInput['protocolBreakCredit'];
}

export interface RoutineTriggerCanonicalizers {
  wallClock(input: AIWallClockTriggerInput): unknown;
  elapsed(input: AIElapsedTriggerInput): unknown;
  activeUsage(input: RoutineActiveUsageSemantics): unknown;
}

/** Routine owner capabilities used by the AI command adapter. */
export interface RoutineCommandAdapterDeps {
  readonly routine: {
    createRoutine(input: {
      readonly identityId: string;
      readonly routineId?: string;
      readonly name: string;
      readonly description?: string | null;
      readonly trigger?: unknown;
      readonly profileIds?: readonly string[];
      readonly at?: number;
    }): Promise<{ readonly routineId: string; readonly name: string }>;
    setProfileActive(input: {
      readonly identityId: string;
      readonly profileId: string;
      readonly active: boolean;
      readonly at?: number;
    }): Promise<{ readonly profileId: string; readonly active: boolean }>;
    setTemporaryOverride(input: {
      readonly identityId: string;
      readonly routineId: string;
      readonly snoozeUntil?: number | null;
      readonly suppressUntil?: number | null;
      readonly overrideIntervalMs?: number | null;
      readonly expiresAt: number;
      readonly reason: string;
      readonly source: 'ai';
    }): Promise<{
      readonly routineId: string;
      readonly override?: { readonly expiresAt: number } | null;
    }>;
    clearTemporaryOverride(input: {
      readonly identityId: string;
      readonly routineId: string;
    }): Promise<{ readonly routineId: string }>;
    startPresetProtocol(input: {
      readonly identityId: string;
      readonly methodId: string;
      readonly focusMinutes?: number;
      readonly breakMinutes?: number;
      readonly cycles?: number;
      readonly longBreakEveryCycles?: number | null;
      readonly longBreakMinutes?: number | null;
      readonly at?: number;
    }): Promise<{
      readonly sessionId: string;
      readonly state: string;
      readonly protocolId: string;
      readonly phaseKey: string | null;
    }>;
    transitionProtocol(input: {
      readonly identityId: string;
      readonly sessionId: string;
      readonly action: 'pause' | 'resume' | 'end';
      readonly at?: number;
    }): Promise<{
      readonly sessionId: string;
      readonly state: string;
      readonly phaseKey: string | null;
    }>;
  };
  readonly triggers: RoutineTriggerCanonicalizers;
}

function canonicalTrigger(
  triggers: RoutineTriggerCanonicalizers,
  input: AIRoutineCreateInput['trigger'],
): unknown {
  switch (input.type) {
    case 'WallClock':
      return triggers.wallClock(input);
    case 'Elapsed':
      return triggers.elapsed(input);
    case 'ActiveUsage':
      return triggers.activeUsage({
        requiredActiveMs: input.requiredActiveMs,
        anchor: input.anchor,
        naturalBreakCredit: input.naturalBreakCredit
          ? { idleDurationMs: input.naturalBreakCredit.idleDurationMs }
          : null,
        protocolBreakCredit: input.protocolBreakCredit,
      });
  }
}

/**
 * Canonical AI command adapter: commands terminate at Reminder-owned
 * application/runtime seams supplied by the host.
 */
export function createRoutineCommandAdapter(
  deps: RoutineCommandAdapterDeps,
): IAIRoutineCommandPort {
  return {
    async createRoutine(input) {
      const created = await deps.routine.createRoutine({
        identityId: input.context.identityId,
        ...(input.routineId === undefined ? {} : { routineId: input.routineId }),
        name: input.name,
        description: input.description,
        trigger: canonicalTrigger(deps.triggers, input.trigger),
        profileIds: input.profileIds,
        at: input.context.startedAt,
      });
      return {
        kind: 'routine' as const,
        id: created.routineId,
        status: 'created',
        details: { name: created.name },
      };
    },

    async setProfileActive(input) {
      const receipt = await deps.routine.setProfileActive({
        identityId: input.context.identityId,
        profileId: input.profileId,
        active: input.active,
        at: input.context.startedAt,
      });
      return {
        kind: 'profile' as const,
        id: receipt.profileId,
        status: receipt.active ? 'active' : 'inactive',
      };
    },

    async setTemporaryOverride(input) {
      const receipt = await deps.routine.setTemporaryOverride({
        identityId: input.context.identityId,
        routineId: input.routineId,
        snoozeUntil: input.snoozeUntil,
        suppressUntil: input.suppressUntil,
        overrideIntervalMs: input.overrideIntervalMs,
        expiresAt: input.expiresAt,
        reason: input.reason,
        source: 'ai',
      });
      return {
        kind: 'override' as const,
        id: receipt.routineId,
        status: 'set',
        details: { expiresAt: receipt.override?.expiresAt ?? null },
      };
    },

    async clearTemporaryOverride(input) {
      const receipt = await deps.routine.clearTemporaryOverride({
        identityId: input.context.identityId,
        routineId: input.routineId,
      });
      return { kind: 'override' as const, id: receipt.routineId, status: 'cleared' };
    },

    async startProtocol(input) {
      const receipt = await deps.routine.startPresetProtocol({
        identityId: input.context.identityId,
        methodId: input.methodId,
        focusMinutes: input.focusMinutes,
        breakMinutes: input.breakMinutes,
        cycles: input.cycles,
        longBreakEveryCycles: input.longBreakEveryCycles,
        longBreakMinutes: input.longBreakMinutes,
        at: input.context.startedAt,
      });
      return {
        kind: 'protocol' as const,
        id: receipt.sessionId,
        status: receipt.state,
        details: { protocolId: receipt.protocolId, phaseKey: receipt.phaseKey },
      };
    },

    async transitionProtocol(input) {
      const receipt = await deps.routine.transitionProtocol({
        identityId: input.context.identityId,
        sessionId: input.sessionId,
        action: input.action,
        at: input.context.startedAt,
      });
      return {
        kind: 'protocol' as const,
        id: receipt.sessionId,
        status: receipt.state,
        details: { phaseKey: receipt.phaseKey },
      };
    },
  };
}
