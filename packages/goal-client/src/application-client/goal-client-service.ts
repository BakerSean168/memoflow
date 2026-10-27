/**
 * GoalClientDTO Client Service
 *
 * Constructor-injected application service for goal management.
 * Uses the GoalClientDTO API client port directly,
 * returning Result<T> types throughout.
 *
 * @module application-client/goal-client-service
 */

import type { Result } from '@memoflow/transport-contracts/result';
import { map as mapResult } from '@memoflow/transport-contracts/result';
import type {
  CreateGoalReq,
  UpdateGoalReq,
  DeleteGoalReq,
  CloneGoalReq,
  AddKeyResultReq,
  UpdateKeyResultReq,
  DeleteKeyResultReq,
  CreateGoalRecordReq,
  UpdateGoalRecordReq,
  DeleteGoalRecordReq,
  CreateGoalReviewReq,
  UpdateGoalReviewReq,
  DeleteGoalReviewReq,
  GoalReviewClientDTO,
  GoalReviewSystemContext,
  GoalReviewWindowInput,
  GoalClientDTO,
  GoalMutationReceipt,
  GoalSystemView,
  KeyResultClientDTO,
  GoalRecordClientDTO,
  QueryGoalsRes,
  GoalHomeProgressSummary,
  GetKeyResultsRes,
  GetGoalRecordsRes,
  GetGoalReviewsRes,
  GetGoalAggregateRes,
} from '@memoflow/goal-contracts';
import type {
  GetGoalWorkspaceReq,
  GoalWorkspaceReadModel,
  GoalWorkspaceTaskPage,
  GoalWorkspaceTaskPageRequest,
  GoalWorkspacePageRequest,
  GoalWorkspaceKnowledgePage,
} from '@memoflow/goal-workspace-contracts';
import type { IGoalApiClient } from './ports/goal-api-client.port';
// ─── Client Application Port ────────────────────────────────────────────────

/** High-level client-side operations for the goal module. */
export interface GoalClientPort {
  createGoal(request: CreateGoalReq): Promise<Result<GoalMutationReceipt>>;
  getGoal(id: string): Promise<Result<GoalClientDTO>>;
  getHomeSummary(): Promise<Result<GoalHomeProgressSummary>>;
  listGoals(params?: {
    page?: number;
    pageSize?: number;
    query?: string;
    status?: string[];
    systemView?: GoalSystemView;
    labelIdsAll?: string[];
    targetStart?: import('@memoflow/shared-primitives').Ymd;
    targetEnd?: import('@memoflow/shared-primitives').Ymd;
  }): Promise<Result<{ goals: GoalClientDTO[]; pagination: QueryGoalsRes['pagination'] }>>;
  updateGoal(id: string, request: UpdateGoalReq): Promise<Result<GoalMutationReceipt>>;
  deleteGoal(id: string, request: DeleteGoalReq): Promise<Result<GoalMutationReceipt>>;
  getGoalWorkspace(
    goalId: string,
    request?: GetGoalWorkspaceReq,
  ): Promise<Result<GoalWorkspaceReadModel>>;
  getGoalWorkspaceTasks(
    goalId: string,
    request?: GoalWorkspaceTaskPageRequest,
  ): Promise<Result<GoalWorkspaceTaskPage>>;
  getGoalWorkspaceKnowledge(
    goalId: string,
    request?: GoalWorkspacePageRequest,
  ): Promise<Result<GoalWorkspaceKnowledgePage>>;
  planGoal(id: string, expectedVersion: number): Promise<Result<GoalMutationReceipt>>;
  activateGoal(id: string, expectedVersion: number): Promise<Result<GoalMutationReceipt>>;
  completeGoal(id: string, expectedVersion: number): Promise<Result<GoalMutationReceipt>>;
  archiveGoal(id: string, expectedVersion: number): Promise<Result<GoalMutationReceipt>>;
  abandonGoal(id: string, expectedVersion: number): Promise<Result<GoalMutationReceipt>>;
  searchGoals(params: {
    query: string;
    page?: number;
    pageSize?: number;
    status?: string[];
    systemView?: GoalSystemView;
  }): Promise<Result<{ goals: GoalClientDTO[]; pagination: QueryGoalsRes['pagination'] }>>;
  getGoalAggregateView(id: string): Promise<Result<GetGoalAggregateRes>>;
  cloneGoal(id: string, request?: CloneGoalReq): Promise<Result<GoalMutationReceipt>>;
  createKeyResult(
    goalId: string,
    request: Omit<AddKeyResultReq, 'goalId'>,
  ): Promise<Result<GoalMutationReceipt>>;
  getKeyResults(goalId: string): Promise<Result<{ keyResults: KeyResultClientDTO[] }>>;
  updateKeyResult(
    goalId: string,
    krId: string,
    request: UpdateKeyResultReq,
  ): Promise<Result<GoalMutationReceipt>>;
  deleteKeyResult(
    goalId: string,
    krId: string,
    request: DeleteKeyResultReq,
  ): Promise<Result<GoalMutationReceipt>>;
  batchUpdateKeyResultWeights(
    goalId: string,
    expectedVersion: number,
    updates: Array<{ keyResultId: string; weight: number }>,
  ): Promise<Result<GoalMutationReceipt>>;
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
    krId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<
    Result<{
      records: GoalRecordClientDTO[];
      total: number;
      previewContext?: GetGoalRecordsRes['previewContext'];
    }>
  >;
  getGoalRecordsByGoal(
    goalId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<Result<{ records: GoalRecordClientDTO[]; total: number }>>;
  deleteGoalRecord(
    goalId: string,
    krId: string,
    recordId: string,
    request: DeleteGoalRecordReq,
  ): Promise<Result<GoalMutationReceipt>>;
  createGoalReview(
    goalId: string,
    request: CreateGoalReviewReq,
  ): Promise<Result<GoalMutationReceipt>>;
  getGoalReviews(goalId: string): Promise<Result<{ reviews: GoalReviewClientDTO[] }>>;
  getGoalReviewContext(
    goalId: string,
    input?: GoalReviewWindowInput,
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
}

export class GoalClientService implements GoalClientPort {
  constructor(private readonly goalApi: IGoalApiClient) {
    this.createGoal = this.createGoal.bind(this);
    this.getGoal = this.getGoal.bind(this);
    this.getHomeSummary = this.getHomeSummary.bind(this);
    this.listGoals = this.listGoals.bind(this);
    this.updateGoal = this.updateGoal.bind(this);
    this.deleteGoal = this.deleteGoal.bind(this);
    this.getGoalWorkspace = this.getGoalWorkspace.bind(this);
    this.getGoalWorkspaceTasks = this.getGoalWorkspaceTasks.bind(this);
    this.getGoalWorkspaceKnowledge = this.getGoalWorkspaceKnowledge.bind(this);
    this.planGoal = this.planGoal.bind(this);
    this.activateGoal = this.activateGoal.bind(this);
    this.completeGoal = this.completeGoal.bind(this);
    this.archiveGoal = this.archiveGoal.bind(this);
    this.abandonGoal = this.abandonGoal.bind(this);
    this.searchGoals = this.searchGoals.bind(this);
    this.getGoalAggregateView = this.getGoalAggregateView.bind(this);
    this.cloneGoal = this.cloneGoal.bind(this);
    this.createKeyResult = this.createKeyResult.bind(this);
    this.getKeyResults = this.getKeyResults.bind(this);
    this.updateKeyResult = this.updateKeyResult.bind(this);
    this.deleteKeyResult = this.deleteKeyResult.bind(this);
    this.batchUpdateKeyResultWeights = this.batchUpdateKeyResultWeights.bind(this);
    this.createGoalRecord = this.createGoalRecord.bind(this);
    this.updateGoalRecord = this.updateGoalRecord.bind(this);
    this.getGoalRecordsByKeyResult = this.getGoalRecordsByKeyResult.bind(this);
    this.getGoalRecordsByGoal = this.getGoalRecordsByGoal.bind(this);
    this.deleteGoalRecord = this.deleteGoalRecord.bind(this);
    this.createGoalReview = this.createGoalReview.bind(this);
    this.getGoalReviews = this.getGoalReviews.bind(this);
    this.updateGoalReview = this.updateGoalReview.bind(this);
    this.deleteGoalReview = this.deleteGoalReview.bind(this);
  }

  // ===== GoalClientDTO Management =====

  async createGoal(request: CreateGoalReq): Promise<Result<GoalMutationReceipt>> {
    return this.goalApi.createGoal(request);
  }

  async getGoal(id: string): Promise<Result<GoalClientDTO>> {
    const result = await this.goalApi.getGoalById(id);
    return result;
  }

  async getHomeSummary(): Promise<Result<GoalHomeProgressSummary>> {
    return this.goalApi.getHomeSummary();
  }

  async listGoals(params?: {
    page?: number;
    pageSize?: number;
    query?: string;
    status?: string[];
    systemView?: GoalSystemView;
    labelIdsAll?: string[];
    targetStart?: import('@memoflow/shared-primitives').Ymd;
    targetEnd?: import('@memoflow/shared-primitives').Ymd;
  }): Promise<Result<{ goals: GoalClientDTO[]; pagination: QueryGoalsRes['pagination'] }>> {
    const result = await this.goalApi.getGoals(params);
    return mapResult(result, (data: QueryGoalsRes) => ({
      goals: data?.data ?? [],
      pagination: data?.pagination ?? {
        page: 1,
        pageSize: 20,
        total: 0,
        hasMore: false,
        totalPages: 0,
      },
    }));
  }

  async updateGoal(id: string, request: UpdateGoalReq): Promise<Result<GoalMutationReceipt>> {
    return this.goalApi.updateGoal(id, request);
  }

  async deleteGoal(id: string, request: DeleteGoalReq): Promise<Result<GoalMutationReceipt>> {
    return this.goalApi.deleteGoal(id, request);
  }

  async getGoalWorkspace(
    goalId: string,
    request?: GetGoalWorkspaceReq,
  ): Promise<Result<GoalWorkspaceReadModel>> {
    return this.goalApi.getGoalWorkspace(goalId, request);
  }

  async getGoalWorkspaceTasks(
    goalId: string,
    request?: GoalWorkspaceTaskPageRequest,
  ): Promise<Result<GoalWorkspaceTaskPage>> {
    return this.goalApi.getGoalWorkspaceTasks(goalId, request);
  }

  async getGoalWorkspaceKnowledge(
    goalId: string,
    request?: GoalWorkspacePageRequest,
  ): Promise<Result<GoalWorkspaceKnowledgePage>> {
    return this.goalApi.getGoalWorkspaceKnowledge(goalId, request);
  }

  async planGoal(id: string, expectedVersion: number): Promise<Result<GoalMutationReceipt>> {
    return this.goalApi.planGoal(id, expectedVersion);
  }

  async activateGoal(id: string, expectedVersion: number): Promise<Result<GoalMutationReceipt>> {
    return this.goalApi.activateGoal(id, expectedVersion);
  }

  async completeGoal(id: string, expectedVersion: number): Promise<Result<GoalMutationReceipt>> {
    return this.goalApi.completeGoal(id, expectedVersion);
  }

  async archiveGoal(id: string, expectedVersion: number): Promise<Result<GoalMutationReceipt>> {
    return this.goalApi.archiveGoal(id, expectedVersion);
  }

  async abandonGoal(id: string, expectedVersion: number): Promise<Result<GoalMutationReceipt>> {
    return this.goalApi.abandonGoal(id, expectedVersion);
  }

  async searchGoals(params: {
    query: string;
    page?: number;
    pageSize?: number;
    status?: string[];
    systemView?: GoalSystemView;
  }): Promise<Result<{ goals: GoalClientDTO[]; pagination: QueryGoalsRes['pagination'] }>> {
    const result = await this.goalApi.searchGoals(params);
    return mapResult(result, (data: QueryGoalsRes) => ({
      goals: data?.data ?? [],
      pagination: data?.pagination ?? {
        page: 1,
        pageSize: 20,
        total: 0,
        hasMore: false,
        totalPages: 0,
      },
    }));
  }

  async getGoalAggregateView(id: string): Promise<Result<GetGoalAggregateRes>> {
    return this.goalApi.getGoalAggregateView(id);
  }

  async cloneGoal(id: string, request: CloneGoalReq = {}): Promise<Result<GoalMutationReceipt>> {
    return this.goalApi.cloneGoal(id, request);
  }

  // ===== Key Result Use Cases =====

  async createKeyResult(
    goalId: string,
    request: Omit<AddKeyResultReq, 'goalId'>,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.goalApi.addKeyResultForGoal(goalId, request);
  }

  async getKeyResults(goalId: string): Promise<Result<{ keyResults: KeyResultClientDTO[] }>> {
    const result = await this.goalApi.getKeyResultsByGoal(goalId);
    return mapResult(result, (data: GetKeyResultsRes) => ({
      keyResults: data?.data ?? [],
    }));
  }

  async updateKeyResult(
    goalId: string,
    krId: string,
    request: UpdateKeyResultReq,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.goalApi.updateKeyResultForGoal(goalId, krId, request);
  }

  async deleteKeyResult(
    goalId: string,
    krId: string,
    request: DeleteKeyResultReq,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.goalApi.deleteKeyResultForGoal(goalId, krId, request);
  }

  async batchUpdateKeyResultWeights(
    goalId: string,
    expectedVersion: number,
    updates: Array<{ keyResultId: string; weight: number }>,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.goalApi.batchUpdateKeyResultWeights(goalId, {
      expectedVersion,
      updates,
    });
  }

  // ===== GoalClientDTO Record Use Cases =====

  async createGoalRecord(
    goalId: string,
    keyResultId: string,
    request: Pick<CreateGoalRecordReq, 'value' | 'note' | 'expectedVersion'>,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.goalApi.createGoalRecord(goalId, keyResultId, request);
  }

  async updateGoalRecord(
    goalId: string,
    keyResultId: string,
    recordId: string,
    request: UpdateGoalRecordReq,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.goalApi.updateGoalRecord(goalId, keyResultId, recordId, request);
  }

  async getGoalRecordsByKeyResult(
    goalId: string,
    krId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<
    Result<{
      records: GoalRecordClientDTO[];
      total: number;
      previewContext?: GetGoalRecordsRes['previewContext'];
    }>
  > {
    const result = await this.goalApi.getGoalRecordsByKeyResult(goalId, krId, params);
    return mapResult(result, (data: GetGoalRecordsRes) => ({
      records: data.data,
      total: data.total,
      previewContext: data.previewContext,
    }));
  }

  async getGoalRecordsByGoal(
    goalId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<Result<{ records: GoalRecordClientDTO[]; total: number }>> {
    const result = await this.goalApi.getGoalRecordsByGoal(goalId, params);
    return mapResult(result, (data: GetGoalRecordsRes) => ({
      records: data.data,
      total: data.total,
    }));
  }

  async deleteGoalRecord(
    goalId: string,
    krId: string,
    recordId: string,
    request: DeleteGoalRecordReq,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.goalApi.deleteGoalRecord(goalId, krId, recordId, request);
  }

  // ===== GoalClientDTO Review Use Cases =====

  async createGoalReview(
    goalId: string,
    request: CreateGoalReviewReq,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.goalApi.createGoalReview(goalId, request);
  }

  async getGoalReviews(goalId: string): Promise<Result<{ reviews: GoalReviewClientDTO[] }>> {
    const result = await this.goalApi.getGoalReviewsByGoal(goalId);
    return mapResult(result, (data: GetGoalReviewsRes) => ({
      reviews: data.data,
    }));
  }

  async getGoalReviewContext(
    goalId: string,
    input?: GoalReviewWindowInput,
  ): Promise<Result<GoalReviewSystemContext>> {
    return this.goalApi.getGoalReviewContext(goalId, input);
  }

  async updateGoalReview(
    goalId: string,
    reviewId: string,
    request: UpdateGoalReviewReq,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.goalApi.updateGoalReview(goalId, reviewId, request);
  }

  async deleteGoalReview(
    goalId: string,
    reviewId: string,
    request: DeleteGoalReviewReq,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.goalApi.deleteGoalReview(goalId, reviewId, request);
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/** Create a `GoalClientService` from any transport adapter. */
export function createGoalClientService(goalApi: IGoalApiClient): GoalClientService {
  return new GoalClientService(goalApi);
}
