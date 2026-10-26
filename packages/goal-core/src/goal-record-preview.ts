import type { GoalRecordPreviewContext } from '@memoflow/contracts/goal';
import {
  appendGoalRecordSnapshot,
  calculateKeyResultProgress,
} from './key-result-progress-calculator';

/** Predict one appended record using the same aggregation authority as the server. */
export function previewGoalRecord(context: GoalRecordPreviewContext, candidate: number) {
  const after = calculateKeyResultProgress(
    context,
    appendGoalRecordSnapshot(context.aggregationSnapshot, candidate),
  );
  return {
    current: context.currentValue,
    after: after.currentValue,
    target: context.targetValue,
    afterPercentage: after.percentage,
    changed: after.currentValue !== context.currentValue,
    method: context.aggregationMethod,
  };
}

export type GoalRecordPreview = ReturnType<typeof previewGoalRecord>;
