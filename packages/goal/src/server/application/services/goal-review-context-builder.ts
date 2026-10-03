import { analyzeGoalReviewSignals } from './goal-review-signal-analyzer';
import type { GoalReviewSystemContext } from '@memoflow/contracts/goal';
import type { Goal } from '../../domain/aggregates/goal';
import type { IGoalRecordRepository } from '../../domain/repositories/i-goal-record-repository';
import { calculateKeyResultProgress } from '../../domain/services/key-result-progress-calculator';

export interface GoalReviewWindow {
  windowStartAt: number;
  windowEndAt: number;
}

export class GoalReviewContextBuilder {
  constructor(private readonly goalRecordRepository: IGoalRecordRepository) {}

  async build(goal: Goal, window: GoalReviewWindow): Promise<GoalReviewSystemContext> {
    if (window.windowStartAt >= window.windowEndAt) {
      throw new Error('Review window start must be before end');
    }

    const keyResults = goal.keyResults;
    const recordsMap = await this.goalRecordRepository.findByKeyResultIds(
      String(goal.identityId),
      keyResults.map((kr) => String(kr.id)),
      { endTime: new Date(window.windowEndAt), orderBy: 'asc' },
    );

    const contexts = keyResults.map((kr) => {
      const records = (recordsMap.get(String(kr.id)) ?? [])
        .filter((record) => Number(record.recordedAt) <= window.windowEndAt)
        .sort((a, b) => Number(a.recordedAt) - Number(b.recordedAt));
      const priorValues = records
        .filter((record) => Number(record.recordedAt) < window.windowStartAt)
        .map((record) => record.value);
      const inWindow = records.filter(
        (record) =>
          Number(record.recordedAt) >= window.windowStartAt &&
          Number(record.recordedAt) <= window.windowEndAt,
      );
      const start = calculateKeyResultProgress(kr.progress, priorValues);
      const end = calculateKeyResultProgress(
        kr.progress,
        records.map((record) => record.value),
      );
      const rollingValues = [...priorValues];
      const trend = [
        { at: window.windowStartAt, progressPercentage: start.percentage },
        ...inWindow.map((record) => {
          rollingValues.push(record.value);
          return {
            at: Number(record.recordedAt),
            progressPercentage: calculateKeyResultProgress(kr.progress, rollingValues).percentage,
          };
        }),
      ];
      if (trend[trend.length - 1]?.at !== window.windowEndAt) {
        trend.push({ at: window.windowEndAt, progressPercentage: end.percentage });
      }
      return {
        keyResultId: kr.id,
        title: kr.title,
        unit: kr.progress.unit,
        weight: kr.weight,
        startPercentage: start.percentage,
        endPercentage: end.percentage,
        deltaPercentage: round(end.percentage - start.percentage),
        trend,
        records: inWindow,
      };
    });

    const startPercentage = weightedProgress(
      contexts.map((item) => ({ percentage: item.startPercentage, weight: item.weight })),
    );
    const endPercentage = weightedProgress(
      contexts.map((item) => ({ percentage: item.endPercentage, weight: item.weight })),
    );
    const windowRecords = contexts.flatMap((item) => item.records);

    const facts: Omit<GoalReviewSystemContext, 'signals'> = {
      windowStartAt: window.windowStartAt,
      windowEndAt: window.windowEndAt,
      overallProgress: {
        startPercentage,
        endPercentage,
        deltaPercentage: round(endPercentage - startPercentage),
      },
      keyResults: contexts.map(({ weight: _weight, records: _records, ...item }) => item),
      summary: {
        recordCount: windowRecords.length,
        manualRecordCount: windowRecords.filter((record) => record.sourceType === null).length,
        taskContributionCount: windowRecords.filter(
          (record) =>
            record.sourceType === 'TASK_INSTANCE' || record.sourceType === 'TASK_TEMPLATE',
        ).length,
      },
    };
    return { ...facts, signals: analyzeGoalReviewSignals(facts) };
  }
}

function weightedProgress(items: readonly { percentage: number; weight: number }[]): number {
  if (items.length === 0) return 0;
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight === 0) {
    return round(items.reduce((sum, item) => sum + item.percentage, 0) / items.length);
  }
  return round(items.reduce((sum, item) => sum + item.percentage * item.weight, 0) / totalWeight);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
