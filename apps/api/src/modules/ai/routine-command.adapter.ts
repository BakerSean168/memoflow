import { unwrap } from '@memoflow/contracts/result';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import {
  NotificationChannel,
  ReminderType,
  TriggerType,
  type CreateReminderTemplateReq,
} from '@memoflow/contracts/reminder';
import type { IAIRoutineCommandPort, AIRoutineCreateInput } from '@memoflow/ai';
import type { ReminderApplicationPort } from '@memoflow/reminder';
import type { RoutineCoachCommandPort } from '@memoflow/reminder/routine-runtime';
import {
  getRoutineMethodTemplatePreset,
  type RoutineMethodId,
} from '@memoflow/reminder/method-library';

/** Host adapter: AI commands terminate at Reminder-owned application/runtime seams. */
export class RoutineAICommandAdapter implements IAIRoutineCommandPort {
  constructor(
    private readonly reminder: ReminderApplicationPort,
    private readonly routine: RoutineCoachCommandPort,
  ) {}

  async createRoutine(input: AIRoutineCreateInput) {
    const preset = input.methodId
      ? getRoutineMethodTemplatePreset(input.methodId as RoutineMethodId)
      : null;
    if (input.methodId && !preset) {
      throw new TypeError(`Protocol method '${input.methodId}' must use routine_start_protocol`);
    }
    const trigger = input.trigger ?? preset?.trigger;
    if (!trigger) throw new TypeError('Routine creation requires a WallClock method or explicit trigger');
    const request: CreateReminderTemplateReq = {
      title: input.title,
      description: input.description ?? preset?.description,
      type: ReminderType.Recurring,
      trigger: trigger.type === 'Interval'
        ? {
            type: TriggerType.Interval,
            fixedTime: null,
            interval: { minutes: trigger.intervalMinutes, startTime: null },
          }
        : {
            type: TriggerType.FixedTime,
            fixedTime: { time: trigger.fixedTime, timezone: null },
            interval: null,
          },
      activeTime: { activatedAt: input.context.startedAt || Date.now() },
      notificationConfig: {
        channels: [NotificationChannel.InApp],
        title: null,
        body: null,
        sound: null,
        vibration: null,
        actions: null,
      },
      importanceLevel: preset?.importanceLevel === 'Important'
        ? ImportanceLevel.Important
        : ImportanceLevel.Moderate,
      tags: preset ? [...preset.tags] : [],
      icon: preset?.icon ?? 'mdi-bell-outline',
      ...(input.profileIds ? { profileIds: input.profileIds as CreateReminderTemplateReq['profileIds'] } : {}),
    };
    const created = unwrap(await this.reminder.createTemplate(request, input.context));
    return {
      kind: 'routine' as const,
      id: String(created.id),
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
    return { kind: 'profile' as const, id: receipt.profileId, status: receipt.active ? 'active' : 'inactive' };
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

  async clearTemporaryOverride(input: Parameters<IAIRoutineCommandPort['clearTemporaryOverride']>[0]) {
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
      at: Date.now(),
    });
    return {
      kind: 'protocol' as const,
      id: receipt.sessionId,
      status: receipt.state,
      details: { phaseKey: receipt.phaseKey },
    };
  }
}
