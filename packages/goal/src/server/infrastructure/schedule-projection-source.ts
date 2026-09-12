import type {
  GoalEventMap,
  GoalServerDTO,
  GoalTimeframe,
  ReminderTrigger,
} from '@memoflow/contracts/goal';
import {
  GoalStatus,
  ReminderTriggerType,
  goalTimeframeEndBoundary,
} from '@memoflow/contracts/goal';
import type { Ymd } from '@memoflow/contracts/primitives';
import type { ScheduledIntent, SchedulingOwner } from '@memoflow/contracts/schedule';
import { buildSchedulingKey } from '@memoflow/contracts/schedule';
import {
  addYmdDays,
  createTimeFacade,
  type TimeFacade,
  type UserTimeContextPort,
} from '@memoflow/time';
import type { IGoalRepository } from '../domain';

export const GOAL_REMINDER_HANDLER_KEY = 'goal.reminder.fire';
export const GOAL_REMINDER_PAYLOAD_VERSION = 2;
export const GOAL_SCHEDULING_OWNER_TYPE = 'goal.goal';

export interface GoalReminderScheduledPayload {
  readonly goalId: string;
  readonly goalTitle: string;
  readonly triggerType: ReminderTriggerType;
  readonly triggerValue: number;
  readonly startDate: Ymd | null;
  readonly target: GoalTimeframe | null;
  readonly reminderTime: number;
}

/**
 * Residual 1177 keep-boundary: goal schedule-projection buildIntentName — Goal + ReminderTrigger domain.
 * RemainingDays / TimeProgressPercentage wording; not task template Relative/Absolute naming.
 * Soft residual 1177: task schedule-projection buildIntentName stays template+trigger domain-specific (no force-merge).
 */
function buildIntentName(goal: GoalServerDTO, trigger: ReminderTrigger): string {
  if (trigger.type === ReminderTriggerType.RemainingDays) {
    return `${goal.name} · 剩余 ${trigger.value} 天提醒`;
  }
  return `${goal.name} · 进度 ${trigger.value}% 提醒`;
}

function shouldScheduleGoal(goal: GoalServerDTO): boolean {
  return (
    goal.status === GoalStatus.InProgress &&
    !goal.archivedAt &&
    !goal.completedAt &&
    !goal.deletedAt &&
    !!goal.reminderConfig?.enabled &&
    goal.reminderConfig.triggers.some((trigger) => trigger.enabled)
  );
}

/** Product Time semantics: reminders are derived from calendar-native planning dates. */
function calculateTriggerAt(
  goal: GoalServerDTO,
  trigger: ReminderTrigger,
  time: TimeFacade,
): number | null {
  if (!goal.target) return null;
  const targetEnd = goalTimeframeEndBoundary(goal.target);

  if (trigger.type === ReminderTriggerType.RemainingDays) {
    return time.codec.startOfYmd(addYmdDays(targetEnd, -trigger.value));
  }

  if (trigger.type === ReminderTriggerType.TimeProgressPercentage) {
    if (!goal.startDate) return null;
    const startAt = time.codec.startOfYmd(goal.startDate);
    const targetEndAt = time.codec.startOfYmd(targetEnd);
    if (targetEndAt <= startAt) return null;
    const totalCalendarDays = time.calendar.diffCalendarDays(targetEndAt, startAt);
    const offsetDays = Math.round(totalCalendarDays * (trigger.value / 100));
    return time.calendar.addDays(startAt, offsetDays);
  }

  return null;
}

function goalOwner(goalId: string, identityId: string): SchedulingOwner {
  return { identityId, type: GOAL_SCHEDULING_OWNER_TYPE, id: goalId };
}

function reminderIdentity(trigger: ReminderTrigger): string {
  if (trigger.type === ReminderTriggerType.RemainingDays) {
    return `remaining:${String(trigger.value)}`;
  }
  return `progress:${String(trigger.value)}`;
}

export interface GoalScheduleProjectionPlan {
  readonly owner: SchedulingOwner;
  readonly desired: readonly ScheduledIntent<GoalReminderScheduledPayload>[];
}

export interface GoalScheduleProjectionSource {
  buildGoalPlan(goalId: string, identityId: string): Promise<GoalScheduleProjectionPlan>;
  buildGoalOwner(goalId: string, identityId: string): SchedulingOwner;
  /** Full source scan used by startup reconcile / lost-event repair. */
  listGoalRefs(): Promise<Array<{ goalId: string; identityId: string }>>;
}

export interface GoalScheduleProjectionHandlers {
  upsertGoal(goalId: string, identityId: string): Promise<void>;
  deleteGoal(goalId: string, identityId: string): Promise<void>;
}

export type GoalScheduleProjectionEventMap = Pick<
  GoalEventMap,
  | 'goal:created'
  | 'goal:updated'
  | 'goal:schedule-time-changed'
  | 'goal:reminder-config-changed'
  | 'goal:completed'
  | 'goal:archived'
  | 'goal:deleted'
>;

export const goalScheduleProjectionEventNames = [
  'goal:created',
  'goal:updated',
  'goal:schedule-time-changed',
  'goal:reminder-config-changed',
  'goal:completed',
  'goal:archived',
  'goal:deleted',
] as const satisfies readonly (keyof GoalScheduleProjectionEventMap)[];

export function createGoalScheduleProjectionSource(deps: {
  goalRepository: IGoalRepository;
  userTimeContextPort: UserTimeContextPort;
}): GoalScheduleProjectionSource {
  return {
    buildGoalOwner(goalId, identityId) {
      return goalOwner(goalId, identityId);
    },

    async listGoalRefs() {
      const refs = await deps.goalRepository.findAllGoalRefs();
      return refs.map((ref) => ({ goalId: ref.id, identityId: ref.identityId }));
    },

    async buildGoalPlan(goalId, identityId) {
      const owner = goalOwner(goalId, identityId);
      const time = createTimeFacade({
        context: await deps.userTimeContextPort.getUserTimeContext(identityId),
      });
      const goal = await deps.goalRepository.findByIdForIdentity(identityId, goalId, {
        includeChildren: true,
      });
      if (!goal) {
        return { owner, desired: [] };
      }

      const goalDTO = goal.toServerDTO(true);
      const canonicalOwner = goalOwner(goalId, String(goalDTO.identityId));
      if (!shouldScheduleGoal(goalDTO) || !goalDTO.reminderConfig) {
        return { owner: canonicalOwner, desired: [] };
      }

      const now = time.now();
      const desiredByKey = new Map<string, ScheduledIntent<GoalReminderScheduledPayload>>();

      for (const trigger of goalDTO.reminderConfig.triggers.filter((item) => item.enabled)) {
        const triggerAt = calculateTriggerAt(goalDTO, trigger, time);
        if (triggerAt === null || triggerAt <= now) {
          continue;
        }

        // Stable identity derives from goal + trigger so repeated projection
        // yields one invocation per enabled reminder regardless of churn.
        const schedulingKey = buildSchedulingKey(
          'goal.reminder',
          goalDTO.id,
          reminderIdentity(trigger),
        );
        if (desiredByKey.has(schedulingKey)) {
          continue;
        }

        desiredByKey.set(schedulingKey, {
          schedulingKey,
          handlerKey: GOAL_REMINDER_HANDLER_KEY,
          runAt: triggerAt,
          payloadVersion: GOAL_REMINDER_PAYLOAD_VERSION,
          payload: {
            goalId: goalDTO.id,
            goalTitle: goalDTO.name,
            triggerType: trigger.type,
            triggerValue: trigger.value,
            startDate: goalDTO.startDate,
            target: goalDTO.target,
            reminderTime: triggerAt,
          },
          sourceRevision: String(goalDTO.version),
          priority: 'normal',
          timeoutMs: null,
          observability: {
            name: buildIntentName(goalDTO, trigger),
            tags: ['goal', 'goal-reminder', `goal:${goalDTO.id}`],
          },
        });
      }

      return { owner: canonicalOwner, desired: [...desiredByKey.values()] };
    },
  };
}

export function createGoalScheduleProjectionEventHandlers(
  handlers: GoalScheduleProjectionHandlers,
): {
  [K in keyof GoalScheduleProjectionEventMap]: (
    event: GoalScheduleProjectionEventMap[K],
  ) => Promise<void>;
} {
  return {
    'goal:created': async (event) => handlers.upsertGoal(event.goal.id, String(event.identityId)),
    'goal:updated': async (event) => handlers.upsertGoal(event.goal.id, String(event.identityId)),
    'goal:schedule-time-changed': async (event) =>
      handlers.upsertGoal(event.goal.id, String(event.identityId)),
    'goal:reminder-config-changed': async (event) =>
      handlers.upsertGoal(event.goal.id, String(event.identityId)),
    'goal:completed': async (event) => handlers.deleteGoal(event.goal.id, String(event.identityId)),
    'goal:archived': async (event) => handlers.deleteGoal(event.goal.id, String(event.identityId)),
    'goal:deleted': async (event) => handlers.deleteGoal(event.goal.id, String(event.identityId)),
  };
}
