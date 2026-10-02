import { describe, expect, it, vi } from 'vitest';
import { error, ok } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import { GoalPlanMutationAdapter } from './goal-plan-mutation.adapter';

const context = { identityId: 'identity-1' } as ExecutionContext;
function setup() {
  const goal = { getGoalAggregate: vi.fn() };
  const adapter = new GoalPlanMutationAdapter(
    goal as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { goal, adapter };
}
describe('GoalPlanMutationAdapter owner read', () => {
  it('reads deterministic Goal/KRs through the identity-scoped owner application capability', async () => {
    const { goal, adapter } = setup();
    goal.getGoalAggregate.mockResolvedValue(
      ok({
        goal: { id: 'goal-1', version: 4, status: 'InProgress' },
        keyResults: [{ id: 'kr-1' }, { id: 'kr-2' }],
      }),
    );
    expect(await adapter.readGoal('goal-1', context)).toEqual(
      ok({
        goalId: 'goal-1',
        goalVersion: 4,
        goalStatus: 'InProgress',
        keyResultIds: ['kr-1', 'kr-2'],
      }),
    );
    expect(goal.getGoalAggregate).toHaveBeenCalledExactlyOnceWith('goal-1', context.identityId);
  });
  it.each(['NOT_FOUND', 'NETWORK_ERROR'])(
    'preserves owner %s rather than converting unknown into absence',
    async (code) => {
      const { goal, adapter } = setup();
      const result = error(code, 'Owner lookup failed');
      goal.getGoalAggregate.mockResolvedValue(result);
      expect(await adapter.readGoal('goal-1', context)).toBe(result);
    },
  );
  it('leaves thrown owner reads for the workflow structured failure boundary', async () => {
    const { goal, adapter } = setup();
    goal.getGoalAggregate.mockRejectedValue(new Error('Transient read'));
    await expect(adapter.readGoal('goal-1', context)).rejects.toThrow('Transient read');
  });
});
