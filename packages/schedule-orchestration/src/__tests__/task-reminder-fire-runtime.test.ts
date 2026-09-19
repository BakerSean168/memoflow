import { describe, expect, it, vi } from 'vitest';
import type { NotificationRequestedWriterPort } from '@memoflow/contracts/notification';
import { buildSchedulingKey, type ScheduledInvocationContext } from '@memoflow/contracts/schedule';
import { ScheduledHandlerRegistry } from '@memoflow/scheduler';
import {
  TASK_REMINDER_PAYLOAD_VERSION,
  TASK_SCHEDULING_OWNER_TYPE,
  type TaskReminderScheduledPayload,
} from '@memoflow/task/schedule-projection';
import { createTaskReminderScheduledHandlerRegistration } from '@memoflow/task/schedule-execution';

const IDENTITY = 'IdentityId_task-owner';
const TEMPLATE_ID = 'TaskPlanId_template';
const INSTANCE_ID = 'TaskOccurrenceId_instance-1';
const OCCURRENCE_KEY = 'TaskPlanId_template:2030-01-10';
const SINGLE_REMINDER_KEY = buildSchedulingKey(
  'task.reminder',
  OCCURRENCE_KEY,
  'relative:30:Minutes',
);
const REMINDER_AT = Date.UTC(2030, 0, 10, 13, 30);
const ANCHOR_AT = Date.UTC(2030, 0, 10, 14);

function payload(): TaskReminderScheduledPayload {
  return {
    planId: TEMPLATE_ID,
    occurrenceId: INSTANCE_ID,
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

/** Canonical Fixture D invocation: one-time Task at 14:00, relative -30m reminder. */
function fixtureInvocation(): ScheduledInvocationContext<TaskReminderScheduledPayload> {
  return {
    identityId: IDENTITY,
    owner: { identityId: IDENTITY, type: TASK_SCHEDULING_OWNER_TYPE, id: TEMPLATE_ID },
    schedulingKey: SINGLE_REMINDER_KEY,
    handlerKey: 'task.reminder.fire',
    runAt: REMINDER_AT,
    payloadVersion: TASK_REMINDER_PAYLOAD_VERSION,
    payload: payload(),
    sourceRevision: '1:1',
  };
}

function createInstance(overrides: Record<string, unknown> = {}) {
  return {
    id: INSTANCE_ID,
    identityId: IDENTITY,
    planId: TEMPLATE_ID,
    occurrenceKey: OCCURRENCE_KEY,
    status: 'Pending',
    deletedAt: null,
    ...overrides,
  };
}

function createPlan(overrides: Record<string, unknown> = {}) {
  return {
    toServerDTO: vi.fn().mockReturnValue({
      id: TEMPLATE_ID,
      name: 'Exercise 30 minutes',
      status: 'Active',
      deletedAt: null,
      reminderConfig: {
        enabled: true,
        triggers: [
          { type: 'Relative', relativeValue: 30, relativeUnit: 'Minutes', absoluteTime: null },
        ],
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
  const enqueueNotificationRequested = vi
    .fn()
    .mockImplementation(
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
    taskOccurrenceRepository: {
      findByIdForIdentity: vi.fn().mockResolvedValue(instance),
    },
    taskPlanRepository: {
      findByIdForIdentity: vi.fn().mockResolvedValue(template),
    },
    notificationRequestedWriter: writer.writer,
  });
}

async function harnessFor(instance: unknown, template: unknown) {
  const writer = createDurableWriterHarness();
  const registry = new ScheduledHandlerRegistry();
  registry.register(createHandler(writer, instance, template));
  return { writer, registry, invocation: fixtureInvocation() };
}

describe('task.reminder.fire through the canonical handler registry', () => {
  it('fires exactly one durable NotificationRequested for Fixture D', async () => {
    const { writer, registry, invocation } = await harnessFor(createInstance(), createPlan());

    const first = await registry.execute(invocation);
    expect(first.status).toBe('succeeded');
    expect(first.result).toMatchObject({
      occurrenceId: INSTANCE_ID,
      planId: TEMPLATE_ID,
      schedulingKey: SINGLE_REMINDER_KEY,
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
    const { writer, registry, invocation } = await harnessFor(createInstance(), createPlan());

    await registry.execute(invocation);
    const replay = await registry.execute(invocation);

    expect(replay.status).toBe('succeeded');
    expect(writer.enqueueNotificationRequested).toHaveBeenCalledTimes(2);
    expect(writer.rows).toHaveLength(1);
    expect(replay.result).toMatchObject({ notificationStatus: 'succeeded' });
  });

  it('returns a skipped receipt for a completed instance without any durable envelope', async () => {
    const { writer, registry, invocation } = await harnessFor(
      createInstance({ status: 'Completed' }),
      createPlan(),
    );

    const result = await registry.execute(invocation);
    expect(result.status).toBe('skipped');
    expect(result.result).toMatchObject({ occurrenceId: INSTANCE_ID, status: 'Completed' });
    expect(writer.enqueueNotificationRequested).not.toHaveBeenCalled();
    expect(writer.rows).toHaveLength(0);
  });

  it('returns a skipped receipt for a deleted instance without any durable envelope', async () => {
    const { writer, registry, invocation } = await harnessFor(
      createInstance({ deletedAt: '2030-01-10T15:00:00.000Z' }),
      createPlan(),
    );

    const result = await registry.execute(invocation);
    expect(result.status).toBe('skipped');
    expect(writer.enqueueNotificationRequested).not.toHaveBeenCalled();
    expect(writer.rows).toHaveLength(0);
  });

  it('rejects retryably when the shared outbox writer fails technically', async () => {
    const { writer, registry, invocation } = await harnessFor(createInstance(), createPlan());
    writer.enqueueNotificationRequested.mockRejectedValueOnce(new Error('outbox unavailable'));

    const result = await registry.execute(invocation);
    expect(result).toMatchObject({
      status: 'retryable',
      failure: { code: 'HANDLER_EXECUTION_FAILED', retryable: true },
    });
    expect(writer.rows).toHaveLength(0);
  });

  it('dead-letters unregistered task.reminder.fire invocations before any handler side effect', async () => {
    const writer = createDurableWriterHarness();
    const registry = new ScheduledHandlerRegistry();

    const result = await registry.execute(fixtureInvocation());
    expect(result.status).toBe('dead_letter');
    expect(result).toMatchObject({ failure: { code: 'UNKNOWN_HANDLER', retryable: false } });
    expect(writer.enqueueNotificationRequested).not.toHaveBeenCalled();
  });
});
