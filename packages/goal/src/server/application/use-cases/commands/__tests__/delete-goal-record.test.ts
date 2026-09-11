import { describe, it, expect, vi } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import { Goal, GoalRecord, KeyResultProgress } from '../../../../domain';
import type { IGoalRecordRepository, IGoalRepository } from '../../../../domain';
import { DeleteGoalRecordUseCase } from '../delete-goal-record.use-case';
import { createInlineGoalWriteTransactionRunner } from '../goal-write-support';
import { InMemoryGoalReliableOperationAdapter } from '../../../../infrastructure/adapters/in-memory/in-memory-goal-reliable-operation.adapter';

describe('DeleteGoalRecordUseCase', () => {
  it('atomically removes a record and recalculates Sum from full history', async () => {
    const goal = Goal.create({
      identityId: 'identity-1' as any,
      name: 'Atomic record deletion',
      summary: null,
      startDate: null,
      reminderConfig: null,
    });
    const keyResult = goal.createAndAddKeyResult({
      title: 'Points',
      aggregationMethod: 'Sum',
      startingValue: 0,
      currentValue: 5,
      targetValue: 20,
      weight: 1,
      unit: 'points',
    });
    const deletedRecord = GoalRecord.create({
      keyResultId: keyResult.id as any,
      identityId: 'identity-1' as any,
      value: 2,
    });
    const remainingRecord = GoalRecord.create({
      keyResultId: keyResult.id as any,
      identityId: 'identity-1' as any,
      value: 3,
    });
    const goalRepository = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
      saveRootWithExpectedVersion: vi.fn().mockResolvedValue(undefined),
    });
    const recordRepository = createMockRepo<IGoalRecordRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(deletedRecord),
      findByKeyResultId: vi.fn().mockResolvedValue([deletedRecord, remainingRecord]),
      delete: vi.fn().mockResolvedValue(undefined),
    });
    const useCase = new DeleteGoalRecordUseCase(
      goalRepository,
      recordRepository,
      createInlineGoalWriteTransactionRunner(
        { goalRepository, goalRecordRepository: recordRepository },
        new InMemoryGoalReliableOperationAdapter(),
      ),
    );

    const result = await useCase.execute(
      goal.id,
      keyResult.id,
      deletedRecord.id,
      'identity-1',
      goal.version,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.goalVersion).toBe(2);
      expect(result.data.readModel.keyResults?.[0]?.progress.currentValue).toBe(3);
      expect(result.data.recordChanges).toEqual({
        upserted: [],
        removedIds: [deletedRecord.id],
      });
    }
    expect(goal.getKeyResult(keyResult.id)?.progress.currentValue).toBe(3);
    expect(recordRepository.delete).toHaveBeenCalledWith('identity-1', deletedRecord.id);
    expect(goalRepository.saveRootWithExpectedVersion).toHaveBeenCalledWith(goal, 1);
  });

  it('Fixture C: deleting the latest Last measurement restores the previous decreasing measurement', async () => {
    const goal = Goal.create({
      identityId: 'identity-1' as any,
      name: 'Reach 70 kg',
      summary: null,
      startDate: null,
      dueDate: null,
      reminderConfig: null,
    });
    const keyResult = goal.createAndAddKeyResult({
      title: 'Weight',
      aggregationMethod: 'Last',
      startingValue: 75,
      currentValue: 70,
      targetValue: 70,
      progressBaselineValue: 75,
      weight: 1,
      unit: 'kg',
    });
    const previous = GoalRecord.create({
      id: 'IGoalRecordId_550e8400-e29b-41d4-a716-446655440301' as any,
      keyResultId: keyResult.id as any,
      identityId: 'identity-1' as any,
      value: 73,
    });
    const latest = GoalRecord.create({
      id: 'IGoalRecordId_550e8400-e29b-41d4-a716-446655440302' as any,
      keyResultId: keyResult.id as any,
      identityId: 'identity-1' as any,
      value: 70,
    });
    const goalRepository = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(goal),
      saveRootWithExpectedVersion: vi.fn().mockResolvedValue(undefined),
    });
    const recordRepository = createMockRepo<IGoalRecordRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(latest),
      findByKeyResultId: vi.fn().mockResolvedValue([previous, latest]),
      delete: vi.fn().mockResolvedValue(undefined),
    });
    const useCase = new DeleteGoalRecordUseCase(
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
      'identity-1',
      goal.version,
    );

    expect(result.ok).toBe(true);
    expect(goal.getKeyResult(String(keyResult.id))?.progress.currentValue).toBe(73);
    const progress = KeyResultProgress.fromDTO(goal.getKeyResult(String(keyResult.id))!.progress);
    expect(progress.getDirection()).toBe('down');
    expect(progress.isCompleted).toBe(false);
    expect(recordRepository.delete).toHaveBeenCalledWith('identity-1', latest.id);
  });

  it('returns NOT_FOUND when record is missing or foreign', async () => {
    const goalRepository = createMockRepo<IGoalRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue({ version: 1 }),
    });
    const recordRepository = createMockRepo<IGoalRecordRepository>({
      findByIdForIdentity: vi.fn().mockResolvedValue(null),
      delete: vi.fn(),
    });
    const useCase = new DeleteGoalRecordUseCase(
      goalRepository,
      recordRepository,
      createInlineGoalWriteTransactionRunner(
        { goalRepository, goalRecordRepository: recordRepository },
        new InMemoryGoalReliableOperationAdapter(),
      ),
    );

    const result = await useCase.execute('goal-1', 'kr-1', 'record-1', 'identity-other', 1);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('NOT_FOUND');
    expect(recordRepository.delete).not.toHaveBeenCalled();
  });
});
