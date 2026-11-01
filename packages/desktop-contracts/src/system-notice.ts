import { z } from 'zod';

/**
 * In-app notices the desktop main process asks the renderer shell to present.
 *
 * Only the notice identifier crosses IPC: user-facing text stays in the
 * renderer locale bundle so it follows the application language setting.
 * Main never sends a message string.
 */
export const SystemNoticeSchema = z.object({
  id: z.enum(['tray-unavailable']),
});
export type SystemNotice = z.infer<typeof SystemNoticeSchema>;

export const SystemNoticeIdSchema = SystemNoticeSchema.shape.id;
export type SystemNoticeId = z.infer<typeof SystemNoticeIdSchema>;

/** Renderer acknowledgement: which queued notices main flushed to this sender. */
export const SystemNoticeReadyResultSchema = z.object({
  delivered: z.array(SystemNoticeIdSchema),
});
export type SystemNoticeReadyResult = z.infer<typeof SystemNoticeReadyResultSchema>;
