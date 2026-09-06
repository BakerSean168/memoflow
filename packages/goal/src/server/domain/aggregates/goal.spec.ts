/**
 * Goal Aggregate Domain Tests
 *
 * Tests for T018 (calculateProgress weighted average) and T019 (weight validation).
 * Critical Path Testing: complex domain logic requires high test coverage.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Goal } from '../aggregates/goal';
import type { KeyResult } from '../entities/key-result';

// ============================================================
// Helper: Create a Goal with key results for testing
// ============================================================

/**
 * Creates a test goal with optional key results.
 * Uses Goal.create() factory and createAndAddKeyResult() to build the aggregate.
 */
function createTestGoal(opts?: { name?: string }): Goal {
  return Goal.create({
    identityId: 'test-identity-id' as any,
    name: opts?.name ?? 'Test Goal',
    description: null,
    feasibilityAnalysis: null,
    motivation: null,
    startDate: null,
    reminderConfig: null,
  });
}

function addKeyResult(
  goal: Goal,
  params: {
    title: string;
    targetValue: number;
    currentValue?: number;
    weight: number;
  },
): KeyResult {
  return goal.createAndAddKeyResult({
    title: params.title,
    startingValue: 0,
    targetValue: params.targetValue,
    currentValue: params.currentValue ?? 0,
    weight: params.weight,
  });
}

// ============================================================
// T018: Goal.calculateProgress() Tests
// ============================================================

describe('Goal.calculateProgress()', () => {
  let goal: Goal;

  beforeEach(() => {
    goal = createTestGoal();
  });

  it('should return 0 when there are no key results', () => {
    expect(goal.calculateProgress()).toBe(0);
  });

  it('should calculate simple weighted average with equal weights', () => {
    // KR1: 50% complete, weight 3
    // KR2: 100% complete, weight 3
    // Expected: (50 * 3 + 100 * 3) / (3 + 3) = 450 / 6 = 75
    addKeyResult(goal, { title: 'KR1', targetValue: 100, currentValue: 50, weight: 3 });
    addKeyResult(goal, { title: 'KR2', targetValue: 100, currentValue: 100, weight: 3 });

    expect(goal.calculateProgress()).toBe(75);
  });

  it('should calculate weighted average with unequal weights', () => {
    // KR1: 50% complete, weight 1
    // KR2: 100% complete, weight 4
    // Expected: (50 * 1 + 100 * 4) / (1 + 4) = (50 + 400) / 5 = 90
    addKeyResult(goal, { title: 'KR1', targetValue: 100, currentValue: 50, weight: 1 });
    addKeyResult(goal, { title: 'KR2', targetValue: 100, currentValue: 100, weight: 4 });

    expect(goal.calculateProgress()).toBe(90);
  });

  it('should return 0 when all key results have 0 progress', () => {
    addKeyResult(goal, { title: 'KR1', targetValue: 100, currentValue: 0, weight: 3 });
    addKeyResult(goal, { title: 'KR2', targetValue: 100, currentValue: 0, weight: 3 });

    expect(goal.calculateProgress()).toBe(0);
  });

  it('should return 100 when all key results are 100% complete', () => {
    addKeyResult(goal, { title: 'KR1', targetValue: 100, currentValue: 100, weight: 3 });
    addKeyResult(goal, { title: 'KR2', targetValue: 100, currentValue: 100, weight: 3 });

    expect(goal.calculateProgress()).toBe(100);
  });

  it('should handle a single key result correctly', () => {
    addKeyResult(goal, { title: 'KR1', targetValue: 200, currentValue: 100, weight: 5 });
    // 100/200 = 50%
    expect(goal.calculateProgress()).toBe(50);
  });

  it('should handle key results with different target values', () => {
    // KR1: 50/100 = 50%, weight 2
    // KR2: 75/150 = 50%, weight 3
    // Expected: (50 * 2 + 50 * 3) / (2 + 3) = 250 / 5 = 50
    addKeyResult(goal, { title: 'KR1', targetValue: 100, currentValue: 50, weight: 2 });
    addKeyResult(goal, { title: 'KR2', targetValue: 150, currentValue: 75, weight: 3 });

    expect(goal.calculateProgress()).toBe(50);
  });

  it('should round to 2 decimal places', () => {
    // KR1: 10/100 = 10%, weight 1
    // KR2: 20/100 = 20%, weight 2
    // KR3: 30/100 = 30%, weight 3
    // Expected: (10*1 + 20*2 + 30*3) / (1+2+3) = (10 + 40 + 90) / 6 = 140/6 ≈ 23.33
    addKeyResult(goal, { title: 'KR1', targetValue: 100, currentValue: 10, weight: 1 });
    addKeyResult(goal, { title: 'KR2', targetValue: 100, currentValue: 20, weight: 2 });
    addKeyResult(goal, { title: 'KR3', targetValue: 100, currentValue: 30, weight: 3 });

    const progress = goal.calculateProgress();
    expect(progress).toBe(23.33);
  });

  it('should update progress when key result progress changes', () => {
    addKeyResult(goal, { title: 'KR1', targetValue: 100, currentValue: 0, weight: 3 });
    addKeyResult(goal, { title: 'KR2', targetValue: 100, currentValue: 0, weight: 3 });

    expect(goal.calculateProgress()).toBe(0);

    // Update KR1 progress to 80
    const kr1 = goal.keyResults[0];
    goal.updateKeyResultProgress(kr1.id as unknown as string, 80);

    // (80*3 + 0*3) / (3+3) = 240 / 6 = 40
    expect(goal.calculateProgress()).toBe(40);
  });

  it('should clamp individual key result percentage to 0-100', () => {
    // If currentValue exceeds targetValue, percentage should be capped at 100
    addKeyResult(goal, { title: 'KR1', targetValue: 100, currentValue: 150, weight: 3 });
    addKeyResult(goal, { title: 'KR2', targetValue: 100, currentValue: 50, weight: 3 });

    // KR1 capped at 100%, KR2 at 50%
    // (100*3 + 50*3) / (3+3) = 450 / 6 = 75
    expect(goal.calculateProgress()).toBe(75);
  });
});


// ============================================================
// T019: Weight Validation Tests
// ============================================================

describe('Goal weight validation', () => {
  let goal: Goal;

  beforeEach(() => {
    goal = createTestGoal();
  });

  describe('validateKeyResultWeight()', () => {
    it('should accept weight of 1', () => {
      expect(() => Goal.validateKeyResultWeight(1)).not.toThrow();
    });

    it('should accept weight of 5', () => {
      expect(() => Goal.validateKeyResultWeight(5)).not.toThrow();
    });

    it('should accept weight of 3', () => {
      expect(() => Goal.validateKeyResultWeight(3)).not.toThrow();
    });

    it('should reject weight of 0', () => {
      expect(() => Goal.validateKeyResultWeight(0)).toThrow();
    });

    it('should reject negative weight', () => {
      expect(() => Goal.validateKeyResultWeight(-1)).toThrow();
    });

    it('should reject weight exceeding 5', () => {
      expect(() => Goal.validateKeyResultWeight(6)).toThrow();
    });

    it('should reject non-integer weight', () => {
      expect(() => Goal.validateKeyResultWeight(2.5)).toThrow();
    });
  });

  describe('key result weight getter', () => {
    it('should return the assigned weight for each key result', () => {
      addKeyResult(goal, { title: 'KR1', targetValue: 100, weight: 2 });
      addKeyResult(goal, { title: 'KR2', targetValue: 100, weight: 4 });

      expect(goal.keyResults[0].weight).toBe(2);
      expect(goal.keyResults[1].weight).toBe(4);
    });
  });
});

// ============================================================
// Goal Lifecycle Tests (Archive/Activate guard)
// ============================================================

describe('Goal lifecycle guards', () => {
  it('should not allow modifying an archived goal', () => {
    const goal = createTestGoal();
    goal.markAsCompleted();
    goal.archive();

    expect(() => {
      addKeyResult(goal, { title: 'KR1', targetValue: 100, weight: 3 });
    }).toThrow();
  });

  it('keeps Completed distinct from archivedAt so completion can be rolled back or adjusted', () => {
    const goal = createTestGoal();
    goal.markAsCompleted();

    expect(goal.status).toBe('Completed');
    expect(goal.archivedAt).toBeNull();
    expect(() => {
      addKeyResult(goal, { title: 'KR1', targetValue: 100, weight: 3 });
    }).not.toThrow();
  });
});

describe('Goal summary fields', () => {
  it('derives summary counts from the hydrated aggregate even when children are omitted in DTO', () => {
    const goal = createTestGoal();
    addKeyResult(goal, { title: 'Done', targetValue: 10, currentValue: 10, weight: 1 });
    addKeyResult(goal, { title: 'Open 1', targetValue: 10, currentValue: 2, weight: 1 });
    addKeyResult(goal, { title: 'Open 2', targetValue: 10, currentValue: 0, weight: 1 });

    const dto = goal.toClientDTO(false);

    expect(dto.keyResults).toBeNull();
    expect(dto.totalKeyResults).toBe(3);
    expect(dto.completedKeyResults).toBe(1);
  });
});
