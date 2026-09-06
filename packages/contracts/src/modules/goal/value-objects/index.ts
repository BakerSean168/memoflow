/**
 * Goal Value Objects Export
 * 目标值对象导出
 */

export type { GoalId } from './goal-id';
export type { KeyResultId } from './key-result-id';

export type { GoalTimeRange, GoalTimeRangeDTO } from './goal-time-range';

export type { KeyResultProgress, KeyResultProgressDTO } from './key-result-progress';
export { KeyResultProgressDTOSchema } from './key-result-progress';

export type { KeyResultSnapshot, KeyResultSnapshotDTO } from './key-result-snapshot';
export { KeyResultSnapshotDTOSchema } from './key-result-snapshot';

export type {
  ReminderTrigger,
  GoalReminderConfig,
  GoalReminderConfigDTO,
} from './goal-reminder-config';
export { ReminderTriggerSchema, GoalReminderConfigDTOSchema } from './goal-reminder-config';

export { SnapshotTrigger } from './key-result-weight-snapshot';
export type {
  KeyResultWeightSnapshot,
  KeyResultWeightSnapshotDTO,
} from './key-result-weight-snapshot';


// ============ 枚举值对象 ============
export { GoalStatus } from './goal-status';

export { GoalSystemView } from './goal-system-view';

export { KeyResultCalculationMethod } from './key-result-calculation-method';

export { ReminderTriggerType } from './reminder-trigger-type';

export { GoalReviewSystemContextSchema, GoalReviewKeyResultContextSchema, GoalReviewTrendPointSchema } from './goal-review-context';
export type { GoalReviewSystemContext, GoalReviewKeyResultContext, GoalReviewTrendPoint } from './goal-review-context';
