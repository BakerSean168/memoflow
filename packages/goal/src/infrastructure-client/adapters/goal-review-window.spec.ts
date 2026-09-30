import { describe, expect, it, vi } from 'vitest';
import type { GoalReviewWindowInput } from '@memoflow/contracts/goal';
import { GoalReviewWindowQuerySchema } from '@memoflow/contracts/goal';
import { GoalChannels } from '@memoflow/contracts/electron';
import { ok } from '@memoflow/contracts/result';
import { GoalHttpAdapter } from './http/goal-http.adapter';
import { GoalIpcAdapter } from './ipc/goal-ipc.adapter';
import { createGoalClientService } from '../../application-client';

const inputs: (GoalReviewWindowInput | undefined)[] = [
  undefined,
  7,
  30,
  { windowDays: 7 },
  { windowDays: 30 },
  { window: { mode: 'since-last-review' } },
  { window: { mode: '7d' } },
  { window: { mode: '30d' } },
  { window: { mode: 'custom', windowStartAt: 101, windowEndAt: 987 } },
];
const context = {
  windowStartAt: 101,
  windowEndAt: 987,
  overallProgress: { startPercentage: 0, endPercentage: 0, deltaPercentage: 0 },
  keyResults: [],
  summary: { recordCount: 0, manualRecordCount: 0, taskContributionCount: 0 },
};
describe('Goal review window HTTP/IPC client parity', () => {
  it.each(inputs)(
    'context round-trips old and new forms through client service: %j',
    async (input) => {
      const get = vi.fn().mockResolvedValue(ok(context));
      const invoke = vi.fn().mockResolvedValue(ok(context));
      const http = new GoalHttpAdapter({ get } as never);
      const ipc = new GoalIpcAdapter({ invoke } as never);
      expect(await createGoalClientService(http).getGoalReviewContext('goal-1', input)).toEqual(
        ok(context),
      );
      expect(await createGoalClientService(ipc).getGoalReviewContext('goal-1', input)).toEqual(
        ok(context),
      );
      expect(get.mock.calls[0][0]).toBe('/goals/goal-1/reviews/context');
      expect(invoke).toHaveBeenCalledWith(GoalChannels.REVIEW_CONTEXT, 'goal-1', input);
      const query = GoalReviewWindowQuerySchema.parse(get.mock.calls[0][1].params);
      const expected = typeof input === 'number' ? { windowDays: input } : (input ?? {});
      expect(query).toEqual(expected);
      if (typeof input === 'number')
        expect(get.mock.calls[0][1].params).toEqual({ windowDays: input });
    },
  );

  it.each(inputs)(
    'creation passes identical additive body through both adapters: %j',
    async (input) => {
      const post = vi.fn().mockResolvedValue(ok({}));
      const invoke = vi.fn().mockResolvedValue(ok({}));
      const body = {
        expectedVersion: 1,
        reflection: 'Progress',
        ...(typeof input === 'number' ? { windowDays: input } : (input ?? {})),
      };
      await new GoalHttpAdapter({ post } as never).createGoalReview('goal-1', body);
      await new GoalIpcAdapter({ invoke } as never).createGoalReview('goal-1', body);
      expect(post).toHaveBeenCalledWith('/goals/goal-1/reviews', body);
      expect(invoke).toHaveBeenCalledWith(GoalChannels.REVIEW_CREATE, 'goal-1', body);
    },
  );
});
