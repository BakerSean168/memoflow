/**
 * Goal API Client Port
 *
 * Transport-agnostic interface for Goal API operations.
 * Implementations: HTTP adapters (web), IPC adapters (desktop)
 *
 * All methods return Result<T> for consistent error handling.
 * Types imported from @memoflow/contracts/goal.
 */

import type { Result } from '@memoflow/contracts/result';
import type {
  GoalClientDTO,
  GoalMutationReceipt,
  GoalSystemView,
  CreateGoalReq,
  UpdateGoalReq,
  DeleteGoalReq,
  CloneGoalReq,
  QueryGoalsRes,
  AddKeyResultReq,
  UpdateKeyResultReq,
  DeleteKeyResultReq,
  GetKeyResultsRes,
  CreateGoalReviewReq,
  GoalReviewSystemContext,
  UpdateGoalReviewReq,
  DeleteGoalReviewReq,
  GetGoalReviewsRes,
  CreateGoalRecordReq,
  UpdateGoalRecordReq,
  DeleteGoalRecordReq,
  GetGoalRecordsRes,
  GetGoalAggregateRes,
} from '@memoflow/contracts/goal';

export interface IGoalApiClient {
  // Goal CRUD
  createGoal(request: CreateGoalReq): Promise<Result<GoalMutationReceipt>>;
  getGoals(params?: {
    page?: number;
    pageSize?: number;
    query?: string;
    status?: string[];
    systemView?: GoalSystemView;
    labelIdsAll?: string[];
    targetStart?: import('@memoflow/contracts/primitives').Ymd;
    targetEnd?: import('@memoflow/contracts/primitives').Ymd;
    includeChildren?: boolean;
  }): Promise<Result<QueryGoalsRes>>;
  getGoalById(id: string, includeChildren?: boolean): Promise<Result<GoalClientDTO>>;
  updateGoal(id: string, request: UpdateGoalReq): Promise<Result<GoalMutationReceipt>>;
  deleteGoal(id: string, request: DeleteGoalReq): Promise<Result<GoalMutationReceipt>>;

  // Goal Status
  planGoal(id: string, expectedVersion: number): Promise<Result<GoalMutationReceipt>>;
  activateGoal(id: string, expectedVersion: number): Promise<Result<GoalMutationReceipt>>;
  completeGoal(id: string, expectedVersion: number): Promise<Result<GoalMutationReceipt>>;
  archiveGoal(id: string, expectedVersion: number): Promise<Result<GoalMutationReceipt>>;
  abandonGoal(id: string, expectedVersion: number): Promise<Result<GoalMutationReceipt>>;

  // Search
  searchGoals(params: {
    query: string;
    page?: number;
    pageSize?: number;
    status?: string[];
    systemView?: GoalSystemView;
  }): Promise<Result<QueryGoalsRes>>;

  // KeyResult Management (via Goal Aggregate)
  addKeyResultForGoal(
    goalId: string,
    request: Omit<AddKeyResultReq, 'goalId'>,
  ): Promise<Result<GoalMutationReceipt>>;
  getKeyResultsByGoal(goalId: string): Promise<Result<GetKeyResultsRes>>;
  updateKeyResultForGoal(
    goalId: string,
    keyResultId: string,
    request: UpdateKeyResultReq,
  ): Promise<Result<GoalMutationReceipt>>;
  deleteKeyResultForGoal(
    goalId: string,
    keyResultId: string,
    request: DeleteKeyResultReq,
  ): Promise<Result<GoalMutationReceipt>>;
  batchUpdateKeyResultWeights(
    goalId: string,
    request: {
      expectedVersion: number;
      updates: Array<{ keyResultId: string; weight: number }>;
    },
  ): Promise<Result<GoalMutationReceipt>>;

  // GoalReview Management
  createGoalReview(
    goalId: string,
    request: CreateGoalReviewReq,
  ): Promise<Result<GoalMutationReceipt>>;
  getGoalReviewsByGoal(goalId: string): Promise<Result<GetGoalReviewsRes>>;
  getGoalReviewContext(
    goalId: string,
    windowDays?: number,
  ): Promise<Result<GoalReviewSystemContext>>;
  updateGoalReview(
    goalId: string,
    reviewId: string,
    request: UpdateGoalReviewReq,
  ): Promise<Result<GoalMutationReceipt>>;
  deleteGoalReview(
    goalId: string,
    reviewId: string,
    request: DeleteGoalReviewReq,
  ): Promise<Result<GoalMutationReceipt>>;

  // GoalRecord Management
  createGoalRecord(
    goalId: string,
    keyResultId: string,
    request: Pick<CreateGoalRecordReq, 'value' | 'note' | 'expectedVersion'>,
  ): Promise<Result<GoalMutationReceipt>>;
  updateGoalRecord(
    goalId: string,
    keyResultId: string,
    recordId: string,
    request: UpdateGoalRecordReq,
  ): Promise<Result<GoalMutationReceipt>>;
  getGoalRecordsByKeyResult(
    goalId: string,
    keyResultId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<Result<GetGoalRecordsRes>>;
  getGoalRecordsByGoal(
    goalId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<Result<GetGoalRecordsRes>>;
  deleteGoalRecord(
    goalId: string,
    keyResultId: string,
    recordId: string,
    request: DeleteGoalRecordReq,
  ): Promise<Result<GoalMutationReceipt>>;

  // Aggregate View
  getGoalAggregateView(goalId: string): Promise<Result<GetGoalAggregateRes>>;
  cloneGoal(goalId: string, request: CloneGoalReq): Promise<Result<GoalMutationReceipt>>;

  // AI Generation
}
