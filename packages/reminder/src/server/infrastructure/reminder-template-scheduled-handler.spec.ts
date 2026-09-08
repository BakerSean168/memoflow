import { describe, expect, it, vi } from 'vitest';
import {
  REMINDER_SCHEDULING_OWNER_TYPE,
  REMINDER_TEMPLATE_HANDLER_KEY,
} from './schedule-projection-source';
import {
  ReminderTemplateScheduledPayloadSchema,
  createReminderTemplateScheduledHandlerRegistration,
} from './reminder-template-scheduled-handler';

const scheduledFor = Date.parse('2030-01-10T08:45:00.000Z');
const context = {
  identityId: 'IdentityId_reminder-owner',
  owner: {
    identityId: 'IdentityId_reminder-owner',
    type: REMINDER_SCHEDULING_OWNER_TYPE,
    id: 'ReminderTemplateId_template-1',
  },
  schedulingKey: 'sk:v1:test',
  handlerKey: REMINDER_TEMPLATE_HANDLER_KEY,
  runAt: scheduledFor,
  payloadVersion: 1,
  payload: { templateId: 'ReminderTemplateId_template-1', scheduledFor },
};

describe('Reminder template scheduled handler', () => {
  it('delegates to the Reminder-owned atomic execution source and succeeds one-shot', async () => {
    const executeReminder = vi.fn().mockResolvedValue({
      nextRunAt: scheduledFor + 60_000,
      result: { reminderId: 'ReminderTemplateId_template-1', notificationOperationId: 'op-1' },
    });
    const registration = createReminderTemplateScheduledHandlerRegistration({
      executionSource: { executeReminder },
    });

    await expect(registration.handler.execute(context)).resolves.toEqual({
      status: 'succeeded',
      result: {
        reminderId: 'ReminderTemplateId_template-1',
        notificationOperationId: 'op-1',
        nextTriggerAt: scheduledFor + 60_000,
      },
    });
    expect(executeReminder).toHaveBeenCalledWith({
      identityId: context.identityId,
      sourceEntityId: context.payload.templateId,
      nextRunAt: new Date(scheduledFor),
    });
  });

  it('maps a stale Reminder occurrence to skipped without replaying the business commit', async () => {
    const executeReminder = vi.fn().mockResolvedValue({
      nextRunAt: scheduledFor + 60_000,
      result: {
        skipped: true,
        reason: 'STALE_SCHEDULE_OCCURRENCE',
        reminderId: context.payload.templateId,
      },
    });
    const registration = createReminderTemplateScheduledHandlerRegistration({
      executionSource: { executeReminder },
    });

    await expect(registration.handler.execute(context)).resolves.toMatchObject({
      status: 'skipped',
      reason: 'STALE_SCHEDULE_OCCURRENCE',
    });
  });

  it('fails payload validation closed', () => {
    expect(() =>
      ReminderTemplateScheduledPayloadSchema.parse({
        templateId: '',
        scheduledFor: -1,
      }),
    ).toThrow();
  });
});
