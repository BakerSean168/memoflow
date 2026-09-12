import { describe, expect, it } from 'vitest';
import type { IDomainEvent } from '@memoflow/contracts/shared';
import {
  TaskGoalBindingTrigger,
  TaskPlanOutcome,
  type TaskOccurrenceCompletedEvent,
  type TaskPlanOutcomeChangedEvent,
} from '@memoflow/contracts/task';
import { toTaskGoalOutboxRecord } from './task-goal-outbox';

function completionEvent(
  contribution: NonNullable<
    NonNullable<TaskOccurrenceCompletedEvent['goalBinding']>['contribution']
  > | null = {
    value: 2,
    trigger: TaskGoalBindingTrigger.EachCompletion,
  },
): IDomainEvent<TaskOccurrenceCompletedEvent> {
  return {
    eventType: 'task:instance-completed',
    aggregateId: 'instance-1',
    occurredAt: new Date(1_000),
    payload: {
      identityId: 'identity-1' as TaskOccurrenceCompletedEvent['identityId'],
      taskOccurrenceId: 'instance-1' as TaskOccurrenceCompletedEvent['taskOccurrenceId'],
      taskPlanId: 'template-1' as TaskOccurrenceCompletedEvent['taskPlanId'],
      completedAt: 1_000,
      taskTitle: 'Ship reliable progress',
      goalBinding: {
        goalId: 'goal-1' as NonNullable<TaskOccurrenceCompletedEvent['goalBinding']>['goalId'],
        keyResultId: 'kr-1' as NonNullable<
          TaskOccurrenceCompletedEvent['goalBinding']
        >['keyResultId'],
        contribution,
      },
    },
  };
}

function planOutcomeEvent(
  previousOutcome: TaskPlanOutcomeChangedEvent['previousOutcome'],
  nextOutcome: TaskPlanOutcomeChangedEvent['nextOutcome'],
  planVersion = 8,
  contribution: NonNullable<
    NonNullable<TaskPlanOutcomeChangedEvent['goalBinding']>['contribution']
  > | null = {
    value: 3,
    trigger: TaskGoalBindingTrigger.PlanCompletion,
  },
): IDomainEvent<TaskPlanOutcomeChangedEvent> {
  return {
    eventType: 'task:plan-outcome-changed',
    aggregateId: 'template-1',
    occurredAt: new Date(2_000),
    payload: {
      identityId: 'identity-1' as TaskPlanOutcomeChangedEvent['identityId'],
      taskPlanId: 'template-1' as TaskPlanOutcomeChangedEvent['taskPlanId'],
      triggeringTaskOccurrenceId:
        'instance-15' as TaskPlanOutcomeChangedEvent['triggeringTaskOccurrenceId'],
      taskTitle: 'Graduate reliably',
      goalBinding: {
        goalId: 'goal-1' as NonNullable<TaskPlanOutcomeChangedEvent['goalBinding']>['goalId'],
        keyResultId: 'kr-1' as NonNullable<
          TaskPlanOutcomeChangedEvent['goalBinding']
        >['keyResultId'],
        contribution,
      },
      previousOutcome,
      nextOutcome,
      planVersion,
      changedAt: 2_000,
    },
  };
}

describe('toTaskGoalOutboxRecord V2', () => {
  it('derives a stable instance-source event id so transaction retries cannot enqueue duplicates', () => {
    const source = completionEvent();
    const first = toTaskGoalOutboxRecord(source);
    const retry = toTaskGoalOutboxRecord(source);

    expect(first?.eventId).toBe('task-goal-apply:TaskOccurrence:instance-1:1000');
    expect(retry?.eventId).toBe(first?.eventId);
    expect(JSON.parse(first!.payload)).toMatchObject({
      schemaVersion: 2,
      action: 'apply',
      value: 2,
      source: { type: 'TaskOccurrence', id: 'instance-1' },
    });
  });

  it('never enqueues progress for a link-only Task', () => {
    expect(toTaskGoalOutboxRecord(completionEvent(null))).toBeNull();
  });

  it('never enqueues progress for a Goal-only Task link', () => {
    const event = completionEvent(null);
    const payload = event.payload as TaskOccurrenceCompletedEvent;
    payload.goalBinding = {
      goalId: payload.goalBinding!.goalId,
      keyResultId: null,
      contribution: null,
    };
    expect(toTaskGoalOutboxRecord(event)).toBeNull();
  });

  it('does not let an occurrence completion directly settle PlanCompletion', () => {
    expect(
      toTaskGoalOutboxRecord(
        completionEvent({ value: 3, trigger: TaskGoalBindingTrigger.PlanCompletion }),
      ),
    ).toBeNull();
  });

  it('settles PlanCompletion only on the authoritative transition to Succeeded', () => {
    const event = planOutcomeEvent(TaskPlanOutcome.Open, TaskPlanOutcome.Succeeded, 8);
    const first = toTaskGoalOutboxRecord(event);
    const retry = toTaskGoalOutboxRecord(event);

    expect(first?.eventId).toBe('task-goal-plan-apply:template-1:v8');
    expect(retry?.eventId).toBe(first?.eventId);
    expect(JSON.parse(first!.payload)).toMatchObject({
      action: 'apply',
      source: { type: 'TaskPlan', id: 'template-1' },
      value: 3,
    });
  });

  it('does not settle a strict plan transition to Failed', () => {
    expect(
      toTaskGoalOutboxRecord(planOutcomeEvent(TaskPlanOutcome.Open, TaskPlanOutcome.Failed)),
    ).toBeNull();
  });

  it('reverts only the plan source when a correction leaves Succeeded', () => {
    const record = toTaskGoalOutboxRecord(
      planOutcomeEvent(TaskPlanOutcome.Succeeded, TaskPlanOutcome.Open, 9),
    );

    expect(record?.eventId).toBe('task-goal-plan-revert:template-1:v9');
    expect(JSON.parse(record!.payload)).toMatchObject({
      action: 'revert',
      sources: [{ type: 'TaskPlan', id: 'template-1' }],
    });
  });

  it('uses a new transition version when a corrected plan succeeds again', () => {
    const first = toTaskGoalOutboxRecord(
      planOutcomeEvent(TaskPlanOutcome.Open, TaskPlanOutcome.Succeeded, 8),
    );
    const second = toTaskGoalOutboxRecord(
      planOutcomeEvent(TaskPlanOutcome.Open, TaskPlanOutcome.Succeeded, 10),
    );
    expect(second?.eventId).not.toBe(first?.eventId);
    expect(second?.eventId).toBe('task-goal-plan-apply:template-1:v10');
  });

  it('converts uncomplete into an instance-source revert; plan revert comes from outcome transition', () => {
    const source: IDomainEvent = {
      eventType: 'task:instance-uncompleted',
      aggregateId: 'instance-1',
      occurredAt: new Date(2_000),
      payload: {
        identityId: 'identity-1',
        taskOccurrenceId: 'instance-1',
        taskPlanId: 'template-1',
        uncompletedAt: 2_000,
      },
    };

    const record = toTaskGoalOutboxRecord(source);

    expect(record).not.toBeNull();
    expect(record!.eventId).toBe('task-goal-revert:instance:instance-1:2000');
    expect(JSON.parse(record!.payload)).toMatchObject({
      schemaVersion: 2,
      action: 'revert',
      sources: [{ type: 'TaskOccurrence', id: 'instance-1' }],
    });
  });
});
