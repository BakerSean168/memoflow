import { GoalPortablePayloadV3Schema } from './portable-v3';
import { GoalStatus } from './value-objects/goal-status';
import { KeyResultCalculationMethod } from './value-objects/key-result-calculation-method';

function goal(
  ref: `goals:${number}`,
  keyResultRef: `goals:${number}`,
  labelRef: `labels:${number}`,
) {
  return {
    ref,
    name: ref,
    summary: null,
    status: GoalStatus.Planned,
    startDate: null,
    target: null,
    reminderConfig: null,
    archived: false,
    labelRefs: [labelRef],
    keyResults: [
      {
        ref: keyResultRef,
        title: 'Result',
        description: null,
        calculationMethod: KeyResultCalculationMethod.Sum,
        initialValue: 0,
        currentValue: 0,
        trackingBaseValue: 0,
        targetValue: 1,
        target: null,
        unit: null,
        weight: 1,
      },
    ],
    records: [],
    reviews: [],
  };
}

describe('Goal portable V3 contracts', () => {
  it('allows one label reference to be shared by multiple goals', () => {
    const result = GoalPortablePayloadV3Schema.safeParse({
      goals: [goal('goals:1', 'goals:2', 'labels:1'), goal('goals:3', 'goals:4', 'labels:1')],
    });

    expect(result.success).toBe(true);
  });

  it('requires Goal records and reviews to use owned Key Result references', () => {
    const value = goal('goals:1', 'goals:2', 'labels:1');
    value.records.push({
      ref: 'goals:3',
      keyResultRef: 'goals:99',
      value: 1,
      note: null,
      recordedAt: 1,
    });
    expect(GoalPortablePayloadV3Schema.safeParse({ goals: [value] }).success).toBe(false);
  });

  it('rejects duplicate references across Goal children and invalid review windows', () => {
    const value = goal('goals:1', 'goals:2', 'labels:1');
    value.records.push({
      ref: 'goals:2',
      keyResultRef: 'goals:2',
      value: 1,
      note: null,
      recordedAt: 1,
    });
    value.reviews.push({
      ref: 'goals:3',
      reflection: 'Review',
      challenges: null,
      adjustments: null,
      reviewedAt: 2,
      systemContext: {
        windowStartAt: 3,
        windowEndAt: 2,
        overallProgress: { startPercentage: 0, endPercentage: 0, deltaPercentage: 0 },
        keyResults: [],
        summary: { recordCount: 0, manualRecordCount: 0, taskContributionCount: 0 },
      },
    });
    expect(GoalPortablePayloadV3Schema.safeParse({ goals: [value] }).success).toBe(false);
  });
});
