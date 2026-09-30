import { describe, expect, it } from 'vitest';
import {
  GoalReviewSystemContextSchema,
  GoalReviewSignalSchema,
} from '../value-objects/goal-review-context';
import { GoalReviewClientDTOSchema } from './response-schemas';

const old = {
  windowStartAt: 1,
  windowEndAt: 2,
  overallProgress: { startPercentage: 20, endPercentage: 40, deltaPercentage: 20 },
  keyResults: [],
  summary: { recordCount: 0, manualRecordCount: 0, taskContributionCount: 0 },
};
describe('Review signal contract', () => {
  it('defaults old snapshots to empty signals without inventing history', () => {
    expect(GoalReviewSystemContextSchema.parse(old)).toEqual({ ...old, signals: [] });
  });
  it('preserves the complete signal union through JSON and client schema', () => {
    const context = {
      ...old,
      signals: [
        { kind: 'overall-movement', direction: 'increased', evidence: old.overallProgress },
        {
          kind: 'key-result-movement',
          evidence: [
            {
              keyResultId: 'IKeyResultId_11111111-1111-4111-8111-111111111111',
              title: 'Distance',
              direction: 'improved',
              ...old.overallProgress,
            },
          ],
        },
        { kind: 'measurement-activity', evidence: old.summary },
      ],
    };
    const dto = {
      id: 'IGoalReviewId_11111111-1111-4111-8111-111111111111',
      goalId: 'IGoalId_11111111-1111-4111-8111-111111111111',
      reflection: 'Done',
      challenges: null,
      adjustments: null,
      reviewedAt: 2,
      createdAt: 2,
      updatedAt: 2,
      systemContext: context,
    };
    expect(GoalReviewClientDTOSchema.parse(JSON.parse(JSON.stringify(dto)))).toEqual(dto);
  });
  it('rejects causal/recommendation fields and unknown vocabulary', () => {
    for (const extra of [{ cause: 'tasks' }, { recommendation: 'act' }, { confidence: 1 }]) {
      expect(
        GoalReviewSignalSchema.safeParse({
          kind: 'overall-movement',
          direction: 'increased',
          evidence: old.overallProgress,
          ...extra,
        }).success,
      ).toBe(false);
    }
    expect(GoalReviewSignalSchema.safeParse({ kind: 'healthy', evidence: {} }).success).toBe(false);
  });
});
