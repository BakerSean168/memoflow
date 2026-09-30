import { vi, describe, it, expect } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils';
import type { IGoalRepository } from '../../../../domain';
import { GetGoalUseCase } from '../get-goal.use-case';

// ============================================================
// Helpers
// ============================================================

function createGoalFixture(overrides?: Record<string, any>) {
  return {
    id: overrides?.id ?? 'goal-id-1',
    name: overrides?.name ?? 'Test Goal',
    description: overrides?.description ?? 'Test description',
    status: overrides?.status ?? 'IN_PROGRESS',
    title: overrides?.title ?? 'Test Goal',
    targetDate: overrides?.targetDate ?? null,
    keyResults: overrides?.keyResults ?? [],
    getOverallProgress: vi.fn().mockReturnValue(overrides?.progress ?? 50),
    toClientDTO: vi.fn().mockReturnValue({
      id: overrides?.id ?? 'goal-id-1',
      name: overrides?.name ?? 'Test Goal',
      description: overrides?.description ?? 'Test description',
      status: overrides?.status ?? 'IN_PROGRESS',
    }),
    ...overrides,
  } as any;
}

// ============================================================
// Tests
// ============================================================

describe('GetGoalUseCase', () => {
  it('projects one KR measurement through an identity-scoped Goal read', async () => {
    const kr = { id: 'kr-1', title: 'Temperature', progress: { aggregationMethod: 'Average', unit: '°C', initialValue: 0, currentValue: -2, targetValue: 0 } };
    const goal = createGoalFixture({ toClientDTO: vi.fn().mockReturnValue({ keyResults: [kr] }) });
    const goalRepo = createMockRepo<IGoalRepository>({ findByIdForIdentity: vi.fn().mockResolvedValue(goal) });
    const useCase = new GetGoalUseCase(goalRepo);
    const result = await useCase.getKeyResultMeasurementContext('goal-1', 'kr-1', 'identity-1');
    expect(result).toEqual({ ok: true, data: kr });
    expect(goalRepo.findByIdForIdentity).toHaveBeenCalledWith('identity-1', 'goal-1', { includeChildren: true });
    expect((await useCase.getKeyResultMeasurementContext('goal-1', 'foreign-kr', 'identity-1')).ok).toBe(false);
    goalRepo.findByIdForIdentity.mockResolvedValue(null);
    expect((await useCase.getKeyResultMeasurementContext('goal-1', 'kr-1', 'foreign-owner')).ok).toBe(false);
  });

  it('should return a goal by ID', async () => {
    const goal = createGoalFixture();
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
    });
    const useCase = new GetGoalUseCase(goalRepo);

    const result = await useCase.execute('goal-id-1', 'identity-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({
      id: 'goal-id-1',
      name: 'Test Goal',
      description: 'Test description',
      status: 'IN_PROGRESS',
    });
    expect(goal.toClientDTO).toHaveBeenCalledWith(true);
  });

  it('should return NOT_FOUND when goal does not exist', async () => {
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(null),
    });
    const useCase = new GetGoalUseCase(goalRepo);

    const result = await useCase.execute('non-existent', 'identity-1');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_FOUND');
    expect(result.error.message).toContain('non-existent');
  });

  it('should pass includeChildren option to repository', async () => {
    const goal = createGoalFixture();
    const findByIdForIdentity = vi.fn().mockResolvedValue(goal);
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity,
    });
    const useCase = new GetGoalUseCase(goalRepo);

    await useCase.execute('goal-id-1', 'identity-1', true);

    expect(findByIdForIdentity).toHaveBeenCalledWith('identity-1', 'goal-id-1', { includeChildren: true });
  });

  it('should pass includeChildren as undefined when not provided', async () => {
    const goal = createGoalFixture();
    const findByIdForIdentity = vi.fn().mockResolvedValue(goal);
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity,
    });
    const useCase = new GetGoalUseCase(goalRepo);

    await useCase.execute('goal-id-1', 'identity-1');

    expect(findByIdForIdentity).toHaveBeenCalledWith('identity-1', 'goal-id-1', { includeChildren: undefined });
  });

  it('should return the DTO produced by toClientDTO', async () => {
    const customDTO = {
      id: 'custom-id',
      name: 'Custom Goal',
      description: 'Custom desc',
      status: 'COMPLETED',
    };
    const goal = createGoalFixture({
      toClientDTO: vi.fn().mockReturnValue(customDTO),
    });
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
    });
    const useCase = new GetGoalUseCase(goalRepo);

    const result = await useCase.execute('custom-id', 'identity-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual(customDTO);
  });

  it('should return NOT_FOUND for another identity', async () => {
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(null),
    });
    const useCase = new GetGoalUseCase(goalRepo);

    const result = await useCase.execute('goal-id-1', 'identity-other');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_FOUND');
    expect(goalRepo.findByIdForIdentity).toHaveBeenCalledWith('identity-other', 'goal-id-1', {
      includeChildren: undefined,
    });
  });
});
