import { vi, describe, it, expect } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { IGoalRepository, IGoalRecordRepository } from '../../../../domain';
import { GetGoalAggregateUseCase } from '../get-goal-aggregate.use-case';

// ============================================================
// Helpers
// ============================================================

function createGoalFixture(overrides?: Record<string, any>) {
  return {
    id: overrides?.id ?? 'goal-id-1',
    name: overrides?.name ?? 'Test Goal',
    keyResults: overrides?.keyResults ?? [],
    goalReviews: overrides?.goalReviews ?? [],
    calculateProgress: vi.fn().mockReturnValue(overrides?.overallProgress ?? 50),
    toClientDTO: vi.fn().mockReturnValue({
      id: overrides?.id ?? 'goal-id-1',
      name: overrides?.name ?? 'Test Goal',
      keyResults: overrides?.clientKeyResults ?? [],
      reviews: overrides?.clientReviews ?? [],
    }),
    ...overrides,
  } as any;
}

function createRecordFixture(id: string, overrides?: Record<string, any>) {
  return {
    id,
    keyResultId: overrides?.keyResultId ?? 'kr-1',
    value: overrides?.value ?? 10,
    toClientDTO: vi.fn().mockReturnValue({ id, value: overrides?.value ?? 10 }),
  } as any;
}

// ============================================================
// Tests
// ============================================================

describe('GetGoalAggregateUseCase', () => {
  it('returns aggregate with goal, keyResults, records, reviews, and statistics', async () => {
    const goal = createGoalFixture({
      keyResults: [
        {
          id: 'kr-1',
          isCompleted: vi.fn().mockReturnValue(false),
          toClientDTO: vi.fn().mockReturnValue({
            id: 'kr-1',
            title: 'KR1',
            progress: { currentValue: 8, targetValue: 10, initialValue: 0 },
          }),
        },
        {
          id: 'kr-2',
          isCompleted: vi.fn().mockReturnValue(true),
          toClientDTO: vi.fn().mockReturnValue({
            id: 'kr-2',
            title: 'KR2',
            progress: { currentValue: 10, targetValue: 10, initialValue: 0 },
          }),
        },
      ],
      goalReviews: [
        {
          id: 'rev-1',
          toClientDTO: vi.fn().mockReturnValue({ id: 'rev-1', title: 'Review 1' }),
        },
      ],
      clientKeyResults: [
        {
          id: 'kr-1',
          title: 'KR1',
          progress: { currentValue: 8, targetValue: 10, initialValue: 0 },
        },
        {
          id: 'kr-2',
          title: 'KR2',
          progress: { currentValue: 10, targetValue: 10, initialValue: 0 },
        },
      ],
      clientReviews: [{ id: 'rev-1', title: 'Review 1' }],
    });
    const records = [createRecordFixture('rec-1'), createRecordFixture('rec-2')];

    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
    });
    const recordRepo = createMockRepo<IGoalRecordRepository>({
      findByGoalId: vi.fn().mockResolvedValue(records),
    });

    const useCase = new GetGoalAggregateUseCase(goalRepo, recordRepo);
    const result = await useCase.execute('goal-id-1', 'identity-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.goal.id).toBe('goal-id-1');
    expect(result.data.keyResults).toHaveLength(2);
    expect(result.data.records).toHaveLength(2);
    expect(result.data.reviews).toHaveLength(1);
    expect(result.data.statistics.totalKeyResults).toBe(2);
    expect(result.data.statistics.completedKeyResults).toBe(1);
    expect(result.data.statistics.totalRecords).toBe(2);
    expect(result.data.statistics.totalReviews).toBe(1);
  });

  it('returns NOT_FOUND when goal does not exist', async () => {
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(null),
    });
    const recordRepo = createMockRepo<IGoalRecordRepository>({});

    const useCase = new GetGoalAggregateUseCase(goalRepo, recordRepo);
    const result = await useCase.execute('non-existent', 'identity-1');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_FOUND');
  });

  it('passes includeChildren=true to repository', async () => {
    const goal = createGoalFixture();
    const findByIdForIdentity = vi.fn().mockResolvedValue(goal);
    const goalRepo = createMockRepo<IGoalRepository>({ findByIdForIdentity });
    const recordRepo = createMockRepo<IGoalRecordRepository>({
      findByGoalId: vi.fn().mockResolvedValue([]),
    });

    const useCase = new GetGoalAggregateUseCase(goalRepo, recordRepo);
    await useCase.execute('goal-id-1', 'identity-1');

    expect(findByIdForIdentity).toHaveBeenCalledWith('identity-1', 'goal-id-1', {
      includeChildren: true,
    });
  });

  it('returns empty arrays when goal has no children', async () => {
    const goal = createGoalFixture({
      keyResults: [],
      goalReviews: [],
      clientKeyResults: [],
      clientReviews: [],
      overallProgress: 0,
    });
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
    });
    const recordRepo = createMockRepo<IGoalRecordRepository>({
      findByGoalId: vi.fn().mockResolvedValue([]),
    });

    const useCase = new GetGoalAggregateUseCase(goalRepo, recordRepo);
    const result = await useCase.execute('goal-id-1', 'identity-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.statistics.totalKeyResults).toBe(0);
    expect(result.data.statistics.completedKeyResults).toBe(0);
    expect(result.data.statistics.overallProgress).toBe(0);
  });

  it('orders records by descending', async () => {
    const goal = createGoalFixture();
    const findByGoalId = vi.fn().mockResolvedValue([]);
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
    });
    const recordRepo = createMockRepo<IGoalRecordRepository>({ findByGoalId });

    const useCase = new GetGoalAggregateUseCase(goalRepo, recordRepo);
    await useCase.execute('goal-id-1', 'identity-1');

    expect(findByGoalId).toHaveBeenCalledWith('identity-1', 'goal-id-1', { orderBy: 'desc' });
  });
});
