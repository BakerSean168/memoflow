import { describe, expect, it, vi } from 'vitest';
import type {
  ScheduledHandlerResult,
  ScheduledInvocationContext,
} from '@memoflow/contracts/schedule';
import { parseIdempotencyKeyString } from '@memoflow/contracts/reliable-messaging';
import type { NotificationRequestedWriterPort } from '@memoflow/contracts/notification';
import {
  createTaskReminderScheduledHandlerRegistration,
  buildTaskReminderOperationId,
} from '../task-reminder-fire.handler';
import { TASK_REMINDER_HANDLER_KEY, TASK_REMINDER_PAYLOAD_VERSION } from '../schedule-projection-source';

const IDENTITY = 'IdentityId_task-owner';
const INSTANCE_ID = 'TaskOccurrenceId_instance-1';
const TEMPLATE_ID = 'TaskPlanId_template-1';
const SCHEDULING_KEY = 'sk:v1:3:task.reminder:6:TaskOccurrenceId_instance-1:16:relative:15:Minutes';

function createPayload(overrides: Record<string, unknown> = {}) {
  return {
    templateId: TEMPLATE_ID,
    instanceId: INSTANCE_ID,
    occurrenceKey: null,
    taskTitle: 'Write Tests',
    reminderType: 'Relative',
    reminderValue: 15,
    reminderUnit: 'Minutes',
    reminderAbsoluteTime: null,
    anchorTime: 1_703_000_000_000,
    reminderTime: 1_703_000_000_000 - 15 * 60_000,
    ...overrides,
  };
}

function createContext(overrides: Partial<ScheduledInvocationContext> = {}): ScheduledInvocationContext {
  return {
    identityId: IDENTITY,
    owner: { identityId: IDENTITY, type: 'task.template', id: TEMPLATE_ID },
    schedulingKey: SCHEDULING_KEY,
    handlerKey: TASK_REMINDER_HANDLER_KEY,
    runAt: '2030-01-10T08:30:00.000Z',
    payloadVersion: TASK_REMINDER_PAYLOAD_VERSION,
    payload: createPayload(),
    ...overrides,
  };
}

function createInstance(overrides: Record<string, unknown> = {}) {
  return {
    id: INSTANCE_ID,
    identityId: IDENTITY,
    templateId: TEMPLATE_ID,
    occurrenceKey: null,
    status: 'Pending',
    deletedAt: null,
    ...overrides,
  };
}

function createTemplate(overrides: Record<string, unknown> = {}) {
  return {
    toServerDTO: vi.fn().mockReturnValue({
      id: TEMPLATE_ID,
      name: 'Write Tests',
      status: 'Active',
      deletedAt: null,
      reminderConfig: {
        enabled: true,
        triggers: [{ type: 'Relative', relativeValue: 15, relativeUnit: 'Minutes', absoluteTime: null }],
      },
      ...overrides,
    }),
  };
}

function createWriter() {
  const enqueueNotificationRequested = vi
    .fn()
    .mockImplementation(async (input: { operationId: string }) => ({
      operationId: input.operationId,
      status: 'succeeded',
    }));
  return { enqueueNotificationRequested };
}

function createDeps(writerRet: ReturnType<typeof createWriter>, instanceRet: unknown, templateRet: unknown) {
  return {
    taskOccurrenceRepository: {
      findByIdForIdentity: vi.fn().mockResolvedValue(instanceRet),
    },
    taskPlanRepository: {
      findByIdForIdentity: vi.fn().mockResolvedValue(templateRet),
    },
    notificationRequestedWriter: writerRet as unknown as NotificationRequestedWriterPort,
  };
}

describe('createTaskReminderScheduledHandlerRegistration', () => {
  it('exposes the canonical handler key and payload version', () => {
    const registration = createTaskReminderScheduledHandlerRegistration(createDeps(createWriter(), createInstance(), createTemplate()));
    expect(registration.handlerKey).toBe(TASK_REMINDER_HANDLER_KEY);
    expect(registration.payloadVersion).toBe(TASK_REMINDER_PAYLOAD_VERSION);
  });

  it('enqueues a durable NotificationRequested envelope aligned with the canonical idempotency key', async () => {
    const writer = createWriter();
    const registration = createTaskReminderScheduledHandlerRegistration(
      createDeps(writer, createInstance(), createTemplate()),
    );
    const result = (await registration.handler.execute(createContext())) as Extract<
      ScheduledHandlerResult,
      { status: 'succeeded' }
    >;

    expect(result.status).toBe('succeeded');
    expect(writer.enqueueNotificationRequested).toHaveBeenCalledTimes(1);
    const input = writer.enqueueNotificationRequested.mock.calls[0]![0];
    expect(input.operationId).toBe(buildTaskReminderOperationId(SCHEDULING_KEY));
    expect(input.correlationId).toBe(SCHEDULING_KEY);
    expect(input.causationId).toBe(SCHEDULING_KEY);

    const envelope = input.envelope;
    expect(envelope.identityId).toBe(IDENTITY);
    expect(envelope.source).toBe('task');
    expect(envelope.occurrenceKey).toBe(SCHEDULING_KEY);
    expect(envelope.workflowKey).toBe('task.reminder');
    expect(envelope.topic).toBe('task.reminder');
    expect(envelope.relatedEntity).toEqual({ type: 'Task', id: INSTANCE_ID });
    expect(envelope.content).toEqual({
      title: '任务提醒：Write Tests',
      content: '任务「Write Tests」的提前 15Minutes 提醒已到达。',
      type: 'Reminder',
      category: 'Task',
    });
    expect(envelope.suggestedChannels).toEqual(['InApp', 'Push']);
    expect(envelope.correlationId).toBe(SCHEDULING_KEY);
    expect(envelope.causationId).toBe(SCHEDULING_KEY);

    const parsed = parseIdempotencyKeyString(envelope.idempotencyKey);
    expect(parsed).toEqual({ identityId: IDENTITY, source: 'task', occurrenceKey: SCHEDULING_KEY });
  });

  it('uses the absolute-time wording when the reminder is not relative', async () => {
    const writer = createWriter();
    const registration = createTaskReminderScheduledHandlerRegistration(
      createDeps(
        writer,
        createInstance(),
        createTemplate({
          reminderConfig: {
            enabled: true,
            triggers: [
              { type: 'Absolute', absoluteTime: 1_703_000_000_000, relativeValue: null, relativeUnit: null },
            ],
          },
        }),
      ),
    );
    await registration.handler.execute(
      createContext({
        payload: createPayload({
          reminderType: 'Absolute',
          reminderValue: null,
          reminderUnit: null,
          reminderAbsoluteTime: 1_703_000_000_000,
        }),
      }),
    );
    const envelope = writer.enqueueNotificationRequested.mock.calls[0]![0].envelope;
    expect(envelope.content.content).toBe('任务「Write Tests」已到达提醒时间。');
  });

  it('skips when the instance no longer exists', async () => {
    const writer = createWriter();
    const registration = createTaskReminderScheduledHandlerRegistration(
      createDeps(writer, null, createTemplate()),
    );
    const result = await registration.handler.execute(createContext());
    expect(result).toMatchObject({ status: 'skipped', reason: 'TASK_INSTANCE_NOT_FOUND' });
    expect(writer.enqueueNotificationRequested).not.toHaveBeenCalled();
  });

  it('skips a deleted instance', async () => {
    const writer = createWriter();
    const registration = createTaskReminderScheduledHandlerRegistration(
      createDeps(writer, createInstance({ deletedAt: '2030-01-10T09:00:00.000Z' }), createTemplate()),
    );
    const result = await registration.handler.execute(createContext());
    expect(result).toMatchObject({ status: 'skipped', reason: 'TASK_INSTANCE_UNAVAILABLE' });
    expect(writer.enqueueNotificationRequested).not.toHaveBeenCalled();
  });

  it('skips a completed or skipped instance', async () => {
    for (const status of ['Completed', 'Skipped', 'Missed']) {
      const writer = createWriter();
      const registration = createTaskReminderScheduledHandlerRegistration(
        createDeps(writer, createInstance({ status }), createTemplate()),
      );
      const result = await registration.handler.execute(createContext());
      expect(result).toMatchObject({ status: 'skipped', reason: 'TASK_INSTANCE_UNAVAILABLE', result: { status } });
      expect(writer.enqueueNotificationRequested).not.toHaveBeenCalled();
    }
  });

  it('skips a stale occurrence recurrence mismatch', async () => {
    const writer = createWriter();
    const registration = createTaskReminderScheduledHandlerRegistration(
      createDeps(
        writer,
        createInstance({ occurrenceKey: 'sk:v1:4:task:o:2-2' }),
        createTemplate(),
      ),
    );
    const result = await registration.handler.execute(
      createContext({ payload: createPayload({ occurrenceKey: 'sk:v1:4:task:o:1-1' }) }),
    );
    expect(result).toMatchObject({ status: 'skipped', reason: 'TASK_OCCURRENCE_STALE' });
    expect(writer.enqueueNotificationRequested).not.toHaveBeenCalled();
  });

  it('skips when the template no longer exists', async () => {
    const writer = createWriter();
    const registration = createTaskReminderScheduledHandlerRegistration(
      createDeps(writer, createInstance(), null),
    );
    const result = await registration.handler.execute(createContext());
    expect(result).toMatchObject({ status: 'skipped', reason: 'TASK_TEMPLATE_UNAVAILABLE' });
    expect(writer.enqueueNotificationRequested).not.toHaveBeenCalled();
  });

  it('skips when the template is deleted', async () => {
    const writer = createWriter();
    const registration = createTaskReminderScheduledHandlerRegistration(
      createDeps(writer, createInstance(), createTemplate({ deletedAt: '2030-01-09T00:00:00.000Z' })),
    );
    const result = await registration.handler.execute(createContext());
    expect(result).toMatchObject({ status: 'skipped', reason: 'TASK_TEMPLATE_UNAVAILABLE' });
    expect(writer.enqueueNotificationRequested).not.toHaveBeenCalled();
  });

  it('skips when the template is not Active', async () => {
    const writer = createWriter();
    const registration = createTaskReminderScheduledHandlerRegistration(
      createDeps(writer, createInstance(), createTemplate({ status: 'Paused' })),
    );
    const result = await registration.handler.execute(createContext());
    expect(result).toMatchObject({ status: 'skipped', reason: 'TASK_TEMPLATE_UNAVAILABLE' });
    expect(writer.enqueueNotificationRequested).not.toHaveBeenCalled();
  });

  it('skips when the template reminders are disabled or empty', async () => {
    for (const reminderConfig of [{ enabled: false }, { enabled: true, triggers: [] }]) {
      const writer = createWriter();
      const registration = createTaskReminderScheduledHandlerRegistration(
        createDeps(writer, createInstance(), createTemplate({ reminderConfig })),
      );
      const result = await registration.handler.execute(createContext());
      expect(result).toMatchObject({ status: 'skipped', reason: 'TASK_TEMPLATE_UNAVAILABLE' });
      expect(writer.enqueueNotificationRequested).not.toHaveBeenCalled();
    }
  });

  it('skips when the relative trigger value/unit changed since scheduling', async () => {
    const writer = createWriter();
    const registration = createTaskReminderScheduledHandlerRegistration(
      createDeps(
        writer,
        createInstance(),
        createTemplate({
          reminderConfig: {
            enabled: true,
            triggers: [{ type: 'Relative', relativeValue: 30, relativeUnit: 'Minutes', absoluteTime: null }],
          },
        }),
      ),
    );
    const result = await registration.handler.execute(
      createContext({ payload: createPayload({ reminderValue: 15, reminderUnit: 'Minutes' }) }),
    );
    expect(result).toMatchObject({ status: 'skipped', reason: 'TASK_REMINDER_CONFIG_STALE' });
    expect(writer.enqueueNotificationRequested).not.toHaveBeenCalled();
  });

  it('skips when the reminder type changed since scheduling', async () => {
    const writer = createWriter();
    const registration = createTaskReminderScheduledHandlerRegistration(
      createDeps(writer, createInstance(), createTemplate()),
    );
    const result = await registration.handler.execute(
      createContext({
        payload: createPayload({
          reminderType: 'Absolute',
          reminderValue: null,
          reminderUnit: null,
          reminderAbsoluteTime: 1_704_000_000_000,
        }),
      }),
    );
    expect(result).toMatchObject({ status: 'skipped', reason: 'TASK_REMINDER_CONFIG_STALE' });
    expect(writer.enqueueNotificationRequested).not.toHaveBeenCalled();
  });

  it('skips when the absolute reminder time changed since scheduling', async () => {
    const writer = createWriter();
    const registration = createTaskReminderScheduledHandlerRegistration(
      createDeps(
        writer,
        createInstance(),
        createTemplate({
          reminderConfig: {
            enabled: true,
            triggers: [
              { type: 'Absolute', absoluteTime: 1_705_000_000_000, relativeValue: null, relativeUnit: null },
            ],
          },
        }),
      ),
    );
    const result = await registration.handler.execute(
      createContext({
        payload: createPayload({
          reminderType: 'Absolute',
          reminderValue: null,
          reminderUnit: null,
          reminderAbsoluteTime: 1_704_000_000_000,
        }),
      }),
    );
    expect(result).toMatchObject({ status: 'skipped', reason: 'TASK_REMINDER_CONFIG_STALE' });
    expect(writer.enqueueNotificationRequested).not.toHaveBeenCalled();
  });

  it('fires an absolute reminder aligned with the current template trigger', async () => {
    const writer = createWriter();
    const registration = createTaskReminderScheduledHandlerRegistration(
      createDeps(
        writer,
        createInstance(),
        createTemplate({
          reminderConfig: {
            enabled: true,
            triggers: [
              { type: 'Absolute', absoluteTime: 1_704_000_000_000, relativeValue: null, relativeUnit: null },
            ],
          },
        }),
      ),
    );
    const result = await registration.handler.execute(
      createContext({
        payload: createPayload({
          reminderType: 'Absolute',
          reminderValue: null,
          reminderUnit: null,
          reminderAbsoluteTime: 1_704_000_000_000,
        }),
      }),
    );
    expect(result).toMatchObject({ status: 'succeeded' });
    expect(writer.enqueueNotificationRequested).toHaveBeenCalledTimes(1);
  });

  it('skips when the payload occurrence is null but the instance moved to a newer occurrence', async () => {
    const writer = createWriter();
    const instanceOccurrence = 'sk:v1:4:task:o:2-1';
    const registration = createTaskReminderScheduledHandlerRegistration(
      createDeps(
        writer,
        createInstance({ occurrenceKey: instanceOccurrence }),
        createTemplate(),
      ),
    );
    const result = await registration.handler.execute(
      createContext({ payload: createPayload({ occurrenceKey: null }) }),
    );
    expect(result).toMatchObject({
      status: 'skipped',
      reason: 'TASK_OCCURRENCE_STALE',
      result: { staleOccurrence: null, currentOccurrence: instanceOccurrence },
    });
    expect(writer.enqueueNotificationRequested).not.toHaveBeenCalled();
  });

  it('skips when the payload pins an occurrence the instance no longer carries (drifted back to base)', async () => {
    const writer = createWriter();
    const staleOccurrence = 'sk:v1:4:task:o:1-1';
    const registration = createTaskReminderScheduledHandlerRegistration(
      createDeps(
        writer,
        createInstance({ occurrenceKey: null }),
        createTemplate(),
      ),
    );
    const result = await registration.handler.execute(
      createContext({ payload: createPayload({ occurrenceKey: staleOccurrence }) }),
    );
    expect(result).toMatchObject({
      status: 'skipped',
      reason: 'TASK_OCCURRENCE_STALE',
      result: { staleOccurrence, currentOccurrence: null },
    });
    expect(writer.enqueueNotificationRequested).not.toHaveBeenCalled();
  });

  it('supports a fireable instance that carries its own new occurrence key', async () => {
    const writer = createWriter();
    const occurrenceKey = 'sk:v1:4:task:o:3-1';
    const registration = createTaskReminderScheduledHandlerRegistration(
      createDeps(
        writer,
        createInstance({ occurrenceKey }),
        createTemplate(),
      ),
    );
    const result = await registration.handler.execute(
      createContext({ payload: createPayload({ occurrenceKey }) }),
    );
    expect(result).toMatchObject({ status: 'succeeded' });
    expect(writer.enqueueNotificationRequested).toHaveBeenCalledTimes(1);
  });

  it('propagates writer technical failures so the registry can retry', async () => {
    const writer = createWriter();
    writer.enqueueNotificationRequested.mockRejectedValueOnce(new Error('outbox unavailable'));
    const registration = createTaskReminderScheduledHandlerRegistration(
      createDeps(writer, createInstance(), createTemplate()),
    );
    await expect(registration.handler.execute(createContext())).rejects.toThrow('outbox unavailable');
  });

  it('propagates repository technical failures as retryable', async () => {
    const writer = createWriter();
    const deps = createDeps(writer, createInstance(), createTemplate());
    deps.taskOccurrenceRepository.findByIdForIdentity.mockRejectedValueOnce(new Error('db down'));
    const registration = createTaskReminderScheduledHandlerRegistration(deps);
    await expect(registration.handler.execute(createContext())).rejects.toThrow('db down');
  });

  it('validates the versioned payload', () => {
    const registration = createTaskReminderScheduledHandlerRegistration(createDeps(createWriter(), createInstance(), createTemplate()));
    expect(() => registration.validatePayload(createPayload())).not.toThrow();
    expect(() => registration.validatePayload({ ...createPayload(), instanceId: '' })).toThrow();
    expect(() => registration.validatePayload({ ...createPayload(), reminderUnit: 'not-a-unit' })).toThrow();
  });

  it('derives deterministic operation ids from the scheduling key', () => {
    expect(buildTaskReminderOperationId('sk:v1:1:a')).toBe(buildTaskReminderOperationId('sk:v1:1:a'));
    expect(buildTaskReminderOperationId('sk:v1:1:a')).toContain('task-reminder:');
  });
});