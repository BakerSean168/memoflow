import { vi, describe, it, expect } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils';
import type { IGoalRepository } from '../../../../domain';
import { ListGoalReviewsUseCase } from '../list-goal-reviews.use-case';

function createGoalReviewFixture(overrides?: Record<string, any>) {
  const dto = {
    id: overrides?.id ?? 'review-1',
    reflection: overrides?.reflection ?? 'reflection',
  };
  return {
    ...dto,
    toClientDTO: vi.fn().mockReturnValue(dto),
    ...overrides,
  } as any;
}

function createGoalFixture(overrides?: Record<string, any>) {
  return {
    id: overrides?.id ?? 'goal-1',
    goalReviews: overrides?.goalReviews ?? [],
    ...overrides,
  } as any;
}

describe('ListGoalReviewsUseCase', () => {
  it('should return all goal reviews', async () => {
    const review1 = createGoalReviewFixture({ id: 'review-1' });
    const review2 = createGoalReviewFixture({ id: 'review-2' });
    const goal = createGoalFixture({ goalReviews: [review1, review2] });

    const findByIdForIdentity = vi.fn().mockResolvedValue(goal);
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity,
    });
    const useCase = new ListGoalReviewsUseCase(goalRepo);

    const result = await useCase.execute('goal-1', 'identity-1');

    expect(findByIdForIdentity).toHaveBeenCalledWith('identity-1', 'goal-1', {
      includeChildren: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total).toBe(2);
    expect(result.data.data).toEqual([
      { id: 'review-1', reflection: 'reflection' },
      { id: 'review-2', reflection: 'reflection' },
    ]);
    expect(review1.toClientDTO).toHaveBeenCalled();
    expect(review2.toClientDTO).toHaveBeenCalled();
  });

  it('should return NOT_FOUND when goal does not exist', async () => {
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(null),
    });
    const useCase = new ListGoalReviewsUseCase(goalRepo);

    const result = await useCase.execute('missing-goal', 'identity-1');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_FOUND');
    expect(result.error.message).toContain('missing-goal');
  });

  it('should return empty result when goal has no reviews', async () => {
    const goal = createGoalFixture({ goalReviews: [] });
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
    });
    const useCase = new ListGoalReviewsUseCase(goalRepo);

    const result = await useCase.execute('goal-1', 'identity-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.data).toEqual([]);
    expect(result.data.total).toBe(0);
  });
});
