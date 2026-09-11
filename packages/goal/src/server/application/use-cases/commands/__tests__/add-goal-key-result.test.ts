import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { IGoalRepository } from '../../../../domain/repositories/i-goal-repository';
import { Goal, GoalPolicy } from '../../../../domain';
import { AddGoalKeyResultUseCase } from '../add-goal-key-result.use-case';

// ============================================================
// Helpers
// ============================================================

function createTestGoal(name = 'Test Goal'): Goal {
  return Goal.create({
    identityId: 'test-identity-id' as any,
    name,
    summary: null,
    startDate: null,
    reminderConfig: null,
  });
}

function aKeyResultInput(overrides: Record<string, any> = {}) {
  return {
    title: 'Read 10 books',
    valueType: 'NUMERIC',
    targetValue: 10,
    currentValue: 0,
    weight: 3,
    expectedVersion: 1,
    ...overrides,
  };
}

describe('AddGoalKeyResultUseCase', () => {
  let goalRepo: ReturnType<typeof createMockRepo<IGoalRepository>>;
  let useCase: AddGoalKeyResultUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn(),
      saveRootWithExpectedVersion: vi.fn().mockResolvedValue(undefined),
    });
    useCase = new AddGoalKeyResultUseCase(goalRepo, new GoalPolicy());
  });

  it('should return NOT_FOUND when goal does not exist', async () => {
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'identity-1', aKeyResultInput());

    expect(result).toBeErrorWithCode('NOT_FOUND');
    expect(goalRepo.saveRootWithExpectedVersion).not.toHaveBeenCalled();
  });

  it('should add a key result to an active goal', async () => {
    const goal = createTestGoal();
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    const result = await useCase.execute(goal.id, 'identity-1', aKeyResultInput());

    expect(result).toBeOk();
    expect(goal.keyResults).toHaveLength(1);
    expect(goal.keyResults[0].title).toBe('Read 10 books');
    expect(goalRepo.saveRootWithExpectedVersion).toHaveBeenCalledWith(goal, 1);
  });

  it('rejects a stale goal version before mutating the aggregate', async () => {
    const goal = createTestGoal();
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    const result = await useCase.execute(
      goal.id,
      'identity-1',
      aKeyResultInput({ expectedVersion: 2 }),
    );

    expect(result).toBeErrorWithCode('CONFLICT');
    expect(goal.keyResults).toHaveLength(0);
    expect(goalRepo.saveRootWithExpectedVersion).not.toHaveBeenCalled();
  });

  it('should throw when goal is archived', async () => {
    const goal = createTestGoal();
    goal.activate();
    goal.markAsCompleted();
    goal.archive();
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    await expect(useCase.execute(goal.id, 'identity-1', aKeyResultInput())).rejects.toThrow();
  });

  it('should validate key result weight', async () => {
    const goal = createTestGoal();
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    await expect(
      useCase.execute(goal.id, 'identity-1', aKeyResultInput({ weight: 0 })),
    ).rejects.toThrow();
  });

  it('should reject weight exceeding 5', async () => {
    const goal = createTestGoal();
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    await expect(
      useCase.execute(goal.id, 'identity-1', aKeyResultInput({ weight: 6 })),
    ).rejects.toThrow();
  });

  it('returns the authoritative Goal mutation receipt on success', async () => {
    const goal = createTestGoal('Goal with KR');
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    const result = await useCase.execute(
      goal.id,
      'identity-1',
      aKeyResultInput({ title: 'My KR' }),
    );

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.goalVersion).toBe(2);
      expect(result.data.readModel.keyResults?.[0]?.title).toBe('My KR');
      expect(result.data.affectedEntityIds.keyResultIds).toEqual([goal.keyResults[0]?.id]);
    }
  });

  it('should allow adding multiple key results', async () => {
    const goal = createTestGoal();
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    await useCase.execute(goal.id, 'identity-1', aKeyResultInput({ title: 'KR1' }));
    await useCase.execute(
      goal.id,
      'identity-1',
      aKeyResultInput({ title: 'KR2', expectedVersion: 2 }),
    );

    expect(goal.keyResults).toHaveLength(2);
  });
});
