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

  it('accepts name + summary + description and rejects retired Goal identity fields', () => {
    expect(
      CreateGoalSchema.safeParse({
        name: 'Ship MemoFlow',
        summary: 'Converge Goal semantics.',
        description: 'Long-form goal brief.',
      }).success,
    ).toBe(true);

    for (const retired of ['motivation', 'feasibilityAnalysis'] as const) {
      expect(
        CreateGoalSchema.safeParse({ name: 'Ship MemoFlow', [retired]: 'legacy text' }).success,
      ).toBe(false);
    }
  });

  it('keeps name/summary/description bounded across create/update/clone', () => {
    expect(CreateGoalSchema.safeParse({ name: 'x'.repeat(81) }).success).toBe(false);
    const tooLong = 'x'.repeat(256);
    expect(CreateGoalSchema.safeParse({ name: 'Goal', summary: tooLong }).success).toBe(false);
    expect(UpdateGoalSchema.safeParse({ expectedVersion: 1, summary: tooLong }).success).toBe(
      false,
    );
    expect(CloneGoalSchema.safeParse({ summary: tooLong }).success).toBe(false);
    expect(
      CreateGoalSchema.safeParse({ name: 'Goal', description: 'x'.repeat(10001) }).success,
    ).toBe(false);
  });
});
