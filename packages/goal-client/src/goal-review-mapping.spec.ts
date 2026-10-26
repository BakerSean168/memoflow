import { describe, expect, it } from 'vitest';
import { GoalReviewClientDTOSchema } from '@memoflow/goal-contracts';
import { createGoalClientService } from './application-client';
import { ok } from '@memoflow/transport-contracts';
import type { IGoalApiClient } from './application-client/ports/goal-api-client.port';

describe('Goal client review DTO parity', () => {
  it('preserves persisted review signals through the client DTO port', async () => {
    const context = {
      windowStartAt: 1,
      windowEndAt: 2,
      overallProgress: { startPercentage: 20, endPercentage: 40, deltaPercentage: 20 },
      keyResults: [],
      summary: { recordCount: 3, manualRecordCount: 2, taskContributionCount: 1 },
      signals: [
        {
          kind: 'measurement-activity' as const,
          evidence: { recordCount: 3, manualRecordCount: 2, taskContributionCount: 1 },
        },
      ],
    };
    const dto = GoalReviewClientDTOSchema.parse({
      id: 'IGoalReviewId_550e8400-e29b-41d4-a716-446655440000',
      goalId: 'IGoalId_550e8400-e29b-41d4-a716-446655440001',
      reflection: 'Done',
      challenges: null,
      adjustments: null,
      systemContext: context,
      reviewedAt: 2,
      createdAt: 2,
      updatedAt: 2,
    });
    const service = createGoalClientService({
      getGoalReviewsByGoal: async () => ok({ data: [dto] }),
    } as IGoalApiClient);
    const result = await service.getGoalReviews(dto.goalId);
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(GoalReviewClientDTOSchema.parse(result.data.reviews[0]).systemContext).toEqual(context);
  });
});
