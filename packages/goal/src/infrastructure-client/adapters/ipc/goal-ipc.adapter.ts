/**
 * Goal IPC Adapter
 *
 * IPC implementation of IGoalApiClient using ResultIpcClient.
 * Communicates with Electron main process for data operations.
 */

import type { Result } from '@memoflow/contracts/result';
import { GoalChannels } from '@memoflow/contracts/electron';
import type { IGoalApiClient, IResultIpcClient } from '../types';
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

export class GoalIpcAdapter implements IGoalApiClient {
  constructor(private readonly ipcClient: IResultIpcClient) {}

  // ===== Goal CRUD =====

  async createGoal(request: CreateGoalReq): Promise<Result<GoalMutationReceipt>> {
    return this.ipcClient.invoke(GoalChannels.CREATE, request);
  }

  async getGoals(params?: {
    page?: number;
    pageSize?: number;
    query?: string;
    status?: string[];
    systemView?: GoalSystemView;
    labelIdsAll?: string[];
    startDate?: number;
    endDate?: number;
    includeChildren?: boolean;
  }): Promise<Result<QueryGoalsRes>> {
    return this.ipcClient.invoke(GoalChannels.LIST, params);
  }

  async getGoalById(id: string, includeChildren = true): Promise<Result<GoalClientDTO>> {
    return this.ipcClient.invoke(GoalChannels.GET, id, includeChildren);
  }

  async updateGoal(id: string, request: UpdateGoalReq): Promise<Result<GoalMutationReceipt>> {
    return this.ipcClient.invoke(GoalChannels.UPDATE, id, request);
  }

  async deleteGoal(id: string, request: DeleteGoalReq): Promise<Result<GoalMutationReceipt>> {
    return this.ipcClient.invoke(GoalChannels.DELETE, id, request);
  }

  // ===== Goal Status =====

  async planGoal(id: string, expectedVersion: number): Promise<Result<GoalMutationReceipt>> {
    return this.ipcClient.invoke(GoalChannels.PLAN, id, { expectedVersion });
  }

  async activateGoal(id: string, expectedVersion: number): Promise<Result<GoalMutationReceipt>> {
    return this.ipcClient.invoke(GoalChannels.ACTIVATE, id, { expectedVersion });
  }

  async completeGoal(id: string, expectedVersion: number): Promise<Result<GoalMutationReceipt>> {
    return this.ipcClient.invoke(GoalChannels.COMPLETE, id, { expectedVersion });
  }

  async archiveGoal(id: string, expectedVersion: number): Promise<Result<GoalMutationReceipt>> {
    return this.ipcClient.invoke(GoalChannels.ARCHIVE, id, { expectedVersion });
  }

  async abandonGoal(id: string, expectedVersion: number): Promise<Result<GoalMutationReceipt>> {
    return this.ipcClient.invoke(GoalChannels.ABANDON, id, { expectedVersion });
  }

  // ===== Search =====

  async searchGoals(params: {
    query: string;
    page?: number;
    pageSize?: number;
    status?: string[];
    systemView?: GoalSystemView;
  }): Promise<Result<QueryGoalsRes>> {
    return this.ipcClient.invoke(GoalChannels.SEARCH, params);
  }

  // ===== KeyResult Management =====

  async addKeyResultForGoal(
    goalId: string,
    request: Omit<AddKeyResultReq, 'goalId'>,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.ipcClient.invoke(GoalChannels.KEY_RESULT_ADD, goalId, request);
  }

  async getKeyResultsByGoal(goalId: string): Promise<Result<GetKeyResultsRes>> {
    return this.ipcClient.invoke(GoalChannels.KEY_RESULT_LIST, goalId);
  }

  async updateKeyResultForGoal(
    goalId: string,
    keyResultId: string,
    request: UpdateKeyResultReq,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.ipcClient.invoke(GoalChannels.KEY_RESULT_UPDATE, goalId, keyResultId, request);
  }

  async deleteKeyResultForGoal(
    goalId: string,
    keyResultId: string,
    request: DeleteKeyResultReq,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.ipcClient.invoke(GoalChannels.KEY_RESULT_DELETE, goalId, keyResultId, request);
  }

  async batchUpdateKeyResultWeights(
    goalId: string,
    request: {
      expectedVersion: number;
      updates: Array<{ keyResultId: string; weight: number }>;
    },
  ): Promise<Result<GoalMutationReceipt>> {
    return this.ipcClient.invoke(GoalChannels.KEY_RESULT_BATCH_UPDATE_WEIGHTS, goalId, request);
  }

  // ===== GoalReview Management =====

  async createGoalReview(
    goalId: string,
    request: CreateGoalReviewReq,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.ipcClient.invoke(GoalChannels.REVIEW_CREATE, goalId, request);
  }

  async getGoalReviewsByGoal(goalId: string): Promise<Result<GetGoalReviewsRes>> {
    return this.ipcClient.invoke(GoalChannels.REVIEW_LIST, goalId);
  }

  async getGoalReviewContext(
    goalId: string,
    windowDays: number = 7,
  ): Promise<Result<GoalReviewSystemContext>> {
    return this.ipcClient.invoke(GoalChannels.REVIEW_CONTEXT, goalId, windowDays);
  }

  async updateGoalReview(
    goalId: string,
    reviewId: string,
    request: UpdateGoalReviewReq,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.ipcClient.invoke(GoalChannels.REVIEW_UPDATE, goalId, reviewId, request);
  }

  async deleteGoalReview(
    goalId: string,
    reviewId: string,
    request: DeleteGoalReviewReq,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.ipcClient.invoke(GoalChannels.REVIEW_DELETE, goalId, reviewId, request);
  }

  // ===== GoalRecord Management =====

  async createGoalRecord(
    goalId: string,
    keyResultId: string,
    request: Pick<CreateGoalRecordReq, 'value' | 'note' | 'expectedVersion'>,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.ipcClient.invoke(GoalChannels.RECORD_CREATE, goalId, keyResultId, request);
  }

  async updateGoalRecord(
    goalId: string,
    keyResultId: string,
    recordId: string,
    request: UpdateGoalRecordReq,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.ipcClient.invoke(
      GoalChannels.RECORD_UPDATE,
      goalId,
      keyResultId,
      recordId,
      request,
    );
  }

  async getGoalRecordsByKeyResult(
    goalId: string,
    keyResultId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<Result<GetGoalRecordsRes>> {
    return this.ipcClient.invoke(
      GoalChannels.RECORD_LIST_BY_KEY_RESULT,
      goalId,
      keyResultId,
      params,
    );
  }

  async getGoalRecordsByGoal(
    goalId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<Result<GetGoalRecordsRes>> {
    return this.ipcClient.invoke(GoalChannels.RECORD_LIST_BY_GOAL, goalId, params);
  }

  async deleteGoalRecord(
    goalId: string,
    keyResultId: string,
    recordId: string,
    request: DeleteGoalRecordReq,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.ipcClient.invoke(
      GoalChannels.RECORD_DELETE,
      goalId,
      keyResultId,
      recordId,
      request,
    );
  }

  // ===== Aggregate View =====

  async getGoalAggregateView(goalId: string): Promise<Result<GetGoalAggregateRes>> {
    return this.ipcClient.invoke(GoalChannels.AGGREGATE, goalId);
  }

  async cloneGoal(goalId: string, request: CloneGoalReq): Promise<Result<GoalMutationReceipt>> {
    return this.ipcClient.invoke(GoalChannels.CLONE, goalId, request);
  }
}
