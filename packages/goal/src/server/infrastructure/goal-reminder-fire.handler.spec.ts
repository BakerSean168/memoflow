import { describe, expect, it, vi } from 'vitest';
import { GoalStatus, ReminderTriggerType } from '@memoflow/contracts/goal';
import {
  NotificationCategory,
  NotificationChannelType,
  NotificationType,
  RelatedEntityType,
} from '@memoflow/contracts/notification';
import { buildIdempotencyKeyString } from '@memoflow/contracts/reliable-messaging';
import type { BusinessOperationReceipt } from '@memoflow/contracts/reliable-messaging';
import {
  GOAL_REMINDER_NOTIFICATION_SOURCE,
  GOAL_REMINDER_WORKFLOW_KEY,
  buildGoalReminderOperationId,
  executeGoalReminderFire,
  GoalReminderFirePayloadSchema,
  type GoalReminderFirePayload,
} from './goal-reminder-fire.handler';
import { GOAL_REMINDER_HANDLER_KEY } from './schedule-projection-source';

const IDENTITY_ID = 'IdentityId_goal-owner';
const GOAL_ID = 'GoalId_goal-1';
const SCHEDULING_KEY = 'GoalId_goal-1|2026-08-10T08:45:00.000Z';

const payload: GoalReminderFirePayload = {
  goalId: GOAL_ID,
  goalTitle: 'Ship R06',
  triggerType: ReminderTriggerType.RemainingDays,
  triggerValue: 3,
  startDate: Date.UTC(2026, 1, 1),
  dueDate: Date.UTC(2026, 8, 1),
  reminderTime: 8 * 60,
};

const context = {
  identityId: IDENTITY_ID,
  owner: { identityId: IDENTITY_ID, type: 'Identity', id: IDENTITY_ID },
  schedulingKey: SCHEDULING_KEY,
  handlerKey: GOAL_REMINDER_HANDLER_KEY,
  runAt: new Date('2026-08-10T08:45:00.000Z').toISOString(),
  payloadVersion: 1,
  payload,
};

function makeGoal(overrides: Record<string, unknown> = {}) {
  return {
    toServerDTO: () => ({
      id: GOAL_ID,
      identityId: IDENTITY_ID,
      name: 'Ship R06',
      description: null,
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
      ...overrides,
    }),
  };
}

function makeWriter(receipt: Partial<BusinessOperationReceipt> = {}) {
  const captured: Array<{ operationId: string; envelope: Record<string, unknown> }> = [];
  const enqueueNotificationRequested = vi.fn(
    async (input: { operationId: string; envelope: Record<string, unknown> }) => {
      captured.push(input);
      const idempotencyKey = input.envelope.idempotencyKey as string;
      return {
        schemaVersion: 1,
        operationId: input.operationId,
        identityId: IDENTITY_ID,
        source: GOAL_REMINDER_NOTIFICATION_SOURCE,
        occurrenceKey: SCHEDULING_KEY,
        idempotencyKey,
        status: 'pending',
        attempt: 0,
        lease: null,
        lastError: null,
        nextRetryAt: null,
        deadLetterAt: null,
        correlationId: idempotencyKey,
        causationId: null,
        attemptsHistory: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        finishedAt: null,
        ...receipt,
      } satisfies BusinessOperationReceipt;
    },
  );
  return {
    enqueueNotificationRequested,
    lastEnvelope: () => captured[0]?.envelope ?? null,
    lastInput: () => captured[0] ?? null,
  };
}

describe('GoalReminderFirePayloadSchema', () => {
  it('accepts a snapshot payload and rejects an unknown trigger type', () => {
    expect(GoalReminderFirePayloadSchema.parse(payload)).toEqual(payload);
    expect(() =>
      GoalReminderFirePayloadSchema.parse({ ...payload, triggerType: 'MysteryTrigger' }),
    ).toThrow();
  });
});

describe('buildGoalReminderOperationId', () => {
  it('is deterministic from the invocation schedulingKey', () => {
    expect(buildGoalReminderOperationId(context)).toBe(`goal-reminder:${SCHEDULING_KEY}`);
  });
});

describe('executeGoalReminderFire', () => {
  it('emits ONE idempotent NotificationRequested envelope for an eligible in-progress goal', async () => {
    const findByIdForIdentity = vi.fn().mockResolvedValue(makeGoal());
    const writer = makeWriter();
    const result = await executeGoalReminderFire(
      {
        goalRepository: { findByIdForIdentity },
        requestedWriter: { enqueueNotificationRequested: writer.enqueueNotificationRequested },
      },
      context,
    );

    expect(findByIdForIdentity).toHaveBeenCalledWith(IDENTITY_ID, GOAL_ID, {
      includeChildren: true,
    });
    expect(writer.enqueueNotificationRequested).toHaveBeenCalledTimes(1);

    const envelope = writer.lastEnvelope()!;
    const expectedIdempotencyKey = buildIdempotencyKeyString({
      identityId: IDENTITY_ID,
      source: GOAL_REMINDER_NOTIFICATION_SOURCE,
      occurrenceKey: SCHEDULING_KEY,
    });
    expect(envelope).toMatchObject({
      identityId: IDENTITY_ID,
      source: GOAL_REMINDER_NOTIFICATION_SOURCE,
      occurrenceKey: SCHEDULING_KEY,
      idempotencyKey: expectedIdempotencyKey,
      workflowKey: GOAL_REMINDER_WORKFLOW_KEY,
      topic: GOAL_REMINDER_WORKFLOW_KEY,
      relatedEntity: { type: RelatedEntityType.Goal, id: GOAL_ID },
      content: {
        type: NotificationType.Reminder,
        category: NotificationCategory.Goal,
        title: '目标提醒：Ship R06',
        content: '目标「Ship R06」距离截止还有 3 天。',
      },
      suggestedChannels: [NotificationChannelType.InApp, NotificationChannelType.Push],
      correlationId: SCHEDULING_KEY,
    });

    expect(writer.enqueueNotificationRequested).toHaveBeenCalledWith({
      operationId: `goal-reminder:${SCHEDULING_KEY}`,
      envelope,
    });
    expect(result).toEqual({
      status: 'succeeded',
      result: {
        goalId: GOAL_ID,
        goalTitle: 'Ship R06',
        triggerType: ReminderTriggerType.RemainingDays,
        triggerValue: 3,
        operationId: `goal-reminder:${SCHEDULING_KEY}`,
        idempotencyKey: expectedIdempotencyKey,
      },
    });
  });

  it('uses the TimeProgressPercentage content for that trigger type', async () => {
    const findByIdForIdentity = vi.fn().mockResolvedValue(
      makeGoal({
        status: GoalStatus.InProgress,
        reminderConfig: {
          enabled: true,
          triggers: [
            { type: ReminderTriggerType.TimeProgressPercentage, value: 30, enabled: true },
          ],
        },
      }),
    );
    const writer = makeWriter();
    const result = await executeGoalReminderFire(
      {
        goalRepository: { findByIdForIdentity },
        requestedWriter: { enqueueNotificationRequested: writer.enqueueNotificationRequested },
      },
      {
        ...context,
        payload: {
          ...payload,
          triggerType: ReminderTriggerType.TimeProgressPercentage,
          triggerValue: 30,
        },
      },
    );
    const envelope = writer.lastEnvelope()!;
    expect((envelope.content as { content: string }).content).toBe(
      '目标「Ship R06」已达到 30% 时间进度节点。',
    );
    expect(result.status).toBe('succeeded');
  });

  it.each([
    ['GOAL_NOT_FOUND', null],
    ['GOAL_COMPLETED', { status: GoalStatus.Completed, completedAt: Date.UTC(2026, 5, 1) }],
    ['GOAL_ABANDONED', { status: GoalStatus.Abandoned }],
    ['GOAL_ARCHIVED', { archivedAt: Date.UTC(2026, 3, 1) }],
    ['GOAL_DELETED', { deletedAt: Date.UTC(2026, 3, 1) }],
    ['GOAL_NOT_IN_PROGRESS', { status: 'Draft' }],
    ['GOAL_REMINDER_DISABLED', { reminderConfig: { enabled: false } }],
    [
      'GOAL_TRIGGER_DISABLED',
      {
        reminderConfig: {
          enabled: true,
          triggers: [{ type: ReminderTriggerType.RemainingDays, value: 3, enabled: false }],
        },
      },
    ],
    [
      'GOAL_TRIGGER_DISABLED',
      {
        reminderConfig: {
          enabled: true,
          triggers: [{ type: ReminderTriggerType.RemainingDays, value: 5, enabled: true }],
        },
      },
    ],
  ])('returns skipped %s and writes nothing', async (expectedCode, goalOverride) => {
    const findByIdForIdentity = vi
      .fn()
      .mockResolvedValue(
        goalOverride === null ? null : makeGoal(goalOverride as Record<string, unknown>),
      );
    const writer = makeWriter();
    const result = await executeGoalReminderFire(
      {
        goalRepository: { findByIdForIdentity },
        requestedWriter: { enqueueNotificationRequested: writer.enqueueNotificationRequested },
      },
      context,
    );

    expect(result).toMatchObject({
      status: 'skipped',
      result: {
        goalId: GOAL_ID,
        skippedReason: expectedCode,
      },
    });
    expect(writer.enqueueNotificationRequested).not.toHaveBeenCalled();
  });
});
