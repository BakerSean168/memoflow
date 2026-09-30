import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GoalReviewSignalSchema, type GoalReviewSystemContext } from '@memoflow/contracts/goal';
import { analyzeGoalReviewSignals } from './goal-review-signal-analyzer';

function facts(start = 20, end = 40): Omit<GoalReviewSystemContext, 'signals'> {
  return {
    windowStartAt: 1,
    windowEndAt: 2,
    overallProgress: { startPercentage: start, endPercentage: end, deltaPercentage: end - start },
    keyResults: [],
    summary: { recordCount: 0, manualRecordCount: 0, taskContributionCount: 0 },
  };
}

describe('Goal review observed-fact signals', () => {
  it('keeps the deterministic analyzer, builder and Review UI free of AI dependencies', () => {
    for (const path of [
      './goal-review-signal-analyzer.ts',
      './goal-review-context-builder.ts',
      '../../../../../app-vue/src/modules/goal/components/GoalReviewSnapshot.vue',
      '../../../../../app-vue/src/modules/goal/views/GoalReviewCreationView.vue',
      '../../../../../app-vue/src/modules/goal/views/GoalReviewDetailView.vue',
    ]) {
      const source = readFileSync(new URL(path, import.meta.url), 'utf8');
      expect(source).not.toMatch(/@memoflow\/ai|AI_SERVICE|useAI|generateText|generateObject|llm/i);
      expect(source).not.toMatch(/sourceId|source_id/);
    }
  });
  it.each([
    [20, 40, 'increased'],
    [40, 20, 'decreased'],
    [40, 40, 'unchanged'],
  ] as const)('overall %s → %s is %s with exact evidence', (start, end, direction) => {
    const input = facts(start, end);
    expect(analyzeGoalReviewSignals(input)[0]).toEqual({
      kind: 'overall-movement',
      direction,
      evidence: input.overallProgress,
    });
  });
  it.each([
    { recordCount: 0, manualRecordCount: 0, taskContributionCount: 0 },
    { recordCount: 2, manualRecordCount: 2, taskContributionCount: 0 },
    { recordCount: 3, manualRecordCount: 0, taskContributionCount: 3 },
    { recordCount: 5, manualRecordCount: 2, taskContributionCount: 3 },
  ])('retains zero/manual/Task/mixed activity evidence %j', (summary) => {
    expect(analyzeGoalReviewSignals({ ...facts(), summary }).at(-1)).toEqual({
      kind: 'measurement-activity',
      evidence: summary,
    });
  });
  it('uses normalized percentages, keeps exact evidence, orders by KR ID and is pure', () => {
    const input = facts();
    input.keyResults = [
      {
        keyResultId: 'IKeyResultId_33333333-1111-4111-8111-111111111111' as never,
        title: 'Stable',
        unit: null,
        startPercentage: 50,
        endPercentage: 50,
        deltaPercentage: 0,
        trend: [],
      },
      {
        keyResultId: 'IKeyResultId_22222222-1111-4111-8111-111111111111' as never,
        title: 'Regressed',
        unit: null,
        startPercentage: 50,
        endPercentage: 20,
        deltaPercentage: -30,
        trend: [],
      },
      {
        keyResultId: 'IKeyResultId_11111111-1111-4111-8111-111111111111' as never,
        title: 'Decreasing target',
        unit: 'kg',
        startPercentage: 20,
        endPercentage: 50,
        deltaPercentage: 30,
        trend: [],
      },
    ];
    const original = structuredClone(input);
    const signals = analyzeGoalReviewSignals(input);
    expect(signals.map((signal) => signal.kind)).toEqual([
      'overall-movement',
      'key-result-movement',
      'measurement-activity',
    ]);
    expect(signals[1]).toEqual({
      kind: 'key-result-movement',
      evidence: [
        {
          keyResultId: 'IKeyResultId_11111111-1111-4111-8111-111111111111',
          title: 'Decreasing target',
          startPercentage: 20,
          endPercentage: 50,
          deltaPercentage: 30,
          direction: 'improved',
        },
        {
          keyResultId: 'IKeyResultId_22222222-1111-4111-8111-111111111111',
          title: 'Regressed',
          startPercentage: 50,
          endPercentage: 20,
          deltaPercentage: -30,
          direction: 'regressed',
        },
        {
          keyResultId: 'IKeyResultId_33333333-1111-4111-8111-111111111111',
          title: 'Stable',
          startPercentage: 50,
          endPercentage: 50,
          deltaPercentage: 0,
          direction: 'unchanged',
        },
      ],
    });
    expect(
      analyzeGoalReviewSignals({ ...input, keyResults: [...input.keyResults].reverse() }),
    ).toEqual(signals);
    expect(input).toEqual(original);
    for (const signal of signals) expect(GoalReviewSignalSchema.parse(signal)).toEqual(signal);
    expect(JSON.stringify(signals)).not.toMatch(
      /cause|recommendation|confidence|on.track|healthy|blocked|needs.attention|will.miss/i,
    );
  });
});
