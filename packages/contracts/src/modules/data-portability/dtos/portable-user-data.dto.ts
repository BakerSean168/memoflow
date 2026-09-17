/** Portable User Data V2 — composed Core vNext backup schema. */
import { z } from 'zod';
import { PortableSettingsSchema, PortableNotificationPreferenceSchema } from './portable-settings.dto';
import { PortableGoalDataSchema } from './portable-goals.dto';
import { PortableTaskDataSchema } from './portable-tasks.dto';
import { PortableRepositoryDataSchema } from './portable-repositories.dto';
import { PortableScheduleDataSchema } from './portable-schedules.dto';
import { PortableAIDataSchema } from './portable-ai.dto';

export const PortableUserDataV2Schema = z.object({
  settings: PortableSettingsSchema.optional(),
  notificationPreference: PortableNotificationPreferenceSchema.optional(),
  goals: PortableGoalDataSchema.optional(),
  tasks: PortableTaskDataSchema.optional(),
  repositories: PortableRepositoryDataSchema.optional(),
  schedules: PortableScheduleDataSchema.optional(),
  ai: PortableAIDataSchema.optional(),
}).strict();
export type PortableUserDataV2 = z.infer<typeof PortableUserDataV2Schema>;
