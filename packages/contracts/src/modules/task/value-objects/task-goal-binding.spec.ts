import { describe, expect, it } from 'vitest';
import { TaskGoalLinkSchema } from './task-goal-binding';

const link = {
  goalId: 'GoalId_11111111-1111-4111-8111-111111111111',
  keyResultId: 'KeyResultId_22222222-2222-4222-8222-222222222222',
};
describe('Task Goal progress rules', () => {
  it('normalizes LinkOnly and legacy signed Fixed contribution', () => {
    expect(TaskGoalLinkSchema.parse(link)).toMatchObject({
      progressRule: null,
      contribution: null,
    });
    expect(
      TaskGoalLinkSchema.parse({ ...link, contribution: { value: -2, trigger: 'EachCompletion' } }),
    ).toMatchObject({ progressRule: { mode: 'Fixed', value: -2, trigger: 'EachCompletion' } });
  });
  it.each([0, -3, 2, null, undefined])(
    'accepts finite optional Prompt suggestion %s',
    (suggestedValue) => {
      expect(
        TaskGoalLinkSchema.parse({
          ...link,
          progressRule: { mode: 'Prompt', trigger: 'EachCompletion', suggestedValue },
        }).contribution,
      ).toBeNull();
    },
  );
  it.each([0, Infinity, -Infinity, NaN])('rejects invalid Fixed delta %s', (value) => {
    expect(
      TaskGoalLinkSchema.safeParse({
        ...link,
        progressRule: { mode: 'Fixed', trigger: 'EachCompletion', value },
      }).success,
    ).toBe(false);
  });
  it('rejects invalid suggestions, triggers, missing KR and conflicts', () => {
    for (const progressRule of [
      { mode: 'Prompt', trigger: 'PlanCompletion' },
      { mode: 'Prompt', trigger: 'EachCompletion', suggestedValue: Infinity },
    ])
      expect(TaskGoalLinkSchema.safeParse({ ...link, progressRule }).success).toBe(false);
    expect(
      TaskGoalLinkSchema.safeParse({
        goalId: link.goalId,
        progressRule: { mode: 'Prompt', trigger: 'EachCompletion' },
      }).success,
    ).toBe(false);
    for (const progressRule of [
      null,
      { mode: 'Prompt', trigger: 'EachCompletion' },
      { mode: 'Fixed', trigger: 'EachCompletion', value: 3 },
    ]) {
      expect(
        TaskGoalLinkSchema.safeParse({
          ...link,
          progressRule,
          contribution: { value: 2, trigger: 'EachCompletion' },
        }).success,
      ).toBe(false);
    }
  });
  it('rejects an explicit LinkOnly mirror for Fixed', () => {
    expect(
      TaskGoalLinkSchema.safeParse({
        ...link,
        progressRule: { mode: 'Fixed', trigger: 'EachCompletion', value: 2 },
        contribution: null,
      }).success,
    ).toBe(false);
  });
  it('accepts an identical deprecated mirror', () => {
    const contribution = { value: -2, trigger: 'EachCompletion' };
    expect(
      TaskGoalLinkSchema.parse({
        ...link,
        progressRule: { mode: 'Fixed', ...contribution },
        contribution,
      }).contribution,
    ).toEqual(contribution);
  });
});
