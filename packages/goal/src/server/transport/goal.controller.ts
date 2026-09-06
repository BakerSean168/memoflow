/**
 * Goal Controller
 *
 * Encapsulates Zod validation and use case orchestration.
 * Shared by both Express (HTTP) and IPC transport layers.
 *
 * Each method:
 * 1. Validates input via Zod schema
 * 2. Delegates to the corresponding use case
 * 3. Returns a Result<T> (transport-agnostic)
 */

import type { Result } from '@memoflow/contracts/result';
import { fail, ok } from '@memoflow/contracts/result';
import { ListGoalFiltersSchema } from '@memoflow/contracts/goal';
import { formatZodErrors } from '@memoflow/utils/result';
import type {
  AddKeyResultReq,
  BatchUpdateKeyResultWeightsReq,
  CloneGoalReq,
  CreateGoalRecordReq,
  UpdateGoalRecordReq,
  CreateGoalReviewReq,
  CreateGoalReq,
  DeleteGoalRecordReq,
  DeleteGoalReviewReq,
  DeleteKeyResultReq,
  GoalSystemView,
  GetGoalAggregateRes,
  ListGoalsQuery,
  UpdateGoalReq,
  UpdateKeyResultProgressReq,
  UpdateKeyResultReq,
  UpdateGoalReviewReq,
} from '@memoflow/contracts/goal';
import type { ExecutionContext } from '@memoflow/contracts/shared';
import type { IdentityId } from '@memoflow/contracts/primitives';
import { toKeyResultListResponse } from './mappers';
import type {
  CreateGoalUseCase,
  GetGoalUseCase,
  ListGoalsUseCase,
  UpdateGoalUseCase,
  DeleteGoalUseCase,
  ArchiveGoalUseCase,
  ActivateGoalUseCase,
  AbandonGoalUseCase,
  SearchGoalsUseCase,
  AddGoalKeyResultUseCase,
  UpdateGoalKeyResultUseCase,
  UpdateGoalKeyResultProgressUseCase,
  DeleteGoalKeyResultUseCase,
  AddGoalReviewUseCase,
  ListGoalReviewsUseCase,
  GetGoalReviewContextUseCase,
  UpdateGoalReviewUseCase,
  DeleteGoalReviewUseCase,
  CreateGoalRecordUseCase,
  UpdateGoalRecordUseCase,
  ListGoalRecordsUseCase,
  DeleteGoalRecordUseCase,
  CompleteGoalUseCase,
  GetGoalAggregateUseCase,
  CloneGoalUseCase,
  BatchUpdateKeyResultWeightsUseCase,
} from '../application';

// ============ Use Case Port ============

export interface GoalUseCases {
  createGoal: CreateGoalUseCase['execute'];
  getGoal: GetGoalUseCase['execute'];
  listGoals: ListGoalsUseCase['execute'];
  updateGoal: UpdateGoalUseCase['execute'];
  deleteGoal: DeleteGoalUseCase['execute'];
  archiveGoal: ArchiveGoalUseCase['execute'];
  abandonGoal: AbandonGoalUseCase['execute'];
  activateGoal: ActivateGoalUseCase['execute'];
  completeGoal: CompleteGoalUseCase['execute'];
  searchGoals: SearchGoalsUseCase['execute'];
  addKeyResult: AddGoalKeyResultUseCase['execute'];
  updateKeyResult: UpdateGoalKeyResultUseCase['execute'];
  updateKeyResultProgress: UpdateGoalKeyResultProgressUseCase['execute'];
  deleteKeyResult: DeleteGoalKeyResultUseCase['execute'];
  addReview: AddGoalReviewUseCase['execute'];
  listReviews: ListGoalReviewsUseCase['execute'];
  getReviewContext: GetGoalReviewContextUseCase['execute'];
  updateReview: UpdateGoalReviewUseCase['execute'];
  deleteReview: DeleteGoalReviewUseCase['execute'];
  createRecord: CreateGoalRecordUseCase['execute'];
  updateRecord: UpdateGoalRecordUseCase['execute'];
  listRecords: ListGoalRecordsUseCase['execute'];
  deleteRecord: DeleteGoalRecordUseCase['execute'];
  getGoalAggregate: GetGoalAggregateUseCase['execute'];
  cloneGoal: CloneGoalUseCase['execute'];
  batchUpdateKeyResultWeights: BatchUpdateKeyResultWeightsUseCase['execute'];
}

/**
 * Goal Controller
 *
 * Provides validated use-case calls for the Goal module.
 * Used by both expressAdapter (HTTP) and ipcAdapter (IPC).
 */
export class GoalController {
  constructor(private readonly useCases: GoalUseCases) {}

  // ==================== Goal CRUD ====================

  async create(input: CreateGoalReq, cx: ExecutionContext): Promise<Result<unknown>> {
    return this.useCases.createGoal(input, cx);
  }

  async list(filters: unknown, cx: ExecutionContext): Promise<Result<unknown>> {
    const parsed = ListGoalFiltersSchema.safeParse(filters);
    if (!parsed.success) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: '参数验证失败',
        details: formatZodErrors(parsed.error.issues),
      });
    }
    // Construct internal query with identityId from context
    const query: ListGoalsQuery = {
      ...parsed.data,
      identityId: cx.identityId as IdentityId,
    };
    return this.useCases.listGoals(query);
  }

  async search(query: string, cx: ExecutionContext, systemView?: string): Promise<Result<unknown>> {
    if (!query.trim()) {
      return fail({
        code: 'VALIDATION_ERROR',
        message: 'Search query (query) is required',
      });
    }
    return this.useCases.searchGoals(cx.identityId, query, systemView as GoalSystemView);
  }

  async get(id: string, cx: ExecutionContext, includeChildren = true): Promise<Result<unknown>> {
    return this.useCases.getGoal(id, cx.identityId, includeChildren);
  }

  async update(id: string, input: UpdateGoalReq, cx: ExecutionContext): Promise<Result<unknown>> {
    return this.useCases.updateGoal(id, cx.identityId, input);
  }

  async delete(
    id: string,
    expectedVersion: number,
    cx: ExecutionContext,
  ): Promise<Result<unknown>> {
    return this.useCases.deleteGoal(id, cx.identityId, expectedVersion);
  }

  // ==================== Goal Status Operations ====================

  async archive(
    id: string,
    expectedVersion: number,
    cx: ExecutionContext,
  ): Promise<Result<unknown>> {
    return this.useCases.archiveGoal(id, cx.identityId, expectedVersion);
  }

  async abandon(
    id: string,
    expectedVersion: number,
    cx: ExecutionContext,
  ): Promise<Result<unknown>> {
    return this.useCases.abandonGoal(id, cx.identityId, expectedVersion);
  }

  async activate(
    id: string,
    expectedVersion: number,
    cx: ExecutionContext,
  ): Promise<Result<unknown>> {
    return this.useCases.activateGoal(id, cx.identityId, expectedVersion);
  }

  async complete(
    id: string,
    expectedVersion: number,
    cx: ExecutionContext,
  ): Promise<Result<unknown>> {
    return this.useCases.completeGoal(id, cx.identityId, expectedVersion);
  }

  async getAggregate(goalId: string, cx: ExecutionContext): Promise<Result<GetGoalAggregateRes>> {
    return this.useCases.getGoalAggregate(goalId, cx.identityId);
  }


  async cloneGoal(
    goalId: string,
    params: CloneGoalReq,
    cx: ExecutionContext,
  ): Promise<Result<unknown>> {
    return this.useCases.cloneGoal(goalId, params, cx);
  }

  async batchUpdateKeyResultWeights(
    goalId: string,
    request: BatchUpdateKeyResultWeightsReq,
    cx: ExecutionContext,
  ): Promise<Result<unknown>> {
    return this.useCases.batchUpdateKeyResultWeights(
      goalId,
      cx.identityId,
      request.expectedVersion,
      request.updates,
    );
  }

  // ==================== Key Results ====================

  async getKeyResults(goalId: string, cx: ExecutionContext): Promise<Result<unknown>> {
    const result = await this.useCases.getGoal(goalId, cx.identityId, true);
    if (!result.ok) return result;
    return ok(toKeyResultListResponse(result.data));
  }

  async addKeyResult(
    goalId: string,
    input: AddKeyResultReq,
    cx: ExecutionContext,
  ): Promise<Result<unknown>> {
    return this.useCases.addKeyResult(goalId, cx.identityId, {
      title: input.title,
      aggregationMethod: input.calculationMethod,
      startingValue: input.startingValue,
      targetValue: input.targetValue,
      currentValue: input.currentValue,
      progressBaselineValue: input.progressBaselineValue,
      unit: input.unit,
      weight: input.weight,
      expectedVersion: input.expectedVersion,
    });
  }

  async updateKeyResult(
    goalId: string,
    krId: string,
    input: UpdateKeyResultReq,
    cx: ExecutionContext,
  ): Promise<Result<unknown>> {
    return this.useCases.updateKeyResult(goalId, cx.identityId, krId, {
      title: input.title,
      description: input.description ?? undefined,
      weight: input.weight,
      startingValue: input.startingValue,
      currentValue: input.currentValue,
      targetValue: input.targetValue,
      progressBaselineValue: input.progressBaselineValue,
      aggregationMethod: input.calculationMethod,
      unit: input.unit ?? undefined,
      expectedVersion: input.expectedVersion,
    });
  }

  async updateKeyResultProgress(
    goalId: string,
    krId: string,
    input: UpdateKeyResultProgressReq,
    cx: ExecutionContext,
  ): Promise<Result<unknown>> {
    return this.useCases.updateKeyResultProgress(
      goalId,
      cx.identityId,
      krId,
      input.newValue,
      input.expectedVersion,
      input.note,
    );
  }

  async deleteKeyResult(
    goalId: string,
    krId: string,
    input: DeleteKeyResultReq,
    cx: ExecutionContext,
  ): Promise<Result<unknown>> {
    return this.useCases.deleteKeyResult(goalId, cx.identityId, krId, input.expectedVersion);
  }

  // ==================== Reviews ====================

  async addReview(
    goalId: string,
    input: CreateGoalReviewReq,
    cx: ExecutionContext,
  ): Promise<Result<unknown>> {
    return this.useCases.addReview(goalId, cx.identityId, {
      reflection: input.reflection,
      challenges: input.challenges,
      adjustments: input.adjustments,
      windowDays: input.windowDays,
      expectedVersion: input.expectedVersion,
    });
  }

  // ==================== Reviews - List / Update / Delete ====================

  async listReviews(goalId: string, cx: ExecutionContext): Promise<Result<unknown>> {
    return this.useCases.listReviews(goalId, cx.identityId);
  }

  async getReviewContext(
    goalId: string,
    windowDays: number | undefined,
    cx: ExecutionContext,
  ): Promise<Result<unknown>> {
    return this.useCases.getReviewContext(goalId, cx.identityId, windowDays);
  }

  async updateReview(
    goalId: string,
    reviewId: string,
    input: UpdateGoalReviewReq,
    cx: ExecutionContext,
  ): Promise<Result<unknown>> {
    return this.useCases.updateReview(goalId, cx.identityId, reviewId, {
      reflection: input.reflection,
      challenges: input.challenges,
      adjustments: input.adjustments,
      expectedVersion: input.expectedVersion,
    });
  }

  async deleteReview(
    goalId: string,
    reviewId: string,
    input: DeleteGoalReviewReq,
    cx: ExecutionContext,
  ): Promise<Result<unknown>> {
    return this.useCases.deleteReview(goalId, cx.identityId, reviewId, input.expectedVersion);
  }

  // ==================== Records ====================

  async createRecord(
    goalId: string,
    keyResultId: string,
    input: CreateGoalRecordReq,
    cx: ExecutionContext,
  ): Promise<Result<unknown>> {
    return this.useCases.createRecord(
      goalId,
      keyResultId,
      {
        value: input.value,
        note: input.note,
        expectedVersion: input.expectedVersion,
      },
      cx.identityId,
    );
  }

  async updateRecord(
    goalId: string,
    keyResultId: string,
    recordId: string,
    input: UpdateGoalRecordReq,
    cx: ExecutionContext,
  ): Promise<Result<unknown>> {
    return this.useCases.updateRecord(goalId, keyResultId, recordId, input, cx.identityId);
  }

  async listRecordsByGoal(
    goalId: string,
    params: { limit?: number; offset?: number } | undefined,
    cx: ExecutionContext,
  ): Promise<Result<unknown>> {
    return this.useCases.listRecords({
      identityId: cx.identityId,
      goalId,
      limit: params?.limit,
      offset: params?.offset,
    });
  }

  async listRecordsByKeyResult(
    goalId: string,
    keyResultId: string,
    params: { limit?: number; offset?: number } | undefined,
    cx: ExecutionContext,
  ): Promise<Result<unknown>> {
    return this.useCases.listRecords({
      identityId: cx.identityId,
      goalId,
      keyResultId,
      limit: params?.limit,
      offset: params?.offset,
    });
  }

  async deleteRecord(
    goalId: string,
    keyResultId: string,
    recordId: string,
    input: DeleteGoalRecordReq,
    cx: ExecutionContext,
  ): Promise<Result<unknown>> {
    return this.useCases.deleteRecord(
      goalId,
      keyResultId,
      recordId,
      cx.identityId,
      input.expectedVersion,
    );
  }
}
