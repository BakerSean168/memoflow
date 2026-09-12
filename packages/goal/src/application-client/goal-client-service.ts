/**
 * Goal Client Service
 *
 * Constructor-injected application service for goal management.
 * Uses the Goal API client port directly,
 * returning Result<T> types throughout.
 *
 * @module application-client/goal-client-service
 */

import type { Result } from '@memoflow/contracts/result';
import { map as mapResult } from '@memoflow/contracts/result';
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
  GoalClientDTO,
  GoalMutationReceipt,
  GoalSystemView,
  KeyResultClientDTO,
  GoalRecordClientDTO,
  QueryGoalsRes,
  GetKeyResultsRes,
  GetGoalRecordsRes,
  GetGoalReviewsRes,
  GetGoalAggregateRes,
  GetGoalWorkspaceReq,
  GoalWorkspaceReadModel,
  GoalWorkspaceTaskPageRequest,
  GoalWorkspaceTaskPage,
  GoalWorkspacePageRequest,
  GoalWorkspaceKnowledgePage,
} from '@memoflow/contracts/goal';
import type { IGoalApiClient } from './ports/goal-api-client.port';
import {
  Goal,
  KeyResult,
  GoalReview,
  GoalRecord,
  GoalId,
  KeyResultId,
  GoalReviewId,
  GoalRecordId,
} from '../domain-client';
import { IdentityId } from '@memoflow/domain-shared/shared';

// ===== DTO-to-State Mappers =====

function goalFromDTO(dto: GoalClientDTO): Goal {
  return Goal.load({
    id: GoalId.of(dto.id),
    identityId: IdentityId.of(dto.identityId),
    name: dto.name,
    summary: dto.summary,
    status: dto.status,
    startDate: dto.startDate ?? null,
    target: dto.target ?? null,
    completedAt: dto.completedAt ? dto.completedAt : null,
    archivedAt: dto.archivedAt ? dto.archivedAt : null,
    sortOrder: dto.sortOrder,
    reminderConfig: dto.reminderConfig ?? null,
    labels: dto.labels ?? [],
    version: dto.version,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    deletedAt: dto.deletedAt ?? null,
    keyResults: dto.keyResults?.map((kr) => keyResultFromDTO(kr)) ?? null,
    reviews: dto.reviews?.map((r) => goalReviewFromDTO(r)) ?? null,
    totalKeyResults: dto.totalKeyResults,
    completedKeyResults: dto.completedKeyResults,
    overallProgress: dto.overallProgress,
  });
}

function keyResultFromDTO(dto: KeyResultClientDTO): KeyResult {
  return KeyResult.load({
    id: KeyResultId.of(dto.id),
    title: dto.title,
    description: dto.description,
    progress: dto.progress,
    target: dto.target,
    progressPercentage: dto.progressPercentage,
    isCompleted: dto.isCompleted,
    weight: dto.weight,
    order: dto.order,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  });
}

function goalReviewFromDTO(dto: GoalReviewClientDTO): GoalReview {
  return GoalReview.load({
    id: GoalReviewId.of(dto.id),
    goalId: GoalId.of(dto.goalId),
    reflection: dto.reflection,
    challenges: dto.challenges,
    adjustments: dto.adjustments,
    systemContext: dto.systemContext,
    reviewedAt: dto.reviewedAt,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  });
}

function goalRecordFromDTO(dto: GoalRecordClientDTO): GoalRecord {
  return GoalRecord.load({
    id: GoalRecordId.of(dto.id),
    keyResultId: KeyResultId.of(dto.keyResultId),
    goalId: GoalId.of(dto.goalId),
    value: dto.value,
    valueAfter: dto.valueAfter,
    comment: dto.comment,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  });
}

// ─── Client Application Port ────────────────────────────────────────────────

/** High-level client-side operations for the goal module. */
export interface GoalClientPort {
  createGoal(request: CreateGoalReq): Promise<Result<GoalMutationReceipt>>;
  getGoal(id: string): Promise<Result<Goal>>;
  listGoals(params?: {
    page?: number;
    pageSize?: number;
    query?: string;
    status?: string[];
    systemView?: GoalSystemView;
    labelIdsAll?: string[];
    targetStart?: import('@memoflow/contracts/primitives').Ymd;
    targetEnd?: import('@memoflow/contracts/primitives').Ymd;
  }): Promise<Result<{ goals: Goal[]; pagination: QueryGoalsRes['pagination'] }>>;
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
  }): Promise<Result<{ goals: Goal[]; pagination: QueryGoalsRes['pagination'] }>>;
  getGoalAggregateView(id: string): Promise<Result<GetGoalAggregateRes>>;
  cloneGoal(id: string, request?: CloneGoalReq): Promise<Result<GoalMutationReceipt>>;
  createKeyResult(
    goalId: string,
    request: Omit<AddKeyResultReq, 'goalId'>,
  ): Promise<Result<GoalMutationReceipt>>;
  getKeyResults(goalId: string): Promise<Result<{ keyResults: KeyResult[] }>>;
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
  ): Promise<Result<{ records: GoalRecord[]; total: number }>>;
  getGoalRecordsByGoal(
    goalId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<Result<{ records: GoalRecord[]; total: number }>>;
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
  getGoalReviews(goalId: string): Promise<Result<{ reviews: GoalReview[] }>>;
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
}

export class GoalClientService implements GoalClientPort {
  constructor(private readonly goalApi: IGoalApiClient) {
    this.createGoal = this.createGoal.bind(this);
    this.getGoal = this.getGoal.bind(this);
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

  // ===== Goal Management =====

  async createGoal(request: CreateGoalReq): Promise<Result<GoalMutationReceipt>> {
    return this.goalApi.createGoal(request);
  }

  async getGoal(id: string): Promise<Result<Goal>> {
    const result = await this.goalApi.getGoalById(id);
    return mapResult(result, (dto) => goalFromDTO(dto));
  }

  async listGoals(params?: {
    page?: number;
    pageSize?: number;
    query?: string;
    status?: string[];
    systemView?: GoalSystemView;
    labelIdsAll?: string[];
    targetStart?: import('@memoflow/contracts/primitives').Ymd;
    targetEnd?: import('@memoflow/contracts/primitives').Ymd;
  }): Promise<Result<{ goals: Goal[]; pagination: QueryGoalsRes['pagination'] }>> {
    const result = await this.goalApi.getGoals(params);
    return mapResult(result, (data: QueryGoalsRes) => ({
      goals: (data?.data ?? []).map((dto) => goalFromDTO(dto)),
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
  }): Promise<Result<{ goals: Goal[]; pagination: QueryGoalsRes['pagination'] }>> {
    const result = await this.goalApi.searchGoals(params);
    return mapResult(result, (data: QueryGoalsRes) => ({
      goals: (data?.data ?? []).map((dto) => goalFromDTO(dto)),
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

  async getKeyResults(goalId: string): Promise<Result<{ keyResults: KeyResult[] }>> {
    const result = await this.goalApi.getKeyResultsByGoal(goalId);
    return mapResult(result, (data: GetKeyResultsRes) => ({
      keyResults: (data?.data ?? []).map((dto) => keyResultFromDTO(dto)),
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

  // ===== Goal Record Use Cases =====

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
  ): Promise<Result<{ records: GoalRecord[]; total: number }>> {
    const result = await this.goalApi.getGoalRecordsByKeyResult(goalId, krId, params);
    return mapResult(result, (data: GetGoalRecordsRes) => ({
      records: data.data.map((dto) => goalRecordFromDTO(dto)),
      total: data.total,
    }));
  }

  async getGoalRecordsByGoal(
    goalId: string,
    params?: { limit?: number; offset?: number },
  ): Promise<Result<{ records: GoalRecord[]; total: number }>> {
    const result = await this.goalApi.getGoalRecordsByGoal(goalId, params);
    return mapResult(result, (data: GetGoalRecordsRes) => ({
      records: data.data.map((dto) => goalRecordFromDTO(dto)),
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

  // ===== Goal Review Use Cases =====

  async createGoalReview(
    goalId: string,
    request: CreateGoalReviewReq,
  ): Promise<Result<GoalMutationReceipt>> {
    return this.goalApi.createGoalReview(goalId, request);
  }

  async getGoalReviews(goalId: string): Promise<Result<{ reviews: GoalReview[] }>> {
    const result = await this.goalApi.getGoalReviewsByGoal(goalId);
    return mapResult(result, (data: GetGoalReviewsRes) => ({
      reviews: data.data.map((dto) => goalReviewFromDTO(dto as GoalReviewClientDTO)),
    }));
  }

  async getGoalReviewContext(
    goalId: string,
    windowDays: number = 7,
  ): Promise<Result<GoalReviewSystemContext>> {
    return this.goalApi.getGoalReviewContext(goalId, windowDays);
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
