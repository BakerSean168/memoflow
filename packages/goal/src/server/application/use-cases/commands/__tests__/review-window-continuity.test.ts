import { describe, expect, it, vi } from 'vitest';
import { createMockRepo } from '@memoflow/test-utils/mocks';
import type { GoalReviewWindowOptions } from '@memoflow/contracts/goal';
import type { IdentityId } from '@memoflow/contracts/primitives';
import { createTimeContext } from '@memoflow/time';
import {
  Goal,
  GoalPolicy,
  type IGoalRepository,
  type IGoalRecordRepository,
} from '../../../../domain';
import { GoalReviewContextBuilder } from '../../../services/goal-review-context-builder';
import { AddGoalReviewUseCase } from '../add-goal-review.use-case';
import { GetGoalReviewContextUseCase } from '../../queries/get-goal-review-context.use-case';

const NOW = Date.parse('2026-03-09T03:30:00Z');
function fixture() {
  const goal = Goal.create({
    identityId: 'identity-1' as IdentityId,
    name: 'Review windows',
    start: null,
    target: null,
    reminderConfig: null,
  });
  const repository = createMockRepo<IGoalRepository>({
    findByIdForIdentity: vi.fn().mockResolvedValue(goal),
    saveRootWithExpectedVersion: vi.fn().mockResolvedValue(undefined),
  });
  const records = createMockRepo<IGoalRecordRepository>({
    findByKeyResultIds: vi.fn().mockResolvedValue(new Map()),
  });
  const builder = new GoalReviewContextBuilder(records);
  const timePort = {
    getUserTimeContext: vi
      .fn()
      .mockResolvedValue(createTimeContext({ timeZone: 'America/New_York', weekStartsOn: 0 })),
  };
  let now = NOW;
  return {
    goal,
    repository,
    records,
    setNow: (value: number) => {
      now = value;
    },
    command: new AddGoalReviewUseCase(repository, new GoalPolicy(), builder, timePort, () => now),
    query: new GetGoalReviewContextUseCase(repository, builder, timePort, () => now),
  };
}

describe('Review windows across query and command on authoritative Goal children', () => {
  it('first/second/third default snapshots have exact shared boundaries', async () => {
    const f = fixture();
    const windows = [];
    for (let index = 0; index < 3; index++) {
      f.setNow(NOW + index * 1234567);
      const preview = await f.query.execute(String(f.goal.id), 'identity-1');
      expect(preview.ok).toBe(true);
      const saved = await f.command.execute(String(f.goal.id), 'identity-1', {
        expectedVersion: f.goal.version,
        reflection: 'Progress',
      });
      expect(saved.ok).toBe(true);
      const snapshot = f.goal.goalReviews[index].systemContext;
      if (preview.ok) expect(snapshot).toEqual(preview.data);
      windows.push(snapshot);
    }
    expect(windows[0].windowStartAt).toBe(Date.parse('2026-03-02T04:30:00Z'));
    expect(windows[0].windowEndAt).toBe(windows[1].windowStartAt);
    expect(windows[1].windowEndAt).toBe(windows[2].windowStartAt);
    expect(f.repository.findByIdForIdentity).toHaveBeenCalledWith('identity-1', String(f.goal.id), {
      includeChildren: true,
    });
    expect(f.repository.saveRootWithExpectedVersion).toHaveBeenCalledTimes(3);
  });

  it.each<GoalReviewWindowOptions>([
    {},
    { window: { mode: 'since-last-review' } },
    { windowDays: 7 },
    { windowDays: 30 },
    { window: { mode: '7d' } },
    { window: { mode: '30d' } },
    { window: { mode: 'custom', windowStartAt: 101, windowEndAt: 987 } },
  ])('query/command agree for %j despite reviewedAt mismatch', async (input) => {
    const f = fixture();
    f.goal.restoreReview({
      id: 'previous-review' as never,
      goalId: f.goal.id,
      reflection: 'Previous',
      challenges: null,
      adjustments: null,
      reviewedAt: NOW + 9999999,
      createdAt: NOW,
      updatedAt: NOW,
      systemContext: {
        windowStartAt: NOW - 2000,
        windowEndAt: NOW - 1000,
        overallProgress: { startPercentage: 0, endPercentage: 0, deltaPercentage: 0 },
        keyResults: [],
        summary: { recordCount: 0, manualRecordCount: 0, taskContributionCount: 0 },
      },
    });
    const preview = await f.query.execute(String(f.goal.id), 'identity-1', input);
    const saved = await f.command.execute(String(f.goal.id), 'identity-1', {
      expectedVersion: f.goal.version,
      reflection: 'Progress',
      ...input,
    });
    expect(saved.ok).toBe(true);
    expect(preview.ok).toBe(true);
    if (preview.ok) {
      expect(f.goal.goalReviews[1].systemContext).toEqual(preview.data);
      if (!input.windowDays && (!input.window || input.window.mode === 'since-last-review')) {
        expect(preview.data.windowStartAt).toBe(NOW - 1000);
      }
    }
  });

  it('invalid custom application input fails before fact reads, mutation or persistence', async () => {
    const f = fixture();
    const input = { window: { mode: 'custom' as const, windowStartAt: 2, windowEndAt: 1 } };
    const preview = await f.query.execute(String(f.goal.id), 'identity-1', input);
    const saved = await f.command.execute(String(f.goal.id), 'identity-1', {
      expectedVersion: 1,
      reflection: 'Progress',
      ...input,
    });
    for (const result of [preview, saved]) {
      expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    }
    expect(f.goal.version).toBe(1);
    expect(f.goal.goalReviews).toHaveLength(0);
    expect(f.records.findByKeyResultIds).not.toHaveBeenCalled();
    expect(f.repository.saveRootWithExpectedVersion).not.toHaveBeenCalled();
  });
});
