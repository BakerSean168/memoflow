import { describe, expect, it, vi } from 'vitest';
import { GoalStatus } from '@memoflow/contracts/goal';
import { createMockRepo } from '@memoflow/test-utils';
import type { IGoalRepository } from '../../../../domain';
import { GetGoalHomeSummaryUseCase } from '../get-goal-home-summary.use-case';

function goal(overrides: Partial<{
  id: string;
  name: string;
  progress: number;
  status: (typeof GoalStatus)[keyof typeof GoalStatus];
  updatedAt: number;
  keyResultCount: number;
}> = {}) {
  return {
    id: overrides.id ?? 'goal-1',
    name: overrides.name ?? 'Goal',
    progress: overrides.progress ?? 50,
    status: overrides.status ?? GoalStatus.InProgress,
    target: null,
    updatedAt: overrides.updatedAt ?? 1,
    keyResults: Array.from({ length: overrides.keyResultCount ?? 2 }, () => ({})),
  } as never;
}

describe('GetGoalHomeSummaryUseCase', () => {
  it('loads the owner active view with children and returns newest five plus total active count', async () => {
    const findByIdentityId = vi.fn().mockResolvedValue([
      goal({ id: 'g1', updatedAt: 1, progress: Number.NaN }),
      goal({ id: 'g2', updatedAt: 6, progress: 99.6 }),
      goal({ id: 'g3', updatedAt: 5, progress: 40.4 }),
      goal({ id: 'g4', updatedAt: 4, progress: -5 }),
      goal({ id: 'g5', updatedAt: 3, progress: 120 }),
      goal({ id: 'g6', updatedAt: 2, progress: 20, keyResultCount: 4 }),
    ]);
    const useCase = new GetGoalHomeSummaryUseCase(
      createMockRepo<IGoalRepository>({ findByIdentityId }),
    );

    const result = await useCase.execute('identity-1');

    expect(findByIdentityId).toHaveBeenCalledWith('identity-1', {
      includeChildren: true,
      systemView: 'active',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.activeCount).toBe(6);
    expect(result.data.goals.map((item) => item.id)).toEqual(['g2', 'g3', 'g4', 'g5', 'g6']);
    expect(result.data.goals.map((item) => item.progress)).toEqual([100, 40, 0, 100, 20]);
    expect(result.data.goals.at(-1)?.keyResultCount).toBe(4);
  });

  it('returns an empty summary when no active goals exist', async () => {
    const useCase = new GetGoalHomeSummaryUseCase(
      createMockRepo<IGoalRepository>({ findByIdentityId: vi.fn().mockResolvedValue([]) }),
    );
    const result = await useCase.execute('identity-1');
    expect(result).toEqual({ ok: true, data: { activeCount: 0, goals: [] } });
  });
});
