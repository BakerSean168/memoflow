/**
 * Goal - Response Schemas (Zod)
 *
 * OpenAPI 响应体 Zod Schema，与 DTO 类型约束对齐。
 * 路由文件统一从此处导入，不在本地重复定义。
 */

import { z } from 'zod';
import { LabelColorSchema } from '../../label';
import { brandedId, YmdSchema } from '../../../primitives';
import type {
  GoalId,
  GoalReviewId,
  KeyResultId,
  IdentityId,
  GoalRecordId,
} from '../../../primitives';
import { GoalStatus } from '../value-objects/goal-status';
import { GoalReviewSystemContextSchema } from '../value-objects/goal-review-context';
export type { GoalReviewSystemContext } from '../value-objects/goal-review-context';

import { KeyResultProgressDTOSchema } from '../value-objects/key-result-progress';
import { KeyResultSnapshotDTOSchema } from '../value-objects/key-result-snapshot';

// Residual 737: KeyResultProgressDTOSchema / KeyResultSnapshotDTOSchema owned by value-objects
// (semantic DTOs are z.infer aliases). Re-export for OpenAPI/route consumers.
export { KeyResultProgressDTOSchema, KeyResultSnapshotDTOSchema };

import {
  GoalReminderConfigDTOSchema,
  ReminderTriggerSchema,
} from '../value-objects/goal-reminder-config';
import { GoalTimeframeSchema } from '../value-objects/goal-timeframe';

// Residual 741: GoalReminderConfigDTOSchema / ReminderTriggerSchema owned by value-objects
// (semantic DTOs are z.infer aliases). Re-export for OpenAPI/route consumers.
export { GoalReminderConfigDTOSchema, ReminderTriggerSchema };

// ============================================================================
// Sub-entity Schemas
// ============================================================================

/**
 * KeyResult Client DTO Schema
 */
// Residual 817: KeyResultClientDTO dual retired — sole KeyResultClientDTOSchema + z.infer
// (semantic type is z.infer alias in entities/key-result-client.ts).
export const KeyResultClientDTOSchema = z.object({
  id: brandedId<KeyResultId>(),
  title: z.string(),
  description: z.string().nullable(),
  progress: KeyResultProgressDTOSchema,
  progressPercentage: z.number().min(0).max(100),
  isCompleted: z.boolean(),
  weight: z.number().int().min(1).max(5),
  order: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

/**
 * GoalReview Client DTO Schema
 */
// Residual 817: GoalReviewClientDTO dual retired — sole GoalReviewClientDTOSchema + z.infer
// (semantic type is z.infer alias in entities/goal-review-client.ts).
export const GoalReviewClientDTOSchema = z.object({
  id: brandedId<GoalReviewId>(),
  goalId: brandedId<GoalId>(),
  reflection: z.string(),
  challenges: z.string().nullable(),
  adjustments: z.string().nullable(),
  systemContext: GoalReviewSystemContextSchema,
  reviewedAt: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const GoalLabelProjectionSchema = z.object({
  id: z.string().min(1),
  identityId: z.string().min(1),
  name: z.string(),
  normalizedName: z.string(),
  color: LabelColorSchema.nullable(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
});
export type GoalLabelProjection = z.infer<typeof GoalLabelProjectionSchema>;

// ============================================================================
// Aggregate Root Response Schemas
// ============================================================================

/**
 * Goal Client DTO Schema — 核心聚合根响应 (GOAL-2101 simplified)
 *
 * Goal answers only Direction + Measurement.
 * Legacy fields retired: color, importance, priority, category, tags, folderId, parentGoalId.
 * Planning uses calendar-native startDate + precision-preserving target timeframe.
 */
export const GoalClientDTOSchema = z.object({
  id: brandedId<GoalId>(),
  identityId: brandedId<IdentityId>(),
  name: z.string(),
  summary: z.string().max(500).nullable(),
  status: z.enum(GoalStatus),
  startDate: YmdSchema.nullable(),
  target: GoalTimeframeSchema.nullable(),
  completedAt: z.number().nullable(),
  archivedAt: z.number().nullable(),
  sortOrder: z.number(),
  reminderConfig: GoalReminderConfigDTOSchema.nullable(),
  labels: z.array(GoalLabelProjectionSchema),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
  version: z.number(),
  keyResults: z.array(KeyResultClientDTOSchema).nullable(),
  reviews: z.array(GoalReviewClientDTOSchema).nullable(),
  totalKeyResults: z.number(),
  completedKeyResults: z.number(),
  overallProgress: z.number(),
});

/** Full Goal aggregate projection returned by commands and aggregate queries. */
export const GoalAggregateReadModelSchema = GoalClientDTOSchema.extend({
  keyResults: z.array(KeyResultClientDTOSchema),
  reviews: z.array(GoalReviewClientDTOSchema),
});

export type GoalAggregateReadModel = z.infer<typeof GoalAggregateReadModelSchema>;

/**
 * GoalRecord Client DTO Schema
 * Residual 815: GoalRecordClientDTO dual retired — this schema is the sole goal-record client shape
 * (semantic GoalRecordClientDTO is z.infer alias in aggregates/goal-record-client.ts).
 */
export const GoalRecordClientDTOSchema = z.object({
  id: brandedId<GoalRecordId>(),
  keyResultId: brandedId<KeyResultId>(),
  goalId: brandedId<GoalId>(),
  value: z.number(),
  valueAfter: z.number(),
  comment: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const GoalMutationReceiptSchema = z.object({
  goalId: brandedId<GoalId>(),
  goalVersion: z.number().int().min(1),
  affectedEntityIds: z.object({
    goalIds: z.array(brandedId<GoalId>()),
    keyResultIds: z.array(brandedId<KeyResultId>()),
    recordIds: z.array(brandedId<GoalRecordId>()),
    reviewIds: z.array(brandedId<GoalReviewId>()),
  }),
  readModel: GoalAggregateReadModelSchema,
  recordChanges: z
    .object({
      upserted: z.array(GoalRecordClientDTOSchema),
      removedIds: z.array(brandedId<GoalRecordId>()),
    })
    .optional(),
});
export type GoalMutationReceipt = z.infer<typeof GoalMutationReceiptSchema>;

// ============================================================================
// Composite Response Schemas
// ============================================================================

/**
 * 分页信息 Schema
 */
export const PaginationSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  hasMore: z.boolean(),
  totalPages: z.number(),
});

/**
 * 目标列表查询响应 Schema
 */
export const QueryGoalsResSchema = z.object({
  data: z.array(GoalClientDTOSchema),
  pagination: PaginationSchema,
});

export type QueryGoalsRes = z.infer<typeof QueryGoalsResSchema>;

/**
 * 目标聚合视图响应 Schema
 */
export const GetGoalAggregateResSchema = z.object({
  goal: GoalAggregateReadModelSchema,
  keyResults: z.array(KeyResultClientDTOSchema),
  records: z.array(GoalRecordClientDTOSchema),
  reviews: z.array(GoalReviewClientDTOSchema),
  statistics: z.object({
    totalKeyResults: z.number(),
    completedKeyResults: z.number(),
    totalRecords: z.number(),
    totalReviews: z.number(),
    overallProgress: z.number(),
  }),
});

export type GetGoalAggregateRes = z.infer<typeof GetGoalAggregateResSchema>;

// ============================================================================
// List Response Schemas
// ============================================================================

// Residual 689: goal list OpenAPI schemas are the sole list response shapes
// (GetKeyResultsRes / GetGoalRecordsRes / GetGoalReviewsRes are z.infer aliases).
/**
 * 关键结果列表响应 Schema
 */
export const KeyResultListResSchema = z.object({
  data: z.array(KeyResultClientDTOSchema),
  total: z.number(),
});

/**
 * 进度记录列表响应 Schema
 */
export const GoalRecordListResSchema = z.object({
  data: z.array(GoalRecordClientDTOSchema),
  total: z.number(),
});

/**
 * 复盘列表响应 Schema
 */
export const GoalReviewListResSchema = z.object({
  data: z.array(GoalReviewClientDTOSchema),
  total: z.number(),
});

// ============================================================================
// Simple Response Schemas
// ============================================================================

// ============================================================================
// Request Schemas
// ============================================================================

/**
 * 批量更新关键结果权重请求 Schema
 */
export const BatchUpdateKeyResultWeightsReqSchema = z.object({
  expectedVersion: z.number().int().min(1),
  updates: z.array(
    z.object({
      keyResultId: brandedId<KeyResultId>(),
      weight: z.number().int().min(1).max(5),
    }),
  ),
});
export type BatchUpdateKeyResultWeightsReq = z.infer<typeof BatchUpdateKeyResultWeightsReqSchema>;
