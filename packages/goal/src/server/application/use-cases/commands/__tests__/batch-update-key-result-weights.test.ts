import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { Goal, GoalPolicy } from '../../../../domain';
import type { IGoalRecordRepository, IGoalRepository } from '../../../../domain';
import type { GoalWriteTransactionRunner } from '../goal-write-support';
import { BatchUpdateKeyResultWeightsUseCase } from '../batch-update-key-result-weights.use-case';

function createGoalFixture() {
  const goal = Goal.create({
    identityId: 'identity-1' as any,
    name: 'Test Goal',
    description: null,
    color: '#3B82F6',
    feasibilityAnalysis: null,
    motivation: null,
    importance: 'Moderate' as any,
    category: null,
    tags: [],
    startDate: null,
    targetDate: null,
    parentGoalId: null,
    reminderConfig: null,
  });
  const first = goal.createAndAddKeyResult({
    title: 'First KR',
    valueType: 'Absolute',
    aggregationMethod: 'Last',
    startValue: 0,
    currentValue: 0,
    targetValue: 10,
    weight: 2,
    unit: 'points',
  });
  const second = goal.createAndAddKeyResult({
    title: 'Second KR',
    valueType: 'Absolute',
    aggregationMethod: 'Last',
    startValue: 0,
    currentValue: 0,
    targetValue: 10,
    weight: 3,
    unit: 'points',
  });
  return { goal, first, second };
}

describe('BatchUpdateKeyResultWeightsUseCase', () => {
  let goalRepository: ReturnType<typeof createMockRepo<IGoalRepository>>;
  let goalRecordRepository: ReturnType<typeof createMockRepo<IGoalRecordRepository>>;
  let transactionRunner: GoalWriteTransactionRunner;

  beforeEach(() => {
    goalRepository = createMockRepo<IGoalRepository>({
      save: vi.fn().mockResolvedValue(undefined),
      saveRootWithExpectedVersion: vi.fn().mockResolvedValue(undefined),
    });
    goalRecordRepository = createMockRepo<IGoalRecordRepository>();
    transactionRunner = {
      run: async (work) => work({ goalRepository, goalRecordRepository }),
    };
  });

  it('writes all changed weights and their audit snapshots in one transaction', async () => {
    const { goal, first, second } = createGoalFixture();
    vi.mocked(goalRepository.findByIdForIdentity).mockResolvedValue(goal);
    const run = vi.spyOn(transactionRunner, 'run');
    const useCase = new BatchUpdateKeyResultWeightsUseCase(transactionRunner, new GoalPolicy());

    const result = await useCase.execute(goal.id, 'identity-1', goal.version, [
      { keyResultId: first.id, weight: 4 },
      { keyResultId: second.id, weight: 5 },
    ]);

    expect(result).toBeOk();
    expect(run).toHaveBeenCalledTimes(1);
    expect(goal.getKeyResult(first.id)?.weight).toBe(4);
    expect(goal.getKeyResult(second.id)?.weight).toBe(5);
    expect(goal.getAllWeightSnapshots()).toEqual([
      expect.objectContaining({ keyResultId: first.id, oldWeight: 2, newWeight: 4 }),
      expect.objectContaining({ keyResultId: second.id, oldWeight: 3, newWeight: 5 }),
    ]);
    expect(goalRepository.saveRootWithExpectedVersion).toHaveBeenCalledWith(goal, 1);
    if (result.ok) {
      expect(result.data.goalVersion).toBe(2);
      expect(result.data.affectedEntityIds.keyResultIds).toEqual([first.id, second.id]);
      expect(result.data.readModel.keyResults?.map((keyResult) => keyResult.weight)).toEqual([4, 5]);
    }
  });

  it('does not persist or audit when every submitted weight is already current', async () => {
    const { goal, first } = createGoalFixture();
    vi.mocked(goalRepository.findByIdForIdentity).mockResolvedValue(goal);
    const useCase = new BatchUpdateKeyResultWeightsUseCase(transactionRunner, new GoalPolicy());

    const result = await useCase.execute(goal.id, 'identity-1', goal.version, [
      { keyResultId: first.id, weight: 2 },
    ]);

    expect(result).toBeOk();
    expect(goal.getAllWeightSnapshots()).toHaveLength(0);
    expect(goalRepository.saveRootWithExpectedVersion).not.toHaveBeenCalled();
    if (result.ok) expect(result.data.affectedEntityIds.keyResultIds).toEqual([]);
  });

  it('validates the whole batch before changing any key result', async () => {
    const { goal, first } = createGoalFixture();
    vi.mocked(goalRepository.findByIdForIdentity).mockResolvedValue(goal);
    const useCase = new BatchUpdateKeyResultWeightsUseCase(transactionRunner, new GoalPolicy());

    const result = await useCase.execute(goal.id, 'identity-1', goal.version, [
      { keyResultId: first.id, weight: 4 },
      { keyResultId: 'missing-key-result', weight: 5 },
    ]);

    expect(result).toBeErrorWithCode('NOT_FOUND');
    expect(goal.getKeyResult(first.id)?.weight).toBe(2);
    expect(goal.getAllWeightSnapshots()).toHaveLength(0);
    expect(goalRepository.saveRootWithExpectedVersion).not.toHaveBeenCalled();
  });

  it('rejects a stale aggregate version before changing any weight', async () => {
    const { goal, first } = createGoalFixture();
    vi.mocked(goalRepository.findByIdForIdentity).mockResolvedValue(goal);
    const useCase = new BatchUpdateKeyResultWeightsUseCase(transactionRunner, new GoalPolicy());

    const result = await useCase.execute(goal.id, 'identity-1', goal.version + 1, [
      { keyResultId: first.id, weight: 4 },
    ]);

    expect(result).toBeErrorWithCode('CONFLICT');
    expect(goal.getKeyResult(first.id)?.weight).toBe(2);
    expect(goal.getAllWeightSnapshots()).toHaveLength(0);
    expect(goalRepository.saveRootWithExpectedVersion).not.toHaveBeenCalled();
  });
});
