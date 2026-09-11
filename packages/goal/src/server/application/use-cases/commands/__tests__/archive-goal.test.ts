import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { IGoalRepository } from '../../../../domain/repositories/i-goal-repository';
import { Goal, GoalPolicy } from '../../../../domain';
import { ArchiveGoalUseCase } from '../archive-goal.use-case';
import { createInlineGoalWriteTransactionRunner } from '../goal-write-support';
import { InMemoryGoalReliableOperationAdapter } from '../../../../infrastructure/adapters/in-memory/in-memory-goal-reliable-operation.adapter';

// ============================================================
// Helpers
// ============================================================

function createTestGoal(name = 'Test Goal'): Goal {
  return Goal.create({
    identityId: 'test-identity-id' as any,
    name,
    summary: null,
    startDate: null,
    dueDate: null,
    reminderConfig: null,
  });
}

function createCompletedGoal(name = 'Completed Goal'): Goal {
  const goal = createTestGoal(name);
  goal.activate();
  goal.markAsCompleted();
  return goal;
}

describe('ArchiveGoalUseCase', () => {
  let goalRepo: ReturnType<typeof createMockRepo<IGoalRepository>>;
  let useCase: ArchiveGoalUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      saveRootWithExpectedVersion: vi.fn().mockResolvedValue(undefined),
    });
    useCase = new ArchiveGoalUseCase(
      goalRepo,
      new GoalPolicy(),
      createInlineGoalWriteTransactionRunner(
        {
          goalRepository: goalRepo,
          goalRecordRepository: null as any,
        },
        new InMemoryGoalReliableOperationAdapter(),
      ),
    );
  });

  it('should return NOT_FOUND when goal does not exist', async () => {
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'identity-1', 1);

    expect(result).toBeErrorWithCode('NOT_FOUND');
    expect(goalRepo.save).not.toHaveBeenCalled();
  });

  it('archives a completed goal without changing its Completed business status', async () => {
    const goal = createCompletedGoal();
    const initialVersion = goal.version;
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    const result = await useCase.execute(goal.id, 'identity-1', initialVersion);

    expect(result).toBeOk();
    expect(goal.version).toBe(initialVersion + 1);
    expect(goal.status).toBe('Completed');
    expect(goal.completedAt).not.toBeNull();
    expect(goal.archivedAt).not.toBeNull();
    expect(goalRepo.saveRootWithExpectedVersion).toHaveBeenCalledWith(goal, initialVersion);
  });

  it('should archive an active goal', async () => {
    const goal = createTestGoal();
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    const result = await useCase.execute(goal.id, 'identity-1', goal.version);

    expect(result).toBeOk();
    expect(goal.archivedAt).not.toBeNull();
    expect(goal.completedAt).toBeNull();
    expect(goalRepo.findByIdForIdentity).toHaveBeenCalledWith('identity-1', goal.id, {
      includeChildren: true,
    });
    expect(goalRepo.saveRootWithExpectedVersion).toHaveBeenCalledWith(goal, 1);
  });

  it('should be idempotent when goal is already archived', async () => {
    const goal = createTestGoal();
    goal.archive();
    const initialVersion = goal.version;
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    const result = await useCase.execute(goal.id, 'identity-1', initialVersion);

    expect(result).toBeOk();
    expect(goal.version).toBe(initialVersion);
    expect(goalRepo.saveRootWithExpectedVersion).not.toHaveBeenCalled();
  });

  it('should return the goal DTO on success', async () => {
    const goal = createTestGoal('Archive Me');
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    const result = await useCase.execute(goal.id, 'identity-1', goal.version);

    expect(result).toBeOk();
    if (result.ok) {
      expect(result.data.readModel.name).toBe('Archive Me');
      expect(result.data.readModel.id).toBe(goal.id);
      expect(result.data.readModel.archivedAt).not.toBeNull();
    }
  });

  it('rejects a stale version before archiving an active goal', async () => {
    const goal = createTestGoal();
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    const result = await useCase.execute(goal.id, 'identity-1', goal.version + 1);

    expect(result).toBeErrorWithCode('CONFLICT');
    expect(goal.archivedAt).toBeNull();
    expect(goalRepo.saveRootWithExpectedVersion).not.toHaveBeenCalled();
  });
});
