import { describe, expect, it } from 'vitest';
import type { KeyResultProgress } from '@memoflow/contracts/goal';
import {
  previewGoalRecord as preview,
  calculateKeyResultProgress,
  createGoalRecordAggregationSnapshot,
} from '../client';
import { calculateKeyResultProgress as serverCalculator } from '../server/domain/services/key-result-progress-calculator';
import { KeyResultProgress as ServerProgress } from '../server/domain/value-objects/key-result-progress';

const measurement: KeyResultProgress = {
  initialValue: 0,
  currentValue: 80,
  targetValue: 100,
  aggregationMethod: 'Sum',
  unit: 'kg',
};

function previewGoalRecord(
  input: KeyResultProgress,
  base: number,
  values: readonly number[],
  candidate: number,
) {
  return preview(
    {
      ...input,
      keyResultId: 'kr-1' as never,
      trackingBaseValue: base,
      aggregationSnapshot: createGoalRecordAggregationSnapshot(values),
    },
    candidate,
  );
}

describe('Goal-owned record preview', () => {
  it('exports the exact server calculator and uses the aggregation seed instead of current', () => {
    expect(serverCalculator).toBe(calculateKeyResultProgress);
    expect(previewGoalRecord(measurement, 40, [], 5)).toEqual({
      current: 80,
      after: 45,
      target: 100,
      afterPercentage: 45,
      changed: true,
      method: 'Sum',
    });
  });

  it.each([
    ['Sum', 44, 49],
    ['Average', 4 / 3, 2.25],
    ['Max', 6, 6],
    ['Min', -2, -2],
    ['Last', 6, 5],
  ] as const)('uses real history for %s with server parity', (method, current, after) => {
    const input = { ...measurement, currentValue: current, aggregationMethod: method };
    const history = [-2, 0, 6];
    const preview = previewGoalRecord(input, 40, history, 5);
    expect(preview.after).toBe(after);
    expect(preview.changed).toBe(after !== current);
    const server = ServerProgress.fromDTO({
      ...input,
      trackingBaseValue: 40,
    }).recalculateFromHistory([...history, 5]);
    expect(server.currentValue).toBe(preview.after);
    expect(server.getProgressPercentage()).toBe(preview.afterPercentage);
  });

  it.each(['Sum', 'Average', 'Max', 'Min', 'Last'] as const)(
    'handles empty history, zero and negative candidate for %s',
    (method) => {
      const input = {
        ...measurement,
        currentValue: -4,
        initialValue: -10,
        targetValue: 10,
        aggregationMethod: method,
      };
      expect(calculateKeyResultProgress({ ...input, trackingBaseValue: -4 }, []).currentValue).toBe(
        -4,
      );
      expect(previewGoalRecord(input, -4, [], 0).after).toBe(method === 'Sum' ? -4 : 0);
      expect(previewGoalRecord(input, -4, [], -2).after).toBe(method === 'Sum' ? -6 : -2);
    },
  );

  it('supports decreasing targets and unchanged Average samples', () => {
    const input = {
      ...measurement,
      initialValue: 100,
      currentValue: 80,
      targetValue: 50,
      aggregationMethod: 'Average' as const,
    };
    expect(previewGoalRecord(input, 100, [70, 90], 80)).toMatchObject({
      after: 80,
      afterPercentage: 40,
      changed: false,
    });
    expect(previewGoalRecord(input, 100, [70, 90], 20)).toMatchObject({
      after: 60,
      afterPercentage: 80,
      changed: true,
    });
  });

  it.each([NaN, Infinity, -Infinity])('rejects invalid candidate %s', (value) => {
    expect(() => previewGoalRecord(measurement, 40, [], value)).toThrow('finite');
  });
});

describe('aggregation snapshots', () => {
  it('retains exact summary including signed, zero and ordered Last values', () => {
    expect(createGoalRecordAggregationSnapshot([])).toEqual({
      count: 0,
      sum: 0,
      max: null,
      min: null,
      last: null,
    });
    expect(createGoalRecordAggregationSnapshot([-2, 6, 0])).toEqual({
      count: 3,
      sum: 4,
      max: 6,
      min: -2,
      last: 0,
    });
  });

  it.each(['Sum', 'Average', 'Max', 'Min', 'Last'] as const)(
    'matches record-array arithmetic for %s in both directions',
    (aggregationMethod) => {
      for (const history of [[], [-2, 0, 6]]) {
        for (const candidate of [-5, 0, 5]) {
          for (const targetValue of [-10, 10]) {
            const input = {
              ...measurement,
              initialValue: 0,
              targetValue,
              aggregationMethod,
              trackingBaseValue: -4,
            };
            const snapshot = createGoalRecordAggregationSnapshot(history);
            expect(calculateKeyResultProgress(input, snapshot)).toEqual(
              calculateKeyResultProgress(input, history),
            );
            const result = preview(
              { ...input, keyResultId: 'kr-1' as never, aggregationSnapshot: snapshot },
              candidate,
            );
            const authoritative = calculateKeyResultProgress(input, [...history, candidate]);
            expect(result.after).toBe(authoritative.currentValue);
            expect(result.afterPercentage).toBe(authoritative.percentage);
          }
        }
      }
    },
  );
});
