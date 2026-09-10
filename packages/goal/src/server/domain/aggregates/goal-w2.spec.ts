import { describe, expect, it } from 'vitest';
import { GoalStatus } from '@memoflow/contracts/goal';
import { IdentityId } from '@memoflow/domain-shared';
import { Goal } from './goal';

function createGoal() {
  return Goal.create({
    identityId: IdentityId.of('IdentityId_550e8400-e29b-41d4-a716-446655440021'),
    name: 'Graduate',
    description: 'Finish the degree',
    feasibilityAnalysis: null,
    motivation: null,
    startDate: 1_700_000_000_000,
    dueDate: 1_800_000_000_000,
    reminderConfig: null,
  });
}

describe('GOAL-2101 canonical lifecycle', () => {
  it('uses Active | Completed | Abandoned as business status', () => {
    expect(Object.values(GoalStatus)).toEqual(['Active', 'Completed', 'Abandoned']);
    const goal = createGoal();
    expect(goal.status).toBe(GoalStatus.Active);
    goal.abandon();
    expect(goal.status).toBe(GoalStatus.Abandoned);
    expect(goal.archivedAt).toBeNull();
  });

  it('keeps archive independent from business status', () => {
    const goal = createGoal();
    goal.archive();
    expect(goal.status).toBe(GoalStatus.Active);
    expect(goal.archivedAt).not.toBeNull();
    const archivedAt = goal.archivedAt;
    goal.archive();
    expect(goal.archivedAt).toBe(archivedAt);
  });

  it('completion does not archive and is idempotent', () => {
    const goal = createGoal();
    goal.markAsCompleted();
    expect(goal.status).toBe(GoalStatus.Completed);
    expect(goal.completedAt).not.toBeNull();
    expect(goal.archivedAt).toBeNull();
    const completedAt = goal.completedAt;
    goal.markAsCompleted();
    expect(goal.completedAt).toBe(completedAt);
  });

  it('uses dueDate consistently in aggregate state', () => {
    const goal = createGoal();
    expect(goal.dueDate).toBe(1_800_000_000_000);
    goal.updateTimeRange({ dueDate: 1_800_086_400_000 });
    expect(goal.dueDate).toBe(1_800_086_400_000);
    expect(goal.toServerDTO().dueDate).toBe(goal.dueDate);
    expect('targetDate' in goal.toServerDTO()).toBe(false);
  });

  it('does not expose retired taxonomy/hierarchy/priority/color fields', () => {
    const dto = createGoal().toServerDTO();
    for (const field of [
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
