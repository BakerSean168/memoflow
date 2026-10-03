import { describe, expect, it } from 'vitest';
import { TaskGoalLinkSchema } from '@memoflow/contracts/task';
import { TaskGoalBinding } from './task-goal-binding';
const ids = {
  goalId: 'GoalId_11111111-1111-4111-8111-111111111111',
  keyResultId: 'KeyResultId_22222222-2222-4222-8222-222222222222',
};
describe('TaskGoalBinding canonical progress', () => {
  it('round-trips legacy Fixed while deriving the deprecated mirror', () => {
    const dto = TaskGoalLinkSchema.parse({
      ...ids,
      contribution: { value: -3, trigger: 'PlanCompletion' },
    });
    const binding = TaskGoalBinding.fromDTO(dto);
    expect(binding.progressRule).toEqual({ mode: 'Fixed', value: -3, trigger: 'PlanCompletion' });
    expect(TaskGoalBinding.fromDTO(binding.toDTO()).toDTO()).toEqual(binding.toDTO());
    expect(binding.withContribution(null).progressRule).toBeNull();
  });
  it.each([0, -3, null])(
    'round-trips Prompt suggestion %s as configuration only',
    (suggestedValue) => {
      const binding = TaskGoalBinding.fromDTO(
        TaskGoalLinkSchema.parse({
          ...ids,
          progressRule: { mode: 'Prompt', trigger: 'EachCompletion', suggestedValue },
        }),
      );
      expect(binding.hasContribution).toBe(false);
      expect(binding.contribution).toBeNull();
      expect(TaskGoalBinding.fromDTO(binding.toDTO()).progressRule).toEqual(binding.progressRule);
    },
  );
});
