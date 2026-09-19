import type { IAIRoutineCommandPort, AIRoutineCreateInput } from '@memoflow/ai';
import {
  createActiveUsageTrigger,
  createElapsedTrigger,
  createWallClockTrigger,
} from '@memoflow/reminder/server';
import type { RoutineCoachCommandPort } from '@memoflow/reminder/routine-runtime';

function canonicalTrigger(input: AIRoutineCreateInput['trigger']) {
  switch (input.type) {
    case 'WallClock':
      return createWallClockTrigger(input);
    case 'Elapsed':
      return createElapsedTrigger(input);
    case 'ActiveUsage':
      return createActiveUsageTrigger({
        requiredActiveMs: input.requiredActiveMs,
        anchor: input.anchor,
        naturalBreakCredit: input.naturalBreakCredit
          ? { idleDurationMs: input.naturalBreakCredit.idleDurationMs }
          : null,
        protocolBreakCredit: input.protocolBreakCredit,
      });
  }
}

/** Host adapter: AI commands terminate at Reminder-owned application/runtime seams. */
export class DesktopRoutineAICommandAdapter implements IAIRoutineCommandPort {
  constructor(private readonly routine: RoutineCoachCommandPort) {}

  async createRoutine(input: AIRoutineCreateInput) {
    const created = await this.routine.createRoutine({
      identityId: input.context.identityId,
      ...(input.routineId === undefined ? {} : { routineId: input.routineId }),
      name: input.name,
      description: input.description,
      trigger: canonicalTrigger(input.trigger),
      profileIds: input.profileIds,
      at: input.context.startedAt,
    });
    return {
      kind: 'routine' as const,
      id: created.routineId,
      status: 'created',
      details: { name: created.name },
    };
  }

  async setProfileActive(input: Parameters<IAIRoutineCommandPort['setProfileActive']>[0]) {
    const receipt = await this.routine.setProfileActive({
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
  }

  async setTemporaryOverride(input: Parameters<IAIRoutineCommandPort['setTemporaryOverride']>[0]) {
    const receipt = await this.routine.setTemporaryOverride({
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
  }

  async clearTemporaryOverride(
    input: Parameters<IAIRoutineCommandPort['clearTemporaryOverride']>[0],
  ) {
    const receipt = await this.routine.clearTemporaryOverride({
      identityId: input.context.identityId,
      routineId: input.routineId,
    });
    return { kind: 'override' as const, id: receipt.routineId, status: 'cleared' };
  }

  async startProtocol(input: Parameters<IAIRoutineCommandPort['startProtocol']>[0]) {
    const receipt = await this.routine.startPresetProtocol({
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
  }

  async transitionProtocol(input: Parameters<IAIRoutineCommandPort['transitionProtocol']>[0]) {
    const receipt = await this.routine.transitionProtocol({
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
  }
}
