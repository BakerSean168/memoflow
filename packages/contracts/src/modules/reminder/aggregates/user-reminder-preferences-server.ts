/**
 * User Reminder Preferences Aggregate Root - Server
 * 用户提醒偏好聚合根 - 服务端
 *
 * Residual 829: UserReminderPreferencesClientDTO dual retired — sole UserReminderPreferencesResponseSchema + z.infer.
 */

import type { z } from 'zod';
import type { UserReminderPreferencesId, IdentityId } from '../../../primitives';
// Residual 751: TimeSlotDTO owned by value-objects/time-slot (z.infer of TimeSlotSchema).
import type { TimeSlotDTO } from '../value-objects/time-slot';
export type { TimeSlotDTO } from '../value-objects/time-slot';
import { UserReminderPreferencesResponseSchema } from '../api/response-schemas';

// ============ DTO 定义 ============

/**
 * User Reminder Preferences Server DTO
 */
export interface UserReminderPreferencesServerDTO {
  id: UserReminderPreferencesId;
  identityId: IdentityId;
  bestTimeSlots: TimeSlotDTO[]; // 最佳时间段
  worstTimeSlots: TimeSlotDTO[]; // 最差时间段
  globalReminderEnabled: boolean; // 全局提醒总开关
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
}

/**
 * User Reminder Preferences Client DTO
 *
 * Residual 829: dual retired — OpenAPI + transport use UserReminderPreferencesResponseSchema.
 */
export type UserReminderPreferencesClientDTO = z.infer<typeof UserReminderPreferencesResponseSchema>;
