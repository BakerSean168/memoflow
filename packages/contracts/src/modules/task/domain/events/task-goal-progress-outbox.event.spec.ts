import { describe, expect, it } from 'vitest';
import type { TaskGoalProgressOutboxEventV2 } from './task-goal-progress-outbox.event';

function applyEvent(): TaskGoalProgressOutboxEventV2 {
  return {
    eventId: 'event-1',
    schemaVersion: 2,
    eventType: 'task.goal-progress-requested',
    action: 'apply',
    identityId: 'identity-1' as never,
    taskOccurrenceId: 'instance-1' as never,
    taskPlanId: 'template-1' as never,
    goalId: 'goal-1' as never,
    keyResultId: 'kr-1' as never,
    value: 2,
    source: { type: 'TaskOccurrence', id: 'instance-1' },
    taskTitle: 'Ship outbox',
    occurredAt: 1,
  };
}

describe('TaskGoalProgressOutboxEventV2', () => {
  it('carries the settlement source explicitly instead of a trigger', () => {
    expect(applyEvent()).toMatchObject({
      schemaVersion: 2,
      action: 'apply',
      source: { type: 'TaskOccurrence', id: 'instance-1' },
    });
  });

  it('can explicitly request correction of both possible Task-owned sources', () => {
    const event: TaskGoalProgressOutboxEventV2 = {
      eventId: 'event-2',
      schemaVersion: 2,
      eventType: 'task.goal-progress-requested',
      action: 'revert',
      identityId: 'identity-1' as never,
      taskOccurrenceId: 'instance-1' as never,
      taskPlanId: 'template-1' as never,
      sources: [
        { type: 'TaskOccurrence', id: 'instance-1' },
        { type: 'TaskPlan', id: 'template-1' },
      ],
      occurredAt: 2,
    };

    expect(event.sources).toHaveLength(2);
  });
});
