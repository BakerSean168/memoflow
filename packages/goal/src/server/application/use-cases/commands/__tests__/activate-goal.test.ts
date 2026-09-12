import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { IGoalRepository } from '../../../../domain/repositories/i-goal-repository';
import { Goal, GoalPolicy } from '../../../../domain';
import { ActivateGoalUseCase } from '../activate-goal.use-case';

// ============================================================
// Helpers
// ============================================================

function createTestGoal(name = 'Test Goal'): Goal {
  return Goal.create({
    identityId: 'test-identity-id' as any,
    name,
    summary: null,
    startDate: null,
    target: null,
    reminderConfig: null,
  });
}

describe('ActivateGoalUseCase', () => {
  let goalRepo: ReturnType<typeof createMockRepo<IGoalRepository>>;
  let useCase: ActivateGoalUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      saveRootWithExpectedVersion: vi.fn().mockResolvedValue(undefined),
    });
    useCase = new ActivateGoalUseCase(goalRepo, new GoalPolicy());
  });

  it('should return NOT_FOUND when goal does not exist', async () => {
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'identity-1', 1);

    expect(result).toBeErrorWithCode('NOT_FOUND');
    expect(goalRepo.save).not.toHaveBeenCalled();
  });

  it('should reactivate a completed goal and clear completedAt', async () => {
    const goal = createTestGoal();
    goal.activate();
    goal.markAsCompleted();
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    const result = await useCase.execute(goal.id, 'identity-1', goal.version);

    expect(result).toBeOk();
    expect(goal.status).toBe('InProgress');
    expect(goal.completedAt).toBeNull();
    expect(goal.archivedAt).toBeNull();
    expect(goalRepo.saveRootWithExpectedVersion).toHaveBeenCalledWith(goal, 1);
  });

  it('should keep an already in-progress goal idempotent', async () => {
    const goal = createTestGoal();
    goal.activate();
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    const result = await useCase.execute(goal.id, 'identity-1', goal.version);

    expect(result).toBeOk();
    expect(goal.status).toBe('InProgress');
    expect(goalRepo.findByIdForIdentity).toHaveBeenCalledWith('identity-1', goal.id, {
      includeChildren: true,
    });
    expect(goal.version).toBe(1);
    expect(goalRepo.saveRootWithExpectedVersion).not.toHaveBeenCalled();
  });

  it('should throw when goal is archived', async () => {
    const goal = createTestGoal();
    goal.activate();
    goal.markAsCompleted();
    goal.archive();
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    const result = await useCase.execute(goal.id, 'identity-1', goal.version);

    expect(result).toBeErrorWithCode('INVALID_STATE');
  });

  it('should return the goal DTO on success', async () => {
    const goal = createTestGoal('Activate Me');
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    const result = await useCase.execute(goal.id, 'identity-1', goal.version);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.readModel.name).toBe('Activate Me');
      expect(result.data.readModel.id).toBe(goal.id);
      expect(result.data.goalVersion).toBe(goal.version);
    }
  });
});
