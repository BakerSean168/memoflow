import { describe, expect, it } from 'vitest';
import { ok, fail } from '@memoflow/transport-contracts';
import {
  createMockGoal,
  createMockKeyResult,
  createMockGoalRecord,
  createMockGoalReview,
} from '@memoflow/goal-contracts/test-support/goal.mock';
import { createGoalClientService } from './application-client';
import type { IGoalApiClient } from './application-client/ports/goal-api-client.port';

describe('Goal client DTO port', () => {
  it('returns the transport DTOs without wrapping or dropping nested fields', async () => {
    const keyResult = createMockKeyResult();
    const review = createMockGoalReview();
    const goal = createMockGoal({ keyResults: [keyResult], reviews: [review] });
    const record = createMockGoalRecord();
    const service = createGoalClientService({
      getGoalById: async () => ok(goal),
      getKeyResultsByGoal: async () => ok({ data: [keyResult] }),
      getGoalRecordsByGoal: async () => ok({ data: [record], total: 1 }),
      getGoalReviewsByGoal: async () => ok({ data: [review] }),
    } as IGoalApiClient);
    const result = await service.getGoal(goal.id);
    const keyResults = await service.getKeyResults(goal.id);
    const records = await service.getGoalRecordsByGoal(goal.id);
    const reviews = await service.getGoalReviews(goal.id);
    expect(result).toEqual(ok(goal));
    expect(result.ok && result.data).toBe(goal);
    expect(keyResults.ok && keyResults.data.keyResults[0]).toBe(keyResult);
    expect(records.ok && records.data.records[0]).toBe(record);
    expect(reviews.ok && reviews.data.reviews[0]).toBe(review);
  });

  it('preserves the transport failure without constructing a client entity', async () => {
    const failure = fail({ code: 'NOT_FOUND', message: 'Goal missing' });
    const service = createGoalClientService({
      getGoalById: async () => failure,
    } as IGoalApiClient);
    expect(await service.getGoal('missing')).toBe(failure);
  });
});
