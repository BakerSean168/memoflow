/** Portable Settings DTOs — schemaVersion 2. */
import { z } from 'zod';
import { UserPreferenceProfileSchema } from '../../setting/preferences/canonical';

export const PortableSettingsSchema = z
  .object({
    preferences: UserPreferenceProfileSchema,
  })
  .strict();
export type PortableSettings = z.infer<typeof PortableSettingsSchema>;

const PortableChannelPreferenceFlagsSchema = z.record(z.string(), z.boolean());
export const PortableNotificationPreferenceSchema = z.object({
  globalChannels: PortableChannelPreferenceFlagsSchema,
  workflowOverrides: z.record(z.string(), PortableChannelPreferenceFlagsSchema),
  doNotDisturb: z.unknown().optional(),
  rateLimit: z.unknown().optional(),
}).strict();
export type PortableNotificationPreference = z.infer<typeof PortableNotificationPreferenceSchema>;

export const PortableUserReminderPreferenceSchema = z.object({
  bestTimeSlots: z.array(z.unknown()),
  worstTimeSlots: z.array(z.unknown()),
  globalReminderEnabled: z.boolean(),
}).strict();
export type PortableUserReminderPreference = z.infer<typeof PortableUserReminderPreferenceSchema>;
