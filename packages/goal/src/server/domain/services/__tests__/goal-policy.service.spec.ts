import { beforeEach, describe, expect, it } from 'vitest';
import { Goal } from '../../aggregates/goal';
import { GoalArchivedError } from '../../value-objects';
import { GoalPolicy } from '../goal-policy.service';

function createTestGoal(): Goal {
  return Goal.create({
    identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440001' as any,
    name: 'Test Goal',
    summary: null,
    startDate: null,
    dueDate: null,
    reminderConfig: null,
  });
}

function createCompletedGoal(): Goal {
  const goal = createTestGoal();
  goal.activate();
  goal.markAsCompleted();
  return goal;
}

function createArchivedGoal(): Goal {
  const goal = createTestGoal();
  goal.archive();
  return goal;
}

describe('GoalPolicy vNext archive/status separation', () => {
  let policy: GoalPolicy;

  beforeEach(() => {
    policy = new GoalPolicy();
  });

  it('allows modification for unarchived Planned, InProgress, Completed, and Abandoned goals', () => {
    const planned = createTestGoal();
    const inProgress = createTestGoal();
    inProgress.activate();
    const completed = createCompletedGoal();
    const abandoned = createTestGoal();
    abandoned.abandon();

    expect(() => policy.ensureGoalCanBeModified(planned)).not.toThrow();
    expect(() => policy.ensureGoalCanBeModified(inProgress)).not.toThrow();
    expect(() => policy.ensureGoalCanBeModified(completed)).not.toThrow();
    expect(() => policy.ensureGoalCanBeModified(abandoned)).not.toThrow();
  });

  it('blocks modification only when archivedAt is set', () => {
    const goal = createArchivedGoal();
    expect(() => policy.ensureGoalCanBeModified(goal)).toThrow(GoalArchivedError);
    expect(() => policy.ensureGoalCanBeModified(goal)).toThrow(goal.id);
  });

  it('allows any unarchived business status to be archived exactly once', () => {
    const completed = createCompletedGoal();
    expect(completed.archivedAt).toBeNull();
    expect(() => policy.ensureGoalCanBeArchived(completed)).not.toThrow();

    const archived = createArchivedGoal();
    expect(() => policy.ensureGoalCanBeArchived(archived)).toThrow(GoalArchivedError);
  });

  it('requires explicit archive before permanent delete', () => {
    const completed = createCompletedGoal();
    expect(() => policy.ensureGoalCanBePermanentlyDeleted(completed)).toThrow(
      'must be archived before it can be permanently deleted',
    );

    completed.archive();
    expect(() => policy.ensureGoalCanBePermanentlyDeleted(completed)).not.toThrow();
  });

  it('allows reactivation from Completed/Abandoned but not from archived display state', () => {
    const completed = createCompletedGoal();
    const abandoned = createTestGoal();
    abandoned.abandon();
    expect(() => policy.ensureGoalCanBeActivated(completed)).not.toThrow();
    expect(() => policy.ensureGoalCanBeActivated(abandoned)).not.toThrow();

    const archived = createArchivedGoal();
    expect(() => policy.ensureGoalCanBeActivated(archived)).toThrow(GoalArchivedError);
  });
});
