import { describe, expect, it } from 'vitest';
import {
  TaskPlanCompletionPolicy,
  TaskPlanOutcome,
  TaskPlanStatus,
} from '@memoflow/contracts/task';
import { ImportanceLevel } from '@memoflow/contracts/shared';
import { TaskPlan, type TaskPlanState } from './task-plan';

function stateWithGoalOnlyLink(): TaskPlanState {
  return {
    id: 'ITaskPlanId_550e8400-e29b-41d4-a716-446655440000' as TaskPlanState['id'],
    identityId: 'IdentityId_550e8400-e29b-41d4-a716-446655440001' as TaskPlanState['identityId'],
    name: 'Goal-level task',
    description: null,
    schedule: { kind: 'OneTime', date: '2026-09-12', timing: { kind: 'AllDay' } },
    reminderConfig: null,
    importance: ImportanceLevel.Moderate,
    goalBinding: {
      goalId: 'IGoalId_550e8400-e29b-41d4-a716-446655440002',
      keyResultId: null,
      contribution: null,
    },
    labels: [],
    status: TaskPlanStatus.Active,
    outcome: TaskPlanOutcome.Open,
    completionPolicy: TaskPlanCompletionPolicy.AllowCorrection,
    closedAt: null,
    archivedAt: null,
    abandonedReason: null,
    lastGeneratedDate: null,
    generateAheadDays: null,
    version: 1,
    createdAt: 1 as TaskPlanState['createdAt'],
    updatedAt: 1 as TaskPlanState['updatedAt'],
    deletedAt: null,
    instanceCount: 0,
    completedInstanceCount: 0,
    pendingInstanceCount: 0,
    dueInstanceCount: 0,
    completedDueInstanceCount: 0,
    completionWindowDays: 30,
    futurePendingInstanceCount: 0,
    singleInstanceStatus: null,
    completionRate: 0,
  };
}

describe('TaskPlan domain-client Goal link serialization', () => {
  it('preserves a Goal-only Key Result id as null instead of the string "null"', () => {
    const dto = TaskPlan.load(stateWithGoalOnlyLink()).toDTO();
    expect(dto.goalBinding).toEqual({
      goalId: 'IGoalId_550e8400-e29b-41d4-a716-446655440002',
      keyResultId: null,
      contribution: null,
    });
  });
});
