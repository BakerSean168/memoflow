import { describe, expect, it, vi } from 'vitest';
import '@memoflow/test-utils/helpers/result-matchers';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { Goal, GoalRecord, KeyResultProgress } from '../../../../domain';
import type { IGoalRecordRepository, IGoalRepository } from '../../../../domain';
import { InMemoryGoalReliableOperationAdapter } from '../../../../infrastructure/adapters/in-memory/in-memory-goal-reliable-operation.adapter';
import { createInlineGoalWriteTransactionRunner } from '../goal-write-support';
import { UpdateGoalRecordUseCase } from '../update-goal-record.use-case';

function createGoalWithSum() {
  const goal = Goal.create({
    identityId: 'identity-1' as never,
    name: 'Running distance',
    summary: null,
    startDate: null,
    target: null,
    reminderConfig: null,
  });
  const keyResult = goal.createAndAddKeyResult({
    title: 'Run 100km',
    aggregationMethod: 'Sum',
    startingValue: 10,
    currentValue: 22,
    targetValue: 100,
    progressBaselineValue: null,
    unit: 'km',
    weight: 3,
  });
  return { goal, keyResult };
}

describe('UpdateGoalRecordUseCase', () => {
  it('recalculates Sum from the complete edited record history', async () => {
    const { goal, keyResult } = createGoalWithSum();
    const recordA = GoalRecord.create({
      id: 'IGoalRecordId_550e8400-e29b-41d4-a716-446655440101' as never,
      keyResultId: keyResult.id as never,
      identityId: 'identity-1' as never,
      value: 5,
    });
    const recordB = GoalRecord.create({
      id: 'IGoalRecordId_550e8400-e29b-41d4-a716-446655440102' as never,
      keyResultId: keyResult.id as never,
      identityId: 'identity-1' as never,
      value: 7,
    });
    const goalRepository = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
      saveRootWithExpectedVersion: vi.fn().mockResolvedValue(undefined),
    });
    const recordRepository = createMockRepo<IGoalRecordRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(recordA),
      save: vi.fn().mockResolvedValue(undefined),
      findByKeyResultId: vi.fn().mockImplementation(async () => [recordA, recordB]),
    });
    const useCase = new UpdateGoalRecordUseCase(
      goalRepository,
      recordRepository,
      createInlineGoalWriteTransactionRunner(
        { goalRepository, goalRecordRepository: recordRepository },
        new InMemoryGoalReliableOperationAdapter(),
      ),
    );

    const result = await useCase.execute(
      String(goal.id),
      String(keyResult.id),
      String(recordA.id),
      { value: 20, note: 'corrected', expectedVersion: 1 },
      'identity-1',
    );

    expect(result).toBeOk();
    expect(recordA.value).toBe(20);
    expect(recordA.note).toBe('corrected');
    expect(goal.getKeyResult(String(keyResult.id))?.progress.currentValue).toBe(37);
    expect(recordRepository.save).toHaveBeenCalledWith(recordA);
    expect(goalRepository.saveRootWithExpectedVersion).toHaveBeenCalledWith(goal, 1);
    if (result.ok) {
      expect(result.data.recordChanges?.upserted[0]).toMatchObject({ value: 20, valueAfter: 37 });
    }
  });

  it('Fixture C: editing the latest 75 -> 70 Last measurement recalculates the decreasing KR from authoritative history', async () => {
    const goal = Goal.create({
      identityId: 'identity-1' as never,
      name: 'Reach 70 kg',
      summary: null,
      startDate: null,
      target: null,
      reminderConfig: null,
    });
    const keyResult = goal.createAndAddKeyResult({
      title: 'Weight',
      aggregationMethod: 'Last',
      startingValue: 75,
      currentValue: 73,
      targetValue: 70,
      progressBaselineValue: 75,
      unit: 'kg',
      weight: 1,
    });
    const older = GoalRecord.create({
      id: 'IGoalRecordId_550e8400-e29b-41d4-a716-446655440201' as never,
      keyResultId: keyResult.id as never,
      identityId: 'identity-1' as never,
      value: 74,
    });
    const latest = GoalRecord.create({
      id: 'IGoalRecordId_550e8400-e29b-41d4-a716-446655440202' as never,
      keyResultId: keyResult.id as never,
      identityId: 'identity-1' as never,
      value: 73,
    });
    const goalRepository = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
      saveRootWithExpectedVersion: vi.fn().mockResolvedValue(undefined),
    });
    const recordRepository = createMockRepo<IGoalRecordRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(latest),
      save: vi.fn().mockResolvedValue(undefined),
      findByKeyResultId: vi.fn().mockImplementation(async () => [older, latest]),
    });
    const useCase = new UpdateGoalRecordUseCase(
      goalRepository,
      recordRepository,
      createInlineGoalWriteTransactionRunner(
        { goalRepository, goalRecordRepository: recordRepository },
        new InMemoryGoalReliableOperationAdapter(),
      ),
    );

    const result = await useCase.execute(
      String(goal.id),
      String(keyResult.id),
      String(latest.id),
      { value: 70, expectedVersion: goal.version },
      'identity-1',
    );

    expect(result).toBeOk();
    expect(latest.value).toBe(70);
    expect(goal.getKeyResult(String(keyResult.id))?.progress.currentValue).toBe(70);
    const progress = KeyResultProgress.fromDTO(goal.getKeyResult(String(keyResult.id))!.progress);
    expect(progress.getDirection()).toBe('down');
    expect(progress.isCompleted).toBe(true);
  });

  it('rejects manual edits to source-correlated Task contribution facts', async () => {
    const { goal, keyResult } = createGoalWithSum();
    const record = GoalRecord.create({
      keyResultId: keyResult.id as never,
      identityId: 'identity-1' as never,
      value: 7,
      source: { type: 'TASK_INSTANCE', id: 'task-occurrence-1' },
    });
    const goalRepository = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
    });
    const recordRepository = createMockRepo<IGoalRecordRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(record),
      save: vi.fn(),
    });
    const useCase = new UpdateGoalRecordUseCase(
      goalRepository,
      recordRepository,
      createInlineGoalWriteTransactionRunner(
        { goalRepository, goalRecordRepository: recordRepository },
        new InMemoryGoalReliableOperationAdapter(),
      ),
    );

    const result = await useCase.execute(
      String(goal.id),
      String(keyResult.id),
      String(record.id),
      { value: 9, expectedVersion: 1 },
      'identity-1',
    );

    expect(result).toBeErrorWithCode('VALIDATION_ERROR');
    expect(recordRepository.save).not.toHaveBeenCalled();
  });
});
