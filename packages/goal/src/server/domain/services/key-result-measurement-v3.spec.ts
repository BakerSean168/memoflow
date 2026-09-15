import { describe, expect, it } from 'vitest';
import type { KeyResultMeasurement } from '@memoflow/contracts/goal';
import { calculateKeyResultProgress } from './key-result-progress-calculator';

describe('GOAL-7204 canonical KR Measurement V3 calculator', () => {
  it('uses Initial as the visible 0% baseline', () => {
    const result = calculateKeyResultProgress({
      initialValue: 40,
      currentValue: 65,
      targetValue: 100,
      trackingBaseValue: 40,
      aggregationMethod: 'Last',
      unit: null,
    });
    expect(result).toMatchObject({
      currentValue: 65,
      percentage: 41.67,
      isCompleted: false,
      direction: 'increasing',
    });
  });

  it('supports decreasing targets with the same formula and no special baseline branch', () => {
    const result = calculateKeyResultProgress({
      initialValue: 100,
      currentValue: 80,
      targetValue: 50,
      trackingBaseValue: 100,
      aggregationMethod: 'Last',
      unit: 'kg',
    });
    expect(result).toMatchObject({
      currentValue: 80,
      percentage: 40,
      isCompleted: false,
      direction: 'decreasing',
    });
    expect(
      calculateKeyResultProgress({
        initialValue: 100,
        currentValue: 50,
        targetValue: 50,
        trackingBaseValue: 100,
        aggregationMethod: 'Last',
        unit: 'kg',
      }).isCompleted,
    ).toBe(true);
  });

  it('uses trackingBaseValue, not Initial, as the Sum record seed', () => {
    const result = calculateKeyResultProgress(
      {
        initialValue: 0,
        currentValue: 40,
        targetValue: 100,
        trackingBaseValue: 40,
        aggregationMethod: 'Sum',
        unit: null,
      },
      [5, -2],
    );
    expect(result.currentValue).toBe(43);
    expect(result.percentage).toBe(43);
  });

  it.each([
    ['Average', [7, 8, 9], 8],
    ['Max', [7, 8, 9], 9],
    ['Min', [7, 8, 9], 7],
    ['Last', [7, 8, 9], 9],
  ] as const)('aggregates %s records and falls back to trackingBaseValue when empty', (method, records, expected) => {
    const input: KeyResultMeasurement = {
      initialValue: 0,
      currentValue: 6,
      targetValue: 10,
      trackingBaseValue: 6,
      aggregationMethod: method,
      unit: null,
    };
    expect(calculateKeyResultProgress(input, [...records]).currentValue).toBe(expected);
    expect(calculateKeyResultProgress(input, []).currentValue).toBe(6);
  });

  it('changing Initial changes visible percentage without rebasing record aggregation', () => {
    const before: KeyResultMeasurement = {
      initialValue: 0,
      currentValue: 40,
      targetValue: 100,
      trackingBaseValue: 40,
      aggregationMethod: 'Sum',
      unit: null,
    };
    const after = { ...before, initialValue: 20 };
    const beforeResult = calculateKeyResultProgress(before, [10]);
    const afterResult = calculateKeyResultProgress(after, [10]);
    expect(beforeResult.currentValue).toBe(50);
    expect(afterResult.currentValue).toBe(50);
    expect(beforeResult.percentage).toBe(50);
    expect(afterResult.percentage).toBe(37.5);
  });

  it('preserves current value and percentage under the frozen V2 -> V3 fixture mapping', () => {
    const legacy = {
      startingValue: 40,
      currentValue: 65,
      targetValue: 100,
      progressBaselineValue: 10 as number | null,
      aggregationMethod: 'Sum' as const,
    };
    const legacyInitial = legacy.progressBaselineValue ?? 0;
    const legacyPercentage =
      ((legacy.currentValue - legacyInitial) / (legacy.targetValue - legacyInitial)) * 100;
    const migrated: KeyResultMeasurement = {
      initialValue: legacyInitial,
      currentValue: legacy.currentValue,
      targetValue: legacy.targetValue,
      trackingBaseValue: legacy.startingValue,
      aggregationMethod: legacy.aggregationMethod,
      unit: null,
    };
    const result = calculateKeyResultProgress(migrated);
    expect(result.currentValue).toBe(legacy.currentValue);
    expect(result.percentage).toBeCloseTo(legacyPercentage, 2);
    expect(migrated.trackingBaseValue).toBe(legacy.startingValue);
  });

  it('clamps display percentage without changing authoritative currentValue', () => {
    expect(
      calculateKeyResultProgress({
        initialValue: 0,
        currentValue: 120,
        targetValue: 100,
        trackingBaseValue: 0,
        aggregationMethod: 'Last',
        unit: null,
      }),
    ).toMatchObject({ currentValue: 120, percentage: 100, isCompleted: true });
  });

  it('rejects equal Initial and Target because the progress span would be undefined', () => {
    expect(() =>
      calculateKeyResultProgress({
        initialValue: 10,
        currentValue: 10,
        targetValue: 10,
        trackingBaseValue: 10,
        aggregationMethod: 'Last',
        unit: null,
      }),
    ).toThrow('targetValue must differ from initialValue');
  });
});
