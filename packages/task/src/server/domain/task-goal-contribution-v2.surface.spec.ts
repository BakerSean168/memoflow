import { describe, expect, it } from 'vitest';
import {
  TaskGoalBindingTrigger,
  type CreateTaskPlanReq,
} from '@memoflow/contracts/task';

describe('TASK-2205 Goal link / contribution V2 contract', () => {
  it('uses the canonical settlement triggers', () => {
    expect(Object.values(TaskGoalBindingTrigger)).toEqual([
      'EachCompletion',
      'PlanCompletion',
    ]);
  });

  it('allows a Goal link without configuring automatic contribution', () => {
    type Binding = NonNullable<CreateTaskPlanReq['goalBinding']>;
    const linkOnly = {
      goalId: 'IGoalId_goal-1',
      keyResultId: 'IKeyResultId_kr-1',
    } as Binding;

    expect(linkOnly.goalId).toBe('IGoalId_goal-1');
    expect(linkOnly.keyResultId).toBe('IKeyResultId_kr-1');
    expect(linkOnly.contribution).toBeUndefined();
    expect(linkOnly).not.toHaveProperty('goalRecordValue');
    expect(linkOnly).not.toHaveProperty('progressTrigger');
  });
});
