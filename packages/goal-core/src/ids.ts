import { createIdType } from '@memoflow/utils/domain';
import type {
  GoalId as GoalIdType,
  KeyResultId as KeyResultIdType,
  GoalRecordId as GoalRecordIdType,
  GoalReviewId as GoalReviewIdType,
} from '@memoflow/goal-contracts';

/** One canonical runtime-neutral factory per goal identifier. */
export const GoalId = createIdType<GoalIdType>('IGoalId');
export type GoalId = GoalIdType;
export const KeyResultId = createIdType<KeyResultIdType>('IKeyResultId');
export type KeyResultId = KeyResultIdType;
export const GoalRecordId = createIdType<GoalRecordIdType>('IGoalRecordId');
export type GoalRecordId = GoalRecordIdType;
export const GoalReviewId = createIdType<GoalReviewIdType>('IGoalReviewId');
export type GoalReviewId = GoalReviewIdType;
