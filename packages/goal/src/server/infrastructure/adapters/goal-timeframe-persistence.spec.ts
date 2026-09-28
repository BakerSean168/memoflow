import { describe, expect, it } from 'vitest';
import { requireYmd } from '@memoflow/contracts/primitives';
import {
  decodeGoalStartTimeframe,
  decodeGoalTimeframe,
  encodeGoalStartTimeframe,
  encodeGoalTimeframe,
} from './goal-timeframe-persistence';

describe('Goal timeframe persistence', () => {
  it('round-trips a coarse start through its canonical start boundary', () => {
    const start = { kind: 'quarter', year: 2030, quarter: 4 } as const;

    expect(encodeGoalStartTimeframe(start)).toEqual({
      startKind: 'quarter',
      startDate: requireYmd('2030-10-01'),
    });
    expect(decodeGoalStartTimeframe('quarter', '2030-10-01')).toEqual(start);
  });

  it('round-trips a coarse target through its canonical end boundary', () => {
    const target = { kind: 'quarter', year: 2031, quarter: 2 } as const;

    expect(encodeGoalTimeframe(target)).toEqual({
      targetKind: 'quarter',
      targetEndDate: requireYmd('2031-06-30'),
    });
    expect(decodeGoalTimeframe('quarter', '2031-06-30')).toEqual(target);
  });

  it('rejects partial or non-canonical start persistence pairs', () => {
    expect(() => decodeGoalStartTimeframe('quarter', null)).toThrow(
      /both start_kind and start_date/,
    );
    expect(() => decodeGoalStartTimeframe(null, '2030-10-01')).toThrow(
      /both start_kind and start_date/,
    );
    expect(() => decodeGoalStartTimeframe('quarter', '2030-11-01')).toThrow(
      /Non-canonical GoalTimeframe start persistence pair/,
    );
  });
});
