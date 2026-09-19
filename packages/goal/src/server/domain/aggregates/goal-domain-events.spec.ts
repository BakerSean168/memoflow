import { describe, expect, it } from 'vitest';
import { GoalStatus } from '@memoflow/contracts/goal';
import { Goal } from './goal';

function createGoalAggregate(): Goal {
  return Goal.create({
    identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440001' as any,
    name: 'Launch Goal',
    summary: 'Ship the launch plan',
    startDate: null,
    target: null,
    reminderConfig: null,
  });
}

describe('Goal vNext domain events', () => {
  it('emits canonical Goal updates without retired fields', () => {
    const goal = createGoalAggregate();
    goal.pullDomainEvents();

    goal.updateBasicInfo({ name: 'Launch Goal v2', summary: 'Ship it' });

    const [event] = goal.pullDomainEvents();
    expect(event.eventType).toBe('goal:updated');
    expect(event.payload).toMatchObject({
      identityId: goal.identityId,
      changes: ['name', 'summary'],
      goal: {
        id: goal.id,
        name: 'Launch Goal v2',
        summary: 'Ship it',
      },
    });
    expect('color' in (event.payload as any).goal).toBe(false);
    expect('parentGoalId' in (event.payload as any).goal).toBe(false);
  });

  it('emits key-result events from the Goal aggregate', () => {
    const goal = createGoalAggregate();
    goal.pullDomainEvents();

    const keyResult = goal.createAndAddKeyResult({
      title: 'Sign 100 users',
      valueType: 'NUMERIC',
      targetValue: 100,
      currentValue: 10,
      weight: 3,
    });

    let [event] = goal.pullDomainEvents();
    expect(event.eventType).toBe('goal:key-result-added');
    expect(event.payload).toMatchObject({ identityId: goal.identityId, goal: { id: goal.id } });

    goal.updateKeyResultProgress(keyResult.id as unknown as string, 40);
    [event] = goal.pullDomainEvents();
    expect(event.eventType).toBe('goal:key-result-updated');
    expect(event.payload).toMatchObject({ previousValue: 10, newValue: 40 });
  });

  it('keeps completion, abandonment and archive as distinct facts', () => {
    const completed = createGoalAggregate();
    completed.pullDomainEvents();
    completed.activate();
    completed.pullDomainEvents();
    completed.markAsCompleted();
    const completionEvents = completed.pullDomainEvents();
    expect(completed.status).toBe(GoalStatus.Completed);
    expect(completed.archivedAt).toBeNull();
    expect(completionEvents.map((event) => event.eventType)).toEqual([
      'goal:status-changed',
      'goal:completed',
    ]);

    const abandoned = createGoalAggregate();
    abandoned.pullDomainEvents();
    abandoned.abandon();
    const [abandonedEvent] = abandoned.pullDomainEvents();
    expect(abandoned.status).toBe(GoalStatus.Abandoned);
    expect(abandoned.archivedAt).toBeNull();
    expect(abandonedEvent.eventType).toBe('goal:status-changed');

    const archived = createGoalAggregate();
    archived.pullDomainEvents();
    archived.archive();
    const [archiveEvent] = archived.pullDomainEvents();
    expect(archived.status).toBe(GoalStatus.Planned);
    expect(archiveEvent.eventType).toBe('goal:archived');
  });
});
