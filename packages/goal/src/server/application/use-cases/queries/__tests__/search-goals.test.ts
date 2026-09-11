import { vi, describe, it, expect } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils';
import type { IGoalRepository } from '../../../../domain';
import { SearchGoalsUseCase } from '../search-goals.use-case';

// ============================================================
// Helpers
// ============================================================

function createGoalFixture(overrides?: Record<string, any>) {
  return {
    id: overrides?.id ?? 'goal-id-1',
    name: overrides?.name ?? 'Test Goal',
    summary: overrides?.description ?? 'Test description',
    status: overrides?.status ?? 'IN_PROGRESS',
    title: overrides?.title ?? 'Test Goal',
    targetDate: overrides?.targetDate ?? null,
    keyResults: overrides?.keyResults ?? [],
    getOverallProgress: vi.fn().mockReturnValue(overrides?.progress ?? 50),
    toClientDTO: vi.fn().mockReturnValue({
      id: overrides?.id ?? 'goal-id-1',
      name: overrides?.name ?? 'Test Goal',
      summary: overrides?.description ?? 'Test description',
      status: overrides?.status ?? 'IN_PROGRESS',
    }),
    ...overrides,
  } as any;
}

// ============================================================
// Tests
// ============================================================

describe('SearchGoalsUseCase', () => {
  it('should return goals matching the query by name', async () => {
    const goal1 = createGoalFixture({ id: 'goal-1', name: 'Learn TypeScript' });
    const goal2 = createGoalFixture({ id: 'goal-2', name: 'Read Books' });
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdentityId: vi.fn().mockResolvedValue([goal1, goal2]),
    });
    const useCase = new SearchGoalsUseCase(goalRepo);

    const result = await useCase.execute('identity-1', 'TypeScript');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.data).toHaveLength(1);
    expect(result.data.pagination.total).toBe(1);
    expect(goal1.toClientDTO).toHaveBeenCalled();
    expect(goal2.toClientDTO).not.toHaveBeenCalled();
  });

  it('should return goals matching the query by summary', async () => {
    const goal1 = createGoalFixture({
      id: 'goal-1',
      name: 'Goal A',
      summary: 'Improve fitness',
    });
    const goal2 = createGoalFixture({ id: 'goal-2', name: 'Goal B', summary: 'Learn cooking' });
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdentityId: vi.fn().mockResolvedValue([goal1, goal2]),
    });
    const useCase = new SearchGoalsUseCase(goalRepo);

    const result = await useCase.execute('identity-1', 'fitness');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.data).toHaveLength(1);
    expect(goal1.toClientDTO).toHaveBeenCalled();
  });

  it('should return empty results when no goals match', async () => {
    const goal1 = createGoalFixture({ id: 'goal-1', name: 'Learn TypeScript' });
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdentityId: vi.fn().mockResolvedValue([goal1]),
    });
    const useCase = new SearchGoalsUseCase(goalRepo);

    const result = await useCase.execute('identity-1', 'nonexistent');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.data).toHaveLength(0);
    expect(result.data.pagination.total).toBe(0);
    expect(result.data.pagination.hasMore).toBe(false);
    expect(result.data.pagination.totalPages).toBe(0);
  });

  it('should perform case-insensitive search', async () => {
    const goal = createGoalFixture({ id: 'goal-1', name: 'Learn TYPESCRIPT' });
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdentityId: vi.fn().mockResolvedValue([goal]),
    });
    const useCase = new SearchGoalsUseCase(goalRepo);

    const result = await useCase.execute('identity-1', 'typescript');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.data).toHaveLength(1);
  });

  it('should handle goals with null summary', async () => {
    const goal = createGoalFixture({ id: 'goal-1', name: 'Goal A', summary: null });
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdentityId: vi.fn().mockResolvedValue([goal]),
    });
    const useCase = new SearchGoalsUseCase(goalRepo);

    const result = await useCase.execute('identity-1', 'something');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.data).toHaveLength(0);
  });

  it('should set pagination with page 1 and hasMore false', async () => {
    const goals = Array.from({ length: 3 }, (_, i) =>
      createGoalFixture({ id: `goal-${i}`, name: `Match ${i}` }),
    );
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdentityId: vi.fn().mockResolvedValue(goals),
    });
    const useCase = new SearchGoalsUseCase(goalRepo);

    const result = await useCase.execute('identity-1', 'Match');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.pagination.page).toBe(1);
    expect(result.data.pagination.pageSize).toBe(3);
    expect(result.data.pagination.total).toBe(3);
    expect(result.data.pagination.hasMore).toBe(false);
    expect(result.data.pagination.totalPages).toBe(1);
  });
});
