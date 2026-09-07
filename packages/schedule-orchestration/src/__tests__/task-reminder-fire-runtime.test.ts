import { describe, expect, it, vi } from 'vitest';
import type { NotificationRequestedWriterPort } from '@memoflow/contracts/notification';
import {
  buildSchedulingKey,
  SourceModule,
} from '@memoflow/contracts/schedule';
import {
  createHandlerRegistryScheduleTaskSourceExecutor,
  ScheduledHandlerRegistry,
  ScheduleTask,
  type ScheduleTaskExecutionResult,
} from '@memoflow/scheduler';
import type { TaskReminderScheduledPayload } from '@memoflow/task/schedule-projection';
import { createTaskReminderScheduledHandlerRegistration } from '@memoflow/task/schedule-execution';

const IDENTITY = 'IdentityId_task-owner';
const TEMPLATE_ID = 'TaskTemplateId_template';
const INSTANCE_ID = 'TaskInstanceId_instance-1';
const OCCURRENCE_KEY = 'TaskTemplateId_template:2030-01-10';
const SINGLE_REMINDER_KEY = buildSchedulingKey('task.reminder', OCCURRENCE_KEY, 'relative:30:Minutes');
const REMINDER_AT = Date.UTC(2030, 0, 10, 13, 30);
const ANCHOR_AT = Date.UTC(2030, 0, 10, 14);

function payload(): TaskReminderScheduledPayload {
  return {
    templateId: TEMPLATE_ID,
    instanceId: INSTANCE_ID,
    occurrenceKey: OCCURRENCE_KEY,
    taskTitle: 'Exercise 30 minutes',
    reminderType: 'Relative',
    reminderValue: 30,
    reminderUnit: 'Minutes',
    reminderAbsoluteTime: null,
    anchorTime: ANCHOR_AT,
    reminderTime: REMINDER_AT,
  };
}

/**
 * Fixture D: one-time Task at 14:00 with a relative −30m reminder. The
 * projection persists a single neutral scheduling envelope (TASK-3101); this
 * test drives the exact persisted document shape through the
 * registry -> ScheduleTaskSourceExecutor -> task.reminder.fire handler.
 */
function fixtureTask(): ScheduleTask {
  return ScheduleTask.create({
    identityId: IDENTITY,
    name: 'Exercise 30 minutes · 提前 30Minutes 提醒',
    sourceModule: SourceModule.Task,
    sourceEntityId: INSTANCE_ID,
    schedule: {
      cronExpression: null,
      timezone: 'UTC',
      startDate: new Date(REMINDER_AT).toISOString(),
      endDate: null,
      maxExecutions: null,
    },
    metadata: {
      payload: {
        __memoflowScheduling: {
          schemaVersion: 1,
          ownerType: 'task.template',
          ownerId: TEMPLATE_ID,
          schedulingKey: SINGLE_REMINDER_KEY,
          handlerKey: 'task.reminder.fire',
          originalRunAt: REMINDER_AT,
          payloadVersion: 1,
          sourceRevision: '1:1',
          fingerprint: 'fixture-d:1',
        },
        payload: payload(),
      },
      tags: ['scheduling:v1', 'task'],
      priority: 'Normal',
      timeout: null,
    },
  });
}

function createInstance(overrides: Record<string, unknown> = {}) {
  return {
    id: INSTANCE_ID,
    identityId: IDENTITY,
    templateId: TEMPLATE_ID,
    occurrenceKey: OCCURRENCE_KEY,
    status: 'Pending',
    deletedAt: null,
    ...overrides,
  };
}

function createTemplate(overrides: Record<string, unknown> = {}) {
  return {
    toServerDTO: vi.fn().mockReturnValue({
      id: TEMPLATE_ID,
      name: 'Exercise 30 minutes',
      status: 'Active',
      deletedAt: null,
      reminderConfig: {
        enabled: true,
        triggers: [{ type: 'Relative', relativeValue: 30, relativeUnit: 'Minutes', absoluteTime: null }],
      },
      ...overrides,
    }),
  };
}

interface DurableWriterHarness {
  writer: NotificationRequestedWriterPort;
  enqueueNotificationRequested: ReturnType<typeof vi.fn>;
  rows: Map<string, { operationId: string; idempotencyKey: string }>;
}

/**
 * Emulates the shared outbox idempotency guarantee: the durable row is keyed
 * by the canonical idempotencyKey, so repeated executions collapse onto the
 * same receipt (crash-replay safe).
 */
function createDurableWriterHarness(): DurableWriterHarness {
  const rows = new Map<string, { operationId: string; idempotencyKey: string }>();
  const enqueueNotificationRequested = vi.fn().mockImplementation(
    async (input: { operationId: string; envelope: { idempotencyKey: string } }) => {
      const existing = rows.get(input.envelope.idempotencyKey);
      if (existing) {
        return { ...existing, status: 'succeeded', identityId: IDENTITY };
      }
      const row = {
        operationId: input.operationId,
        idempotencyKey: input.envelope.idempotencyKey,
      };
      rows.set(input.envelope.idempotencyKey, row);
      return { ...row, status: 'succeeded', identityId: IDENTITY };
    },
  );
  return {
    writer: { enqueueNotificationRequested } as unknown as NotificationRequestedWriterPort,
    enqueueNotificationRequested,
    rows,
  };
}

function createHandler(writer: DurableWriterHarness, instance: unknown, template: unknown) {
  return createTaskReminderScheduledHandlerRegistration({
    taskInstanceRepository: {
      findByIdForIdentity: vi.fn().mockResolvedValue(instance),
    },
    taskTemplateRepository: {
      findByIdForIdentity: vi.fn().mockResolvedValue(template),
    },
    notificationRequestedWriter: writer.writer,
  });
}

async function harnessFor(instance: unknown, template: unknown) {
  const writer = createDurableWriterHarness();
  const registry = new ScheduledHandlerRegistry();
  registry.register(createHandler(writer, instance, template));
  const executor = createHandlerRegistryScheduleTaskSourceExecutor({ registry });
  return { writer, registry, executor, task: fixtureTask() };
}

/**
 * The executor contract allows a `void` return; the registry-backed executor
 * always returns a result for a neutral envelope, so narrow it for assertions.
 */
function executionResult(result: ScheduleTaskExecutionResult | void): ScheduleTaskExecutionResult {
  if (!result) throw new Error('Source executor returned void; expected an execution result.');
  return result;
}

describe('task.reminder.fire through the neutral registry executor', () => {
  it('fires exactly one durable NotificationRequested for Fixture D', async () => {
    const { writer, executor, task } = await harnessFor(createInstance(), createTemplate());

    const first = executionResult(await executor.execute(task));
    expect(first.disposition).toBe('succeeded');
    expect(first.result).toMatchObject({
      instanceId: INSTANCE_ID,
      templateId: TEMPLATE_ID,
      schedulingKey: SINGLE_REMINDER_KEY,
      handlerKey: 'task.reminder.fire',
      schedulingDisposition: 'succeeded',
    });

    expect(writer.enqueueNotificationRequested).toHaveBeenCalledTimes(1);
    const input = writer.enqueueNotificationRequested.mock.calls[0][0];
    expect(input.envelope.identityId).toBe(IDENTITY);
    expect(input.envelope.source).toBe('task');
    expect(input.envelope.occurrenceKey).toBe(SINGLE_REMINDER_KEY);
    expect(input.envelope.workflowKey).toBe('task.reminder');
    expect(input.envelope.content.title).toBe('任务提醒：Exercise 30 minutes');
    expect(input.envelope.relatedEntity).toEqual({ type: 'Task', id: INSTANCE_ID });
    expect(writer.rows).toHaveLength(1);
  });

  it('re-execution after a no-op reconcile collapses onto the same durable envelope', async () => {
    const { writer, executor, task } = await harnessFor(createInstance(), createTemplate());

    await executor.execute(task);
    const replay = executionResult(await executor.execute(task));

    expect(replay.disposition).toBe('succeeded');
    expect(writer.enqueueNotificationRequested).toHaveBeenCalledTimes(2);
    expect(writer.rows).toHaveLength(1);
    expect(replay.result).toMatchObject({ notificationStatus: 'succeeded' });
  });

  it('returns a skipped receipt for a completed instance without any durable envelope', async () => {
    const { writer, executor, task } = await harnessFor(
      createInstance({ status: 'Completed' }),
      createTemplate(),
    );

    const result = executionResult(await executor.execute(task));
    expect(result.disposition).toBe('skipped');
    expect(result.result).toMatchObject({ schedulingDisposition: 'skipped' });
    expect(writer.enqueueNotificationRequested).not.toHaveBeenCalled();
    expect(writer.rows).toHaveLength(0);
  });

  it('returns a skipped receipt for a deleted instance without any durable envelope', async () => {
    const { writer, executor, task } = await harnessFor(
      createInstance({ deletedAt: '2030-01-10T15:00:00.000Z' }),
      createTemplate(),
    );

    const result = executionResult(await executor.execute(task));
    expect(result.disposition).toBe('skipped');
    expect(writer.enqueueNotificationRequested).not.toHaveBeenCalled();
    expect(writer.rows).toHaveLength(0);
  });

  it('rejects retryably when the shared outbox writer fails technically', async () => {
    const { writer, executor, task } = await harnessFor(createInstance(), createTemplate());
    writer.enqueueNotificationRequested.mockRejectedValueOnce(new Error('outbox unavailable'));

    await expect(executor.execute(task)).rejects.toThrow('outbox unavailable');
    expect(writer.rows).toHaveLength(0);
  });

  it('dead-letters unregistered task.reminder.fire invocations before any handler side effect', async () => {
    const writer = createDurableWriterHarness();
    const registry = new ScheduledHandlerRegistry();
    const executor = createHandlerRegistryScheduleTaskSourceExecutor({ registry });

    const result = executionResult(await executor.execute(fixtureTask()));
    expect(result.disposition).toBe('dead_letter');
    expect(result.result).toMatchObject({ schedulingFailureCode: 'UNKNOWN_HANDLER' });
    expect(writer.enqueueNotificationRequested).not.toHaveBeenCalled();
  });
});