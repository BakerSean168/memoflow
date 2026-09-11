import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { IGoalRepository } from '../../../../domain/repositories/i-goal-repository';
import { Goal, GoalPolicy } from '../../../../domain';
import { CompleteGoalUseCase } from '../complete-goal.use-case';
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

describe('CompleteGoalUseCase', () => {
  let goalRepo: ReturnType<typeof createMockRepo<IGoalRepository>>;
  let useCase: CompleteGoalUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    goalRepo = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
      saveRootWithExpectedVersion: vi.fn().mockResolvedValue(undefined),
    });
    useCase = new CompleteGoalUseCase(
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

  it('should return error when goal does not exist', async () => {
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(null);

    const result = await useCase.execute('non-existent', 'identity-1', 1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.message).toContain('Goal not found');
    }
  });

  it('should complete an in-progress goal', async () => {
    const goal = createTestGoal();
    goal.activate();
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    const result = await useCase.execute(goal.id, 'identity-1', goal.version);

    expect(result.ok).toBe(true);
    expect(goal.status).toBe('Completed');
    expect(goal.completedAt).not.toBeNull();
    expect(goal.archivedAt).toBeNull();
    expect(goalRepo.findByIdForIdentity).toHaveBeenCalledWith('identity-1', goal.id, {
      includeChildren: true,
    });
    expect(goalRepo.saveRootWithExpectedVersion).toHaveBeenCalledWith(goal, 1);
    if (result.ok) {
      expect(result.data.readModel).toBeDefined();
      expect(result.data.readModel.name).toBe('Test Goal');
    }
  });

  it('should be idempotent for already completed goals without extra version increments or save calls', async () => {
    const goal = createTestGoal();
    goal.activate();
    goal.markAsCompleted();
    const initialVersion = goal.version; // e.g. 1
    const initialEventsCount = goal.domainEvents.length;

    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    // Call execute once on already completed goal
    const result1 = await useCase.execute(goal.id, 'identity-1', initialVersion);
    expect(result1.ok).toBe(true);
    expect(goal.version).toBe(initialVersion);
    expect(goal.domainEvents).toHaveLength(initialEventsCount);
    expect(goalRepo.saveRootWithExpectedVersion).not.toHaveBeenCalled();

    // Call execute a second time
    const result2 = await useCase.execute(goal.id, 'identity-1', initialVersion);
    expect(result2.ok).toBe(true);
    expect(goal.version).toBe(initialVersion);
    expect(goal.domainEvents).toHaveLength(initialEventsCount);
    expect(goalRepo.saveRootWithExpectedVersion).not.toHaveBeenCalled();

    if (result1.ok && result2.ok) {
      expect(result1.data.readModel.id).toBe(result2.data.readModel.id);
      expect(result1.data.goalVersion).toBe(result2.data.goalVersion);
    }
  });

  it('should return ok when goal is archived', async () => {
    const goal = createTestGoal();
    goal.activate();
    goal.markAsCompleted();
    goal.archive();
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    const result = await useCase.execute(goal.id, 'identity-1', goal.version);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.readModel.status).toBe('Completed');
      expect(result.data.readModel.archivedAt).not.toBeNull();
    }
  });

  it('should return the client read model with children', async () => {
    const goal = createTestGoal('Complete Me');
    goal.activate();
    goal.createAndAddKeyResult({
      title: 'KR1',
      valueType: 'NUMERIC',
      targetValue: 100,
      weight: 3,
    });
    vi.mocked(goalRepo.findByIdForIdentity).mockResolvedValue(goal);

    const result = await useCase.execute(goal.id, 'identity-1', goal.version);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.readModel.name).toBe('Complete Me');
      expect(result.data.readModel.status).toBe('Completed');
      expect(result.data.readModel.archivedAt).toBeNull();
    }
  });
});
