import { z } from 'zod';

export const DesktopStartupSnapshotSchema = z.object({
  autoLaunch: z.object({ available: z.boolean(), enabled: z.boolean() }),
  closeToTray: z.boolean(),
  startHidden: z.boolean(),
});
export const DesktopStartupPatchSchema = z
  .object({
    autoLaunch: z.boolean().optional(),
    closeToTray: z.boolean().optional(),
    startHidden: z.boolean().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0);
export type DesktopStartupSnapshot = z.infer<typeof DesktopStartupSnapshotSchema>;
export type DesktopStartupPatch = z.infer<typeof DesktopStartupPatchSchema>;
export const DesktopStartupUpdateSchema = z.object({
  snapshot: DesktopStartupSnapshotSchema,
  success: z.boolean(),
});
export type DesktopStartupUpdate = z.infer<typeof DesktopStartupUpdateSchema>;

export const DesktopStartupChannels = {
  GET: 'desktop:startup:get',
  UPDATE: 'desktop:startup:update',
  CHANGED: 'desktop:startup:changed',
} as const;
