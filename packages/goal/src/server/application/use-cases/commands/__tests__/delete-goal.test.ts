import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { IGoalRepository } from '../../../../domain/repositories/i-goal-repository';
import { Goal, GoalPolicy } from '../../../../domain';
import { DeleteGoalUseCase } from '../delete-goal.use-case';
import type { GoalDependencyReadPort } from '@memoflow/contracts/reliable-messaging';

// ============================================================
// Helpers
// ============================================================

function createTestGoal(name = 'Test Goal'): Goal {
  return Goal.create({
    identityId: 'test-identity-id' as any,
    name,
    description: null,
    color: '#3B82F6',
    feasibilityAnalysis: null,
    motivation: null,
    importance: 'MEDIUM' as any,
    category: null,
    tags: [],
    startDate: null,
    targetDate: null,
    parentGoalId: null,
    reminderConfig: null,
  });
}

function createCompletedGoal(name = 'Completed Goal'): Goal {
  const goal = createTestGoal(name);
  goal.markAsCompleted();
  return goal;
}

describe('DeleteGoalUseCase', () => {
  let goalRepo: ReturnType<typeof createMockRepo<IGoalRepository>>;
  let taskBindingReadPort: GoalDependencyReadPort;
  let useCase: DeleteGoalUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      saveRootWithExpectedVersion: vi.fn().mockResolvedValue(undefined),
    });
    taskBindingReadPort = {
      checkActiveTaskBindings: vi.fn().mockResolvedValue({ hasActiveBindings: false, activeCount: 0 }),
    };
    useCase = new DeleteGoalUseCase(goalRepo, new GoalPolicy(), taskBindingReadPort);
  });

  it('throws an error if taskBindingReadPort is missing', () => {
    expect(() => new DeleteGoalUseCase(goalRepo, new GoalPolicy(), undefined as any)).toThrow(
      'ITaskBindingReadPort must be explicitly provided to DeleteGoalUseCase',
    );
  });

  describe('execute()', () => {
    it('should return NOT_FOUND when goal does not exist', async () => {
      vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(null);

      const result = await useCase.execute('non-existent', 'identity-1', 1);

      expect(result).toBeErrorWithCode('NOT_FOUND');
      expect(goalRepo.save).not.toHaveBeenCalled();
    });

    it('should soft delete a completed goal when no task bindings exist', async () => {
      const goal = createCompletedGoal();
      vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

      const result = await useCase.execute(goal.id, 'identity-1', goal.version);

      expect(result).toBeOk();
      expect(goal.deletedAt).not.toBeNull();
      expect(goalRepo.saveRootWithExpectedVersion).toHaveBeenCalledWith(goal, 1);
    });

    it('should soft delete an active goal when no task bindings exist', async () => {
      const goal = createTestGoal();
      vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

      const result = await useCase.execute(goal.id, 'identity-1', goal.version);

      expect(result).toBeOk();
      expect(goal.deletedAt).not.toBeNull();
    });

    it('should reject deletion when active task bindings exist', async () => {
      const goal = createTestGoal();
      vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);
      vi.mocked(taskBindingReadPort.checkActiveTaskBindings).mockResolvedValue({ hasActiveBindings: true, activeCount: 2 });

      const result = await useCase.execute(goal.id, 'identity-1', goal.version);

      expect(result).toBeErrorWithCode('CONFLICT');
      if (!result.ok) {
        expect(result.error.message).toContain('2 active task binding(s)');
      }
      expect(goal.deletedAt).toBeNull();
      expect(goalRepo.saveRootWithExpectedVersion).not.toHaveBeenCalled();
    });

    it('isolates task binding queries by identityId', async () => {
      const goal = createTestGoal();
      vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

      vi.mocked(taskBindingReadPort.checkActiveTaskBindings).mockImplementation(
        async (input: { identityId: string }) => {
          if (input.identityId === 'identity-A') {
            return { hasActiveBindings: true, activeCount: 3 };
          }
          return { hasActiveBindings: false, activeCount: 0 };
        },
      );

      // Identity A is blocked
      const resultA = await useCase.execute(goal.id, 'identity-A', goal.version);
      expect(resultA).toBeErrorWithCode('CONFLICT');

      // Identity B is allowed
      const resultB = await useCase.execute(goal.id, 'identity-B', goal.version);
      expect(resultB).toBeOk();
    });

    it('should return the DTO after deleting', async () => {
      const goal = createCompletedGoal('My Goal');
      vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

      const result = await useCase.execute(goal.id, 'identity-1', goal.version);

      expect(result).toBeOk();
      if (result.ok) {
        expect(result.data.readModel.name).toBe('My Goal');
        expect(result.data.readModel.deletedAt).not.toBeNull();
      }
    });

    it('rejects a stale version without deleting', async () => {
      const goal = createTestGoal();
      vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

      const result = await useCase.execute(goal.id, 'identity-1', goal.version + 1);

      expect(result).toBeErrorWithCode('CONFLICT');
      expect(goal.deletedAt).toBeNull();
      expect(goalRepo.saveRootWithExpectedVersion).not.toHaveBeenCalled();
    });
  });

  describe('checkDependencies()', () => {
    it('should return NOT_FOUND when goal does not exist', async () => {
      vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(null);

      const result = await useCase.checkDependencies('non-existent', 'identity-1');

      expect(result).toBeErrorWithCode('NOT_FOUND');
    });

    it('should return dependency info for goal with no children or task links', async () => {
      const goal = createTestGoal();
      vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

      const result = await useCase.checkDependencies(goal.id, 'identity-1');

      expect(result).toBeOk();
      if (result.ok) {
        expect(result.data.hasKeyResults).toBe(false);
        expect(result.data.keyResultCount).toBe(0);
        expect(result.data.hasReviews).toBe(false);
        expect(result.data.reviewCount).toBe(0);
        expect(result.data.hasTaskLinks).toBe(false);
        expect(result.data.taskBindingCount).toBe(0);
        expect(result.data.canDelete).toBe(true);
        expect(result.data.warnings).toHaveLength(0);
      }
    });

    it('should report active task links when they exist', async () => {
      const goal = createTestGoal();
      vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);
      vi.mocked(taskBindingReadPort.checkActiveTaskBindings).mockResolvedValue({ hasActiveBindings: true, activeCount: 1 });

      const result = await useCase.checkDependencies(goal.id, 'identity-1');

      expect(result).toBeOk();
      if (result.ok) {
        expect(result.data.hasTaskLinks).toBe(true);
        expect(result.data.taskBindingCount).toBe(1);
        expect(result.data.canDelete).toBe(false);
        expect(result.data.warnings).toContain('该目标包含 1 个关联任务');
      }
    });
  });
});
