import {
  asInstant,
  createTimeContext,
  createTimeFacade,
  type UserTimeContextPort,
} from '@memoflow/time';
import type { IAIRoutineCommandPort, AIRoutineCreateInput } from '@memoflow/ai';
import { createElapsedTrigger, createWallClockTrigger } from '@memoflow/reminder/server';
import type { RoutineCoachCommandPort } from '@memoflow/reminder/routine-runtime';
import {
  getRoutineMethodTemplatePreset,
  type RoutineMethodId,
} from '@memoflow/reminder/method-library';

function canonicalTrigger(input: AIRoutineCreateInput['trigger'], at: number, timeZone: string) {
  if (!input) return null;
  if (input.type === 'Interval') {
    return createElapsedTrigger({
      durationMs: input.intervalMinutes * 60_000,
      anchor: 'routine-activation',
    });
  }
  const startDate = createTimeFacade({
    context: createTimeContext({ timeZone, weekStartsOn: 1 }),
  }).calendar.toYmd(asInstant(at));
  return createWallClockTrigger({
    localTime: input.fixedTime,
    timeZone,
    recurrence: { startDate, frequency: 'daily' },
  });
}

/** Host adapter: AI commands terminate at Reminder-owned application/runtime seams. */
export class DesktopRoutineAICommandAdapter implements IAIRoutineCommandPort {
  constructor(
    private readonly routine: RoutineCoachCommandPort,
    private readonly userTimeContextPort: UserTimeContextPort,
  ) {}

  async createRoutine(input: AIRoutineCreateInput) {
    const preset = input.methodId
      ? getRoutineMethodTemplatePreset(input.methodId as RoutineMethodId)
      : null;
    if (input.methodId && !preset) {
      throw new TypeError(`Protocol method '${input.methodId}' must use routine_start_protocol`);
    }
    const trigger = input.trigger ?? preset?.trigger;
    if (!trigger) throw new TypeError('Routine creation requires a method or explicit trigger');
    const timeContext = await this.userTimeContextPort.getUserTimeContext(input.context.identityId);
    const created = await this.routine.createRoutine({
      identityId: input.context.identityId,
      name: input.title,
      description: input.description ?? preset?.description,
      trigger: canonicalTrigger(trigger, input.context.startedAt, timeContext.timeZone),
      profileIds: input.profileIds,
      at: input.context.startedAt,
    });
    return {
      kind: 'routine' as const,
      id: created.routineId,
      status: 'created',
      details: { title: created.name },
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
