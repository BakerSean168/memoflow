import type { SchedulingPort } from '@memoflow/contracts/schedule';
import {
  createReminderScheduleProjectionEventHandlers,
  type ReminderScheduleProjectionEventMap,
  type ReminderScheduleProjectionSource,
} from '@memoflow/reminder/schedule-projection';
import type { Subscriber } from '@memoflow/utils/domain';
import type { RuntimeContribution } from '../ports/runtime-contribution';
import { createReminderProjector } from '../projectors/reminder-projector';

export interface CreateReminderProjectionRuntimeDeps {
  readonly source: ReminderScheduleProjectionSource;
  readonly schedulingPort: SchedulingPort;
  readonly reminderEvents: Subscriber<ReminderScheduleProjectionEventMap>;
}

/**
 * Incremental Reminder projection. `reminder:triggered` is deliberately part of
 * the event map: the Reminder aggregate commits its nextTriggerAt and durable
 * NotificationRequested first, then this listener re-arms the next one-shot
 * Scheduler invocation from business truth.
 */
export function createReminderProjectionRuntime(
  deps: CreateReminderProjectionRuntimeDeps,
): RuntimeContribution {
  const projector = createReminderProjector({
    source: deps.source,
    schedulingPort: deps.schedulingPort,
  });
  const handlers = createReminderScheduleProjectionEventHandlers(projector);
  let started = false;

  const eventNames: readonly (keyof ReminderScheduleProjectionEventMap)[] = [
    'reminder:template-created',
    'reminder:template-updated',
    'reminder:template-enabled',
    'reminder:template-paused',
    'reminder:template-deleted',
    'reminder:template-eligibility-changed',
    'reminder:triggered',
  ];

  return {
    async start(): Promise<void> {
      if (started) return;
      for (const eventName of eventNames) {
        deps.reminderEvents.on(eventName, handlers[eventName] as never);
      }
      started = true;
    },

    async stop(): Promise<void> {
      if (!started) return;
      for (const eventName of eventNames) {
        deps.reminderEvents.off(eventName, handlers[eventName] as never);
      }
      started = false;
    },
  };
}
