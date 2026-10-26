/**
 * Goal Invocation Schemas
 * 目标操作调用契约
 *
 * Named composite request schemas that bind path params + body/query into the
 * canonical contract input validated by the shared validation adapters
 * (`expressAdapterWithValidation` / `ipcAdapterWithValidation`). Each schema is
 * the single source of truth for BOTH the OpenAPI request registration (via
 * `.shape`) and the runtime validator — never inline `z.object` in route
 * callbacks. Identity never appears in these bodies; it is supplied by the
 * canonical `ExecutionContext`.
 *
 * 命名复合请求 schema：把 path params + body/query 组合成 shared validation
 * adapter 校验的 canonical contract 输入。每个 schema 同时是 OpenAPI request
 * 注册（通过 `.shape`）与 runtime 校验器的唯一事实来源——绝不在 route callback
 * 内拼内联 `z.object`。identity 永不出现于这些 body，而是由 canonical
 * `ExecutionContext` 提供。
 */

import { z } from 'zod';
import { brandedId } from '@memoflow/shared-primitives';
import type { GoalId } from '../value-objects/goal-id';
import type { GoalRecordId } from '../value-objects/goal-record-id';
import type { GoalReviewId } from '../value-objects/goal-review-id';
import type { KeyResultId } from '../value-objects/key-result-id';
import { CloneGoalSchema, GoalVersionCommandSchema, UpdateGoalSchema } from './goal-crud.dto';
import {
  AddKeyResultSchema,
  DeleteKeyResultSchema,
  UpdateKeyResultProgressSchema,
  UpdateKeyResultSchema,
} from './key-result.dto';
import {
  CreateGoalReviewSchema,
  GoalReviewWindowQuerySchema,
  DeleteGoalReviewSchema,
  UpdateGoalReviewSchema,
} from './goal-review.dto';
import {
  CreateGoalRecordSchema,
  DeleteGoalRecordSchema,
  UpdateGoalRecordSchema,
} from './goal-record.dto';
import { BatchUpdateKeyResultWeightsReqSchema } from './response-schemas';

// ============================================================================
// Shared route params
// ============================================================================

/** `:id` path param for a goal-scoped route. 目标作用域路由的 `:id` path 参数。 */
export const GoalRouteIdParamsSchema = z.object({ id: brandedId<GoalId>() });
export type GoalRouteIdParams = z.infer<typeof GoalRouteIdParamsSchema>;

/** `:id/:krId` path params for a key-result-scoped route. 关键结果作用域路由的 path 参数。 */
export const KeyResultRouteParamsSchema = z.object({
  id: brandedId<GoalId>(),
  krId: brandedId<KeyResultId>(),
});
export type KeyResultRouteParams = z.infer<typeof KeyResultRouteParamsSchema>;

/** `:id/:reviewId` path params for a review-scoped route. 复盘作用域路由的 path 参数。 */
export const ReviewRouteParamsSchema = z.object({
  id: brandedId<GoalId>(),
  reviewId: brandedId<GoalReviewId>(),
});
export type ReviewRouteParams = z.infer<typeof ReviewRouteParamsSchema>;

/** `:id/:krId/:recordId` path params for a record-scoped route. 进度记录作用域路由的 path 参数。 */
export const RecordRouteParamsSchema = z.object({
  id: brandedId<GoalId>(),
  krId: brandedId<KeyResultId>(),
  recordId: brandedId<GoalRecordId>(),
});
export type RecordRouteParams = z.infer<typeof RecordRouteParamsSchema>;

// ============================================================================
// Core Goal mutations
// ============================================================================

/** PUT/PATCH /:id — update a goal. 更新目标。 */
export const UpdateGoalInvocationSchema = z.object({
  params: GoalRouteIdParamsSchema,
  body: UpdateGoalSchema,
});
export type UpdateGoalInvocation = z.infer<typeof UpdateGoalInvocationSchema>;

/** DELETE /:id — delete a goal (query carries expectedVersion). 删除目标。 */
export const DeleteGoalInvocationSchema = z.object({
  params: GoalRouteIdParamsSchema,
  query: GoalVersionCommandSchema,
});
export type DeleteGoalInvocation = z.infer<typeof DeleteGoalInvocationSchema>;

/** POST /:id/archive | /activate | /complete | /abandon — versioned Goal commands. */
export const GoalStatusCommandInvocationSchema = z.object({
  params: GoalRouteIdParamsSchema,
  body: GoalVersionCommandSchema,
});
export type GoalStatusCommandInvocation = z.infer<typeof GoalStatusCommandInvocationSchema>;

/** POST /:id/clone — clone a goal. 克隆目标。 */
export const CloneGoalInvocationSchema = z.object({
  params: GoalRouteIdParamsSchema,
  body: CloneGoalSchema,
});
export type CloneGoalInvocation = z.infer<typeof CloneGoalInvocationSchema>;

/** PUT /:id/key-results/batch-weight — batch key-result weights. 批量更新关键结果权重。 */
export const BatchKeyResultWeightsInvocationSchema = z.object({
  params: GoalRouteIdParamsSchema,
  body: BatchUpdateKeyResultWeightsReqSchema,
});
export type BatchKeyResultWeightsInvocation = z.infer<typeof BatchKeyResultWeightsInvocationSchema>;

// ============================================================================
// Key Result mutations
// ============================================================================

/** POST /:id/key-results — add a key result (body includes goalId). 添加关键结果。 */
export const AddKeyResultInvocationSchema = z.object({
  params: GoalRouteIdParamsSchema,
  body: AddKeyResultSchema,
});
export type AddKeyResultInvocation = z.infer<typeof AddKeyResultInvocationSchema>;

/** PUT /:id/key-results/:krId — update a key result. 更新关键结果。 */
export const UpdateKeyResultInvocationSchema = z.object({
  params: KeyResultRouteParamsSchema,
  body: UpdateKeyResultSchema,
});
export type UpdateKeyResultInvocation = z.infer<typeof UpdateKeyResultInvocationSchema>;

/** PATCH /:id/key-results/:krId/progress — update key-result progress. 更新关键结果进度。 */
export const UpdateKeyResultProgressInvocationSchema = z.object({
  params: KeyResultRouteParamsSchema,
  body: UpdateKeyResultProgressSchema,
});
export type UpdateKeyResultProgressInvocation = z.infer<
  typeof UpdateKeyResultProgressInvocationSchema
>;

/** DELETE /:id/key-results/:krId — delete a key result (query carries expectedVersion). 删除关键结果。 */
export const DeleteKeyResultInvocationSchema = z.object({
  params: KeyResultRouteParamsSchema,
  query: DeleteKeyResultSchema,
});
export type DeleteKeyResultInvocation = z.infer<typeof DeleteKeyResultInvocationSchema>;

// ============================================================================
// Review mutations
// ============================================================================

/** POST /:id/reviews — create a review (body includes goalId). 创建复盘。 */
export const CreateReviewInvocationSchema = z.object({
  params: GoalRouteIdParamsSchema,
  body: CreateGoalReviewSchema,
});
export type CreateReviewInvocation = z.infer<typeof CreateReviewInvocationSchema>;

/** GET /:id/reviews/context — server-generated facts for review composition. */
export const ReviewContextInvocationSchema = z.object({
  params: GoalRouteIdParamsSchema,
  query: GoalReviewWindowQuerySchema,
});
export type ReviewContextInvocation = z.infer<typeof ReviewContextInvocationSchema>;

/** PUT /:id/reviews/:reviewId — update a review. 更新复盘。 */
export const UpdateReviewInvocationSchema = z.object({
  params: ReviewRouteParamsSchema,
  body: UpdateGoalReviewSchema,
});
export type UpdateReviewInvocation = z.infer<typeof UpdateReviewInvocationSchema>;

/** DELETE /:id/reviews/:reviewId — delete a review (query carries expectedVersion). 删除复盘。 */
export const DeleteReviewInvocationSchema = z.object({
  params: ReviewRouteParamsSchema,
  query: DeleteGoalReviewSchema,
});
export type DeleteReviewInvocation = z.infer<typeof DeleteReviewInvocationSchema>;

// ============================================================================
// Record mutations
// ============================================================================

/** POST /:id/key-results/:krId/records — create a record (body includes keyResultId). 创建进度记录。 */
export const CreateRecordInvocationSchema = z.object({
  params: KeyResultRouteParamsSchema,
  body: CreateGoalRecordSchema,
});
export type CreateRecordInvocation = z.infer<typeof CreateRecordInvocationSchema>;

/** PUT /:id/key-results/:krId/records/:recordId — edit a user-owned record. */
export const UpdateRecordInvocationSchema = z.object({
  params: RecordRouteParamsSchema,
  body: UpdateGoalRecordSchema,
});
export type UpdateRecordInvocation = z.infer<typeof UpdateRecordInvocationSchema>;

/** DELETE /:id/key-results/:krId/records/:recordId — delete a record. 删除进度记录。 */
export const DeleteRecordInvocationSchema = z.object({
  params: RecordRouteParamsSchema,
  query: DeleteGoalRecordSchema,
});
export type DeleteRecordInvocation = z.infer<typeof DeleteRecordInvocationSchema>;
