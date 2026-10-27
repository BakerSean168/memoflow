import { describe, expect, it } from 'vitest';
import {
  TaskGoalContextItemSchema,
  TaskGoalContextPageRequestSchema,
  TaskGoalContextPageSchema,
  TaskGoalContextSummarySchema,
} from './task-goal-context.dto';
import { TaskPlanOutcome } from '../value-objects/task-plan-outcome';
import { TaskPlanStatus } from '../value-objects/task-plan-status';

describe('Task Goal context read contracts', () => {
  it('applies bounded pagination defaults and rejects unknown request fields', () => {
    expect(TaskGoalContextPageRequestSchema.parse({})).toEqual({ limit: 20, offset: 0 });
    expect(TaskGoalContextPageRequestSchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(TaskGoalContextPageRequestSchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(TaskGoalContextPageRequestSchema.safeParse({ extra: true }).success).toBe(false);
  });

  it('represents Goal-only Task context without synthesizing a Key Result', () => {
    expect(
      TaskGoalContextItemSchema.parse({
        taskPlanId: 'task-1',
        name: 'Prepare portfolio',
        status: TaskPlanStatus.Active,
        outcome: TaskPlanOutcome.Open,
        keyResultId: null,
        hasContribution: false,
      }),
    ).toMatchObject({ keyResultId: null, hasContribution: false });
  });

  it('keeps pages and summaries strict and non-negative', () => {
    const item = {
      taskPlanId: 'task-1',
      name: 'Prepare portfolio',
      status: TaskPlanStatus.Closed,
      outcome: TaskPlanOutcome.Succeeded,
      keyResultId: 'kr-1',
      hasContribution: true,
    };
    expect(
      TaskGoalContextPageSchema.parse({ items: [item], total: 1, limit: 20, offset: 0 }),
    ).toMatchObject({ total: 1 });
    expect(
      TaskGoalContextPageSchema.safeParse({
        items: [item],
        total: 1,
        limit: 20,
        offset: 0,
        extra: true,
      }).success,
    ).toBe(false);

    expect(
      TaskGoalContextSummarySchema.parse({
        total: 3,
        active: 1,
        completed: 1,
        goalLevel: 1,
        byKeyResult: [{ keyResultId: 'kr-1', total: 2, active: 1 }],
      }),
    ).toEqual({
      total: 3,
      active: 1,
      completed: 1,
      goalLevel: 1,
      byKeyResult: [{ keyResultId: 'kr-1', total: 2, active: 1 }],
    });
    expect(
      TaskGoalContextSummarySchema.safeParse({
        total: -1,
        active: 0,
        completed: 0,
        goalLevel: 0,
        byKeyResult: [],
      }).success,
    ).toBe(false);
  });
});
