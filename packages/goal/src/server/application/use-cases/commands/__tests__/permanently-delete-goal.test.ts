import { vi, describe, it, expect } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { IGoalRepository } from '../../../../domain/repositories/i-goal-repository';
import { PermanentlyDeleteGoalUseCase } from '../permanently-delete-goal.use-case';
import type { GoalDeletionTransactionRunner } from '../goal-deletion-support';

// ============================================================
// Helpers
// ============================================================

function createGoalFixture(overrides?: Record<string, any>) {
  return {
    id: 'goal-id-1',
    status: 'ARCHIVED',
    name: 'Archived Goal',
    description: 'Test description',
    archivedAt: new Date(),
    version: 3,
    keyResults: [],
    ...overrides,
  } as any;
}

function deletionRunner(
  goalRepository: IGoalRepository,
  unlinkAllForGoal = vi.fn().mockResolvedValue(0),
) {
  const runner: GoalDeletionTransactionRunner = {
    run: (work) => work({ goalRepository, relationCleanup: { unlinkAllForGoal } }),
  };
  return { runner, unlinkAllForGoal };
}

describe('PermanentlyDeleteGoalUseCase', () => {
  it('rejects permanent deletion from a stale Goal version', async () => {
    const goal = createGoalFixture();
    const goalPolicy = { ensureGoalCanBePermanentlyDeleted: vi.fn() } as any;
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
      deleteWithExpectedVersion: vi.fn(),
    });
    const { runner, unlinkAllForGoal } = deletionRunner(goalRepo);
    const useCase = new PermanentlyDeleteGoalUseCase(goalPolicy, runner);

    const result = await useCase.execute('goal-id-1', 'identity-1', 2);

    expect(result).toMatchObject({ ok: false, error: { code: 'CONFLICT' } });
    expect(goalRepo.deleteWithExpectedVersion).not.toHaveBeenCalled();
    expect(unlinkAllForGoal).not.toHaveBeenCalled();
  });

  it('should permanently delete an archived goal', async () => {
    const goal = createGoalFixture();
    const goalPolicy = { ensureGoalCanBePermanentlyDeleted: vi.fn() } as any;
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
      deleteWithExpectedVersion: vi.fn().mockResolvedValue(undefined),
    });
    const { runner, unlinkAllForGoal } = deletionRunner(goalRepo);
    const useCase = new PermanentlyDeleteGoalUseCase(goalPolicy, runner);

    const result = await useCase.execute('goal-id-1', 'identity-1', 3);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.id).toBe('goal-id-1');
    }
    expect(goalPolicy.ensureGoalCanBePermanentlyDeleted).toHaveBeenCalledWith(goal);
    expect(goalRepo.deleteWithExpectedVersion).toHaveBeenCalledWith('identity-1', 'goal-id-1', 3);
    expect(unlinkAllForGoal).toHaveBeenCalledWith('identity-1', 'goal-id-1');
  });

  it('should return NOT_FOUND when goal does not exist', async () => {
    const goalPolicy = { ensureGoalCanBePermanentlyDeleted: vi.fn() } as any;
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(null),
      deleteWithExpectedVersion: vi.fn().mockResolvedValue(undefined),
    });
    const { runner, unlinkAllForGoal } = deletionRunner(goalRepo);
    const useCase = new PermanentlyDeleteGoalUseCase(goalPolicy, runner);

    const result = await useCase.execute('non-existent', 'identity-1', 3);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
    expect(goalRepo.deleteWithExpectedVersion).not.toHaveBeenCalled();
    expect(goalPolicy.ensureGoalCanBePermanentlyDeleted).not.toHaveBeenCalled();
    expect(unlinkAllForGoal).not.toHaveBeenCalled();
  });

  it('should throw when policy rejects deletion (goal not archived)', async () => {
    const goal = createGoalFixture({ status: 'IN_PROGRESS', archivedAt: null });
    const goalPolicy = {
      ensureGoalCanBePermanentlyDeleted: vi.fn().mockImplementation(() => {
        throw new Error('Goal must be archived before permanent deletion');
      }),
    } as any;
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
      deleteWithExpectedVersion: vi.fn().mockResolvedValue(undefined),
    });
    const { runner, unlinkAllForGoal } = deletionRunner(goalRepo);
    const useCase = new PermanentlyDeleteGoalUseCase(goalPolicy, runner);

    await expect(useCase.execute('goal-id-1', 'identity-1', 3)).rejects.toThrow(
      'Goal must be archived before permanent deletion',
    );
    expect(goalRepo.deleteWithExpectedVersion).not.toHaveBeenCalled();
    expect(unlinkAllForGoal).not.toHaveBeenCalled();
  });

  it('should call findByIdForIdentity with includeChildren option', async () => {
    const goal = createGoalFixture();
    const goalPolicy = { ensureGoalCanBePermanentlyDeleted: vi.fn() } as any;
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
      deleteWithExpectedVersion: vi.fn().mockResolvedValue(undefined),
    });
    const { runner, unlinkAllForGoal } = deletionRunner(goalRepo);
    const useCase = new PermanentlyDeleteGoalUseCase(goalPolicy, runner);

    await useCase.execute('goal-id-1', 'identity-1', 3);

    expect(goalRepo.findByIdForIdentity).toHaveBeenCalledWith('identity-1', 'goal-id-1', {
      includeChildren: true,
    });
    expect(unlinkAllForGoal).toHaveBeenCalledWith('identity-1', 'goal-id-1');
  });

  it('should not call delete when policy throws', async () => {
    const goal = createGoalFixture();
    const goalPolicy = {
      ensureGoalCanBePermanentlyDeleted: vi.fn().mockImplementation(() => {
        throw new Error('Cannot delete');
      }),
    } as any;
    const goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
      deleteWithExpectedVersion: vi.fn().mockResolvedValue(undefined),
    });
    const { runner, unlinkAllForGoal } = deletionRunner(goalRepo);
    const useCase = new PermanentlyDeleteGoalUseCase(goalPolicy, runner);

    await expect(useCase.execute('goal-id-1', 'identity-1', 3)).rejects.toThrow('Cannot delete');
    expect(goalRepo.deleteWithExpectedVersion).not.toHaveBeenCalled();
    expect(unlinkAllForGoal).not.toHaveBeenCalled();
  });
});
