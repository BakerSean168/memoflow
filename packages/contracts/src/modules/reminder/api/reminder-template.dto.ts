/**
 * Reminder Template Operations
 *
 * This file contains DTOs for managing reminder templates.
 * Reminder templates define the structure and triggering rules for reminders.
 */

import { z } from 'zod';
import { brandedId } from '../../../primitives';
import type { ReminderTemplateId, RoutineProfileId } from '../../../primitives';
import type { ReminderTemplateClientDTO } from '../aggregates/reminder-template-client';
import { ReminderTemplateListResponseSchema } from './response-schemas';
import { ReminderType } from '../value-objects/reminder-type';
import { TriggerType } from '../value-objects/trigger-type';
import { NotificationChannel } from '../value-objects/notification-channel';
import { NotificationAction } from '../value-objects/notification-action';
import { ImportanceLevel } from '../../../shared/value-objects/importance';
import { ActiveTimeConfigSchema } from '../value-objects/active-time-config';

// ============================================================================
// REMINDER TEMPLATE Operations
// ============================================================================

/**
 * 创建提醒模板 Schema
 *
 * Residual 835: activeTime request dual retired — ActiveTimeConfigSchema (activatedAt).
 */
export const CreateReminderTemplateSchema = z.object({
  id: brandedId<ReminderTemplateId>().optional(),
  title: z.string().min(1).max(200),
  type: z.enum(ReminderType),
  trigger: z.object({
    type: z.enum(TriggerType),
    fixedTime: z
      .object({
        time: z.string(),
        timezone: z.string().nullable(),
      })
      .nullable(),
    interval: z
      .object({
        minutes: z.number().min(1),
        startTime: z.number().nullable(),
      })
      .nullable(),
  }),
  // Residual 835: request ActiveTime reuses VO ActiveTimeConfigSchema (activatedAt; no startDate/endDate dual).
  activeTime: ActiveTimeConfigSchema,
  notificationConfig: z.object({
    channels: z.array(z.enum(NotificationChannel)),
    title: z.string().nullable(),
    body: z.string().nullable(),
    sound: z
      .object({
        enabled: z.boolean(),
        soundName: z.string().nullable(),
      })
      .nullable(),
    vibration: z
      .object({
        enabled: z.boolean(),
        pattern: z.array(z.number()).nullable(),
      })
      .nullable(),
    actions: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          action: z.enum(NotificationAction),
          customAction: z.string().nullable(),
        }),
      )
      .nullable(),
  }),
  description: z.string().max(1000).optional(),
  activeHours: z
    .object({
      startHour: z.number().min(0).max(23),
      endHour: z.number().min(0).max(23),
      timezone: z.string().nullable(),
    })
    .optional(),
  importanceLevel: z.enum(ImportanceLevel).optional(),
  tags: z.array(z.string()).optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  profileIds: z.array(brandedId<RoutineProfileId>()).optional(),
});

export type CreateReminderTemplateReq = z.infer<typeof CreateReminderTemplateSchema>;
export type CreateReminderTemplateRes = ReminderTemplateClientDTO;

/**
 * 更新提醒模板 Schema
 */
export const UpdateReminderTemplateSchema = CreateReminderTemplateSchema.partial();

export type UpdateReminderTemplateReq = z.infer<typeof UpdateReminderTemplateSchema>;
export type UpdateReminderTemplateRes = ReminderTemplateClientDTO;

/** Replaces the complete M:N ProfileMembership set for one Routine. */
export const ReplaceRoutineProfilesSchema = z.object({
  profileIds: z.array(brandedId<RoutineProfileId>()),
});

export type ReplaceRoutineProfilesReq = z.infer<typeof ReplaceRoutineProfilesSchema>;
export type ReplaceRoutineProfilesRes = ReminderTemplateClientDTO;

/**
 * 获取即将到来的提醒 Schema
 */
export const GetUpcomingRemindersSchema = z.object({
  days: z.number().int().min(1).max(365).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  importanceLevel: z.enum(ImportanceLevel).optional(),
  type: z.enum(ReminderType).optional(),
  /**
   * 查询/计算时区，未传时按兜底链取值：请求时区 → 账号时区 → 显式默认('UTC')。无静默服务器时区
   */
  timezone: z.string().optional(),
});

export type GetUpcomingRemindersReq = z.infer<typeof GetUpcomingRemindersSchema>;

export const ReminderTodayScheduleItemSchema = z.object({
  templateId: brandedId<ReminderTemplateId>(),
  title: z.string(),
  description: z.string().optional(),
  type: z.enum(ReminderType),
  triggerType: z.enum(TriggerType),
  importanceLevel: z.enum(ImportanceLevel),
  nextTriggerAt: z.number().int(),
  nextTriggerDisplay: z.string(),
  daysUntilTrigger: z.number().int(),
  icon: z.string(),
  color: z.string(),
  notificationChannels: z.array(z.enum(NotificationChannel)),
});
export type ReminderTodayScheduleItem = z.infer<typeof ReminderTodayScheduleItemSchema>;

// Residual 775: upcoming/today schedule list Res dual retired — sole list shape + z.infer.
export const ReminderScheduleListResSchema = z.object({
  data: z.array(ReminderTodayScheduleItemSchema),
  total: z.number(),
});

export const GetUpcomingRemindersResSchema = ReminderScheduleListResSchema;
export type GetUpcomingRemindersRes = z.infer<typeof GetUpcomingRemindersResSchema>;

export const GetReminderTodayScheduleSchema = z.object({
  limit: z.number().int().min(1).max(200).optional(),
  includeExpired: z.boolean().optional(),
  /**
   * 查询/计算时区，未传时按兜底链取值：请求时区 → 账号时区 → 显式默认('UTC')。无静默服务器时区
   */
  timezone: z.string().optional(),
});

export type GetReminderTodayScheduleReq = z.infer<typeof GetReminderTodayScheduleSchema>;

// Residual 775: today schedule Res reuses shared list schema (no dual body).
export const GetReminderTodayScheduleResSchema = ReminderScheduleListResSchema;
export type GetReminderTodayScheduleRes = z.infer<typeof GetReminderTodayScheduleResSchema>;

// Residual 693: list response dual body retired — OpenAPI + transport use ReminderTemplateListResponseSchema.
export type ReminderTemplateListRes = z.infer<typeof ReminderTemplateListResponseSchema>;
