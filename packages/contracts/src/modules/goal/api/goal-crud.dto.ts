/**
 * Goal - CRUD Operations
 *
 * 目标的基础增删改查操作，包括批量操作
 */

import { z } from 'zod';
import { brandedId, YmdSchema } from '../../../primitives';
import type { GoalId, IdentityId, KeyResultId } from '../../../primitives';
import type { GoalClientDTO } from '../aggregates/goal-client';
import { GoalStatus } from '../value-objects/goal-status';
import { GoalSystemView } from '../value-objects/goal-system-view';
import {
  GoalReminderConfigDTOSchema,
  ReminderTriggerSchema,
} from '../value-objects/goal-reminder-config';
import { GoalTimeframeSchema } from '../value-objects/goal-timeframe';
import { KeyResultInputSchema } from './key-result-input.schema';

const GoalNameSchema = z
  .string()
  .trim()
  .min(1, '目标名称不能为空')
  .max(256, '目标名称不能超过 256 字符');

// Residual 753: request reminder-config reuses residual 741 VO schemas.
// Request-only refinements (value.min(0), triggers.max(10)) without dual bodies.
const GoalReminderConfigRequestSchema = GoalReminderConfigDTOSchema.extend({
  triggers: z.array(ReminderTriggerSchema.extend({ value: z.number().min(0) })).max(10),
});

/** Residual 677: shared goalId params for goal-scoped list queries. */
export const GoalIdParamsSchema = z.object({
  goalId: brandedId<GoalId>(),
});

// ============================================================================
// CREATE Goal
// ============================================================================

/**
 * 创建目标 Schema
 */
export const CreateGoalSchema = z
  .object({
    id: brandedId<GoalId>().optional(),
    name: GoalNameSchema,
    summary: z.string().trim().max(500, '目标摘要不能超过 500 字符').optional(),
    startDate: YmdSchema.optional(),
    target: GoalTimeframeSchema.optional(),
    labelIds: z.array(z.string().min(1)).max(50).optional(),
    reminderConfig: GoalReminderConfigRequestSchema.nullable().optional(),
    initialKeyResults: z.array(KeyResultInputSchema).max(50).optional(),
  })
  .strict();

export type CreateGoalReq = z.infer<typeof CreateGoalSchema>;
export type CreateGoalRes = import('./response-schemas').GoalMutationReceipt;

// ============================================================================
// UPDATE Goal
// ============================================================================

/**
 * 更新目标 Schema
 */
export const UpdateGoalSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    name: GoalNameSchema.optional(),
    summary: z.string().trim().max(500, '目标摘要不能超过 500 字符').nullable().optional(),
    startDate: YmdSchema.nullable().optional(),
    target: GoalTimeframeSchema.nullable().optional(),
    labelIds: z.array(z.string().min(1)).max(50).optional(),
    reminderConfig: GoalReminderConfigRequestSchema.nullable().optional(),
    keyResults: z
      .array(
        KeyResultInputSchema.extend({
          id: brandedId<KeyResultId>().optional(),
          description: z.string().max(2000).nullable().optional(),
        }).strict(),
      )
      .max(50)
      .optional(),
  })
  .strict();

export type UpdateGoalReq = z.infer<typeof UpdateGoalSchema>;
export type UpdateGoalRes = import('./response-schemas').GoalMutationReceipt;

export const GoalVersionCommandSchema = z
  .object({ expectedVersion: z.coerce.number().int().min(1) })
  .strict();
export type GoalVersionCommandReq = z.infer<typeof GoalVersionCommandSchema>;

// ============================================================================
// GET Goal
// ============================================================================

/**
 * 获取目标详情
 */
export type GetGoalReq = void;
export type GetGoalRes = GoalClientDTO;

/**
 * 删除目标
 */
export type DeleteGoalReq = GoalVersionCommandReq;
export type DeleteGoalRes = import('./response-schemas').GoalMutationReceipt;

// ============================================================================
// QUERY Goals
// ============================================================================

/**
 * Public transport DTO for listing goals - excludes identityId
 * 公共传输 DTO 用于列表目标 - 不包含 identityId
 */
export const ListGoalFiltersSchema = z.object({
  systemView: z.enum(GoalSystemView).optional(),
  status: z.array(z.enum(GoalStatus)).optional(),
  query: z.string().max(256).optional(),
  labelIdsAll: z.array(z.string().min(1)).max(50).optional(),
  targetStart: YmdSchema.optional(),
  targetEnd: YmdSchema.optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'target']).default('createdAt').optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc').optional(),
  page: z.number().int().min(1).default(1).optional(),
  pageSize: z.number().int().min(1).max(100).default(20).optional(),
  includeKeyResults: z.boolean().default(false).optional(),
  includeReviews: z.boolean().default(false).optional(),
});

export type ListGoalFilters = z.infer<typeof ListGoalFiltersSchema>;

/**
 * Internal application query - used by controller/use case
 * 内部应用查询 - 由控制器/用例使用
 */
export interface ListGoalsQuery extends ListGoalFilters {
  identityId: IdentityId;
}

// QueryGoalsRes 由 response-schemas.ts 中 QueryGoalsResSchema 的 z.infer 导出

// ============================================================================
// AGGREGATE View
// ============================================================================

/**
 * 获取目标聚合视图
 */
export type GetGoalAggregateReq = void;

// GetGoalAggregateRes 由 response-schemas.ts 中 GetGoalAggregateResSchema 的 z.infer 导出

// ============================================================================
// CLONE Goal
// ============================================================================

export const CloneGoalSchema = z
  .object({
    name: GoalNameSchema.optional(),
    summary: z.string().trim().max(500, '目标摘要不能超过 500 字符').optional(),
    includeKeyResults: z.boolean().optional(),
    includeRecords: z.boolean().optional(),
  })
  .strict();

export type CloneGoalReq = z.infer<typeof CloneGoalSchema>;

// ============================================================================
// BATCH Operations
// ============================================================================

/**
 * 批量删除目标 Schema
 */
export const BatchDeleteGoalsSchema = z.object({
  goalIds: z.array(brandedId<GoalId>()).min(1),
  hardDelete: z.boolean().default(false).optional(),
});

export type BatchDeleteGoalsReq = z.infer<typeof BatchDeleteGoalsSchema>;

// ============================================================================
// IMPORT/EXPORT Operations
// ============================================================================

/**
 * Public transport DTO for export goals - excludes identityId (current-user operation)
 * 公共传输 DTO 用于导出目标 - 不包含 identityId (当前用户操作)
 */
export const ExportGoalFiltersSchema = z.object({
  goalIds: z.array(brandedId<GoalId>()).optional(),
  format: z.enum(['json', 'csv', 'markdown']),
  includeKeyResults: z.boolean().default(true).optional(),
  includeReviews: z.boolean().default(true).optional(),
});

export type ExportGoalFilters = z.infer<typeof ExportGoalFiltersSchema>;

/**
 * Internal export query - used by controller/use case
 * 内部导出查询 - 由控制器/用例使用
 */
export interface ExportGoalsQuery extends ExportGoalFilters {
  identityId: IdentityId;
}

// Residual 791: export goals Res dual retired — sole ResSchema + z.infer.
export const ExportGoalsResSchema = z.object({
  data: z.union([z.string(), z.custom<Uint8Array>((val) => val instanceof Uint8Array)]),
  filename: z.string(),
  mimeType: z.string(),
});
export type ExportGoalsRes = z.infer<typeof ExportGoalsResSchema>;

/**
 * Public transport DTO for import goals - excludes identityId (current-user operation)
 * 公共传输 DTO 用于导入目标 - 不包含 identityId (当前用户操作)
 */
export const ImportGoalPayloadSchema = z.object({
  data: z.union([z.string(), z.custom<Uint8Array>((val) => val instanceof Uint8Array)]),
  format: z.enum(['json', 'csv']),
  overwriteExisting: z.boolean().default(false).optional(),
});

export type ImportGoalPayload = z.infer<typeof ImportGoalPayloadSchema>;

/**
 * Internal import command - used by controller/use case
 * 内部导入命令 - 由控制器/用例使用
 */
export interface ImportGoalsCommand extends ImportGoalPayload {
  identityId: IdentityId;
}

// Residual 791: import goals Res dual retired — sole ResSchema + z.infer.
export const ImportGoalsResSchema = z.object({
  importedCount: z.number(),
  skippedCount: z.number(),
  errors: z
    .array(
      z.object({
        line: z.number(),
        error: z.string(),
      }),
    )
    .optional(),
});
export type ImportGoalsRes = z.infer<typeof ImportGoalsResSchema>;
