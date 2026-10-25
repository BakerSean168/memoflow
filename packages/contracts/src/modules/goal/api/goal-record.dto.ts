/**
 * Goal - Record Operations
 *
 * 目标记录管理（进度记录）
 */

import { z } from 'zod';
import { brandedId } from '@memoflow/shared-primitives';
import type { GoalId, KeyResultId } from '@memoflow/shared-primitives';
import { GoalRecordListResSchema } from './response-schemas';

// ============================================================================
// CREATE Goal Record
// ============================================================================

/**
 * 创建目标记录 Schema
 */
export const CreateGoalRecordSchema = z.object({
  expectedVersion: z.number().int().min(1),
  keyResultId: brandedId<KeyResultId>(),
  value: z.number(),
  note: z.string().max(500).optional(),
});

export type CreateGoalRecordReq = z.infer<typeof CreateGoalRecordSchema>;

// ============================================================================
// UPDATE Goal Record
// ============================================================================

export const UpdateGoalRecordSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    value: z.number().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .refine((input) => input.value !== undefined || input.note !== undefined, {
    message: 'At least one editable GoalRecord field is required',
  });

export type UpdateGoalRecordReq = z.infer<typeof UpdateGoalRecordSchema>;

// ============================================================================
// GET Goal Records
// ============================================================================

/**
 * 查询目标记录
 */
export const GetGoalRecordsSchema = z.object({
  goalId: brandedId<GoalId>().optional(),
  keyResultId: brandedId<KeyResultId>().optional(),
  limit: z.number().int().min(1).max(100).default(20).optional(),
  offset: z.number().int().min(0).default(0).optional(),
});

export type GetGoalRecordsReq = z.infer<typeof GetGoalRecordsSchema>;

// Residual 689: list response dual body retired — OpenAPI + transport use GoalRecordListResSchema.
export type GetGoalRecordsRes = z.infer<typeof GoalRecordListResSchema>;

// ============================================================================
// DELETE Goal Record
// ============================================================================

export const DeleteGoalRecordSchema = z.object({
  expectedVersion: z.number().int().min(1),
});
export type DeleteGoalRecordReq = z.infer<typeof DeleteGoalRecordSchema>;
