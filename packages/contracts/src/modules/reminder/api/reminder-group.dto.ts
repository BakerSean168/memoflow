/**
 * Reminder Group Operations
 *
 * This file contains DTOs for managing reminder groups.
 * Reminder groups allow organizing and controlling multiple reminders together.
 */

import { z } from 'zod';
import type { ReminderGroupClientDTO } from '../aggregates/reminder-group-client';
import {
  ReminderGroupListResponseSchema,
  ReminderBatchResultSchema,
} from './response-schemas';

// ============================================================================
// REMINDER GROUP Operations
// ============================================================================

/**
 * 创建提醒分组 Schema
 */
export const CreateReminderGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  order: z.number().int().min(0).optional(),
});

export type CreateReminderGroupReq = z.infer<typeof CreateReminderGroupSchema>;
export type CreateReminderGroupRes = ReminderGroupClientDTO;

/**
 * 更新提醒分组 Schema
 */
export const UpdateReminderGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  order: z.number().int().min(0).optional(),
});

export type UpdateReminderGroupReq = z.infer<typeof UpdateReminderGroupSchema>;
export type UpdateReminderGroupRes = ReminderGroupClientDTO;

/**
 * 批量分组操作 Schema
 */
export const BatchGroupTemplatesSchema = z.object({
  action: z.enum(['ENABLE', 'PAUSE']),
});

export type BatchGroupTemplatesReq = z.infer<typeof BatchGroupTemplatesSchema>;

// Residual 781: batch group templates Res dual retired — reuses ReminderBatchResultSchema
// (runtime returns successCount/failedCount only; unused errors dual field dropped).
export const BatchGroupTemplatesResSchema = ReminderBatchResultSchema;
export type BatchGroupTemplatesRes = z.infer<typeof BatchGroupTemplatesResSchema>;

// Residual 693: list response dual body retired — OpenAPI + transport use ReminderGroupListResponseSchema.
export type ReminderGroupListRes = z.infer<typeof ReminderGroupListResponseSchema>;

// Residual 635: ReminderOperationRes / ReminderTriggerRes { ok } dual envelopes
// and unused TemplateScheduleStatusRes dead surface deleted.
// Reminder control success bodies use DTO / void / Result envelopes only.
