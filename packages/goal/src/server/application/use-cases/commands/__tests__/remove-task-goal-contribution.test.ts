import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { Goal, GoalRecord, GoalVersionConflictError } from '../../../../domain';
import type { IGoalRepository } from '../../../../domain/repositories/i-goal-repository';
import type { IGoalRecordRepository } from '../../../../domain/repositories/i-goal-record-repository';
import { RemoveTaskGoalContributionUseCase } from '../remove-task-goal-contribution.use-case';
import { createInlineGoalWriteTransactionRunner } from '../goal-write-support';
import { InMemoryGoalReliableOperationAdapter } from '../../../../infrastructure/adapters/in-memory/in-memory-goal-reliable-operation.adapter';

function createGoalWithProgress() {
  const goal = Goal.create({
    identityId: 'identity-1' as never,
    name: 'Delivery goal',
    description: null,
    feasibilityAnalysis: null,
    motivation: null,
    startDate: null,
    reminderConfig: null,
  });
  const keyResult = goal.createAndAddKeyResult({
    title: 'Completed tasks',
    aggregationMethod: 'Sum',
    startingValue: 0,
    currentValue: 3,
    targetValue: 10,
    weight: 1,
    unit: 'tasks',
  });
  return { goal, keyResult };
}

describe('RemoveTaskGoalContributionUseCase', () => {
  let goalRepository: ReturnType<typeof createMockRepo<IGoalRepository>>;
  let goalRecordRepository: ReturnType<typeof createMockRepo<IGoalRecordRepository>>;
  let useCase: RemoveTaskGoalContributionUseCase;

  beforeEach(() => {
    goalRepository = createMockRepo<IGoalRepository>({
      findByKeyResultIdForIdentity: vi.fn(),
      saveRootWithExpectedVersion: vi.fn().mockResolvedValue(undefined),
    });
    goalRecordRepository = createMockRepo<IGoalRecordRepository>({
      findBySource: vi.fn().mockResolvedValue(null),
      findByKeyResultId: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(undefined),
    });
    useCase = new RemoveTaskGoalContributionUseCase(
      goalRepository,
      goalRecordRepository,
      createInlineGoalWriteTransactionRunner(
        { goalRepository, goalRecordRepository },
        new InMemoryGoalReliableOperationAdapter(),
      ),
    );
  });

  it('deletes the exact source record and recalculates canonical Sum history', async () => {
    const { goal, keyResult } = createGoalWithProgress();
    const record = GoalRecord.create({
      keyResultId: keyResult.id as never,
      identityId: 'identity-1' as never,
      value: 3,
      source: { type: 'TASK_INSTANCE', id: 'task-occurrence-1' },
    });
    vi.mocked(goalRecordRepository.findBySource).mockResolvedValue(record);
    vi.mocked(goalRecordRepository.findByKeyResultId).mockResolvedValue([record]);
    vi.mocked(goalRepository.findByKeyResultIdForIdentity).mockResolvedValue(goal);

    const result = await useCase.execute('identity-1', 'TASK_INSTANCE', 'task-occurrence-1');

    expect(result).toBeOk();
    expect(goalRecordRepository.delete).toHaveBeenCalledWith('identity-1', String(record.id));
    expect(goal.getKeyResult(keyResult.id)?.progress.currentValue).toBe(0);
    expect(goalRepository.saveRootWithExpectedVersion).toHaveBeenCalledWith(goal, 1);
    expect(goal.version).toBe(2);
  });

  it('is idempotent when the source contribution is already absent', async () => {
    const result = await useCase.execute('identity-1', 'TASK_INSTANCE', 'task-occurrence-1');

    expect(result).toBeOk();
    expect(goalRecordRepository.delete).not.toHaveBeenCalled();
    expect(goalRepository.saveRootWithExpectedVersion).not.toHaveBeenCalled();
  });

  it('does not delete the source record when the Goal CAS fails', async () => {
    const { goal, keyResult } = createGoalWithProgress();
    const record = GoalRecord.create({
      keyResultId: keyResult.id as never,
      identityId: 'identity-1' as never,
      value: 3,
      source: { type: 'TASK_INSTANCE', id: 'task-occurrence-1' },
    });
    vi.mocked(goalRecordRepository.findBySource).mockResolvedValue(record);
    vi.mocked(goalRecordRepository.findByKeyResultId).mockResolvedValue([record]);
    vi.mocked(goalRepository.findByKeyResultIdForIdentity).mockResolvedValue(goal);
    vi.mocked(goalRepository.saveRootWithExpectedVersion).mockRejectedValue(
      new GoalVersionConflictError(),
    );

    const result = await useCase.execute('identity-1', 'TASK_INSTANCE', 'task-occurrence-1');

    expect(result).toBeErrorWithCode('CONFLICT');
    expect(goalRecordRepository.delete).not.toHaveBeenCalled();
  });
});
