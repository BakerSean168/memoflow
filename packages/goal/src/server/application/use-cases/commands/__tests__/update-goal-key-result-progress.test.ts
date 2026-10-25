import { vi, describe, it, expect } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { IGoalRepository } from '../../../../domain/repositories/i-goal-repository';
import { UpdateGoalKeyResultProgressUseCase } from '../update-goal-key-result-progress.use-case';

// ============================================================
// Helpers
// ============================================================

function createGoalFixture(overrides?: Record<string, any>) {
  const keyResult = {
    id: 'kr-1',
    title: 'Key Result 1',
    currentValue: 0,
    targetValue: 100,
    toClientDTO: vi.fn().mockReturnValue({
      id: 'kr-1',
      title: 'Key Result 1',
      currentValue: 50,
      targetValue: 100,
    }),
  };

  return {
    id: 'goal-id-1',
    status: 'IN_PROGRESS',
    name: 'Test Goal',
    description: 'Test description',
    version: 1,
    advanceVersion: vi.fn(),
    keyResults: [keyResult],
    updateKeyResultProgress: vi.fn(),
    getKeyResult: vi.fn().mockImplementation((id: string) => (id === 'kr-1' ? keyResult : null)),
    toClientDTO: vi.fn().mockReturnValue({
      id: 'goal-id-1',
      version: 1,
      keyResults: [{ id: 'kr-1', currentValue: 50 }],
    }),
    ...overrides,
  } as any;
}

describe('UpdateGoalKeyResultProgressUseCase', () => {
  it('rejects a stale goal version before changing progress', async () => {
    const goal = createGoalFixture();
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
    });
    const useCase = new UpdateGoalKeyResultProgressUseCase(goalRepo, {
      ensureGoalCanBeModified: vi.fn(),
    } as any);

    const result = await useCase.execute('goal-id-1', 'identity-1', 'kr-1', 50, 2);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CONFLICT');
    expect(goal.updateKeyResultProgress).not.toHaveBeenCalled();
  });

  it('should update key result progress successfully', async () => {
    const goal = createGoalFixture();
    const goalPolicy = { ensureGoalCanBeModified: vi.fn() } as any;
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
      saveRootWithExpectedVersion: vi.fn().mockResolvedValue(undefined),
    });
    const useCase = new UpdateGoalKeyResultProgressUseCase(goalRepo, goalPolicy);

    const result = await useCase.execute('goal-id-1', 'identity-1', 'kr-1', 50, 1);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.affectedEntityIds.keyResultIds).toEqual(['kr-1']);
      expect(result.data.readModel.keyResults?.[0]?.id).toBe('kr-1');
    }
    expect(goal.updateKeyResultProgress).toHaveBeenCalledWith('kr-1', 50, undefined);
    expect(goalRepo.saveRootWithExpectedVersion).toHaveBeenCalledWith(goal, 1);
    expect(goalPolicy.ensureGoalCanBeModified).toHaveBeenCalledWith(goal);
  });

  it('should pass optional note to updateKeyResultProgress', async () => {
    const goal = createGoalFixture();
    const goalPolicy = { ensureGoalCanBeModified: vi.fn() } as any;
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
      save: vi.fn().mockResolvedValue(undefined),
    });
    const useCase = new UpdateGoalKeyResultProgressUseCase(goalRepo, goalPolicy);

    await useCase.execute('goal-id-1', 'identity-1', 'kr-1', 75, 1, 'Good progress this week');

    expect(goal.updateKeyResultProgress).toHaveBeenCalledWith(
      'kr-1',
      75,
      'Good progress this week',
    );
  });

  it('should return NOT_FOUND when goal does not exist', async () => {
    const goalPolicy = { ensureGoalCanBeModified: vi.fn() } as any;
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
    });
    const useCase = new UpdateGoalKeyResultProgressUseCase(goalRepo, goalPolicy);

    const result = await useCase.execute('non-existent', 'identity-1', 'kr-1', 50, 1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
    expect(goalRepo.save).not.toHaveBeenCalled();
  });

  it('should throw when policy rejects modification', async () => {
    const goal = createGoalFixture();
    const goalPolicy = {
      ensureGoalCanBeModified: vi.fn().mockImplementation(() => {
        throw new Error('Goal cannot be modified');
      }),
    } as any;
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
      save: vi.fn().mockResolvedValue(undefined),
    });
    const useCase = new UpdateGoalKeyResultProgressUseCase(goalRepo, goalPolicy);

    await expect(useCase.execute('goal-id-1', 'identity-1', 'kr-1', 50, 1)).rejects.toThrow(
      'Goal cannot be modified',
    );
    expect(goalRepo.save).not.toHaveBeenCalled();
    expect(goal.updateKeyResultProgress).not.toHaveBeenCalled();
  });

  it('should call findByIdForIdentity with includeChildren option', async () => {
    const goal = createGoalFixture();
    const goalPolicy = { ensureGoalCanBeModified: vi.fn() } as any;
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
      save: vi.fn().mockResolvedValue(undefined),
    });
    const useCase = new UpdateGoalKeyResultProgressUseCase(goalRepo, goalPolicy);

    await useCase.execute('goal-id-1', 'identity-1', 'kr-1', 50, 1);

    expect(goalRepo.findByIdForIdentity).toHaveBeenCalledWith('identity-1', 'goal-id-1', {
      includeChildren: true,
    });
  });

  it('materializes the authoritative Goal read model', async () => {
    const goal = createGoalFixture();
    const goalPolicy = { ensureGoalCanBeModified: vi.fn() } as any;
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
      save: vi.fn().mockResolvedValue(undefined),
    });
    const useCase = new UpdateGoalKeyResultProgressUseCase(goalRepo, goalPolicy);

    await useCase.execute('goal-id-1', 'identity-1', 'kr-1', 50, 1);

    expect(goal.getKeyResult).toHaveBeenCalledWith('kr-1');
    expect(goal.toClientDTO).toHaveBeenCalledWith(true);
  });
});
