import { describe, expect, it, vi } from 'vitest';
import { ScheduledHandlerRegistry } from '@memoflow/scheduler';
import type { ScheduledInvocationContext } from '@memoflow/contracts/schedule';
import {
  createGoalReminderFireHandler,
  GOAL_REMINDER_NOTIFICATION_SOURCE,
} from '@memoflow/goal/schedule-execution';
import { GoalStatus, ReminderTriggerType } from '@memoflow/contracts/goal';
import { buildIdempotencyKeyString } from '@memoflow/contracts/reliable-messaging';
import type { BusinessOperationReceipt } from '@memoflow/contracts/reliable-messaging';

const IDENTITY_ID = 'IdentityId_goal-owner';
const GOAL_ID = 'GoalId_goal-1';
const SCHEDULING_KEY = `${GOAL_ID}|2026-08-10T08:45:00.000Z`;

function buildPayload() {
  return {
    goalId: GOAL_ID,
    goalTitle: 'Ship R06',
    triggerType: ReminderTriggerType.RemainingDays,
    triggerValue: 3,
    startDate: Date.UTC(2026, 1, 1),
    dueDate: Date.UTC(2026, 8, 1),
    reminderTime: 8 * 60,
  };
}

function buildInvocation(): ScheduledInvocationContext {
  return {
    identityId: IDENTITY_ID,
    owner: { identityId: IDENTITY_ID, type: 'Identity', id: IDENTITY_ID },
    schedulingKey: SCHEDULING_KEY,
    handlerKey: 'goal.reminder.fire',
    runAt: Date.UTC(2026, 7, 10, 8, 45),
    payloadVersion: 1,
    payload: buildPayload(),
  };
}

function makeGoal() {
  return {
    toServerDTO: () => ({
      id: GOAL_ID,
      identityId: IDENTITY_ID,
      name: 'Ship R06',
      summary: null,
      status: GoalStatus.InProgress,
      deletedAt: null,
      archivedAt: null,
      completedAt: null,
      reminderConfig: {
        enabled: true,
        triggers: [
          { type: ReminderTriggerType.RemainingDays, value: 3, enabled: true },
          { type: ReminderTriggerType.TimeProgressPercentage, value: 30, enabled: true },
        ],
      },
    }),
  };
}

describe('goal.reminder.fire handler registry dispatch (schedule-orchestration)', () => {
  it('registers and dispatches a successful fire, returning a stable receipt', async () => {
    const registry = new ScheduledHandlerRegistry();
    const findByIdForIdentity = vi.fn().mockResolvedValue(makeGoal());
    const enqueueNotificationRequested = vi.fn(
      async (input: { operationId: string; envelope: { idempotencyKey: string } }) =>
        ({
          schemaVersion: 1,
          operationId: input.operationId,
          identityId: IDENTITY_ID,
          source: GOAL_REMINDER_NOTIFICATION_SOURCE,
          occurrenceKey: SCHEDULING_KEY,
          idempotencyKey: input.envelope.idempotencyKey,
          status: 'pending',
          attempt: 0,
          lease: null,
          lastError: null,
          nextRetryAt: null,
          deadLetterAt: null,
          correlationId: input.envelope.idempotencyKey,
          causationId: null,
          attemptsHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          finishedAt: null,
        }) satisfies BusinessOperationReceipt,
    );

    registry.register(
      createGoalReminderFireHandler({
        goalRepository: { findByIdForIdentity },
        requestedWriter: { enqueueNotificationRequested },
      }),
    );

    expect(registry.has('goal.reminder.fire')).toBe(true);
    expect(registry.keys()).toContain('goal.reminder.fire');

    const result = await registry.execute(buildInvocation());

    expect(result).toMatchObject({
      status: 'succeeded',
      result: {
        goalId: GOAL_ID,
        operationId: `goal-reminder:${SCHEDULING_KEY}`,
        idempotencyKey: buildIdempotencyKeyString({
          identityId: IDENTITY_ID,
          source: GOAL_REMINDER_NOTIFICATION_SOURCE,
          occurrenceKey: SCHEDULING_KEY,
        }),
      },
    });
    expect(enqueueNotificationRequested).toHaveBeenCalledTimes(1);
  });

  it('dead-letters an invocation for an unknown handler key while staying scheduler-neutral', async () => {
    const registry = new ScheduledHandlerRegistry();
    const result = await registry.execute(buildInvocation());

    expect(result).toEqual({
      status: 'dead_letter',
      failure: {
        code: 'UNKNOWN_HANDLER',
        retryable: false,
        message: expect.stringContaining('goal.reminder.fire'),
      },
    });
  });

  it('dead-letters an invocation whose payload fails the registered schema validation', async () => {
    const registry = new ScheduledHandlerRegistry();
    registry.register(
      createGoalReminderFireHandler({
        goalRepository: { findByIdForIdentity: vi.fn() },
        requestedWriter: { enqueueNotificationRequested: vi.fn() },
      }),
    );

    const result = await registry.execute({
      ...buildInvocation(),
      payload: { ...buildPayload(), triggerType: 'MysteryTrigger' },
    });

    expect(result).toMatchObject({
      status: 'dead_letter',
      failure: { code: 'PAYLOAD_VALIDATION_FAILED', retryable: false },
    });
  });
});
