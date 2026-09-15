import { describe, expect, it } from 'vitest';
import { requireYmd } from '../../../primitives';
import {
  GoalTimeframeSchema,
  compareGoalTimeframesByEnd,
  goalTimeframeEndBoundary,
  goalTimeframeFromEndBoundary,
  goalTimeframeLabel,
  goalTimeframeStartBoundary,
  isPastGoalTarget,
  type GoalTimeframe,
} from './goal-timeframe';

const boundaryCases: Array<[GoalTimeframe, string, string]> = [
  [{ kind: 'day', date: requireYmd('2026-10-31') }, '2026-10-31', '2026-10-31'],
  [{ kind: 'month', year: 2028, month: 2 }, '2028-02-01', '2028-02-29'],
  [{ kind: 'quarter', year: 2026, quarter: 4 }, '2026-10-01', '2026-12-31'],
  [{ kind: 'halfYear', year: 2027, half: 1 }, '2027-01-01', '2027-06-30'],
  [{ kind: 'year', year: 2027 }, '2027-01-01', '2027-12-31'],
];

describe('GoalTimeframe', () => {
  it.each([
    { kind: 'day', date: '2028-02-29' },
    { kind: 'month', year: 2026, month: 12 },
    { kind: 'quarter', year: 2026, quarter: 4 },
    { kind: 'halfYear', year: 2027, half: 1 },
    { kind: 'year', year: 2028 },
  ])('accepts canonical timeframe %#', (value) => {
    expect(GoalTimeframeSchema.parse(value)).toEqual(value);
  });

  it.each([
    { kind: 'day', date: '2026-02-29' },
    { kind: 'month', year: 2026, month: 13 },
    { kind: 'quarter', year: 2026, quarter: 5 },
    { kind: 'halfYear', year: 2026, half: 3 },
    { kind: 'year', year: 0 },
    { kind: 'year', year: 2026, month: 1 },
  ])('rejects invalid or ambiguous timeframe %#', (value) => {
    expect(GoalTimeframeSchema.safeParse(value).success).toBe(false);
  });

  it.each(boundaryCases)('computes timezone-free boundaries for %#', (target, start, end) => {
    expect(goalTimeframeStartBoundary(target)).toBe(start);
    expect(goalTimeframeEndBoundary(target)).toBe(end);
  });

  it.each(boundaryCases)(
    'round-trips normalized persistence pair for %#',
    (target, _start, end) => {
      expect(goalTimeframeFromEndBoundary(target.kind, requireYmd(end))).toEqual(target);
    },
  );

  it('rejects non-canonical normalized persistence pairs', () => {
    expect(() => goalTimeframeFromEndBoundary('quarter', requireYmd('2026-11-30'))).toThrow();
    expect(() => goalTimeframeFromEndBoundary('year', requireYmd('2026-11-30'))).toThrow();
  });

  it('uses the timeframe end boundary for past-target semantics', () => {
    const q4: GoalTimeframe = { kind: 'quarter', year: 2026, quarter: 4 };
    expect(isPastGoalTarget(q4, requireYmd('2026-10-01'))).toBe(false);
    expect(isPastGoalTarget(q4, requireYmd('2026-12-31'))).toBe(false);
    expect(isPastGoalTarget(q4, requireYmd('2027-01-01'))).toBe(true);
  });

  it('sorts by target end and places no-target last', () => {
    const year: GoalTimeframe = { kind: 'year', year: 2026 };
    const q3: GoalTimeframe = { kind: 'quarter', year: 2026, quarter: 3 };
    expect(compareGoalTimeframesByEnd(q3, year)).toBeLessThan(0);
    expect(compareGoalTimeframesByEnd(null, year)).toBeGreaterThan(0);
  });

  it('preserves displayed precision', () => {
    expect(goalTimeframeLabel({ kind: 'month', year: 2026, month: 10 })).toBe('2026-10');
    expect(goalTimeframeLabel({ kind: 'quarter', year: 2026, quarter: 4 })).toBe('2026 Q4');
    expect(goalTimeframeLabel({ kind: 'halfYear', year: 2027, half: 1 }, 'zh-CN')).toBe('2027 H1');
    expect(goalTimeframeLabel({ kind: 'year', year: 2027 }, 'zh-CN')).toBe('2027 年');
  });
});
