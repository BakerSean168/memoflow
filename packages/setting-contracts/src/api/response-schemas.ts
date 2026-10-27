/** Canonical Setting response schemas. */
import { z } from 'zod';
import { PreferencePortableImportReceiptV3Schema } from '../preferences/portable-v3';

/** V3 preference-only export transport artifact. */
export const ExportSettingsResponseSchema = z
  .object({
    data: z.string(),
    fileName: z.string(),
  })
  .strict();

/** V3 preference-only import receipt. */
export const ImportSettingsResponseSchema = PreferencePortableImportReceiptV3Schema;
