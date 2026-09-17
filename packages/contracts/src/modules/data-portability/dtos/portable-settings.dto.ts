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
}).strict();
export type PortableNotificationPreference = z.infer<typeof PortableNotificationPreferenceSchema>;
