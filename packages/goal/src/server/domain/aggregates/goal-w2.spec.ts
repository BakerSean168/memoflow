import { describe, expect, it } from 'vitest';
import { GoalStatus } from '@memoflow/contracts/goal';
import { IdentityId } from '@memoflow/domain-shared';
import { requireYmd } from '@memoflow/contracts/primitives';
import { Goal } from './goal';

function createGoal() {
  return Goal.create({
    identityId: IdentityId.of('IdentityId_550e8400-e29b-41d4-a716-446655440021'),
    name: 'Graduate',
    summary: 'Finish the degree',
    startDate: requireYmd('2026-09-01'),
    target: { kind: 'quarter', year: 2026, quarter: 4 },
    reminderConfig: null,
  });
}

describe('GOAL-7202 canonical lifecycle', () => {
  it('uses exactly Planned | InProgress | Completed | Abandoned and defaults to Planned', () => {
    expect(Object.values(GoalStatus)).toEqual(['Planned', 'InProgress', 'Completed', 'Abandoned']);
    const goal = createGoal();
    expect(goal.status).toBe(GoalStatus.Planned);
  });

  it('supports the ADR-067 explicit transition matrix and clears completedAt on reopen', () => {
    const goal = createGoal();
    goal.activate();
    expect(goal.status).toBe(GoalStatus.InProgress);

    goal.plan();
    expect(goal.status).toBe(GoalStatus.Planned);
    goal.activate();
    goal.markAsCompleted();
    expect(goal.status).toBe(GoalStatus.Completed);
    expect(goal.completedAt).not.toBeNull();

    goal.activate();
    expect(goal.status).toBe(GoalStatus.InProgress);
    expect(goal.completedAt).toBeNull();

    goal.abandon();
    expect(goal.status).toBe(GoalStatus.Abandoned);
    goal.plan();
    expect(goal.status).toBe(GoalStatus.Planned);
    goal.abandon();
    goal.activate();
    expect(goal.status).toBe(GoalStatus.InProgress);
  });

  it('rejects Planned -> Completed instead of inferring execution from outcome intent', () => {
    const goal = createGoal();
    expect(() => goal.markAsCompleted()).toThrow('Planned -> Completed');
    expect(goal.status).toBe(GoalStatus.Planned);
  });

  it('keeps archive independent from business status and blocks lifecycle mutation afterwards', () => {
    const goal = createGoal();
    goal.archive();
    expect(goal.status).toBe(GoalStatus.Planned);
    expect(goal.archivedAt).not.toBeNull();
    const archivedAt = goal.archivedAt;
    goal.archive();
    expect(goal.archivedAt).toBe(archivedAt);
    expect(() => goal.activate()).toThrow();
  });

  it('completion does not archive and is idempotent while the Goal remains mutable', () => {
    const goal = createGoal();
    goal.activate();
    goal.pullDomainEvents();
    goal.markAsCompleted();
    expect(goal.status).toBe(GoalStatus.Completed);
    expect(goal.completedAt).not.toBeNull();
    expect(goal.archivedAt).toBeNull();
    const completedAt = goal.completedAt;
    const eventCount = goal.domainEvents.length;
    goal.markAsCompleted();
    expect(goal.completedAt).toBe(completedAt);
    expect(goal.domainEvents).toHaveLength(eventCount);
  });

  it('preserves Target Timeframe precision in aggregate state', () => {
    const goal = createGoal();
    expect(goal.startDate).toBe('2026-09-01');
    expect(goal.target).toEqual({ kind: 'quarter', year: 2026, quarter: 4 });
    goal.updatePlanningTime({ target: { kind: 'halfYear', year: 2027, half: 1 } });
    expect(goal.target).toEqual({ kind: 'halfYear', year: 2027, half: 1 });
    expect(goal.toServerDTO().target).toEqual(goal.target);
    expect('dueDate' in goal.toServerDTO()).toBe(false);
    expect('targetDate' in goal.toServerDTO()).toBe(false);
  });

  it('publishes only name + summary as Goal identity text and no retired taxonomy fields', () => {
    const dto = createGoal().toServerDTO();
    expect(dto.name).toBe('Graduate');
    expect(dto.summary).toBe('Finish the degree');
    for (const field of [
      'description',
      'motivation',
      'feasibilityAnalysis',
      'color',
      'importance',
      'priority',
      'category',
      'tags',
      'folderId',
      'parentGoalId',
      'rollupPolicy',
    ]) {
      expect(field in dto).toBe(false);
    }
  });
});
