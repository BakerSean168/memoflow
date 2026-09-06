/**
 * Goal HTTP Adapter
 *
 * HTTP implementation of IGoalApiClient using ResultHttpClient.
 */

import type { Result } from '@memoflow/contracts/result';
import type { IGoalApiClient, IResultHttpClient } from '../types';
import type { GoalId } from '@memoflow/contracts/primitives';
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

export class GoalHttpAdapter implements IGoalApiClient {
  private readonly baseUrl = '/goals';

  constructor(private readonly httpClient: IResultHttpClient) {}

  // ===== Goal CRUD =====

  async createGoal(request: CreateGoalReq): Promise<Result<GoalMutationReceipt>> {
    return this.httpClient.post(this.baseUrl, request);
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
    const requestParams = {
      ...params,
      includeChildren: params?.includeChildren !== false,
    };
    return this.httpClient.get(this.baseUrl, { params: requestParams });
  }

  async getGoalById(id: string, includeChildren = true): Promise<Result<GoalClientDTO>> {
    return this.httpClient.get(`${this.baseUrl}/${id}?includeChildren=${includeChildren}`);
  }

  async updateGoal(id: string, request: UpdateGoalReq): Promise<Result<GoalMutationReceipt>> {
    return this.httpClient.patch(`${this.baseUrl}/${id}`, request);
  }

  async deleteGoal(id: string, request: DeleteGoalReq): Promise<Result<GoalMutationReceipt>> {
    return this.httpClient.delete(`${this.baseUrl}/${id}`, { params: request });
  }

  // ===== Goal Status =====

  async activateGoal(id: string, expectedVersion: number): Promise<Result<GoalMutationReceipt>> {
    return this.httpClient.post(`${this.baseUrl}/${id}/activate`, { expectedVersion });
  }

  async completeGoal(id: string, expectedVersion: number): Promise<Result<GoalMutationReceipt>> {
    return this.httpClient.post(`${this.baseUrl}/${id}/complete`, { expectedVersion });
  }

  async archiveGoal(id: string, expectedVersion: number): Promise<Result<GoalMutationReceipt>> {
    return this.httpClient.post(`${this.baseUrl}/${id}/archive`, { expectedVersion });
  }

  async abandonGoal(id: string, expectedVersion: number): Promise<Result<GoalMutationReceipt>> {
    return this.httpClient.post(`${this.baseUrl}/${id}/abandon`, { expectedVersion });
  }

  // ===== Search =====

  async searchGoals(params: {
    query: string;
    page?: number;
    pageSize?: number;
    status?: string[];
    systemView?: GoalSystemView;
  }): Promise<Result<QueryGoalsRes>> {
    return this.httpClient.get(`${this.baseUrl}/search`, { params });
  }

  // ===== KeyResult Management =====

  async addKeyResultForGoal(
    goalId: string,
    request: Omit<AddKeyResultReq, 'goalId'>,
  ): Promise<Result<GoalMutationReceipt>> {
    const backendRequest: AddKeyResultReq = { goalId: goalId as GoalId, ...request };
    return this.httpClient.post(`${this.baseUrl}/${goalId}/key-results`, backendRequest);
  }

  async getKeyResultsByGoal(goalId: string): Promise<Result<GetKeyResultsRes>> {
    return this.httpClient.get(`${this.baseUrl}/${goalId}/key-results`);
  }

  async updateKeyResultForGoal(
    goalId: string,
    keyResultId: string,
    request: UpdateKeyResultReq,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.httpClient.put(`${this.baseUrl}/${goalId}/key-results/${keyResultId}`, request);
  }

  async deleteKeyResultForGoal(
    goalId: string,
    keyResultId: string,
    request: DeleteKeyResultReq,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.httpClient.delete(`${this.baseUrl}/${goalId}/key-results/${keyResultId}`, {
      params: request,
    });
  }

  async batchUpdateKeyResultWeights(
    goalId: string,
    request: {
      expectedVersion: number;
      updates: Array<{ keyResultId: string; weight: number }>;
    },
  ): Promise<Result<GoalMutationReceipt>> {
    return this.httpClient.put(`${this.baseUrl}/${goalId}/key-results/batch-weight`, request);
  }


  // ===== GoalReview Management =====

  async createGoalReview(
    goalId: string,
    request: CreateGoalReviewReq,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.httpClient.post(`${this.baseUrl}/${goalId}/reviews`, request);
  }

  async getGoalReviewsByGoal(goalId: string): Promise<Result<GetGoalReviewsRes>> {
    return this.httpClient.get(`${this.baseUrl}/${goalId}/reviews`);
  }

  async getGoalReviewContext(
    goalId: string,
    windowDays: number = 7,
  ): Promise<Result<GoalReviewSystemContext>> {
    return this.httpClient.get(`${this.baseUrl}/${goalId}/reviews/context`, {
      params: { windowDays },
    });
  }

  async updateGoalReview(
    goalId: string,
    reviewId: string,
    request: UpdateGoalReviewReq,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.httpClient.put(`${this.baseUrl}/${goalId}/reviews/${reviewId}`, request);
  }

  async deleteGoalReview(
    goalId: string,
    reviewId: string,
    request: DeleteGoalReviewReq,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.httpClient.delete(`${this.baseUrl}/${goalId}/reviews/${reviewId}`, {
      params: request,
    });
  }

  // ===== GoalRecord Management =====

  async createGoalRecord(
    goalId: string,
    keyResultId: string,
    request: Pick<CreateGoalRecordReq, 'value' | 'note' | 'expectedVersion'>,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.httpClient.post(
      `${this.baseUrl}/${goalId}/key-results/${keyResultId}/records`,
      request,
    );
  }

  async updateGoalRecord(
    goalId: string,
    keyResultId: string,
    recordId: string,
    request: UpdateGoalRecordReq,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.httpClient.put(
      `${this.baseUrl}/${goalId}/key-results/${keyResultId}/records/${recordId}`,
      request,
    );
  }

  async getGoalRecordsByKeyResult(
    goalId: string,
    keyResultId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<Result<GetGoalRecordsRes>> {
    return this.httpClient.get(`${this.baseUrl}/${goalId}/key-results/${keyResultId}/records`, {
      params,
    });
  }

  async getGoalRecordsByGoal(
    goalId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<Result<GetGoalRecordsRes>> {
    return this.httpClient.get(`${this.baseUrl}/${goalId}/records`, {
      params,
    });
  }

  async deleteGoalRecord(
    goalId: string,
    keyResultId: string,
    recordId: string,
    request: DeleteGoalRecordReq,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.httpClient.delete(
      `${this.baseUrl}/${goalId}/key-results/${keyResultId}/records/${recordId}`,
      { params: request },
    );
  }

  // ===== Aggregate View =====

  async getGoalAggregateView(goalId: string): Promise<Result<GetGoalAggregateRes>> {
    return this.httpClient.get(`${this.baseUrl}/${goalId}/aggregate`);
  }

  async cloneGoal(goalId: string, request: CloneGoalReq): Promise<Result<GoalMutationReceipt>> {
    return this.httpClient.post(`${this.baseUrl}/${goalId}/clone`, request);
  }
}
