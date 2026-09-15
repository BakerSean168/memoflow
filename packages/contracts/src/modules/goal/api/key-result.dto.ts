/**
 * Goal - Key Result Operations
 *
 * 关键结果(OKR)的管理操作
 */

import { z } from 'zod';
import { KeyResultCalculationMethod } from '../value-objects/key-result-calculation-method';
import { GoalTimeframeSchema } from '../value-objects/goal-timeframe';
import { brandedId } from '../../../primitives';
import type { GoalId, KeyResultId } from '../../../primitives';
import type { KeyResultClientDTO } from '../entities/key-result-client';
import { GoalIdParamsSchema } from './goal-crud.dto';
import { KeyResultListResSchema } from './response-schemas';
import { KeyResultInputSchema } from './key-result-input.schema';

// ============================================================================
// ADD Key Result
// ============================================================================

/**
 * 添加关键结果 Schema
 */
export const AddKeyResultSchema = KeyResultInputSchema.extend({
  goalId: brandedId<GoalId>(),
  expectedVersion: z.number().int().min(1),
});

export type AddKeyResultReq = z.infer<typeof AddKeyResultSchema>;
export type AddKeyResultRes = KeyResultClientDTO;

// ============================================================================
// UPDATE Key Result
// ============================================================================

/**
 * 更新关键结果 Schema
 */
export const UpdateKeyResultSchema = z.object({
  expectedVersion: z.number().int().min(1),
  title: z.string().min(1).max(256).optional(),
  description: z.string().max(2000).nullable().optional(),
  initialValue: z.number().optional(),
  calculationMethod: z.enum(KeyResultCalculationMethod).optional(),
  currentValue: z.number().optional(),
  targetValue: z.number().optional(),
  target: GoalTimeframeSchema.nullable().optional(),
  unit: z.string().max(50).nullable().optional(),
  weight: z.number().int('权重必须为整数').min(1, '权重最小为 1').max(5, '权重最大为 5').optional(),
});

export type UpdateKeyResultReq = z.infer<typeof UpdateKeyResultSchema>;

// ============================================================================
// GET Key Results
// ============================================================================

/**
 * 获取关键结果列表
 */
// Residual 677: reuses shared GoalIdParamsSchema (no dual body).
export type GetKeyResultsReq = z.infer<typeof GoalIdParamsSchema>;

// Residual 689: list response dual body retired — OpenAPI + transport use KeyResultListResSchema.
export type GetKeyResultsRes = z.infer<typeof KeyResultListResSchema>;

// ============================================================================
// UPDATE Progress
// ============================================================================

/**
 * 更新关键结果进度 Schema
 */
export const UpdateKeyResultProgressSchema = z.object({
  keyResultId: brandedId<KeyResultId>(),
  expectedVersion: z.number().int().min(1),
  newValue: z.number(),
  note: z.string().max(500).optional(),
});

export type UpdateKeyResultProgressReq = z.infer<typeof UpdateKeyResultProgressSchema>;

export const DeleteKeyResultSchema = z.object({
  expectedVersion: z.coerce.number().int().min(1),
});

export type DeleteKeyResultReq = z.infer<typeof DeleteKeyResultSchema>;
