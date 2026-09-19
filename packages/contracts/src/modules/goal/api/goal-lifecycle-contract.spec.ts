import { describe, expect, it } from 'vitest';
import { GoalStatus } from '../value-objects/goal-status';
import {
  CloneGoalSchema,
  CreateGoalSchema,
  ListGoalFiltersSchema,
  UpdateGoalSchema,
} from './goal-crud.dto';

describe('Goal vNext identity/lifecycle contract (GOAL-7202)', () => {
  it('publishes exactly the four explicit lifecycle states and rejects retired Active', () => {
    expect(Object.values(GoalStatus)).toEqual(['Planned', 'InProgress', 'Completed', 'Abandoned']);
    expect(ListGoalFiltersSchema.safeParse({ status: ['Planned', 'InProgress'] }).success).toBe(
      true,
    );
    expect(ListGoalFiltersSchema.safeParse({ status: ['Active'] }).success).toBe(false);
  });

  it('accepts name + summary and rejects retired Goal identity fields', () => {
    expect(
      CreateGoalSchema.safeParse({ name: 'Ship MemoFlow', summary: 'Converge Goal semantics.' })
        .success,
    ).toBe(true);

    for (const retired of ['description', 'motivation', 'feasibilityAnalysis'] as const) {
      expect(
        CreateGoalSchema.safeParse({ name: 'Ship MemoFlow', [retired]: 'legacy text' }).success,
      ).toBe(false);
    }
  });

  it('keeps summary bounded to 500 characters across create/update/clone', () => {
    const tooLong = 'x'.repeat(501);
    expect(CreateGoalSchema.safeParse({ name: 'Goal', summary: tooLong }).success).toBe(false);
    expect(UpdateGoalSchema.safeParse({ expectedVersion: 1, summary: tooLong }).success).toBe(
      false,
    );
    expect(CloneGoalSchema.safeParse({ summary: tooLong }).success).toBe(false);
  });
});
