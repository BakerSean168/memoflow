import { describe, expect, it, vi } from 'vitest';
import { GoalReviewContextBuilder } from './goal-review-context-builder';

const START = Date.UTC(2026, 7, 19, 0, 0, 0);
const END = Date.UTC(2026, 7, 26, 0, 0, 0);

function record(value: number, recordedAt: number, sourceType: string | null = null) {
  return { value, recordedAt, sourceType } as any;
}

describe('GoalReviewContextBuilder', () => {
  it('builds weighted normalized facts across mixed-unit KRs', async () => {
    const krDistance = {
      id: 'kr-distance',
      title: 'Running',
      weight: 1,
      progress: {
        trackingBaseValue: 0,
        currentValue: 40,
        targetValue: 100,
        initialValue: 0,
        aggregationMethod: 'Sum',
        unit: 'km',
      },
    };
    const krWeight = {
      id: 'kr-weight',
      title: 'Weight',
      weight: 3,
      progress: {
        trackingBaseValue: 80,
        currentValue: 75,
        targetValue: 70,
        initialValue: 80,
        aggregationMethod: 'Last',
        unit: 'kg',
      },
    };
    const repo = {
      findByKeyResultIds: vi.fn().mockResolvedValue(
        new Map([
          [
            'kr-distance',
            [
              record(20, START - 1),
              record(10, START + 1_000),
              record(10, START + 2_000, 'TASK_INSTANCE'),
            ],
          ],
          ['kr-weight', [record(78, START - 1), record(75, START + 3_000)]],
        ]),
      ),
    } as any;
    const goal = {
      identityId: 'identity-1',
      keyResults: [krDistance, krWeight],
    } as any;

    const context = await new GoalReviewContextBuilder(repo).build(goal, {
      windowStartAt: START,
      windowEndAt: END,
    });

    expect(context.overallProgress).toEqual({
      startPercentage: 20,
      endPercentage: 47.5,
      deltaPercentage: 27.5,
    });
    expect(context.keyResults).toEqual([
      expect.objectContaining({
        keyResultId: 'kr-distance',
        unit: 'km',
        startPercentage: 20,
        endPercentage: 40,
      }),
      expect.objectContaining({
        keyResultId: 'kr-weight',
        unit: 'kg',
        startPercentage: 20,
        endPercentage: 50,
      }),
    ]);
    expect(context.summary).toEqual({
      recordCount: 3,
      manualRecordCount: 2,
      taskContributionCount: 1,
    });
    for (const keyResult of context.keyResults) {
      for (const point of keyResult.trend) {
        expect(point).toEqual({
          at: expect.any(Number),
          progressPercentage: expect.any(Number),
        });
        expect(point).not.toHaveProperty('value');
      }
    }
  });

  it('uses the same weighted semantics instead of a simple average', async () => {
    const repo = {
      findByKeyResultIds: vi.fn().mockResolvedValue(
        new Map([
          ['a', []],
          ['b', []],
        ]),
      ),
    } as any;
    const goal = {
      identityId: 'identity-1',
      keyResults: [
        {
          id: 'a',
          title: 'A',
          weight: 1,
          progress: {
            trackingBaseValue: 0,
            currentValue: 0,
            targetValue: 100,
            initialValue: 0,
            aggregationMethod: 'Last',
            unit: null,
          },
        },
        {
          id: 'b',
          title: 'B',
          weight: 3,
          progress: {
            trackingBaseValue: 100,
            currentValue: 100,
            targetValue: 100,
            initialValue: 0,
            aggregationMethod: 'Last',
            unit: null,
          },
        },
      ],
    } as any;

    const context = await new GoalReviewContextBuilder(repo).build(goal, {
      windowStartAt: START,
      windowEndAt: END,
    });

    expect(context.overallProgress.endPercentage).toBe(75);
  });
});
