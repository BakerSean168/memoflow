/**
 * GoalProgressCalculator Domain Service Tests
 *
 * Tests the progress calculation service that coordinates between
 * the Goal aggregate, KeyResultProgress value object, and the
 * GoalRecord repository.
 *
 * The repository is mocked since it's an I/O boundary.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Goal } from '../../aggregates/goal';
import { GoalProgressCalculator } from '../goal-progress-calculator';
import type { IGoalRecordRepository } from '../../repositories/i-goal-record-repository';

// ============================================================
// Helpers
// ============================================================

function createTestGoal(opts?: { name?: string }): Goal {
  return Goal.create({
    identityId: 'test-identity-id' as any,
    name: opts?.name ?? 'Test Goal',
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
}

function addKeyResult(
  goal: Goal,
  params: {
    title: string;
    startValue?: number;
    targetValue: number;
    currentValue?: number;
    weight: number;
    aggregationMethod?: string;
  },
) {
  return goal.createAndAddKeyResult({
    title: params.title,
    valueType: 'NUMERIC',
    aggregationMethod: params.aggregationMethod ?? 'Last',
    startValue: params.startValue,
    targetValue: params.targetValue,
    currentValue: params.currentValue ?? 0,
    weight: params.weight,
  });
}

function createMockRecord(value: number) {
  return { value, identityId: 'test-identity-id', recordedAt: Date.now() } as any;
}

function createMockRecordRepo(
  overrides: Partial<IGoalRecordRepository> = {},
): IGoalRecordRepository {
  return {
    findByKeyResultId: vi.fn().mockResolvedValue([]),
    findByGoalId: vi.fn().mockResolvedValue([]),
    findByKeyResultIds: vi.fn().mockResolvedValue(new Map()),
    countByKeyResultId: vi.fn().mockResolvedValue(0),
    save: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    deleteMany: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('GoalProgressCalculator', () => {
  let mockRepo: IGoalRecordRepository;
  let calculator: GoalProgressCalculator;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = createMockRecordRepo();
    calculator = new GoalProgressCalculator(mockRepo);
  });

  // ============================================================
  // recalculateKeyResultProgress
  // ============================================================

  describe('recalculateKeyResultProgress()', () => {
    it('should throw if key result is not found in goal', async () => {
      const goal = createTestGoal();

      await expect(
        calculator.recalculateKeyResultProgress(goal, 'non-existent-kr-id'),
      ).rejects.toThrow('KeyResult non-existent-kr-id not found');
    });

    it('should query the repository for history records', async () => {
      const goal = createTestGoal();
      const kr = addKeyResult(goal, { title: 'KR1', targetValue: 100, weight: 3 });

      await calculator.recalculateKeyResultProgress(goal, kr.id);

      expect(mockRepo.findByKeyResultId).toHaveBeenCalledWith(
        String(goal.identityId),
        kr.id,
        expect.objectContaining({ orderBy: 'asc' }),
      );
    });

    it('should return unchanged result when no records exist and currentValue is 0', async () => {
      const goal = createTestGoal();
      const kr = addKeyResult(goal, { title: 'KR1', targetValue: 100, currentValue: 0, weight: 3 });

      const result = await calculator.recalculateKeyResultProgress(goal, kr.id);

      expect(result.keyResultId).toBe(kr.id);
      expect(result.changed).toBe(false);
      expect(result.oldValue).toBe(0);
      expect(result.newValue).toBe(0);
    });

    it('should calculate progress from history records and update goal when changed', async () => {
      const goal = createTestGoal();
      const kr = addKeyResult(goal, { title: 'KR1', targetValue: 100, currentValue: 0, weight: 3 });

      // Mock repository to return records with values that sum to a different current value
      vi.mocked(mockRepo.findByKeyResultId).mockResolvedValue([
        createMockRecord(30),
        createMockRecord(50),
      ]);

      const result = await calculator.recalculateKeyResultProgress(goal, kr.id);

      expect(result.keyResultId).toBe(kr.id);
      expect(result.changed).toBe(true);
      expect(result.oldValue).toBe(0);
      // The recalculated value depends on the aggregation method (default LAST)
      expect(result.newValue).toBe(50);
    });

    it('should preserve the configured start value for cumulative records', async () => {
      const goal = createTestGoal();
      const kr = addKeyResult(goal, {
        title: 'KR1',
        startValue: 41,
        targetValue: 50,
        currentValue: 41,
        weight: 3,
        aggregationMethod: 'Sum',
      });

      vi.mocked(mockRepo.findByKeyResultId).mockResolvedValue([
        createMockRecord(0.5),
        createMockRecord(1),
      ]);

      const result = await calculator.recalculateKeyResultProgress(goal, kr.id);

      expect(result.newValue).toBe(42.5);
      expect(goal.getKeyResult(kr.id)?.progress.currentValue).toBe(42.5);
    });

    it('should return old and new percentages in the result DTO', async () => {
      const goal = createTestGoal();
      const kr = addKeyResult(goal, { title: 'KR1', targetValue: 100, currentValue: 0, weight: 3 });

      vi.mocked(mockRepo.findByKeyResultId).mockResolvedValue([createMockRecord(75)]);

      const result = await calculator.recalculateKeyResultProgress(goal, kr.id);

      expect(result.oldPercentage).toBe(0);
      expect(result.newPercentage).toBe(75);
      expect(result.changed).toBe(true);
    });

    it('should pass through custom query options', async () => {
      const goal = createTestGoal();
      const kr = addKeyResult(goal, { title: 'KR1', targetValue: 100, weight: 3 });
      const startTime = new Date('2025-01-01');

      await calculator.recalculateKeyResultProgress(goal, kr.id, { startTime });

      expect(mockRepo.findByKeyResultId).toHaveBeenCalledWith(
        String(goal.identityId),
        kr.id,
        expect.objectContaining({ orderBy: 'asc', startTime }),
      );
    });
  });

  // ============================================================
  // recalculateGoalProgress
  // ============================================================

  describe('recalculateGoalProgress()', () => {
    it('should return goal-level DTO with unchanged progress when no key results', async () => {
      const goal = createTestGoal();

      const result = await calculator.recalculateGoalProgress(goal);

      expect(result.goalId).toBe(goal.id);
      expect(result.changed).toBe(false);
      expect(result.oldProgress).toBe(0);
      expect(result.newProgress).toBe(0);
      expect(result.keyResultResults).toHaveLength(0);
    });

    it('should recalculate all key results and return combined result', async () => {
      const goal = createTestGoal();
      const kr1 = addKeyResult(goal, {
        title: 'KR1',
        targetValue: 100,
        currentValue: 0,
        weight: 3,
      });
      const kr2 = addKeyResult(goal, {
        title: 'KR2',
        targetValue: 100,
        currentValue: 0,
        weight: 3,
      });

      const recordsMap = new Map<string, any[]>();
      recordsMap.set(kr1.id, [createMockRecord(60)]);
      recordsMap.set(kr2.id, [createMockRecord(80)]);

      vi.mocked(mockRepo.findByKeyResultIds).mockResolvedValue(recordsMap);

      const result = await calculator.recalculateGoalProgress(goal);

      expect(result.goalId).toBe(goal.id);
      expect(result.changed).toBe(true);
      expect(result.keyResultResults).toHaveLength(2);
      expect(result.keyResultResults[0].changed).toBe(true);
      expect(result.keyResultResults[1].changed).toBe(true);
      // (60*3 + 80*3) / (3+3) = 420/6 = 70
      expect(result.newProgress).toBe(70);
    });

    it('should use batch query for all key results', async () => {
      const goal = createTestGoal();
      const kr1 = addKeyResult(goal, { title: 'KR1', targetValue: 100, weight: 2 });
      const kr2 = addKeyResult(goal, { title: 'KR2', targetValue: 100, weight: 3 });

      vi.mocked(mockRepo.findByKeyResultIds).mockResolvedValue(new Map());

      await calculator.recalculateGoalProgress(goal);

      expect(mockRepo.findByKeyResultIds).toHaveBeenCalledWith(
        String(goal.identityId),
        [kr1.id, kr2.id],
        expect.objectContaining({ orderBy: 'asc' }),
      );
    });

    it('should handle missing records for some key results', async () => {
      const goal = createTestGoal();
      const kr1 = addKeyResult(goal, {
        title: 'KR1',
        targetValue: 100,
        currentValue: 0,
        weight: 3,
      });
      addKeyResult(goal, { title: 'KR2', targetValue: 100, currentValue: 0, weight: 3 });

      // Only kr1 has records in the map
      const recordsMap = new Map<string, any[]>();
      recordsMap.set(kr1.id, [createMockRecord(50)]);
      vi.mocked(mockRepo.findByKeyResultIds).mockResolvedValue(recordsMap);

      const result = await calculator.recalculateGoalProgress(goal);

      expect(result.keyResultResults).toHaveLength(2);
      // kr1 changed, kr2 unchanged (no records, stays 0)
      expect(result.keyResultResults[0].changed).toBe(true);
      expect(result.keyResultResults[1].changed).toBe(false);
    });
  });

  // ============================================================
  // getKeyResultHistoryValues
  // ============================================================

  describe('getKeyResultHistoryValues()', () => {
    it('should return empty array when no records exist', async () => {
      const values = await calculator.getKeyResultHistoryValues('identity-1', 'kr-123');

      expect(values).toEqual([]);
      expect(mockRepo.findByKeyResultId).toHaveBeenCalledWith(
        'identity-1',
        'kr-123',
        expect.objectContaining({ orderBy: 'asc' }),
      );
    });

    it('should return array of values from records', async () => {
      vi.mocked(mockRepo.findByKeyResultId).mockResolvedValue([
        createMockRecord(10),
        createMockRecord(25),
        createMockRecord(40),
      ]);

      const values = await calculator.getKeyResultHistoryValues('identity-1', 'kr-123');

      expect(values).toEqual([10, 25, 40]);
    });

    it('should pass query options through', async () => {
      const endTime = new Date('2025-12-31');

      await calculator.getKeyResultHistoryValues('identity-1', 'kr-123', { endTime });

      expect(mockRepo.findByKeyResultId).toHaveBeenCalledWith(
        'identity-1',
        'kr-123',
        expect.objectContaining({ orderBy: 'asc', endTime }),
      );
    });
  });

  // ============================================================
  // previewProgress
  // ============================================================

  describe('previewProgress()', () => {
    it('should throw if key result is not found', async () => {
      const goal = createTestGoal();

      await expect(calculator.previewProgress(goal, 'non-existent')).rejects.toThrow(
        'KeyResult non-existent not found',
      );
    });

    it('should return preview without modifying the goal', async () => {
      const goal = createTestGoal();
      const kr = addKeyResult(goal, { title: 'KR1', targetValue: 100, currentValue: 0, weight: 3 });

      vi.mocked(mockRepo.findByKeyResultId).mockResolvedValue([createMockRecord(30)]);

      const preview = await calculator.previewProgress(goal, kr.id);

      expect(preview.currentValue).toBe(0);
      expect(preview.previewValue).toBe(30);
      // The goal's actual KR should NOT be modified
      expect(goal.getKeyResult(kr.id)!.progress.currentValue).toBe(0);
    });

    it('should support additionalValue for simulating new records', async () => {
      const goal = createTestGoal();
      const kr = addKeyResult(goal, { title: 'KR1', targetValue: 100, currentValue: 0, weight: 3 });

      vi.mocked(mockRepo.findByKeyResultId).mockResolvedValue([createMockRecord(30)]);

      const preview = await calculator.previewProgress(goal, kr.id, 80);

      // With LAST aggregation, the last value (additionalValue=80) is used
      expect(preview.previewValue).toBe(80);
      expect(preview.previewPercentage).toBe(80);
    });

    it('should return current and preview percentages', async () => {
      const goal = createTestGoal();
      const kr = addKeyResult(goal, {
        title: 'KR1',
        targetValue: 200,
        currentValue: 50,
        weight: 3,
      });

      vi.mocked(mockRepo.findByKeyResultId).mockResolvedValue([createMockRecord(150)]);

      const preview = await calculator.previewProgress(goal, kr.id);

      expect(preview.currentPercentage).toBe(25); // 50/200 = 25%
      expect(preview.previewPercentage).toBe(75); // 150/200 = 75%
    });
  });

  // ============================================================
  // needsRecalculation
  // ============================================================

  describe('needsRecalculation()', () => {
    it('should return false when key result does not exist', async () => {
      const goal = createTestGoal();

      const needs = await calculator.needsRecalculation(goal, 'non-existent');

      expect(needs).toBe(false);
    });

    it('should return false when current value matches expected', async () => {
      const goal = createTestGoal();
      const kr = addKeyResult(goal, { title: 'KR1', targetValue: 100, currentValue: 0, weight: 3 });

      // No records, expected value is 0, current value is 0
      vi.mocked(mockRepo.findByKeyResultId).mockResolvedValue([]);

      const needs = await calculator.needsRecalculation(goal, kr.id);

      expect(needs).toBe(false);
    });

    it('should return true when current value differs from expected', async () => {
      const goal = createTestGoal();
      const kr = addKeyResult(goal, { title: 'KR1', targetValue: 100, currentValue: 0, weight: 3 });

      // Records suggest value should be 50, but current is 0
      vi.mocked(mockRepo.findByKeyResultId).mockResolvedValue([createMockRecord(50)]);

      const needs = await calculator.needsRecalculation(goal, kr.id);

      expect(needs).toBe(true);
    });

    it('should return false when value already matches records', async () => {
      const goal = createTestGoal();
      const kr = addKeyResult(goal, {
        title: 'KR1',
        targetValue: 100,
        currentValue: 75,
        weight: 3,
      });

      // Records suggest value should be 75, current is already 75
      vi.mocked(mockRepo.findByKeyResultId).mockResolvedValue([createMockRecord(75)]);

      const needs = await calculator.needsRecalculation(goal, kr.id);

      expect(needs).toBe(false);
    });
  });
});
