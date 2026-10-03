import { describe, expect, it } from 'vitest';
import { createTimeContext } from '@memoflow/time';
import type { GoalReviewId } from '@memoflow/contracts/primitives';
import { ReviewWindowResolver, selectPreviousGoalReview } from './review-window-resolver';

const timeContext = createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 0 });
const NOW = Date.parse('2026-03-09T03:30:00Z'); // Mar 8 23:30 EDT
const resolver = new ReviewWindowResolver();
function review(id: string, end: number, reviewedAt = end) {
  return {
    id: id as GoalReviewId,
    reviewedAt,
    systemContext: {
      signals: [],
      windowStartAt: end - 1000,
      windowEndAt: end,
      overallProgress: { startPercentage: 0, endPercentage: 0, deltaPercentage: 0 },
      keyResults: [],
      summary: { recordCount: 0, manualRecordCount: 0, taskContributionCount: 0 },
    },
  };
}

describe('ReviewWindowResolver', () => {
  it('first default uses seven Product Time calendar days across DST', () => {
    const result = resolver.resolve([], undefined, NOW, timeContext);
    expect(result).toEqual({
      ok: true,
      data: {
        windowStartAt: Date.parse('2026-03-02T04:30:00Z'),
        windowEndAt: NOW,
      },
    });
    if (result.ok) expect(NOW - result.data.windowStartAt).toBe((7 * 24 - 1) * 3600000);
  });

  it.each([undefined, { window: { mode: 'since-last-review' as const } }])(
    'default starts at authoritative windowEndAt regardless of reviewedAt: %j',
    (input) => {
      const previous = review('previous', NOW - 123456, NOW + 999999);
      expect(resolver.resolve([previous], input, NOW, timeContext)).toEqual({
        ok: true,
        data: {
          windowStartAt: previous.systemContext.windowEndAt,
          windowEndAt: NOW,
        },
      });
    },
  );

  it('selects latest end and lexically greatest ID on ties independently of order', () => {
    const a = review('a', NOW - 100);
    const b = review('b', NOW - 100, NOW - 999999);
    const older = review('z', NOW - 200, NOW + 100);
    for (const children of [
      [a, b, older],
      [older, b, a],
      [b, older, a],
    ]) {
      expect(selectPreviousGoalReview(children)).toBe(b);
      expect(resolver.resolve(children, undefined, NOW, timeContext)).toEqual({
        ok: true,
        data: {
          windowStartAt: NOW - 100,
          windowEndAt: NOW,
        },
      });
    }
  });

  it.each([
    [7, '2026-03-02T04:30:00Z'],
    [30, '2026-02-07T04:30:00Z'],
  ])('legacy %i days overrides previous and explicit selection', (days, expected) => {
    const previous = [review('latest', NOW - 1)];
    for (const window of [
      undefined,
      { mode: 'since-last-review' as const },
      { mode: 'custom' as const, windowStartAt: 1, windowEndAt: 2 },
    ]) {
      expect(resolver.resolve(previous, { windowDays: days, window }, NOW, timeContext)).toEqual({
        ok: true,
        data: { windowStartAt: Date.parse(expected), windowEndAt: NOW },
      });
    }
  });

  it.each([
    ['7d' as const, '2026-03-02T04:30:00Z'],
    ['30d' as const, '2026-02-07T04:30:00Z'],
  ])('preset %s uses calendar days with authoritative now', (mode, expected) => {
    expect(
      resolver.resolve([review('latest', NOW - 1)], { window: { mode } }, NOW, timeContext),
    ).toEqual({ ok: true, data: { windowStartAt: Date.parse(expected), windowEndAt: NOW } });
  });

  it('preserves custom absolute boundaries, including an end different from now', () => {
    expect(
      resolver.resolve(
        [],
        {
          window: {
            mode: 'custom',
            windowStartAt: 101,
            windowEndAt: 987,
          },
        },
        NOW,
        timeContext,
      ),
    ).toEqual({ ok: true, data: { windowStartAt: 101, windowEndAt: 987 } });
  });

  it.each([
    [1, 1],
    [2, 1],
    [NaN, 2],
    [1, Infinity],
    [0.5, 2],
    [1, 2.5],
  ])('rejects custom %s -> %s for direct application callers', (windowStartAt, windowEndAt) => {
    expect(
      resolver.resolve(
        [],
        { window: { mode: 'custom', windowStartAt, windowEndAt } },
        NOW,
        timeContext,
      ),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it.each([0, 1.5, Infinity, 366])('rejects invalid legacy days %s', (days) => {
    expect(resolver.resolve([], days, NOW, timeContext)).toMatchObject({ ok: false });
  });

  it('rejects a non-positive default interval without shifting the previous boundary', () => {
    expect(resolver.resolve([review('latest', NOW)], undefined, NOW, timeContext)).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_ERROR' },
    });
  });
});
