import type {
  CloneGoalReq,
  CreateGoalReq,
  GetGoalAggregateRes,
  GetGoalRes,
  GoalMutationReceipt,
  GoalReviewSystemContext,
  GoalTimeframe,
  ListGoalsQuery,
  QueryGoalsRes,
  UpdateGoalReq,
  UpdateGoalRes,
} from '@memoflow/contracts/goal';
import type { Result } from '@memoflow/contracts/result';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type {
  ListGoalRecordsParams,
  ListGoalRecordsResult,
} from './use-cases/queries/list-goal-records.use-case';
import type { ListGoalReviewsResult } from './use-cases/queries/list-goal-reviews.use-case';

/** Transport-neutral callable application surface. */
export interface GoalApplicationPort {
  createGoal(input: CreateGoalReq, cx: ExecutionContext): Promise<Result<GoalMutationReceipt>>;
  getGoal(id: string, identityId: string, includeChildren?: boolean): Promise<Result<GetGoalRes>>;
  listGoals(input: ListGoalsQuery): Promise<Result<QueryGoalsRes>>;
  updateGoal(id: string, identityId: string, input: UpdateGoalReq): Promise<Result<UpdateGoalRes>>;
  deleteGoal(
    id: string,
    identityId: string,
    expectedVersion: number,
  ): Promise<Result<GoalMutationReceipt>>;
  permanentlyDeleteGoal(
    id: string,
    identityId: string,
    expectedVersion: number,
  ): Promise<Result<{ id: string }>>;
  archiveGoal(
    id: string,
    identityId: string,
    expectedVersion: number,
  ): Promise<Result<GoalMutationReceipt>>;
  abandonGoal(
    id: string,
    identityId: string,
    expectedVersion: number,
  ): Promise<Result<GoalMutationReceipt>>;
  planGoal(
    id: string,
    identityId: string,
    expectedVersion: number,
  ): Promise<Result<GoalMutationReceipt>>;
  activateGoal(
    id: string,
    identityId: string,
    expectedVersion: number,
  ): Promise<Result<GoalMutationReceipt>>;
  completeGoal(
    id: string,
    identityId: string,
    expectedVersion: number,
  ): Promise<Result<GoalMutationReceipt>>;
  searchGoals(
    identityId: string,
    query: string,
    systemView?: string,
  ): Promise<Result<QueryGoalsRes>>;

  addKeyResult(
    goalId: string,
    identityId: string,
    keyResult: {
      title: string;
      aggregationMethod?: import('@memoflow/contracts/goal').KeyResultCalculationMethod;
      initialValue?: number;
      targetValue: number;
      currentValue?: number;
      target?: GoalTimeframe | null;
      unit?: string | null;
      weight?: number;
      expectedVersion: number;
    },
  ): Promise<Result<GoalMutationReceipt>>;
  updateKeyResult(
    goalId: string,
    identityId: string,
    keyResultId: string,
    updates: {
      title?: string;
      description?: string;
      weight?: number;
      initialValue?: number;
      target?: GoalTimeframe | null;
      aggregationMethod?: import('@memoflow/contracts/goal').KeyResultCalculationMethod;
      currentValue?: number;
      targetValue?: number;
      unit?: string;
      expectedVersion: number;
    },
  ): Promise<Result<GoalMutationReceipt>>;
  updateKeyResultProgress(
    goalId: string,
    identityId: string,
    keyResultId: string,
    currentValue: number,
    expectedVersion: number,
    note?: string,
  ): Promise<Result<GoalMutationReceipt>>;
  deleteKeyResult(
    goalId: string,
    identityId: string,
    keyResultId: string,
    expectedVersion: number,
  ): Promise<Result<GoalMutationReceipt>>;

  addReview(
    goalId: string,
    identityId: string,
    params: {
      reflection: string;
      challenges?: string | null;
      adjustments?: string | null;
      windowDays?: number;
      expectedVersion: number;
    },
  ): Promise<Result<GoalMutationReceipt>>;
  getReviewContext(
    goalId: string,
    identityId: string,
    windowDays?: number,
  ): Promise<Result<GoalReviewSystemContext>>;
  listReviews(goalId: string, identityId: string): Promise<Result<ListGoalReviewsResult>>;
  updateReview(
    goalId: string,
    identityId: string,
    reviewId: string,
    params: {
      reflection?: string;
      challenges?: string | null;
      adjustments?: string | null;
      expectedVersion: number;
    },
  ): Promise<Result<GoalMutationReceipt>>;
  deleteReview(
    goalId: string,
    identityId: string,
    reviewId: string,
    expectedVersion: number,
  ): Promise<Result<GoalMutationReceipt>>;

  createRecord(
    goalId: string,
    keyResultId: string,
    params: { value: number; note?: string; expectedVersion: number },
    identityId: string,
  ): Promise<Result<GoalMutationReceipt>>;
  updateRecord(
    goalId: string,
    keyResultId: string,
    recordId: string,
    params: { value?: number; note?: string | null; expectedVersion: number },
    identityId: string,
  ): Promise<Result<GoalMutationReceipt>>;
  listRecords(params: ListGoalRecordsParams): Promise<Result<ListGoalRecordsResult>>;
  deleteRecord(
    goalId: string,
    keyResultId: string,
    recordId: string,
    identityId: string,
    expectedVersion: number,
  ): Promise<Result<GoalMutationReceipt>>;

  getGoalAggregate(goalId: string, identityId: string): Promise<Result<GetGoalAggregateRes>>;
  cloneGoal(
    goalId: string,
    params: CloneGoalReq,
    cx: ExecutionContext,
  ): Promise<Result<GoalMutationReceipt>>;
  batchUpdateKeyResultWeights(
    goalId: string,
    identityId: string,
    expectedVersion: number,
    updates: Array<{ keyResultId: string; weight: number }>,
  ): Promise<Result<GoalMutationReceipt>>;
}
