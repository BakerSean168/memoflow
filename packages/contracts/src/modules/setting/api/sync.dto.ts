import { z } from 'zod';
import {
  ExportSettingsResponseSchema,
  ImportSettingsResponseSchema,
} from './response-schemas';

export const SyncSettingsSchema = z.object({
  force: z.boolean().optional(),
});
export type SyncSettingsReq = z.infer<typeof SyncSettingsSchema>;

/** V3 preference export is JSON-only; no legacy format selector remains. */
export const ExportSettingsSchema = z.object({}).strict();
export type ExportSettingsReq = z.infer<typeof ExportSettingsSchema>;

// Residual 771: export/import settings Res duals retired — OpenAPI + transport use
// *ResponseSchema (semantic Res are z.infer aliases).
export type ExportSettingsRes = z.infer<typeof ExportSettingsResponseSchema>;

/** V3-only preference import. Legacy overwrite/merge switches are intentionally retired. */
export const ImportSettingsSchema = z
  .object({
    data: z.string().min(1),
  })
  .strict();
export type ImportSettingsReq = z.infer<typeof ImportSettingsSchema>;
export type ImportSettingsRes = z.infer<typeof ImportSettingsResponseSchema>;
