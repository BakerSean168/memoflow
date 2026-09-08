/**
 * Task Instance Query Operations
 *
 * This file contains DTOs for querying task instances.
 * Task instances represent actual occurrences of task templates in a time range.
 */

import { z } from 'zod';
import { TaskOccurrenceResponseSchema } from './response-schemas';

// ============================================================================
// GET Task Operations
// ============================================================================

/**
 * 获取任务实例列表 Schema
 */
export const GetTaskOccurrencesByRangeSchema = z.object({
  startDate: z.coerce.number().int(),
  endDate: z.coerce.number().int(),
});

export type GetTaskOccurrencesByRangeReq = z.infer<typeof GetTaskOccurrencesByRangeSchema>;

// Residual 789: by-range list Res dual retired — sole ResSchema + z.infer
// (nests TaskOccurrenceResponseSchema; matches TaskOccurrenceClientDTO fields).
export const GetTaskOccurrencesByRangeResSchema = z.object({
  data: z.array(TaskOccurrenceResponseSchema),
  total: z.number(),
});
export type GetTaskOccurrencesByRangeRes = z.infer<typeof GetTaskOccurrencesByRangeResSchema>;

export const CompleteTaskOccurrenceSchema = z
  .object({
    duration: z.number().optional(),
    note: z.string().optional(),
    rating: z.number().int().min(1).max(5).optional(),
  })
  .default({});

export type CompleteTaskOccurrenceReq = z.infer<typeof CompleteTaskOccurrenceSchema>;

export const SkipTaskOccurrenceSchema = z
  .object({
    reason: z.string().optional(),
  })
  .default({});

export type SkipTaskOccurrenceReq = z.infer<typeof SkipTaskOccurrenceSchema>;

export const MarkTaskOccurrenceMissedSchema = z
  .object({
    reason: z.string().optional(),
  })
  .default({});

export type MarkTaskOccurrenceMissedReq = z.infer<typeof MarkTaskOccurrenceMissedSchema>;

// Residual 789: complete/skip operation Res dual retired — sole ResSchema + z.infer.
export const TaskOccurrenceOperationResSchema = z.object({
  instance: TaskOccurrenceResponseSchema,
});
export type TaskOccurrenceOperationRes = z.infer<typeof TaskOccurrenceOperationResSchema>;
