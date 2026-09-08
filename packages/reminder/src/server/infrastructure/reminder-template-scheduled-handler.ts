import { z } from 'zod';
import type {
  ScheduledHandlerRegistration,
  ScheduledHandlerResult,
} from '@memoflow/contracts/schedule';
import type { ReminderScheduleExecutionSource } from '../../schedule-execution';
import {
  REMINDER_TEMPLATE_HANDLER_KEY,
  REMINDER_TEMPLATE_PAYLOAD_VERSION,
  type ReminderTemplateScheduledPayload,
} from './schedule-projection-source';

export const ReminderTemplateScheduledPayloadSchema = z.object({
  templateId: z.string().min(1),
  scheduledFor: z.number().int().nonnegative(),
});

export function createReminderTemplateScheduledHandlerRegistration(deps: {
  readonly executionSource: ReminderScheduleExecutionSource;
}): ScheduledHandlerRegistration<ReminderTemplateScheduledPayload> {
  return {
    handlerKey: REMINDER_TEMPLATE_HANDLER_KEY,
    payloadVersion: REMINDER_TEMPLATE_PAYLOAD_VERSION,
    validatePayload(payload: unknown) {
      return ReminderTemplateScheduledPayloadSchema.parse(payload);
    },
    handler: {
      async execute(context): Promise<ScheduledHandlerResult> {
        const outcome = await deps.executionSource.executeReminder({
          identityId: context.identityId,
          sourceEntityId: context.payload.templateId,
          nextRunAt: new Date(context.payload.scheduledFor),
        });
        const result = outcome.result ?? {};
        if (result.skipped === true) {
          return {
            status: 'skipped',
            reason: typeof result.reason === 'string' ? result.reason : 'REMINDER_NOT_FIREABLE',
            result: {
              ...result,
              nextTriggerAt: outcome.nextRunAt ?? null,
            },
          };
        }
        return {
          status: 'succeeded',
          result: {
            ...result,
            nextTriggerAt: outcome.nextRunAt ?? null,
          },
        };
      },
    },
  };
}
