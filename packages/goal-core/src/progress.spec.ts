import { describe, expect, it } from 'vitest';
import {
  calculateKeyResultProgress,
  createGoalRecordAggregationSnapshot,
  previewGoalRecord,
} from './index';

describe('Goal core', () => {
  it('shares aggregation between server and client', () => {
    const measurement = {
      initialValue: 0,
      currentValue: 40,
      targetValue: 100,
      trackingBaseValue: 40,
      aggregationMethod: 'Sum' as const,
      unit: null,
    };
    const aggregationSnapshot = createGoalRecordAggregationSnapshot([4]);
    expect(calculateKeyResultProgress(measurement, aggregationSnapshot).currentValue).toBe(44);
    expect(
      previewGoalRecord(
        {
          ...measurement,
          keyResultId: 'IKeyResultId_550e8400-e29b-41d4-a716-446655440001' as never,
          aggregationSnapshot,
        },
        3,
      ).after,
    ).toBe(47);
  });
});
