import { describe, it, expect } from 'vitest';
import { aPrefixedUuid } from '@memoflow/test-utils/fixtures';
import { rawDataToGoalState } from './goal-state-mapper';

describe('rawDataToGoalState', () => {
  const GOAL_ID_1 = aPrefixedUuid('IGoalId', 'goal-state-goal-1');
  const GOAL_ID_2 = aPrefixedUuid('IGoalId', 'goal-state-goal-2');
  const IDENTITY_ID_1 = aPrefixedUuid('IdentityId', 'goal-state-owner-1');
  const KEY_RESULT_ID_1 = aPrefixedUuid('IKeyResultId', 'goal-state-kr-1');
  const REVIEW_ID_1 = aPrefixedUuid('IGoalReviewId', 'goal-state-review-1');
  const SNAPSHOT_ID_1 = aPrefixedUuid('IKeyResultWeightSnapshotId', 'goal-state-snapshot-1');

  it('parses structured fields and maps nested entities', () => {
    const raw = {
      id: GOAL_ID_1,
      identityId: IDENTITY_ID_1,
      name: 'Goal',
      summary: null,
      status: 'InProgress',
      startDate: '2026-01-15',
      targetKind: 'quarter',
      targetEndDate: '2026-12-31',
      completedAt: null,
      archivedAt: null,
      sortOrder: 1,
      reminderConfig: {
        enabled: true,
        triggers: [{ type: 'RemainingDays', value: 3, enabled: true }],
      },
      keyResults: [
        {
          id: KEY_RESULT_ID_1,
          goalId: GOAL_ID_1,
          title: 'KR',
          description: null,
          progress: {
            initialValue: 0,
            trackingBaseValue: 0,
            currentValue: 0,
            targetValue: 100,
            valueType: 'Incremental',
            aggregationMethod: 'Last',
            unit: null,
          },
          targetKind: 'month',
          targetEndDate: '2026-09-30',
          weight: 2,
          sortOrder: 3,
          version: 2,
          createdAt: new Date(1_000),
          updatedAt: new Date(1_500),
          deletedAt: null,
        },
      ],
      goalReviews: [
        {
          id: REVIEW_ID_1,
          goalId: GOAL_ID_1,
          reflection: 'ok',
          challenges: null,
          adjustments: null,
          systemContext: {
            windowStartAt: 1_000,
            windowEndAt: 1_200,
            overallProgress: { startPercentage: 0, endPercentage: 50, deltaPercentage: 50 },
            keyResults: [],
            summary: { recordCount: 0, manualRecordCount: 0, taskContributionCount: 0 },
          },
          reviewedAt: new Date(1_200),
          version: 1,
          createdAt: new Date(1_200),
          updatedAt: new Date(1_300),
          deletedAt: null,
        },
      ],
      weightSnapshots: [
        {
          id: SNAPSHOT_ID_1 as any,
          goalId: GOAL_ID_1 as any,
          keyResultId: KEY_RESULT_ID_1 as any,
          identityId: IDENTITY_ID_1 as any,
          oldWeight: 1,
          newWeight: 2,
          weightDelta: 1,
          snapshotTime: 1_111,
          trigger: 'Manual',
          reason: null,
          operatorId: IDENTITY_ID_1 as any,
          createdAt: 1_112,
        },
      ],
      totalKeyResults: 1,
      completedKeyResults: 0,
      createdAt: new Date(900),
      updatedAt: new Date(1_600),
      deletedAt: null,
      version: 5,
    };

    const state = rawDataToGoalState(raw);

    expect(state.startDate).toBe('2026-01-15');
    expect(state.target).toEqual({ kind: 'quarter', year: 2026, quarter: 4 });
    expect('tags' in state).toBe(false);
    expect('folderId' in state).toBe(false);
    expect('parentGoalId' in state).toBe(false);
    expect(state.reminderConfig?.toDTO().enabled).toBe(true);
    expect(state.keyResults).toHaveLength(1);
    expect(state.keyResults[0].progress.aggregationMethod).toBe('Last');
    expect(state.keyResults[0].progress.currentValue).toBe(0);
    expect(state.keyResults[0].target).toEqual({ kind: 'month', year: 2026, month: 9 });
    expect(state.goalReviews).toHaveLength(1);
    expect(state.goalReviews[0].reflection).toBe('ok');
    expect(state.goalReviews[0].systemContext.overallProgress.endPercentage).toBe(50);
    expect(state.weightSnapshots).toHaveLength(1);
    expect(state.weightSnapshots[0].toDTO().id).toBe(SNAPSHOT_ID_1);
  });

  it('handles null collections', () => {
    const raw = {
      id: GOAL_ID_2,
      identityId: IDENTITY_ID_1,
      name: 'Goal2',
      summary: 'desc',
      status: 'Completed',
      startDate: null,
      targetKind: null,
      targetEndDate: null,
      completedAt: new Date(3_000),
      archivedAt: null,
      sortOrder: 2,
      reminderConfig: {
        enabled: false,
        triggers: [],
      },
      keyResults: null,
      goalReviews: null,
      weightSnapshots: null,
      totalKeyResults: 0,
      completedKeyResults: 0,
      createdAt: 2_000,
      updatedAt: 3_000,
      deletedAt: 3_100,
      version: 1,
    };

    const state = rawDataToGoalState(raw);

    expect(state.target).toBeNull();
    expect('category' in state).toBe(false);
    expect('importance' in state).toBe(false);
    expect(state.keyResults).toEqual([]);
    expect(state.goalReviews).toEqual([]);
    expect(state.weightSnapshots).toEqual([]);
    expect(state.deletedAt).toBe(3_100);
  });
  it('fails closed when the normalized target pair is partial', () => {
    const raw = {
      id: GOAL_ID_2,
      identityId: IDENTITY_ID_1,
      name: 'Broken target',
      summary: null,
      status: 'Planned',
      startDate: null,
      targetKind: 'quarter',
      targetEndDate: null,
      completedAt: null,
      archivedAt: null,
      sortOrder: 0,
      reminderConfig: null,
      keyResults: null,
      goalReviews: null,
      weightSnapshots: null,
      createdAt: 1_000,
      updatedAt: 1_000,
      deletedAt: null,
      version: 1,
    };

    expect(() => rawDataToGoalState(raw)).toThrow(/both target_kind and target_end_date/);
  });

  it('fails closed when a KR target persistence pair is partial', () => {
    const raw = {
      id: GOAL_ID_2,
      identityId: IDENTITY_ID_1,
      name: 'Broken KR target',
      summary: null,
      status: 'Planned',
      startDate: null,
      targetKind: null,
      targetEndDate: null,
      completedAt: null,
      archivedAt: null,
      sortOrder: 0,
      reminderConfig: null,
      keyResults: [
        {
          id: KEY_RESULT_ID_1,
          goalId: GOAL_ID_2,
          title: 'KR',
          description: null,
          progress: {
            initialValue: 0,
            trackingBaseValue: 0,
            currentValue: 0,
            targetValue: 100,
            aggregationMethod: 'Last',
            unit: null,
          },
          targetKind: 'quarter',
          targetEndDate: null,
          weight: 1,
          sortOrder: 0,
          createdAt: 1_000,
          updatedAt: 1_000,
        },
      ],
      goalReviews: null,
      weightSnapshots: null,
      createdAt: 1_000,
      updatedAt: 1_000,
      deletedAt: null,
      version: 1,
    };

    expect(() => rawDataToGoalState(raw)).toThrow(/both target_kind and target_end_date/);
  });

  it('fails closed when a KR target end is non-canonical for its precision', () => {
    const raw = {
      id: GOAL_ID_2,
      identityId: IDENTITY_ID_1,
      name: 'Broken KR quarter',
      summary: null,
      status: 'Planned',
      startDate: null,
      targetKind: null,
      targetEndDate: null,
      completedAt: null,
      archivedAt: null,
      sortOrder: 0,
      reminderConfig: null,
      keyResults: [
        {
          id: KEY_RESULT_ID_1,
          goalId: GOAL_ID_2,
          title: 'KR',
          description: null,
          progress: {
            initialValue: 0,
            trackingBaseValue: 0,
            currentValue: 0,
            targetValue: 100,
            aggregationMethod: 'Last',
            unit: null,
          },
          targetKind: 'quarter',
          targetEndDate: '2026-11-30',
          weight: 1,
          sortOrder: 0,
          createdAt: 1_000,
          updatedAt: 1_000,
        },
      ],
      goalReviews: null,
      weightSnapshots: null,
      createdAt: 1_000,
      updatedAt: 1_000,
      deletedAt: null,
      version: 1,
    };

    expect(() => rawDataToGoalState(raw)).toThrow(/Non-canonical GoalTimeframe/);
  });

  it('fails closed when the normalized target end is not canonical for its precision', () => {
    const raw = {
      id: GOAL_ID_2,
      identityId: IDENTITY_ID_1,
      name: 'Broken quarter',
      summary: null,
      status: 'Planned',
      startDate: null,
      targetKind: 'quarter',
      targetEndDate: '2026-11-30',
      completedAt: null,
      archivedAt: null,
      sortOrder: 0,
      reminderConfig: null,
      keyResults: null,
      goalReviews: null,
      weightSnapshots: null,
      createdAt: 1_000,
      updatedAt: 1_000,
      deletedAt: null,
      version: 1,
    };

    expect(() => rawDataToGoalState(raw)).toThrow(/Non-canonical GoalTimeframe/);
  });
});
