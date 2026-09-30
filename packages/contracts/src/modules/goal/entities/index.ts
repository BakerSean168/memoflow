/**
 * Goal Entities Export
 *
 * Residual 655: record client DTO dual re-export from aggregates retired.
 * Client record DTO lives under aggregates only.
 */

export { GoalRecordSourceType, GoalRecordAuthorship, GoalRecordAuthorshipSchema } from './goal-record-server';
export type {
  GoalRecordServerDTO,
  GoalRecordSource,
  GoalRecordSourceType as GoalRecordSourceTypeValue,
} from './goal-record-server';

export type {
  GoalReviewServerDTO,
} from './goal-review-server';

export type {
  GoalReviewClientDTO,
} from './goal-review-client';

export type {
  KeyResultServerDTO,
} from './key-result-server';

export type {
  KeyResultClientDTO,
} from './key-result-client';
