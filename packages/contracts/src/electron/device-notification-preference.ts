import { z } from 'zod';

/** Device-local notification presentation preference (ADR-094). */
export const DesktopNotificationPreferenceSchema = z
  .object({
    presentationMode: z.enum(['native', 'custom']),
    soundEnabled: z.boolean(),
  })
  .strict();

export const DesktopNotificationPreferencePatchSchema = z
  .object({
    presentationMode: z.enum(['native', 'custom']).optional(),
    soundEnabled: z.boolean().optional(),
  })
  .strict();

export type DesktopNotificationPreference = z.infer<typeof DesktopNotificationPreferenceSchema>;
export type DesktopNotificationPreferencePatch = z.infer<
  typeof DesktopNotificationPreferencePatchSchema
>;
