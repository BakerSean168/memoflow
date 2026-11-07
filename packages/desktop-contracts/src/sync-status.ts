import { z } from 'zod';

/**
 * Renderer-safe business sync projection (Issue #874).
 *
 * Mirrors the sanitized PowerSync health fields already used in main-process
 * diagnostics. It deliberately has no row counts: the main process does not
 * track pending upload/download counts, so the UI must not invent them.
 */
export const DesktopSyncPhaseSchema = z.enum([
  'idle',
  'connecting',
  'download_error',
  'connected',
  'synced',
]);
export type DesktopSyncPhaseDTO = z.infer<typeof DesktopSyncPhaseSchema>;

export const DesktopSyncErrorCategorySchema = z.enum([
  'network',
  'authorization',
  'validation',
  'server',
  'unknown',
]);
export type DesktopSyncErrorCategoryDTO = z.infer<typeof DesktopSyncErrorCategorySchema>;

export const DesktopBusinessSyncStateSchema = z
  .object({
    phase: DesktopSyncPhaseSchema,
    hasSynced: z.boolean(),
    /** Epoch milliseconds; null when the SDK has not completed a sync yet. */
    lastSyncedAt: z.number().int().nonnegative().nullable(),
    errorCategory: DesktopSyncErrorCategorySchema.nullable(),
    /** True while the business dataset has not reached a completed sync. */
    pending: z.boolean(),
  })
  .strict();
export type DesktopBusinessSyncStateDTO = z.infer<typeof DesktopBusinessSyncStateSchema>;

export const DesktopProfileSyncFieldSchema = z.enum(['nickname', 'bio']);
export type DesktopProfileSyncFieldDTO = z.infer<typeof DesktopProfileSyncFieldSchema>;

export const DesktopProfilePendingFieldSchema = z
  .object({
    field: DesktopProfileSyncFieldSchema,
    value: z.string().max(1000),
  })
  .strict();
export type DesktopProfilePendingFieldDTO = z.infer<typeof DesktopProfilePendingFieldSchema>;

export const DesktopProfileSyncStateSchema = z
  .object({
    pendingFields: z.array(DesktopProfilePendingFieldSchema).max(2),
    lastSyncedAt: z.number().int().nonnegative().nullable(),
    failureCategory: DesktopSyncErrorCategorySchema.nullable(),
  })
  .strict();
export type DesktopProfileSyncStateDTO = z.infer<typeof DesktopProfileSyncStateSchema>;

/** Replayable renderer snapshot; GET_SNAPSHOT and STATE_CHANGED share this payload. */
export const DesktopSyncSnapshotSchema = z
  .object({
    business: DesktopBusinessSyncStateSchema,
    profile: DesktopProfileSyncStateSchema,
  })
  .strict();
export type DesktopSyncSnapshotDTO = z.infer<typeof DesktopSyncSnapshotSchema>;
