import type { GoalClientDTO, KeyResultProgress } from '@memoflow/goal-contracts';
import { describe, expect, it } from 'vitest';
import { getGoalOverallProgress, getKeyResultProgressPercentage } from './progress';

const progress = (value: Partial<KeyResultProgress>): KeyResultProgress =>
  value as KeyResultProgress;

describe('goal progress percentage clamp', () => {
  it('clamps overall progress into 0..100 and maps non-finite values to 0', () => {
    expect(getGoalOverallProgress({ overallProgress: 42.6 } as GoalClientDTO)).toBe(43);
    expect(getGoalOverallProgress({ overallProgress: 140 } as GoalClientDTO)).toBe(100);
    expect(getGoalOverallProgress({ overallProgress: -5 } as GoalClientDTO)).toBe(0);
    expect(getGoalOverallProgress({ overallProgress: Number.NaN } as GoalClientDTO)).toBe(0);
    expect(
      getGoalOverallProgress({ overallProgress: Number.POSITIVE_INFINITY } as GoalClientDTO),
    ).toBe(0);
    expect(getGoalOverallProgress(null)).toBe(0);
  });

  it('clamps key-result progress and handles an equal initial/target value', () => {
    expect(getKeyResultProgressPercentage(null)).toBe(0);
    expect(
      getKeyResultProgressPercentage(
        progress({ initialValue: 10, currentValue: 20, targetValue: 30 }),
      ),
    ).toBe(50);
    expect(
      getKeyResultProgressPercentage(
        progress({ initialValue: 10, currentValue: 40, targetValue: 30 }),
      ),
    ).toBe(100);
    expect(
      getKeyResultProgressPercentage(
        progress({ initialValue: 10, currentValue: 0, targetValue: 30 }),
      ),
    ).toBe(0);
    expect(
      getKeyResultProgressPercentage(
        progress({ initialValue: 10, currentValue: 10, targetValue: 10 }),
      ),
    ).toBe(100);
    expect(
      getKeyResultProgressPercentage(
        progress({ initialValue: 10, currentValue: 9, targetValue: 10 }),
      ),
    ).toBe(0);
    expect(
      getKeyResultProgressPercentage(
        progress({ initialValue: 0, currentValue: Number.NaN, targetValue: 10 }),
      ),
    ).toBe(0);
  });
});
