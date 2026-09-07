/**
 * Reminder - Response Schemas (Zod)
 *
 * OpenAPI 响应体 Zod Schema，路由文件统一从此处导入。
 * Schema 必须与对应的 ClientDTO 严格对齐，不得使用影子结构。
 */

import { z } from 'zod';
import { brandedId } from '../../../primitives';
import type {
  ReminderTemplateId,
  ReminderGroupId,
  RoutineProfileId,
  IdentityId,
  ReminderHistoryId,
  ReminderResponseId,
  UserReminderPreferencesId,
} from '../../../primitives';
import { ReminderType } from '../value-objects/reminder-type';
import { ReminderStatus } from '../value-objects/reminder-status';
import { TriggerResult } from '../value-objects/trigger-result';
import { NotificationChannel } from '../value-objects/notification-channel';
import { ImportanceLevel } from '../../../shared/value-objects/importance';
import { ActiveHoursConfigSchema } from '../value-objects/active-hours-config';
import { ActiveTimeConfigSchema } from '../value-objects/active-time-config';
import { GroupStatsSchema } from '../value-objects/group-stats';
import { TriggerConfigSchema } from '../value-objects/trigger-config';
import { NotificationConfigSchema } from '../value-objects/notification-config';
import { ReminderResponseAction } from '../entities/reminder-response-server';
import { TimeSlotSchema } from '../value-objects/time-slot';

// Residual 751: TimeSlotSchema owned by value-objects (TimeSlotDTO is z.infer alias).
export { TimeSlotSchema };

// Residual 733: ActiveHoursConfigSchema / GroupStatsSchema owned by value-objects
// Residual 833: ActiveTimeConfigSchema owned by value-objects (activatedAt; no startDate/endDate dual).
// (re-exported for OpenAPI nested response consumers).
export { ActiveHoursConfigSchema, GroupStatsSchema, ActiveTimeConfigSchema };

// Residual 735: TriggerConfigSchema / NotificationConfigSchema owned by value-objects
// (re-exported for OpenAPI nested response consumers).
export { TriggerConfigSchema, NotificationConfigSchema };

// ============ 值对象 Zod Schema ============

// ============ ReminderTemplate Response Schema ============

/** Canonical Routine/Profile membership read model for one Routine. */
export const RoutineProfileMembershipViewSchema = z.object({
  profileId: brandedId<RoutineProfileId>(),
  profileName: z.string().nullable(),
  enabled: z.boolean(),
  profileEnabled: z.boolean(),
  profileActive: z.boolean(),
  effectiveEnabled: z.boolean(),
});

export type RoutineProfileMembershipView = z.infer<typeof RoutineProfileMembershipViewSchema>;

/**
 * Residual 833: ReminderTemplateClientDTO dual retired — sole ReminderTemplateResponseSchema + z.infer
 * (semantic type is z.infer alias in aggregates/reminder-template-client.ts).
 * activeTime uses VO-owned ActiveTimeConfigSchema (activatedAt).
 */
export const ReminderTemplateResponseSchema = z.object({
  id: brandedId<ReminderTemplateId>(),
  identityId: brandedId<IdentityId>(),
  name: z.string(),
  description: z.string().nullable(),
  type: z.enum(ReminderType),
  trigger: TriggerConfigSchema,
  activeTime: ActiveTimeConfigSchema,
  activeHours: ActiveHoursConfigSchema.nullable(),
  notificationConfig: NotificationConfigSchema,
  selfEnabled: z.boolean(),
  status: z.enum(ReminderStatus),
  effectiveEnabled: z.boolean(),
  profileMemberships: z.array(RoutineProfileMembershipViewSchema),
  importanceLevel: z.enum(ImportanceLevel),
  tags: z.array(z.string()),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  nextTriggerAt: z.number().nullable(),
  version: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
  // history 子实体（可选加载）
  history: z.array(z.lazy(() => ReminderHistoryResponseSchema)).nullable(),
  // UI 扩展
  isActive: z.boolean(),
  isPaused: z.boolean(),
  lifecycleSource: z.enum(['global', 'profile', 'routine']),
  effectiveEnabledReason: z.string(),
  globalReminderEnabled: z.boolean(),
});

// Residual 693: reminder list OpenAPI schemas are the sole list response shapes
// (ReminderTemplateListRes / ReminderGroupListRes are z.infer aliases).
export const ReminderTemplateListResponseSchema = z.object({
  templates: z.array(ReminderTemplateResponseSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  hasMore: z.boolean(),
});

// ============ ReminderGroup Response Schema ============

/**
 * Residual 827: ReminderGroupClientDTO dual retired — sole ReminderGroupResponseSchema + z.infer
 * (semantic type is z.infer alias in aggregates/reminder-group-client.ts).
 */
export const ReminderGroupResponseSchema = z.object({
  id: brandedId<ReminderGroupId>(),
  identityId: brandedId<IdentityId>(),
  name: z.string(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  enabled: z.boolean(),
  status: z.enum(ReminderStatus),
  order: z.number(),
  stats: GroupStatsSchema,
  version: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
});

export const ReminderGroupListResponseSchema = z.object({
  groups: z.array(ReminderGroupResponseSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  hasMore: z.boolean(),
});

// ============ ReminderHistory Response Schema ============
// Residual 827: ReminderHistoryClientDTO dual retired — sole ReminderHistoryResponseSchema + z.infer
// (semantic type is z.infer alias in entities/reminder-history-client.ts).

export const ReminderHistoryResponseSchema = z.object({
  id: brandedId<ReminderHistoryId>(),
  templateId: brandedId<ReminderTemplateId>(),
  triggeredAt: z.number(),
  result: z.enum(TriggerResult),
  error: z.string().nullable(),
  notificationSent: z.boolean(),
  notificationChannels: z.array(z.enum(NotificationChannel)).nullable(),
  version: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable(),
});

// ============ ReminderResponse Response Schema ============

export const ReminderResponseItemSchema = z.object({
  id: brandedId<ReminderResponseId>(),
  reminderTemplateId: brandedId<ReminderTemplateId>(),
  action: z.enum(ReminderResponseAction),
  responseTime: z.number().int().nonnegative().nullable().optional(),
  snoozeDurationSeconds: z.number().int().positive().nullable().optional(),
  timestamp: z.number(),
});

// ============ Batch Result Schema ============

// Residual 781: sole batch result transport shape (BatchGroupTemplatesRes is z.infer alias).
export const ReminderBatchResultSchema = z.object({
  successCount: z.number(),
  failedCount: z.number(),
});

// ============ UserReminderPreferences Response Schema ============

// Residual 829: UserReminderPreferencesClientDTO dual retired — sole UserReminderPreferencesResponseSchema + z.infer
// (semantic type is z.infer alias in aggregates/user-reminder-preferences-server.ts).
export const UserReminderPreferencesResponseSchema = z.object({
  id: brandedId<UserReminderPreferencesId>(),
  identityId: brandedId<IdentityId>(),
  bestTimeSlots: z.array(TimeSlotSchema),
  worstTimeSlots: z.array(TimeSlotSchema),
  globalReminderEnabled: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
  bestTimeSlotsText: z.string(),
  worstTimeSlotsText: z.string(),
  summaryText: z.string().optional(),
});

export const UpdateReminderPreferencesSchema = z.object({
  bestTimeSlots: z.array(TimeSlotSchema).optional(),
  worstTimeSlots: z.array(TimeSlotSchema).optional(),
  globalReminderEnabled: z.boolean().optional(),
});

export type UpdateReminderPreferencesReq = z.infer<typeof UpdateReminderPreferencesSchema>;

// ============ Response Operation Schemas ============

export const ResponseRecordResultSchema = z.object({
  id: brandedId<ReminderResponseId>(),
  templateId: brandedId<ReminderTemplateId>(),
  action: z.enum(ReminderResponseAction),
  responseTime: z.number().int().nonnegative().nullable(),
  snoozeDurationSeconds: z.number().int().positive().nullable(),
  recordedAt: z.number(),
});

export const ResponseStatsResultSchema = z.object({
  total: z.number(),
  clicked: z.number(),
  ignored: z.number(),
  snoozed: z.number(),
  dismissed: z.number(),
  completed: z.number(),
  avgResponseTime: z.number(),
});

// ============ Frequency Analysis Schemas ============

export const FrequencyAnalysisResultSchema = z.object({
  clickRate: z.number(),
  ignoreRate: z.number(),
  avgResponseTime: z.number(),
  snoozeCount: z.number(),
  effectivenessScore: z.number(),
  sampleSize: z.number(),
  lastAnalysisTime: z.number(),
});

export const FrequencyAdjustmentResultSchema = z.object({
  templateId: brandedId<ReminderTemplateId>(),
  originalInterval: z.number(),
  adjustedInterval: z.number(),
  reason: z.string(),
  appliedAt: z.number(),
});
