import { vi, describe, it, expect } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils';
import type { IGoalRecordRepository, IGoalRepository } from '../../../../domain';
import { ListGoalRecordsUseCase } from '../list-goal-records.use-case';

function createRecordFixture(overrides?: Record<string, any>) {
  const id = overrides?.id ?? 'record-1';
  const value = overrides?.value ?? 10;
  return {
    id,
    identityId: overrides?.identityId ?? 'identity-1',
    keyResultId: overrides?.keyResultId ?? 'kr-1',
    value,
    createdAt: overrides?.createdAt ?? new Date('2026-01-01T00:00:00.000Z'),
    toClientDTO: vi.fn().mockReturnValue({ id, value }),
    ...overrides,
  } as any;
}

function createGoalFixture(overrides?: Record<string, any>) {
  return {
    id: overrides?.id ?? 'goal-1',
    keyResults: overrides?.keyResults ?? [],
    ...overrides,
  } as any;
}

describe('ListGoalRecordsUseCase', () => {
  it('should return empty list when no goalId and no keyResultId', async () => {
    const goalRecordRepo = createMockRepo<IGoalRecordRepository>({
      findByKeyResultId: vi.fn(),
      findByGoalId: vi.fn(),
    });
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn(),
    });
    const useCase = new ListGoalRecordsUseCase(goalRecordRepo, goalRepo);

    const result = await useCase.execute({ identityId: 'identity-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.data).toEqual([]);
    expect(result.data.total).toBe(0);
    expect(goalRecordRepo.findByKeyResultId).not.toHaveBeenCalled();
    expect(goalRecordRepo.findByGoalId).not.toHaveBeenCalled();
    expect(goalRepo.findByIdForIdentity).not.toHaveBeenCalled();
  });

  it('should query by keyResultId and apply offset/limit', async () => {
    const first = createRecordFixture({ id: 'record-1', value: 10 });
    const second = createRecordFixture({ id: 'record-2', value: 20 });
    const third = createRecordFixture({ id: 'record-3', value: 30 });

    const findByKeyResultId = vi.fn().mockResolvedValue([first, second, third]);
    const goalRecordRepo = createMockRepo<IGoalRecordRepository>({
      findByKeyResultId,
      findByGoalId: vi.fn(),
    });
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn(),
    });
    const useCase = new ListGoalRecordsUseCase(goalRecordRepo, goalRepo);

    const result = await useCase.execute({
      identityId: 'identity-1',
      keyResultId: 'kr-1',
      offset: 1,
      limit: 1,
    });

    expect(findByKeyResultId).toHaveBeenCalledWith('identity-1', 'kr-1', { orderBy: 'desc' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total).toBe(3);
    expect(result.data.data).toHaveLength(1);
    expect(second.toClientDTO).toHaveBeenCalledWith('', 20);
    expect(first.toClientDTO).not.toHaveBeenCalled();
    expect(third.toClientDTO).not.toHaveBeenCalled();
    expect(goalRepo.findByIdForIdentity).not.toHaveBeenCalled();
  });

  it('should filter out foreign-identity records', async () => {
    const owned = createRecordFixture({ id: 'record-1', value: 10 });
    const foreign = createRecordFixture({
      id: 'record-2',
      value: 20,
      identityId: 'identity-other',
    });
    const goalRecordRepo = createMockRepo<IGoalRecordRepository>({
      findByKeyResultId: vi.fn().mockResolvedValue([owned, foreign]),
      findByGoalId: vi.fn(),
    });
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn(),
    });
    const useCase = new ListGoalRecordsUseCase(goalRecordRepo, goalRepo);

    const result = await useCase.execute({
      identityId: 'identity-1',
      keyResultId: 'kr-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.total).toBe(1);
    expect(owned.toClientDTO).toHaveBeenCalled();
    expect(foreign.toClientDTO).not.toHaveBeenCalled();
  });

  it('should return NOT_FOUND when goal is not found for identity', async () => {
    const record = createRecordFixture({ id: 'record-1', value: 40, keyResultId: 'kr-1' });

    const goalRecordRepo = createMockRepo<IGoalRecordRepository>({
      findByGoalId: vi.fn().mockResolvedValue([record]),
      findByKeyResultId: vi.fn(),
    });
    const findByIdForIdentity = vi.fn().mockResolvedValue(null);
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity,
    });
    const useCase = new ListGoalRecordsUseCase(goalRecordRepo, goalRepo);

    const result = await useCase.execute({ identityId: 'identity-1', goalId: 'goal-1' });

    expect(findByIdForIdentity).toHaveBeenCalledWith('identity-1', 'goal-1', {
      includeChildren: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_FOUND');
    expect(goalRecordRepo.findByGoalId).not.toHaveBeenCalled();
  });

  it('should fallback to record value when keyResult does not exist on goal', async () => {
    const record = createRecordFixture({ id: 'record-1', value: 15, keyResultId: 'kr-missing' });
    const goal = createGoalFixture({
      keyResults: [
        {
          id: 'kr-1',
          progress: {
            aggregationMethod: 'Sum',
            trackingBaseValue: 0,
            initialValue: 0,
            targetValue: 100,
            currentValue: 0,
            unit: null,
          },
        },
      ],
    });

    const goalRecordRepo = createMockRepo<IGoalRecordRepository>({
      findByGoalId: vi.fn().mockResolvedValue([record]),
      findByKeyResultId: vi.fn(),
    });
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
    });
    const useCase = new ListGoalRecordsUseCase(goalRecordRepo, goalRepo);

    const result = await useCase.execute({ identityId: 'identity-1', goalId: 'goal-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(record.toClientDTO).toHaveBeenCalledWith('goal-1', 15);
  });

  it('should calculate valueAfter using trackingBaseValue plus authoritative Sum history', async () => {
    const recordA = createRecordFixture({
      id: 'record-a',
      value: 5,
      keyResultId: 'kr-1',
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
    });
    const recordB = createRecordFixture({
      id: 'record-b',
      value: 7,
      keyResultId: 'kr-1',
      createdAt: new Date('2026-02-02T00:00:00.000Z'),
    });

    const goal = createGoalFixture({
      keyResults: [
        {
          id: 'kr-1',
          progress: {
            aggregationMethod: 'Sum',
            trackingBaseValue: 10,
            initialValue: 0,
            targetValue: 200,
            currentValue: 22,
            unit: null,
          },
        },
      ],
    });

    const goalRecordRepo = createMockRepo<IGoalRecordRepository>({
      findByGoalId: vi.fn().mockResolvedValue([recordA, recordB]),
      findByKeyResultId: vi.fn(),
    });
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
    });
    const useCase = new ListGoalRecordsUseCase(goalRecordRepo, goalRepo);

    const result = await useCase.execute({ identityId: 'identity-1', goalId: 'goal-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(recordA.toClientDTO).toHaveBeenCalledWith('goal-1', 15);
    expect(recordB.toClientDTO).toHaveBeenCalledWith('goal-1', 22);
  });

  it('should calculate valueAfter directly from sample aggregation history', async () => {
    const recordA = createRecordFixture({
      id: 'record-a',
      value: 10,
      keyResultId: 'kr-1',
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
    });
    const recordB = createRecordFixture({
      id: 'record-b',
      value: 30,
      keyResultId: 'kr-1',
      createdAt: new Date('2026-03-02T00:00:00.000Z'),
    });

    const goal = createGoalFixture({
      keyResults: [
        {
          id: 'kr-1',
          progress: {
            aggregationMethod: 'Average',
            trackingBaseValue: 0,
            initialValue: 0,
            targetValue: 100,
            currentValue: 999,
            unit: null,
          },
        },
      ],
    });

    const goalRecordRepo = createMockRepo<IGoalRecordRepository>({
      findByGoalId: vi.fn().mockResolvedValue([recordA, recordB]),
      findByKeyResultId: vi.fn(),
    });
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
    });
    const useCase = new ListGoalRecordsUseCase(goalRecordRepo, goalRepo);

    const result = await useCase.execute({ identityId: 'identity-1', goalId: 'goal-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(recordA.toClientDTO).toHaveBeenCalledWith('goal-1', 10);
    expect(recordB.toClientDTO).toHaveBeenCalledWith('goal-1', 20);
  });
});
