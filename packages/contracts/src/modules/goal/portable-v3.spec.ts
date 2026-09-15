import { describe, expect, it } from 'vitest';
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
  };
}

describe('Goal portable V3 contracts', () => {
  it('allows one label reference to be shared by multiple goals', () => {
    const result = GoalPortablePayloadV3Schema.safeParse({
      goals: [
        goal('goals:1', 'goals:2', 'labels:1'),
        goal('goals:3', 'goals:4', 'labels:1'),
      ],
    });

    expect(result.success).toBe(true);
  });
});
