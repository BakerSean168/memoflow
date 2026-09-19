import { vi, describe, it, expect } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { IGoalRepository } from '../../../../domain/repositories/i-goal-repository';
import { UpdateGoalKeyResultUseCase } from '../update-goal-key-result.use-case';

// ============================================================
// Helpers
// ============================================================

function createGoalFixture(overrides?: Record<string, any>) {
  const keyResult1 = {
    id: 'kr-1',
    title: 'Key Result 1',
    weight: 3,
    toClientDTO: vi.fn().mockReturnValue({ id: 'kr-1', title: 'Updated KR', weight: 5 }),
  };
  const keyResult2 = {
    id: 'kr-2',
    title: 'Key Result 2',
    weight: 2,
    toClientDTO: vi.fn().mockReturnValue({ id: 'kr-2', title: 'Key Result 2', weight: 2 }),
  };

  return {
    id: 'goal-id-1',
    status: 'IN_PROGRESS',
    name: 'Test Goal',
    description: 'Test description',
    version: 1,
    advanceVersion: vi.fn(),
    keyResults: [keyResult1, keyResult2],
    updateKeyResult: vi.fn(),
    toClientDTO: vi.fn().mockReturnValue({
      id: 'goal-id-1',
      version: 2,
      keyResults: [{ id: 'kr-1', title: 'Updated KR', weight: 5 }],
    }),
    ...overrides,
  } as any;
}

describe('UpdateGoalKeyResultUseCase', () => {
  it('rejects a stale goal version before updating the key result', async () => {
    const goal = createGoalFixture();
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
    });
    const useCase = new UpdateGoalKeyResultUseCase(goalRepo, {
      ensureGoalCanBeModified: vi.fn(),
    } as any);

    const result = await useCase.execute('goal-id-1', 'identity-1', 'kr-1', {
      title: 'Stale update',
      expectedVersion: 2,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('CONFLICT');
    expect(goal.updateKeyResult).not.toHaveBeenCalled();
    expect(goalRepo.saveRootWithExpectedVersion).not.toHaveBeenCalled();
  });

  it('should update a key result successfully', async () => {
    const goal = createGoalFixture();
    const goalPolicy = { ensureGoalCanBeModified: vi.fn() } as any;
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
      saveRootWithExpectedVersion: vi.fn().mockResolvedValue(undefined),
    });
    const useCase = new UpdateGoalKeyResultUseCase(goalRepo, goalPolicy);

    const result = await useCase.execute('goal-id-1', 'identity-1', 'kr-1', {
      title: 'Updated KR',
      weight: 5,
      expectedVersion: 1,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.goalVersion).toBe(1);
      expect(result.data.readModel.keyResults?.[0]?.id).toBe('kr-1');
    }
    expect(goal.updateKeyResult).toHaveBeenCalledWith('kr-1', {
      title: 'Updated KR',
      description: undefined,
      weight: 5,
      initialValue: undefined,
      target: undefined,
      aggregationMethod: undefined,
      currentValue: undefined,
      targetValue: undefined,
      unit: undefined,
    });
    expect(goalRepo.saveRootWithExpectedVersion).toHaveBeenCalledWith(goal, 1);
  });

  it('should return NOT_FOUND when goal does not exist', async () => {
    const goalPolicy = { ensureGoalCanBeModified: vi.fn() } as any;
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
    });
    const useCase = new UpdateGoalKeyResultUseCase(goalRepo, goalPolicy);

    const result = await useCase.execute('non-existent', 'identity-1', 'kr-1', {
      title: 'New',
      expectedVersion: 1,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
    expect(goalRepo.save).not.toHaveBeenCalled();
  });

  it('should return NOT_FOUND when key result does not exist', async () => {
    const goal = createGoalFixture();
    const goalPolicy = { ensureGoalCanBeModified: vi.fn() } as any;
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
      save: vi.fn().mockResolvedValue(undefined),
    });
    const useCase = new UpdateGoalKeyResultUseCase(goalRepo, goalPolicy);

    const result = await useCase.execute('goal-id-1', 'identity-1', 'kr-non-existent', {
      title: 'New',
      expectedVersion: 1,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.message).toContain('kr-non-existent');
    }
    expect(goal.updateKeyResult).not.toHaveBeenCalled();
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
    const useCase = new UpdateGoalKeyResultUseCase(goalRepo, goalPolicy);

    await expect(
      useCase.execute('goal-id-1', 'identity-1', 'kr-1', {
        title: 'New',
        expectedVersion: 1,
      }),
    ).rejects.toThrow('Goal cannot be modified');
    expect(goalRepo.save).not.toHaveBeenCalled();
  });

  it('should pass partial updates correctly', async () => {
    const goal = createGoalFixture();
    const goalPolicy = { ensureGoalCanBeModified: vi.fn() } as any;
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
      save: vi.fn().mockResolvedValue(undefined),
    });
    const useCase = new UpdateGoalKeyResultUseCase(goalRepo, goalPolicy);

    await useCase.execute('goal-id-1', 'identity-1', 'kr-1', {
      description: 'New desc',
      unit: 'books',
      expectedVersion: 1,
    });

    expect(goal.updateKeyResult).toHaveBeenCalledWith('kr-1', {
      title: undefined,
      description: 'New desc',
      weight: undefined,
      initialValue: undefined,
      target: undefined,
      aggregationMethod: undefined,
      currentValue: undefined,
      targetValue: undefined,
      unit: 'books',
    });
  });

  it('passes Initial and Current updates without exposing tracking-base control', async () => {
    const goal = createGoalFixture();
    const goalPolicy = { ensureGoalCanBeModified: vi.fn() } as any;
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
      save: vi.fn().mockResolvedValue(undefined),
    });
    const useCase = new UpdateGoalKeyResultUseCase(goalRepo, goalPolicy);

    await useCase.execute('goal-id-1', 'identity-1', 'kr-1', {
      currentValue: 11,
      initialValue: 5,
      expectedVersion: 1,
    });

    expect(goal.updateKeyResult).toHaveBeenCalledWith('kr-1', {
      title: undefined,
      description: undefined,
      weight: undefined,
      initialValue: 5,
      target: undefined,
      currentValue: 11,
      targetValue: undefined,
      unit: undefined,
    });
  });

  it('materializes the authoritative Goal read model', async () => {
    const goal = createGoalFixture();
    const goalPolicy = { ensureGoalCanBeModified: vi.fn() } as any;
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
      save: vi.fn().mockResolvedValue(undefined),
    });
    const useCase = new UpdateGoalKeyResultUseCase(goalRepo, goalPolicy);

    await useCase.execute('goal-id-1', 'identity-1', 'kr-1', {
      title: 'Updated',
      expectedVersion: 1,
    });

    expect(goal.toClientDTO).toHaveBeenCalledWith(true);
  });
});
